import openNext from "./.open-next/worker.js"
import { enqueueDailySync, processSyncBatch } from "./lib/gsc-sync"
import type { GscSyncMessage } from "./lib/gsc-sync"

const worker = {
  fetch: openNext.fetch,
  async scheduled(_event: unknown, env: CloudflareEnv, ctx: { waitUntil: (promise: Promise<unknown>) => void }) {
    ctx.waitUntil(enqueueDailySync(env))
  },
  async queue(
    batch: {
      messages: Array<{
        body: GscSyncMessage & { date?: string }
        ack: () => void
        retry: (opts: { delaySeconds: number }) => void
      }>
    },
    env: CloudflareEnv,
  ) {
    // Normalize old {siteId, date} messages to new {siteId, startDate, endDate}
    const normalize = (body: GscSyncMessage & { date?: string }): GscSyncMessage => {
      if (body.startDate && body.endDate) return body
      const d = body.date ?? ""
      return { siteId: body.siteId, startDate: d, endDate: d }
    }

    const syncMessages = batch.messages.map((m) => normalize(m.body))
    const results = await processSyncBatch(syncMessages, env)

    for (let i = 0; i < batch.messages.length; i++) {
      const msg = syncMessages[i]
      const key = `${msg.siteId}:${msg.startDate}:${msg.endDate}`
      const result = results.get(key)
      if (result?.ok) {
        batch.messages[i].ack()
      } else {
        batch.messages[i].retry({ delaySeconds: 60 })
      }
    }
  },
}

export default worker
