import { ManagedRuntime } from "effect"
export * from "drizzle-orm"
import { memoMap } from "@opencode-ai/core/effect/memo-map"
import { NamedError } from "@opencode-ai/core/util/error"
import z from "zod"
import { InstanceState } from "@/effect/instance-state"
import { LocalContext } from "@/util/local-context"
import { lazy } from "@/util/lazy"
import { DatabaseEffect } from "./db-effect"

export { Path, getChannelPath } from "./db-effect"

export const NotFoundError = NamedError.create(
  "NotFoundError",
  z.object({
    message: z.string(),
  }),
)

// Dedicated runtime that owns the DB layer. It exists separately from
// AppRuntime/BootstrapRuntime to keep the legacy sync `use` / `transaction`
// helpers reachable without an import cycle from app-runtime.ts. All three
// runtimes share the global memoMap so they resolve to the same Service.
const runtime = lazy(() => ManagedRuntime.make(DatabaseEffect.layer, { memoMap }))

// Resolves the current Drizzle handle. The Service value is stable for the
// lifetime of the runtime, so cache it to avoid paying fiber-startup cost on
// every `Database.use(cb)` call. `close()` clears the cache when the runtime
// is disposed.
let cached: Client | undefined
function resolve() {
  return runtime().runSync(DatabaseEffect.Service.asEffect())
}
export function client(): Client {
  return (cached ??= resolve())
}

export type Client = ReturnType<typeof resolve>

export type Transaction = Parameters<Parameters<Client["transaction"]>[0]>[0]

export type TxOrDb = Transaction | Client

// Disposes the dedicated DB runtime so its memoMap reference is released.
// When every other runtime consuming the layer has also been disposed, the
// memoMap drops the entry and the layer's finalizer closes the SQLite
// handle. Used by `test/fixture/db.ts:resetDatabase`.
export async function close() {
  const old = runtime.peek()
  cached = undefined
  runtime.reset()
  await old?.dispose()
}

const ctx = LocalContext.create<{
  tx: TxOrDb
  effects: (() => void | Promise<void>)[]
}>("database")

export function use<T>(callback: (trx: TxOrDb) => T): T {
  try {
    return callback(ctx.use().tx)
  } catch (err) {
    if (!(err instanceof LocalContext.NotFound)) throw err
  }
  const db = client()
  const effects: (() => void | Promise<void>)[] = []
  const result = ctx.provide({ effects, tx: db }, () => callback(db))
  for (const effect of effects) effect()
  return result
}

export function effect(fn: () => any | Promise<any>) {
  const bound = InstanceState.bind(fn)
  try {
    ctx.use().effects.push(bound)
  } catch {
    bound()
  }
}

type NotPromise<T> = T extends Promise<any> ? never : T

export function transaction<T>(
  callback: (tx: TxOrDb) => NotPromise<T>,
  options?: {
    behavior?: "deferred" | "immediate" | "exclusive"
  },
): NotPromise<T> {
  try {
    return callback(ctx.use().tx)
  } catch (err) {
    if (!(err instanceof LocalContext.NotFound)) throw err
  }
  const db = client()
  const effects: (() => void | Promise<void>)[] = []
  const txCallback = InstanceState.bind((tx: TxOrDb) => ctx.provide({ tx, effects }, () => callback(tx)))
  const result = db.transaction(txCallback, { behavior: options?.behavior }) as NotPromise<T>
  for (const effect of effects) effect()
  return result
}

export * as Database from "./db"
