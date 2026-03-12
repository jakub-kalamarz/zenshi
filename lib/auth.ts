import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ensureAuthSchema } from "@/lib/auth-schema";
import { normalizeEmail, normalizeName } from "@/lib/credentials";
import { getLocalePath, normalizeLocale } from "@/lib/locale";
import { consumeOauthState, createOauthState } from "@/lib/mobile-auth";

type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

export type AuthSession = {
  user: AuthUser;
  expires: string;
};

const SESSION_COOKIE = "session_token";
const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_VERIFIER_COOKIE = "oauth_verifier";
const OAUTH_RETURN_TO_COOKIE = "oauth_return_to";
const NEXT_LOCALE_COOKIE = "NEXT_LOCALE";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_TTL_SECONDS = 60 * 15;

type GoogleTokenData = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
};

type GoogleUserInfo = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

type GoogleOAuthState = {
  mode: "signin" | "link";
  verifier: string;
  userId?: string;
};

export type GoogleRelinkIntent = {
  canRelink: true;
  code: "CONFLICT";
  message: string;
  provider: "google";
  relinkToken: string;
  status: 409;
};

export class GoogleAccountConflictError extends Error {
  public readonly status = 409;
  public readonly code = "GOOGLE_ACCOUNT_CONFLICT";

  constructor(message = "Google account is linked to another user") {
    super(message);
  }
}

export class GoogleRelinkTokenError extends Error {
  public readonly status = 400;
  public readonly code = "INVALID_RELINK_TOKEN";

  constructor(message = "Invalid or expired relink token") {
    super(message);
  }
}

export class GoogleDisconnectError extends Error {
  public readonly status = 400;
  public readonly code = "VALIDATION_ERROR";

  constructor(message = "Add a password before disconnecting Google.") {
    super(message);
  }
}

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

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
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

function clearCookie(name: string) {
  return buildCookie(name, "", { maxAge: 0, path: "/" });
}

