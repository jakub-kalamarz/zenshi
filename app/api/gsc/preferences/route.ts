import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureGscSchema } from "@/lib/gsc-schema"
import { parseGranularity } from "@/lib/gsc-analytics"
import { clampGranularity } from "@/lib/gsc-granularity"

type PreferencesPayload = {
  compareMode: "disabled" | "previous" | "yoy" | "custom"
  compareSettings: {
    showPreviousTrend: boolean
    matchWeekdays: boolean
    showChangePercent: boolean
  }
  folderOpenKeys: string[]
  granularity: "day" | "week" | "month"
  range: { start: string; end: string }
  preset: string
  compareRange?: { start: string; end: string } | null
}

function parseFolderOpenKeys(value: unknown): string[] {
  if (typeof value !== "string" || !value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
}

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const row = await env.DB.prepare(
    `SELECT
       compare_mode,
       compare_show_previous_trend,
       compare_match_weekdays,
       compare_show_change_percent,
       folder_open_values,
       granularity,
       range_preset,
       range_start,
       range_end,
       compare_range_start,
       compare_range_end
     FROM gsc_user_preferences
     WHERE user_id = ?`,
  )
    .bind(session.user.id)
    .first()

  if (!row) {
    return Response.json({ preferences: null })
  }

  return Response.json({
    preferences: {
      compareMode: row.compare_mode,
      compareSettings: {
        showPreviousTrend: Boolean(row.compare_show_previous_trend),
        matchWeekdays: Boolean(row.compare_match_weekdays),
        showChangePercent: Boolean(row.compare_show_change_percent),
      },
      folderOpenKeys: parseFolderOpenKeys(row.folder_open_values),
      granularity: parseGranularity(
        typeof row.granularity === "string" ? row.granularity : null,
      ),
      preset: row.range_preset,
      range: row.range_start && row.range_end
        ? { start: row.range_start, end: row.range_end }
        : null,
      compareRange: row.compare_range_start && row.compare_range_end
        ? { start: row.compare_range_start, end: row.compare_range_end }
        : null,
    },
  })
}

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const payload = (await request.json()) as PreferencesPayload
  const normalizedGranularity = parseGranularity(payload.granularity)
  const persistedGranularity =
    payload.range?.start && payload.range?.end
      ? clampGranularity(
        normalizedGranularity,
        payload.range.start,
        payload.range.end,
      )
      : normalizedGranularity

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  await env.DB.prepare(
    `INSERT INTO gsc_user_preferences (
       user_id,
       compare_mode,
       compare_show_previous_trend,
       compare_match_weekdays,
       compare_show_change_percent,
       folder_open_values,
       granularity,
       range_preset,
       range_start,
       range_end,
       compare_range_start,
       compare_range_end,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       compare_mode = excluded.compare_mode,
       compare_show_previous_trend = excluded.compare_show_previous_trend,
       compare_match_weekdays = excluded.compare_match_weekdays,
       compare_show_change_percent = excluded.compare_show_change_percent,
       folder_open_values = excluded.folder_open_values,
       granularity = excluded.granularity,
       range_preset = excluded.range_preset,
       range_start = excluded.range_start,
       range_end = excluded.range_end,
       compare_range_start = excluded.compare_range_start,
       compare_range_end = excluded.compare_range_end,
       updated_at = datetime('now')`,
  )
    .bind(
      session.user.id,
      payload.compareMode,
      payload.compareSettings.showPreviousTrend ? 1 : 0,
      payload.compareSettings.matchWeekdays ? 1 : 0,
      payload.compareSettings.showChangePercent ? 1 : 0,
      JSON.stringify(
        (payload.folderOpenKeys ?? []).filter(
          (key, index, all): key is string =>
            typeof key === "string" && key.length > 0 && all.indexOf(key) === index,
        ),
      ),
      persistedGranularity,
      payload.preset,
      payload.range?.start ?? null,
      payload.range?.end ?? null,
      payload.compareRange?.start ?? null,
      payload.compareRange?.end ?? null,
    )
    .run()

  return Response.json({ ok: true })
}
