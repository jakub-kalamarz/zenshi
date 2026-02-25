import { getCloudflareContext } from "@opennextjs/cloudflare"

const GOOGLE_FAVICON_ENDPOINT = "https://www.google.com/s2/favicons"
const DEFAULT_SIZE = 64

function normalizeDomain(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  if (lower.startsWith("sc-domain:")) {
    return lower.replace("sc-domain:", "")
  }
  if (/^[a-z0-9.-]+$/i.test(trimmed) && trimmed.includes(".")) {
    return trimmed.toLowerCase()
  }
  try {
    const url = new URL(trimmed)
    return url.hostname.toLowerCase()
  } catch {
    return null
  }
}

function faviconKey(domain: string, size: number) {
  const safe = domain.replace(/[^a-z0-9.-]/gi, "_")
  return `favicons/${safe}-${size}.png`
}

function globeSvg(size: number) {
  const stroke = "#94a3b8"
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256" fill="${stroke}"><path d="M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm88,104a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48ZM40,128a87.61,87.61,0,0,1,3.33-24H81.84a157.44,157.44,0,0,0,0,48H43.33A87.61,87.61,0,0,1,40,128ZM154,88H102a115.11,115.11,0,0,1,26-45A115.27,115.27,0,0,1,154,88Zm52.33,0H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM107.59,42.4A135.28,135.28,0,0,0,85.29,88H49.63A88.29,88.29,0,0,1,107.59,42.4ZM49.63,168H85.29a135.28,135.28,0,0,0,22.3,45.6A88.29,88.29,0,0,1,49.63,168Zm98.78,45.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z"/></svg>`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const siteUrl = searchParams.get("siteUrl")?.trim() ?? ""
  const sizeParam = Number(searchParams.get("size") ?? DEFAULT_SIZE)
  const size = Number.isFinite(sizeParam) && sizeParam > 0 ? Math.min(sizeParam, 256) : DEFAULT_SIZE
  const domain = normalizeDomain(siteUrl)

  if (!domain) {
    return new Response("Missing or invalid siteUrl", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  const bucket = env.FAVICON_BUCKET
  const key = faviconKey(domain, size)
  const cached = bucket ? await bucket.get(key) : null

  if (cached) {
    const headers = new Headers()
    const cachedType = cached.httpMetadata?.contentType
    if (cachedType) headers.set("content-type", cachedType)
    headers.set("cache-control", "public, max-age=604800, immutable")
    return new Response(cached.body, { headers })
  }

  const googleUrl = `${GOOGLE_FAVICON_ENDPOINT}?domain_url=${encodeURIComponent(`https://${domain}`)}&sz=${size}`
  let googleResponse: Response | null = null
  try {
    googleResponse = await fetch(googleUrl, {
      cf: { cacheTtl: 86400, cacheEverything: true },
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    })
  } catch {
    googleResponse = null
  }

  if (!googleResponse || !googleResponse.ok) {
    return new Response(globeSvg(size), {
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": "public, max-age=86400",
      },
    })
  }

  const contentType = googleResponse.headers.get("content-type") ?? "image/png"
  const body = await googleResponse.arrayBuffer()

  if (!contentType.startsWith("image/") || body.byteLength === 0) {
    return new Response(globeSvg(size), {
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": "public, max-age=86400",
      },
    })
  }

  if (bucket) {
    await bucket.put(key, body, {
      httpMetadata: { contentType },
    })
  }

  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=604800, immutable",
    },
  })
}
