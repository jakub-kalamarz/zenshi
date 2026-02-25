import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ensureAuthSchema } from "@/lib/auth-schema";
import { getLocalePath, normalizeLocale } from "@/lib/locale";

type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

type AuthSession = {
  user: AuthUser;
  expires: string;
};

const SESSION_COOKIE = "session_token";
const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_VERIFIER_COOKIE = "oauth_verifier";
const OAUTH_RETURN_TO_COOKIE = "oauth_return_to";
const NEXT_LOCALE_COOKIE = "NEXT_LOCALE";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_TTL_SECONDS = 60 * 15;

function base64UrlEncode(input: Uint8Array) {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64UrlEncode(buffer);
}

async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function parseCookies(header: string | null) {
  const output: Record<string, string> = {};
  if (!header) return output;
  const parts = header.split(";");
  for (const part of parts) {
    const [name, ...rest] = part.trim().split("=");
    if (!name) continue;
    output[name] = decodeURIComponent(rest.join("=") || "");
  }
  return output;
}

async function buildRequestFromNextHeaders(pathname: string) {
  const { env } = await getCloudflareContext({ async: true });
  const { headers, cookies } = await import("next/headers");

  const resolved = resolveEnv(env);
  const baseUrl = resolved.AUTH_URL || "http://localhost:3000";
  const url = new URL(pathname, baseUrl);

  const nextHeaders = await headers();
  const nextCookies = await cookies();

  const requestHeaders = new Headers();
  nextHeaders.forEach((value, key) => {
    requestHeaders.set(key, value);
  });

  const cookieHeader = buildCookieHeader(nextCookies.getAll());
  if (cookieHeader) requestHeaders.set("cookie", cookieHeader);

  return new Request(url.toString(), { method: "GET", headers: requestHeaders });
}

function buildCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    path?: string;
    maxAge?: number;
  } = {},
) {
  const pieces = [`${name}=${encodeURIComponent(value)}`];
  pieces.push(`Path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) pieces.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) pieces.push("HttpOnly");
  if (options.secure) pieces.push("Secure");
  if (options.sameSite) pieces.push(`SameSite=${options.sameSite}`);
  return pieces.join("; ");
}

function buildCookieHeader(cookies: Array<{ name: string; value: string }>) {
  if (cookies.length === 0) return "";
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function clearCookie(name: string) {
  return buildCookie(name, "", { maxAge: 0, path: "/" });
}

function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("://")) return null;
  return value;
}

function getLocalizedHomeFromCookies(cookies: Record<string, string>) {
  const locale = normalizeLocale(cookies[NEXT_LOCALE_COOKIE]);
  return getLocalePath(locale, "/");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function resolveEnv(env: CloudflareEnv) {
  return {
    AUTH_URL: env.AUTH_URL ?? process.env.AUTH_URL,
    AUTH_GOOGLE_ID: env.AUTH_GOOGLE_ID ?? process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: env.AUTH_GOOGLE_SECRET ?? process.env.AUTH_GOOGLE_SECRET,
  };
}

function ensureEnv(env: CloudflareEnv) {
  const resolved = resolveEnv(env);
  if (!resolved.AUTH_GOOGLE_ID || !resolved.AUTH_GOOGLE_SECRET || !resolved.AUTH_URL) {
    throw new Error("Missing AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET/AUTH_URL");
  }
}

export async function auth(request?: Request): Promise<AuthSession | null> {
  const { env } = await getCloudflareContext({ async: true });
  await ensureAuthSchema(env);

  const resolvedRequest =
    request ?? (await buildRequestFromNextHeaders("/"));

  const headers = resolvedRequest.headers ?? new Headers();
  const cookieHeader = headers.get("cookie");
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[SESSION_COOKIE];
  if (!sessionToken) return null;

  const row = await env.DB.prepare(
    `SELECT s.expires_at, u.id, u.email, u.name, u.image
     FROM auth_sessions s
     JOIN auth_users u ON u.id = s.user_id
     WHERE s.session_token = ?`,
  )
    .bind(sessionToken)
    .first<{
      expires_at: number;
      id: string;
      email: string | null;
      name: string | null;
      image: string | null;
    }>();

  if (!row) return null;
  if (row.expires_at < nowSeconds()) return null;

  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      image: row.image,
    },
    expires: new Date(row.expires_at * 1000).toISOString(),
  };
}

export async function startGoogleOAuth(request?: Request) {
  const { env } = await getCloudflareContext({ async: true });
  await ensureAuthSchema(env);
  ensureEnv(env);

  const requestOrigin = request ? new URL(request.url).origin : null;
  const resolved = resolveEnv(env);
  const baseOrigin = requestOrigin ?? resolved.AUTH_URL ?? "http://localhost:3000";

  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = await sha256(verifier);
  const secure = baseOrigin.startsWith("https://");
  const returnTo = sanitizeReturnTo(
    request ? new URL(request.url).searchParams.get("returnTo") : null,
  );

  const redirectUri = new URL("/api/auth/callback/google", baseOrigin).toString();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", resolved.AUTH_GOOGLE_ID ?? "");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/webmasters",
  ].join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    buildCookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: OAUTH_TTL_SECONDS,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildCookie(OAUTH_VERIFIER_COOKIE, verifier, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: OAUTH_TTL_SECONDS,
    }),
  );
  if (returnTo) {
    headers.append(
      "Set-Cookie",
      buildCookie(OAUTH_RETURN_TO_COOKIE, returnTo, {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/",
        maxAge: OAUTH_TTL_SECONDS,
      }),
    );
  } else {
    headers.append("Set-Cookie", clearCookie(OAUTH_RETURN_TO_COOKIE));
  }
  headers.set("Location", authUrl.toString());

  return new Response(null, { status: 302, headers });
}

export async function handleGoogleCallback(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  await ensureAuthSchema(env);
  ensureEnv(env);
  const resolved = resolveEnv(env);
  const requestOrigin = new URL(request.url).origin;
  const baseOrigin = requestOrigin || resolved.AUTH_URL || "http://localhost:3000";
  const secure = baseOrigin.startsWith("https://");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response("Missing code/state", { status: 400 });
  }

  const cookies = parseCookies(request.headers.get("cookie"));
  const storedState = cookies[OAUTH_STATE_COOKIE];
  const verifier = cookies[OAUTH_VERIFIER_COOKIE];
  const returnTo = sanitizeReturnTo(cookies[OAUTH_RETURN_TO_COOKIE]);
  const localizedHome = getLocalizedHomeFromCookies(cookies);
  if (!storedState || !verifier || storedState !== state) {
    return new Response("Invalid OAuth state", { status: 400 });
  }

  const redirectUri = new URL("/api/auth/callback/google", baseOrigin).toString();
  const tokenBody = new URLSearchParams({
    client_id: resolved.AUTH_GOOGLE_ID ?? "",
    client_secret: resolved.AUTH_GOOGLE_SECRET ?? "",
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return new Response(`Token exchange failed: ${text}`, { status: 400 });
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
    id_token?: string;
  };

  const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) {
    const text = await userRes.text();
    return new Response(`Userinfo failed: ${text}`, { status: 400 });
  }

  const userInfo = (await userRes.json()) as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  const now = nowSeconds();
  const expiresAt = now + tokenData.expires_in;

  const account = await env.DB.prepare(
    `SELECT id, user_id
     FROM auth_accounts
     WHERE provider = 'google' AND provider_account_id = ?`,
  )
    .bind(userInfo.sub)
    .first<{ id: string; user_id: string }>();

  let userId: string;
  if (account) {
    userId = account.user_id;
  } else {
    const existingUser = userInfo.email
      ? await env.DB.prepare(
        `SELECT id FROM auth_users WHERE email = ?`,
      )
        .bind(userInfo.email)
        .first<{ id: string }>()
      : null;
    userId = existingUser?.id ?? crypto.randomUUID();
    if (!existingUser) {
      await env.DB.prepare(
        `INSERT INTO auth_users (id, email, name, image)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(userId, userInfo.email ?? null, userInfo.name ?? null, userInfo.picture ?? null)
        .run();
    }

    await env.DB.prepare(
      `INSERT INTO auth_accounts (
         id, user_id, provider, provider_account_id,
         access_token, refresh_token, token_type, scope, expires_at,
         created_at, updated_at
       ) VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        userInfo.sub,
        tokenData.access_token,
        tokenData.refresh_token ?? null,
        tokenData.token_type ?? null,
        tokenData.scope ?? null,
        expiresAt,
      )
      .run();
  }

  if (account) {
    await env.DB.prepare(
      `UPDATE auth_accounts
       SET access_token = ?, refresh_token = COALESCE(?, refresh_token),
           token_type = ?, scope = ?, expires_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(
        tokenData.access_token,
        tokenData.refresh_token ?? null,
        tokenData.token_type ?? null,
        tokenData.scope ?? null,
        expiresAt,
        account.id,
      )
      .run();
  }

  const sessionToken = randomToken(32);
  const sessionExpires = now + SESSION_TTL_SECONDS;
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, session_token, expires_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), userId, sessionToken, sessionExpires)
    .run();

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE));
  headers.append("Set-Cookie", clearCookie(OAUTH_VERIFIER_COOKIE));
  headers.append("Set-Cookie", clearCookie(OAUTH_RETURN_TO_COOKIE));
  headers.append(
    "Set-Cookie",
    buildCookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    }),
  );
  headers.set("Location", returnTo ?? localizedHome);

  return new Response(null, { status: 302, headers });
}

export async function handleLogout(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  await ensureAuthSchema(env);

  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionToken = cookies[SESSION_COOKIE];
  if (sessionToken) {
    await env.DB.prepare(
      `DELETE FROM auth_sessions WHERE session_token = ?`,
    )
      .bind(sessionToken)
      .run();
  }

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(SESSION_COOKIE));
  headers.set("Location", getLocalizedHomeFromCookies(cookies));
  return new Response(null, { status: 302, headers });
}

export async function handleSession(request: Request) {
  const session = await auth(request);
  return Response.json({ session });
}
