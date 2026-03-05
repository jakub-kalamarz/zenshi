export type FakeRow = Record<string, unknown>

type TableName =
  | "auth_accounts"
  | "auth_sessions"
  | "auth_users"
  | "mobile_oauth_states"
  | "api_tokens"

type Seed = Partial<Record<TableName, FakeRow[]>>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneRows(rows: FakeRow[]) {
  return rows.map((row) => clone(row))
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : value
}

function normalize(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase()
}

function extractColumns(sql: string) {
  const match = sql.match(/insert into [^(]+\(([^)]+)\)/i)
  if (!match) return []
  return match[1].split(",").map((column) => column.trim())
}

export function createFakeDb(seed: Seed = {}) {
  const tables: Record<TableName, FakeRow[]> = {
    auth_accounts: seed.auth_accounts ? cloneRows(seed.auth_accounts) : [],
    auth_sessions: seed.auth_sessions ? cloneRows(seed.auth_sessions) : [],
    auth_users: seed.auth_users ? cloneRows(seed.auth_users) : [],
    mobile_oauth_states: seed.mobile_oauth_states
      ? cloneRows(seed.mobile_oauth_states)
      : [],
    api_tokens: seed.api_tokens ? cloneRows(seed.api_tokens) : [],
  }

  function findAuthAccountByProviderSub(sub: unknown) {
    const row = tables.auth_accounts.find((item) => item.provider_account_id === sub)
    return row ? clone(row) : null
  }

  function findAuthAccountByUserAndProvider(userId: unknown) {
    const row = tables.auth_accounts.find(
      (item) => item.user_id === userId && item.provider === "google",
    )
    return row ? clone(row) : null
  }

  function findAuthUserByEmail(email: unknown) {
    const normalized = normalizeEmail(email)
    const row = tables.auth_users.find((item) => item.email === normalized)
    return row ? clone(row) : null
  }

  function deleteMobileOauthState(state: unknown) {
    const before = tables.mobile_oauth_states.length
    tables.mobile_oauth_states = tables.mobile_oauth_states.filter((row) => row.state !== state)
    return before - tables.mobile_oauth_states.length
  }

  function bindRunner(sql: string) {
    let bound: unknown[] = []
    const preparedSql = normalize(sql)
    const prepared = {
      bind: (...values: unknown[]) => {
        bound = values
        return prepared
      },
      first: async <T>() => {
        const row = runFirst(preparedSql, bound)
        return row ? (row as T) : null
      },
      all: async () => {
        const rows = runAll(preparedSql, bound)
        return { results: rows as FakeRow[] }
      },
      run: async () => {
        const result = runStatement(preparedSql, bound)
        return { success: true, meta: { changes: result.changes } }
      },
    }
    return prepared
  }

  function runFirst(sql: string, values: unknown[]) {
    if (sql.startsWith("create table") || sql.startsWith("create unique")) return null

    if (sql.includes("select verifier, purpose, user_id, expires_at")) {
      const row = tables.mobile_oauth_states.find((item) => item.state === values[0])
      return row ? clone(row) : null
    }

    if (sql.includes("select id, user_id from auth_accounts")) {
      const account = findAuthAccountByProviderSub(values[0])
      return account ? { id: account.id, user_id: account.user_id } : null
    }

    if (sql.includes("select id from auth_accounts") && sql.includes("provider_account_id")) {
      const account = findAuthAccountByProviderSub(values[0])
      return account
    }

    if (
      sql.includes("select id, access_token, refresh_token, expires_at")
      && sql.includes("provider = 'google'")
    ) {
      const account = findAuthAccountByUserAndProvider(values[0])
      return account ? clone(account) : null
    }

    if (sql.includes("select id, email, name, image, password_hash, password_salt")) {
      const user = findAuthUserByEmail(values[0])
      return user
        ? {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
          password_hash: user.password_hash ?? null,
          password_salt: user.password_salt ?? null,
        }
        : null
    }

    if (sql.includes("select id from auth_users")) {
      const user = findAuthUserByEmail(values[0])
      return user ? { id: user.id } : null
    }

    if (sql.includes("select id, email from auth_users where id")) {
      const user = tables.auth_users.find((item) => item.id === values[0])
      return user ? clone({ id: user.id, email: user.email ?? null, name: user.name ?? null, image: user.image ?? null }) : null
    }

    return null
  }

  function runAll(_sql: string, _values: unknown[]) {
    return []
  }

  function runStatement(sql: string, values: unknown[]) {
    if (
      sql.startsWith("create table")
      || sql.startsWith("create index")
      || sql.startsWith("create unique")
    ) {
      return { changes: 0 }
    }

    if (sql.startsWith("insert into auth_accounts")) {
      const columns = extractColumns(sql)
      const row: FakeRow = {}
      if (columns.includes("provider")) {
        let valueIndex = 0
        for (const column of columns) {
          if (column === "provider") {
            row[column] = "google"
            continue
          }
          row[column] = values[valueIndex]
          valueIndex += 1
        }
      } else {
        columns.forEach((column, index) => {
          row[column] = values[index]
        })
      }
      tables.auth_accounts.push(row)
      return { changes: 1 }
    }

    if (sql.startsWith("insert into auth_sessions")) {
      const columns = extractColumns(sql)
      const row: FakeRow = {}
      columns.forEach((column, index) => {
        row[column] = values[index]
      })
      tables.auth_sessions.push(row)
      return { changes: 1 }
    }

    if (sql.startsWith("insert into auth_users")) {
      const columns = extractColumns(sql)
      const row: FakeRow = {}
      columns.forEach((column, index) => {
        row[column] = values[index]
      })
      if (!row.password_updated_at) {
        row.password_updated_at = null
      }
      tables.auth_users.push(row)
      return { changes: 1 }
    }

    if (sql.startsWith("insert into mobile_oauth_states")) {
      const [state, verifier, purpose, userId, expiresAt] = values
      tables.mobile_oauth_states.push({
        state,
        verifier,
        purpose,
        user_id: userId,
        expires_at: expiresAt,
      })
      return { changes: 1 }
    }

    if (sql.startsWith("insert into api_tokens")) {
      const columns = extractColumns(sql)
      const row: FakeRow = {}
      columns.forEach((column, index) => {
        row[column] = values[index]
      })
      tables.api_tokens.push(row)
      return { changes: 1 }
    }

    if (sql.startsWith("update auth_accounts")) {
      const id = values[5]
      const target = tables.auth_accounts.find((item) => item.id === id)
      if (!target) return { changes: 0 }
      target.access_token = values[0]
      target.refresh_token = values[1] === null ? target.refresh_token : values[1]
      target.token_type = values[2]
      target.scope = values[3]
      target.expires_at = values[4]
      target.updated_at = new Date().toISOString()
      return { changes: 1 }
    }

    if (sql.startsWith("delete from mobile_oauth_states")) {
      const removed = deleteMobileOauthState(values[0])
      return { changes: removed }
    }

    if (sql.startsWith("update api_tokens")) {
      const tokenHash = values[0]
      const target = tables.api_tokens.find((item) => item.token_hash === tokenHash)
      if (!target) return { changes: 0 }
      target.revoked_at = new Date().toISOString()
      return { changes: 1 }
    }

    return { changes: 0 }
  }

  return {
    prepare: (sql: string) => bindRunner(sql),
    table: (name: TableName) => tables[name],
  }
}
