const scalarScriptUrl = "https://cdn.jsdelivr.net/npm/@scalar/api-reference"

const html = `<!doctype html>
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
        url: '/openapi-mobile.yaml'
      })
    </script>
  </body>
</html>`

export async function GET() {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  })
}
