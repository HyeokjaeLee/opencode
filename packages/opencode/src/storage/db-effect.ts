import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import type { EffectSQLiteDatabase } from "@opencode-ai/effect-drizzle-sqlite"
import { Context, Effect, Layer } from "effect"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { InstallationChannel } from "@opencode-ai/core/installation/version"
import * as Log from "@opencode-ai/core/util/log"
import { iife } from "@/util/iife"
import * as StorageSchema from "@/storage/schema"
import { init } from "#db"

declare const OPENCODE_MIGRATIONS: { sql: string; timestamp: number; name: string }[] | undefined

const log = Log.create({ service: "db" })

export function getChannelPath() {
  if (["latest", "beta", "prod"].includes(InstallationChannel) || Flag.OPENCODE_DISABLE_CHANNEL_DB)
    return path.join(Global.Path.data, "opencode.db")
  const safe = InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")
  return path.join(Global.Path.data, `opencode-${safe}.db`)
}

export const Path = iife(() => {
  if (Flag.OPENCODE_DB) {
    if (Flag.OPENCODE_DB === ":memory:" || path.isAbsolute(Flag.OPENCODE_DB)) return Flag.OPENCODE_DB
    return path.join(Global.Path.data, Flag.OPENCODE_DB)
  }
  return getChannelPath()
})

type Journal = { sql: string; timestamp: number; name: string }[]

function timestampFromTag(tag: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag)
  if (!match) return 0
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
}

function readMigrations(dir: string): Journal {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const file = path.join(dir, entry.name, "migration.sql")
      if (!existsSync(file)) return []
      return [{ sql: readFileSync(file, "utf-8"), timestamp: timestampFromTag(entry.name), name: entry.name }]
    })
    .sort((a, b) => a.timestamp - b.timestamp)
}

export class Service extends Context.Service<Service, EffectSQLiteDatabase<typeof StorageSchema>>()(
  "@opencode/DatabaseEffect",
) {}

// The layer owns the SQLite connection. `Effect.acquireRelease` opens the
// handle, applies PRAGMAs and migrations, and registers a finalizer that
// closes the handle when the layer's scope ends.
//
// Multiple runtimes (AppRuntime, BootstrapRuntime, the dedicated DbRuntime
// behind `Database.use`) share this layer through the global memoMap. The
// memoMap refcounts the entry by scope; the finalizer fires only after the
// last runtime referencing it has been disposed. In production no runtime
// is ever disposed so the connection lives for the process; in tests
// `resetDatabase` disposes every runtime and the close fires automatically.
export const layer = Layer.effect(
  Service,
  Effect.acquireRelease(
    Effect.sync(() => {
      log.info("opening database", { path: Path })
      const db = init(Path, StorageSchema)
      db.run("PRAGMA journal_mode = WAL")
      db.run("PRAGMA synchronous = NORMAL")
      db.run("PRAGMA busy_timeout = 5000")
      db.run("PRAGMA cache_size = -64000")
      db.run("PRAGMA foreign_keys = ON")
      db.run("PRAGMA wal_checkpoint(PASSIVE)")

      const source =
        typeof OPENCODE_MIGRATIONS !== "undefined"
          ? OPENCODE_MIGRATIONS
          : readMigrations(path.join(import.meta.dirname, "../../migration"))
      if (source.length > 0) {
        log.info("applying migrations", {
          count: source.length,
          mode: typeof OPENCODE_MIGRATIONS !== "undefined" ? "bundled" : "dev",
        })
        // Mapping rather than mutating preserves the bundled `OPENCODE_MIGRATIONS`
        // array so a subsequent acquire (after Database.close) sees the original
        // SQL even if `OPENCODE_SKIP_MIGRATIONS` was toggled mid-process.
        const entries = Flag.OPENCODE_SKIP_MIGRATIONS
          ? source.map((item) => ({ ...item, sql: "select 1;" }))
          : source
        migrate(db, entries)
      }
      return db
    }),
    (db) =>
      Effect.sync(() => {
        log.info("closing database")
        db.$client.close()
      }),
  ),
)

export * as DatabaseEffect from "./db-effect"
