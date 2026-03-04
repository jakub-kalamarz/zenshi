type MobileEnv = CloudflareEnv & {
  MOBILE_ALLOWED_ORIGINS?: string
  AUTH_URL?: string
}

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:3001"]

function resolveAllowedOrigins(env: MobileEnv) {
  const envList = env.MOBILE_ALLOWED_ORIGINS
  const parsed = envList
    ? envList.split(",").map((value) => value.trim()).filter(Boolean)
    : []
  const authUrl = env.AUTH_URL ? [env.AUTH_URL] : []
  return Array.from(new Set([...parsed, ...authUrl, ...DEFAULT_ALLOWED_ORIGINS]))
}

function resolveOrigin(request: Request) {
  return request.headers.get("origin")
}

export function getMobileCorsHeaders(request: Request, env: MobileEnv) {
  const headers = new Headers()
  const origin = resolveOrigin(request)
  if (!origin) return headers

  const allowed = resolveAllowedOrigins(env)
  if (allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Vary", "Origin")
    headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
    headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type")
  }
  return headers
}

export function withMobileCors(
  response: Response,
  request: Request,
  env: MobileEnv,
) {
  const cors = getMobileCorsHeaders(request, env)
  cors.forEach((value, key) => {
    response.headers.set(key, value)
  })
  return response
}

export function mobileJson(
  data: unknown,
  request: Request,
  env: MobileEnv,
  init: ResponseInit = {},
) {
  const response = Response.json({ ok: true, data }, init)
  return withMobileCors(response, request, env)
}

export function mobileError(
  code: string,
  message: string,
  request: Request,
  env: MobileEnv,
  status = 400,
  details?: Record<string, unknown>,
) {
  const response = Response.json(
    { ok: false, error: { code, message, details } },
    { status },
  )
  return withMobileCors(response, request, env)
}

export function handleMobileOptions(request: Request, env: MobileEnv) {
  if (request.method !== "OPTIONS") return null
  const headers = getMobileCorsHeaders(request, env)
  return new Response(null, { status: 204, headers })
}

function mapStatusToCode(status: number) {
  if (status === 401) return "UNAUTHORIZED"
  if (status === 403) return "FORBIDDEN"
  if (status === 404) return "NOT_FOUND"
  if (status === 409) return "CONFLICT"
  if (status >= 500) return "INTERNAL"
  return "VALIDATION_ERROR"
}

export function mobileFromService(
  result: { ok: boolean; data?: unknown; status?: number; message?: string },
  request: Request,
  env: MobileEnv,
) {
  if (result.ok) {
    return mobileJson(result.data, request, env)
  }
  const status = result.status ?? 400
  return mobileError(
    mapStatusToCode(status),
    result.message ?? "Request failed",
    request,
    env,
    status,
  )
}
