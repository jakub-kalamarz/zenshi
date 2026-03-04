const scalarScriptUrl = "https://cdn.jsdelivr.net/npm/@scalar/api-reference"

function renderHtml(openapiUrl: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Reference</title>
    <style>
      html, body { height: 100%; margin: 0; }
      #api-reference { height: 100vh; }
    </style>
  </head>
  <body>
    <div id="api-reference"></div>
    <script src="${scalarScriptUrl}"></script>
    <script>
      Scalar.createApiReference('#api-reference', {
        sources: [
          {
            url: '${openapiUrl}',
            title: 'Zenshi Mobile API',
            slug: 'mobile',
            default: true,
          }
        ],
        agent: {
          disabled: true
        }
      })
    </script>
  </body>
</html>`
}

export async function GET(request: Request) {
  const openapiUrl = new URL("/openapi-mobile.yaml", request.url).toString();
  return new Response(renderHtml(openapiUrl), {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  })
}
