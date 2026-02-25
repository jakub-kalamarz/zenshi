declare module "*.open-next/worker.js" {
  type OpenNextWorker = {
    fetch: (request: Request, env: CloudflareEnv, ctx: ExecutionContext) => Promise<Response> | Response
  }

  const worker: OpenNextWorker
  export default worker
}
