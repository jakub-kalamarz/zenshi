import { ApiReference } from "@scalar/nextjs-api-reference"

const scalarCdnUrl =
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.31.8"

export async function GET(request: Request) {
  const openapiUrl = new URL("/openapi-mobile.yaml", request.url).toString()

  return ApiReference({
    url: openapiUrl,
    title: "Zenshi Mobile API",
    cdn: scalarCdnUrl,
    agent: {
      disabled: true,
    },
  })()
}
