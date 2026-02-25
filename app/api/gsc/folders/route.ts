import { auth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { ensureGscSchema } from "@/lib/gsc-schema"

const NAME_MAX = 60
const ALLOWED_ICONS = new Set([
  "folder",
  "globe",
  "chart",
  "rocket",
  "briefcase",
  "store",
  "code",
  "megaphone",
  "money",
  "users",
  "shield",
  "wrench",
  "lightning",
  "database",
  "house",
  "target",
  "cart",
  "puzzle",
  "cloud",
  "star",
  "settings",
  "palette",
  "news",
  "health",
])
const ALLOWED_COLORS = new Set([
  "#6b7280",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
])

function normalizeName(input: string) {
  return input.trim()
}

function normalizeIcon(input?: string) {
  const icon = (input ?? "folder").trim().toLowerCase()
  return ALLOWED_ICONS.has(icon) ? icon : null
}

function normalizeColor(input?: string) {
  const color = (input ?? "#6b7280").trim().toLowerCase()
  return ALLOWED_COLORS.has(color) ? color : null
}

export async function GET(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const folders = await env.DB.prepare(
    `SELECT id, name, icon, color, created_at, updated_at
     FROM gsc_folders
     WHERE owner_user_id = ?
     ORDER BY name ASC`,
  )
    .bind(session.user.id)
    .all()

  return Response.json({ folders: folders.results ?? [] })
}

export async function POST(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string
    icon?: string
    color?: string
  } | null
  const name = normalizeName(body?.name ?? "")
  const icon = normalizeIcon(body?.icon)
  const color = normalizeColor(body?.color)
  if (!name || name.length > NAME_MAX) {
    return new Response("Invalid name", { status: 400 })
  }
  if (!icon || !color) {
    return new Response("Invalid icon or color", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const existing = await env.DB.prepare(
    `SELECT id FROM gsc_folders
     WHERE owner_user_id = ? AND lower(name) = lower(?)`,
  )
    .bind(session.user.id, name)
    .first()

  if (existing) {
    return new Response("Folder name already exists", { status: 409 })
  }

  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO gsc_folders (id, owner_user_id, name, icon, color)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, session.user.id, name, icon, color)
    .run()

  return Response.json({ id, name, icon, color })
}

export async function PATCH(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    folderId?: string
    name?: string
    icon?: string
    color?: string
  } | null
  const folderId = body?.folderId?.trim()
  const name = normalizeName(body?.name ?? "")
  const icon = normalizeIcon(body?.icon)
  const color = normalizeColor(body?.color)

  if (!folderId || !name || name.length > NAME_MAX) {
    return new Response("Invalid request", { status: 400 })
  }
  if (!icon || !color) {
    return new Response("Invalid icon or color", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const folder = await env.DB.prepare(
    `SELECT id FROM gsc_folders WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(folderId, session.user.id)
    .first()

  if (!folder) {
    return new Response("Folder not found", { status: 404 })
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM gsc_folders
     WHERE owner_user_id = ? AND lower(name) = lower(?) AND id != ?`,
  )
    .bind(session.user.id, name, folderId)
    .first()

  if (existing) {
    return new Response("Folder name already exists", { status: 409 })
  }

  await env.DB.prepare(
    `UPDATE gsc_folders
     SET name = ?, icon = ?, color = ?, updated_at = datetime('now')
     WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(name, icon, color, folderId, session.user.id)
    .run()

  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await auth(request)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { folderId?: string } | null
  const folderId = body?.folderId?.trim()
  if (!folderId) {
    return new Response("Missing folderId", { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await ensureGscSchema(env)

  const folder = await env.DB.prepare(
    `SELECT id FROM gsc_folders WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(folderId, session.user.id)
    .first()

  if (!folder) {
    return new Response("Folder not found", { status: 404 })
  }

  await env.DB.prepare(
    `DELETE FROM gsc_site_folders WHERE folder_id = ?`,
  )
    .bind(folderId)
    .run()

  await env.DB.prepare(
    `DELETE FROM gsc_folders WHERE id = ? AND owner_user_id = ?`,
  )
    .bind(folderId, session.user.id)
    .run()

  return Response.json({ ok: true })
}
