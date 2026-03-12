import { getCloudflareContext } from "@opennextjs/cloudflare";
import { auth, relinkGoogleAccountToUser, GoogleRelinkTokenError } from "@/lib/auth";
import { getLocalePath, normalizeLocale } from "@/lib/locale";

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

function sanitizeReturnTo(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("://")) return null;
  return value;
}

function localizedRelinkPath(request: Request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const locale = normalizeLocale(cookies.NEXT_LOCALE);
  return getLocalePath(locale, "/auth/google-relink");
}

function wantsJson(request: Request) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("application/json");
}

async function readBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      relinkToken?: string;
      returnTo?: string;
    } | null;
    return {
      relinkToken: body?.relinkToken ?? "",
      returnTo: sanitizeReturnTo(body?.returnTo),
    };
  }

  const formData = await request.formData().catch(() => null);
  return {
    relinkToken: String(formData?.get("relinkToken") ?? ""),
    returnTo: sanitizeReturnTo(String(formData?.get("returnTo") ?? "")),
  };
}

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  const session = await auth(request);
  if (!session) {
    if (wantsJson(request)) {
      return Response.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        { status: 401 },
      );
    }
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }

  const { relinkToken, returnTo } = await readBody(request);
  if (!relinkToken) {
    if (wantsJson(request)) {
      return Response.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "Missing relink token" } },
        { status: 400 },
      );
    }
    const fallback = localizedRelinkPath(request);
    return new Response(null, {
      status: 302,
      headers: { Location: `${fallback}?error=missing-token` },
    });
  }

  try {
    await relinkGoogleAccountToUser(env, session.user.id, relinkToken);
  } catch (error) {
    if (error instanceof GoogleRelinkTokenError) {
      if (wantsJson(request)) {
        return Response.json(
          { ok: false, error: { code: error.code, message: error.message } },
          { status: error.status },
        );
      }
      const fallback = localizedRelinkPath(request);
      return new Response(null, {
        status: 302,
        headers: { Location: `${fallback}?error=invalid-token` },
      });
    }
    throw error;
  }

  if (wantsJson(request)) {
    return Response.json({ ok: true, data: { linked: true } });
  }

  const location = sanitizeReturnTo(returnTo) ?? getLocalePath(normalizeLocale(parseCookies(request.headers.get("cookie")).NEXT_LOCALE), "/");
  return new Response(null, { status: 302, headers: { Location: `${location}${location.includes("?") ? "&" : "?"}googleLinked=1` } });
}