export function buildSessionCookieFromRequest(request: Request, token: string) {
  const secure = new URL(request.url).protocol === "https:";
  return buildCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie() {
  return clearCookie(SESSION_COOKIE);
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

function getLocalizedGoogleRelinkPath(cookies: Record<string, string>) {
  const locale = normalizeLocale(cookies[NEXT_LOCALE_COOKIE]);
  return getLocalePath(locale, "/auth/google-relink");
}

function withSearchParams(path: string, params: Record<string, string | null | undefined>) {
  const url = new URL(path, "https://zenshi.local");
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
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

async function buildAuthRequestFromNextHeaders() {
  const { headers } = await import("next/headers");
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get("cookie") ?? "";
  return new Request("https://localhost", {
    method: "GET",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

export async function createSessionForUser(env: CloudflareEnv, userId: string) {
  await ensureAuthSchema(env);
  const sessionToken = randomToken(32);
  const sessionExpires = nowSeconds() + SESSION_TTL_SECONDS;
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, session_token, expires_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), userId, sessionToken, sessionExpires)
    .run();
  return {
    sessionToken,
    expiresAt: new Date(sessionExpires * 1000).toISOString(),
  };
}

export async function upsertGoogleAccountForUser(
  env: CloudflareEnv,
  userId: string,
  userInfo: GoogleUserInfo,
  tokenData: GoogleTokenData,
) {
  await ensureAuthSchema(env);
  const expiresAt = nowSeconds() + tokenData.expires_in;
  const email = userInfo.email ? normalizeEmail(userInfo.email) : null;
  const name = normalizeName(userInfo.name);
  const image = userInfo.picture ?? null;

  const providerAccount = await env.DB.prepare(
    `SELECT id, user_id
     FROM auth_accounts
     WHERE provider = 'google' AND provider_account_id = ?`,
  )
    .bind(userInfo.sub)
    .first<{ id: string; user_id: string }>();

  if (providerAccount) {
    if (providerAccount.user_id !== userId) {
      throw new GoogleAccountConflictError();
    }
    await env.DB.prepare(
      `UPDATE auth_accounts
       SET email = ?, name = ?, image = ?, access_token = ?, refresh_token = COALESCE(?, refresh_token),
           token_type = ?, scope = ?, expires_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(
        email,
        name,
        image,
        tokenData.access_token,
        tokenData.refresh_token ?? null,
        tokenData.token_type ?? null,
        tokenData.scope ?? null,
        expiresAt,
        providerAccount.id,
      )
      .run();
    return providerAccount.id;
  }

  const insertResult = await env.DB.prepare(
    `INSERT INTO auth_accounts (
       id, user_id, provider, provider_account_id,
       email, name, image,
       access_token, refresh_token, token_type, scope, expires_at,
       created_at, updated_at
     ) VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
  )
    .bind(
      crypto.randomUUID(),
      userId,
      userInfo.sub,
      email,
      name,
      image,
      tokenData.access_token,
      tokenData.refresh_token ?? null,
      tokenData.token_type ?? null,
      tokenData.scope ?? null,
      expiresAt,
    )
    .run();

  if (!insertResult?.success) {
    throw new Error("Failed to link Google account");
  }

  const created = await env.DB.prepare(
    `SELECT id
     FROM auth_accounts
     WHERE provider = 'google' AND provider_account_id = ?`,
  )
    .bind(userInfo.sub)
    .first<{ id: string }>();
  if (!created) {
    throw new Error("Google account creation failed");
  }
  return created.id;
}

export async function createGoogleRelinkIntent(
  env: CloudflareEnv,
  userId: string,
  userInfo: GoogleUserInfo,
  tokenData: GoogleTokenData,
): Promise<GoogleRelinkIntent> {
  await ensureAuthSchema(env);

  const relinkToken = randomToken(24);
  const tokenHash = await sha256(relinkToken);
  const expiresAt = nowSeconds() + OAUTH_TTL_SECONDS;
  const providerExpiresAt = nowSeconds() + tokenData.expires_in;
  const email = userInfo.email ? normalizeEmail(userInfo.email) : null;
  const name = normalizeName(userInfo.name);
  const image = userInfo.picture ?? null;

  await env.DB.prepare(`DELETE FROM auth_relink_tokens WHERE token_hash = ?`)
    .bind(tokenHash)
    .run();

  await env.DB.prepare(
    `INSERT INTO auth_relink_tokens (
       token_hash, target_user_id, provider, provider_account_id,
       email, name, image,
       access_token, refresh_token, token_type, scope, provider_expires_at, expires_at
     ) VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      tokenHash,
      userId,
      userInfo.sub,
      email,
      name,
      image,
      tokenData.access_token,
      tokenData.refresh_token ?? null,
      tokenData.token_type ?? null,
      tokenData.scope ?? null,
      providerExpiresAt,
      expiresAt,
    )
    .run();

  return {
    canRelink: true,
    code: "CONFLICT",
    message: "Google account is linked to another user",
    provider: "google",
    relinkToken,
    status: 409,
  };
}

export async function relinkGoogleAccountToUser(
  env: CloudflareEnv,
  userId: string,
  relinkToken: string,
) {
  await ensureAuthSchema(env);

  const tokenHash = await sha256(relinkToken);
  const relinkState = await env.DB.prepare(
    `SELECT target_user_id, provider_account_id, email, name, image, access_token, refresh_token, token_type, scope, provider_expires_at, expires_at
     FROM auth_relink_tokens
     WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{
      target_user_id: string;
      provider_account_id: string;
      email: string | null;
      name: string | null;
      image: string | null;
      access_token: string;
      refresh_token: string | null;
      token_type: string | null;
      scope: string | null;
      provider_expires_at: number;
      expires_at: number;
    }>();

  if (!relinkState || relinkState.expires_at < nowSeconds()) {
    throw new GoogleRelinkTokenError();
  }

  if (relinkState.target_user_id !== userId) {
    throw new GoogleRelinkTokenError("Relink token does not belong to this user");
  }

  const providerAccount = await env.DB.prepare(
    `SELECT id, user_id
     FROM auth_accounts
     WHERE provider = 'google' AND provider_account_id = ?`,
  )
    .bind(relinkState.provider_account_id)
    .first<{ id: string; user_id: string }>();

  if (!providerAccount) {
    throw new GoogleRelinkTokenError("Google account is no longer available for relink");
  }

  await env.DB.prepare(
    `UPDATE auth_accounts
     SET user_id = ?, email = ?, name = ?, image = ?, access_token = ?, refresh_token = ?, token_type = ?, scope = ?, expires_at = ?, updated_at = datetime('now')
     WHERE provider = 'google' AND provider_account_id = ?`,
  )
    .bind(
      userId,
      relinkState.email,
      relinkState.name,
      relinkState.image,
      relinkState.access_token,
      relinkState.refresh_token,
      relinkState.token_type,
      relinkState.scope,
      relinkState.provider_expires_at,
      relinkState.provider_account_id,
    )
    .run();

  await env.DB.prepare(`DELETE FROM auth_relink_tokens WHERE token_hash = ?`)
    .bind(tokenHash)
    .run();

  return {
    accountId: providerAccount.id,
    provider: "google" as const,
    providerAccountId: relinkState.provider_account_id,
    userId,
  };
}

export async function disconnectGoogleAccountFromUser(
  env: CloudflareEnv,
  userId: string,
) {
  await ensureAuthSchema(env);

  const user = await env.DB.prepare(
    `SELECT password_hash, password_salt
     FROM auth_users
     WHERE id = ?`,
  )
    .bind(userId)
    .first<{ password_hash: string | null; password_salt: string | null }>();

  if (!user?.password_hash || !user.password_salt) {
    throw new GoogleDisconnectError();
  }

  await env.DB.prepare(
    `DELETE FROM auth_accounts
     WHERE user_id = ? AND provider = 'google'`,
  )
    .bind(userId)
    .run();
}

async function createUserFromGoogleInfo(env: CloudflareEnv, userInfo: GoogleUserInfo) {
  const email = userInfo.email ? normalizeEmail(userInfo.email) : null;
  const existing = email
    ? await env.DB.prepare(`SELECT id FROM auth_users WHERE email = ?`)
        .bind(email)
        .first<{ id: string }>()
    : null;
  if (existing?.id) {
    return existing.id;
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auth_users (id, email, name, image, password_updated_at)
     VALUES (?, ?, ?, ?, NULL)`,
  )
    .bind(
      id,
      email,
      normalizeName(userInfo.name),
      userInfo.picture ?? null,
    )
    .run();
  return id;
}

async function getUserById(env: CloudflareEnv, userId: string) {
  return env.DB.prepare(
    `SELECT id, email, name, image
     FROM auth_users
     WHERE id = ?`,
  )
    .bind(userId)
    .first<AuthUser>();
}

export async function signInWithGoogle(
  env: CloudflareEnv,
  userInfo: GoogleUserInfo,
  tokenData: GoogleTokenData,
) {
  await ensureAuthSchema(env);

  const existingAccount = await env.DB.prepare(
    `SELECT user_id
     FROM auth_accounts
     WHERE provider = 'google' AND provider_account_id = ?`,
  )
    .bind(userInfo.sub)
    .first<{ user_id: string }>();

  let userId: string;
  if (existingAccount) {
    userId = existingAccount.user_id;
  } else {
    const normalizedEmail = userInfo.email ? normalizeEmail(userInfo.email) : null;
    const existingUser = normalizedEmail
      ? await env.DB.prepare(`SELECT id FROM auth_users WHERE email = ?`)
          .bind(normalizedEmail)
          .first<{ id: string }>()
      : null;
    if (existingUser) {
      userId = existingUser.id;
      await env.DB.prepare(
        `UPDATE auth_users
         SET name = COALESCE(?, name), image = COALESCE(?, image)
         WHERE id = ?`,
      )
        .bind(normalizeName(userInfo.name), userInfo.picture ?? null, userId)
        .run();
    } else {
      userId = await createUserFromGoogleInfo(env, userInfo);
    }
  }

  await upsertGoogleAccountForUser(env, userId, userInfo, tokenData);
  const user = await getUserById(env, userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

function parseOAuthState(state: string | null, request: Request) {
  const requestState = state;
  if (!requestState) {
    return null;
  }
  const cookies = parseCookies(request.headers.get("cookie"));
  const storedState = cookies[OAUTH_STATE_COOKIE];
  const storedVerifier = cookies[OAUTH_VERIFIER_COOKIE];
  if (!storedState || !storedVerifier || storedState !== requestState) {
    return null;
  }
  return {
    state: requestState,
    verifier: storedVerifier,
    storedState,
  };
}

async function resolveOAuthFlow(
  env: CloudflareEnv,
  state: string | null,
  request: Request,
): Promise<GoogleOAuthState | null> {
  const parsed = parseOAuthState(state, request);
  if (!parsed) {
    return null;
  }
  const linkedState = await consumeOauthState(env, parsed.state);
  if (linkedState) {
    if (linkedState.verifier !== parsed.verifier) {
      return null;
    }
    if (linkedState.purpose === "link") {
      if (!linkedState.userId) {
        return null;
      }
      return {
        mode: "link",
        verifier: parsed.verifier,
        userId: linkedState.userId,
      };
    }
  }
  return {
    mode: "signin",
    verifier: parsed.verifier,
  };
}

async function exchangeGoogleCode(
  env: CloudflareEnv,
  code: string,
  codeVerifier: string,
  redirectUri: string,
) {
  const resolved = resolveEnv(env);
  const tokenBody = new URLSearchParams({
    client_id: resolved.AUTH_GOOGLE_ID ?? "",
    client_secret: resolved.AUTH_GOOGLE_SECRET ?? "",
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const tokenData = (await tokenRes.json()) as GoogleTokenData;
  if (!tokenData.access_token || !tokenData.expires_in) {
    throw new Error("Invalid token response");
  }
  return tokenData;
}

async function fetchGoogleUser(accessToken: string) {
  const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    const text = await userRes.text();
    throw new Error(`Userinfo failed: ${text}`);
  }
  return (await userRes.json()) as GoogleUserInfo;
}

export async function startGoogleOAuth(
  request: Request,
  options: {
    purpose?: "signin" | "link"
    userId?: string | null
    callbackPath?: string
  } = {},
) {
  const { env } = await getCloudflareContext({ async: true });
  await ensureAuthSchema(env);
  ensureEnv(env);

  const requestOrigin = new URL(request.url).origin;
  const resolved = resolveEnv(env);
  const baseOrigin = requestOrigin || resolved.AUTH_URL || "http://localhost:3000";
  const secure = baseOrigin.startsWith("https://");
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  const callbackPath = options.callbackPath || "/api/auth/callback/google";

  const purpose = options.purpose === "link" ? "link" : "signin";
  const verifier = randomToken(32);
  const challenge = await sha256(verifier);
  const state = await createOauthState(env, verifier, 15, {
    purpose,
    userId: options.userId,
  });

  if (purpose === "link" && !options.userId) {
    throw new Error("Missing user id for link flow");
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", resolved.AUTH_GOOGLE_ID ?? "");
  authUrl.searchParams.set("redirect_uri", new URL(callbackPath, baseOrigin).toString());
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

export async function handleGoogleCallback(
  request: Request,
  options: { callbackPath?: string } = {},
) {
  const { env } = await getCloudflareContext({ async: true });
  await ensureAuthSchema(env);
  ensureEnv(env);

  const resolved = resolveEnv(env);
  const requestOrigin = new URL(request.url).origin;
  const baseOrigin = requestOrigin || resolved.AUTH_URL || "http://localhost:3000";
  const callbackPath = options.callbackPath || "/api/auth/callback/google";

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response("Missing code/state", { status: 400 });
  }

  const cookies = parseCookies(request.headers.get("cookie"));
  const returnTo = sanitizeReturnTo(cookies[OAUTH_RETURN_TO_COOKIE]);
  const localizedHome = getLocalizedHomeFromCookies(cookies);
  const oauthState = await resolveOAuthFlow(env, state, request);
  if (!oauthState) {
    return new Response("Invalid OAuth state", { status: 400 });
  }

  let tokenData: GoogleTokenData;
  try {
    tokenData = await exchangeGoogleCode(
      env,
      code,
      oauthState.verifier,
      new URL(callbackPath, baseOrigin).toString(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token exchange failed";
    return new Response(message, { status: 400 });
  }

  let userInfo: GoogleUserInfo;
  try {
    userInfo = await fetchGoogleUser(tokenData.access_token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Userinfo failed";
    return new Response(message, { status: 400 });
  }

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE));
  headers.append("Set-Cookie", clearCookie(OAUTH_VERIFIER_COOKIE));
  headers.append("Set-Cookie", clearCookie(OAUTH_RETURN_TO_COOKIE));

  if (oauthState.mode === "link" && oauthState.userId) {
    try {
      await upsertGoogleAccountForUser(env, oauthState.userId, userInfo, tokenData);
    } catch (error) {
      if (error instanceof GoogleAccountConflictError) {
        const relink = await createGoogleRelinkIntent(env, oauthState.userId, userInfo, tokenData);
        const redirectTarget = withSearchParams(
          getLocalizedGoogleRelinkPath(cookies),
          {
            googleRelink: "1",
            relinkToken: relink.relinkToken,
            provider: relink.provider,
            returnTo: returnTo ?? localizedHome,
          },
        );
        headers.set("Location", redirectTarget);
        return new Response(null, { status: 302, headers });
      }
      throw error;
    }
    headers.set("Location", returnTo ?? localizedHome);
    return new Response(null, { status: 302, headers });
  }

  const user = await signInWithGoogle(env, userInfo, tokenData);
  const session = await createSessionForUser(env, user.id);
  headers.append("Set-Cookie", buildSessionCookieFromRequest(request, session.sessionToken));
  headers.set("Location", returnTo ?? localizedHome);
  return new Response(null, { status: 302, headers });
}

export async function auth(request?: Request): Promise<AuthSession | null> {
  const { env } = await getCloudflareContext({ async: true });
  await ensureAuthSchema(env);
  const resolvedRequest = request ?? await buildAuthRequestFromNextHeaders();

  const cookieHeader = resolvedRequest.headers.get("cookie");
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

export async function handleSession(request: Request) {
  const session = await auth(request);
  return Response.json({ session });
}

export async function handleLogout(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  await ensureAuthSchema(env);

  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionToken = cookies[SESSION_COOKIE];
  if (sessionToken) {
    await env.DB.prepare(`DELETE FROM auth_sessions WHERE session_token = ?`).bind(sessionToken).run();
  }

  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(SESSION_COOKIE));
  headers.set("Location", getLocalizedHomeFromCookies(cookies));
  return new Response(null, { status: 302, headers });
}
