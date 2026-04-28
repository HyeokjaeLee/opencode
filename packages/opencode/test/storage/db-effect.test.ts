import { afterEach, describe, expect, test } from "bun:test"
import { Effect, ManagedRuntime } from "effect"
import { memoMap } from "@opencode-ai/core/effect/memo-map"
import { DatabaseEffect } from "@/storage/db-effect"
import { resetDatabase } from "../fixture/db"

afterEach(async () => {
  await resetDatabase()
})

describe("DatabaseEffect.layer", () => {
  test("yields a working Service that round-trips a query", async () => {
    const rt = ManagedRuntime.make(DatabaseEffect.layer)
    try {
      const value = await rt.runPromise(
        Effect.gen(function* () {
          const db = yield* DatabaseEffect.Service
          return db.$client.prepare("SELECT 42 as n").get() as { n: number }
        }),
      )
      expect(value).toEqual({ n: 42 })
    } finally {
      await rt.dispose()
    }
  })

  test("disposing the runtime closes the underlying SQLite handle", async () => {
    const rt = ManagedRuntime.make(DatabaseEffect.layer)
    const captured = await rt.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseEffect.Service
        return db.$client
      }),
    )
    expect(captured.prepare("SELECT 1 as n").get()).toEqual({ n: 1 })

    await rt.dispose()

    // The layer's release fires when the last consumer's scope closes, so
    // the underlying connection should now be closed.
    expect(() => captured.prepare("SELECT 1 as n").get()).toThrow()
  })

  test("rebuilds a fresh handle after the previous runtime is disposed", async () => {
    const rt1 = ManagedRuntime.make(DatabaseEffect.layer)
    const first = await rt1.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseEffect.Service
        return db.$client
      }),
    )
    expect(first.prepare("SELECT 1 as n").get()).toEqual({ n: 1 })
    await rt1.dispose()

    const rt2 = ManagedRuntime.make(DatabaseEffect.layer)
    try {
      const second = await rt2.runPromise(
        Effect.gen(function* () {
          const db = yield* DatabaseEffect.Service
          return db.$client
        }),
      )
      expect(second).not.toBe(first)
      expect(second.prepare("SELECT 1 as n").get()).toEqual({ n: 1 })
    } finally {
      await rt2.dispose()
    }
  })
})

// The shared layer memoMap refcounts the cached Service across every runtime
// that consumes the layer. The release that closes the SQLite handle only
// fires after the last consumer's scope has closed. These tests pin both
// halves of that invariant — the property `test/fixture/db.ts:resetDatabase`
// relies on by disposing every consumer before deleting the DB files.
describe("DatabaseEffect.layer + shared memoMap lifecycle", () => {
  test("two runtimes consuming the layer share the same Service value", async () => {
    const rt1 = ManagedRuntime.make(DatabaseEffect.layer, { memoMap })
    const rt2 = ManagedRuntime.make(DatabaseEffect.layer, { memoMap })
    try {
      const a = await rt1.runPromise(
        Effect.gen(function* () {
          const db = yield* DatabaseEffect.Service
          return db.$client
        }),
      )
      const b = await rt2.runPromise(
        Effect.gen(function* () {
          const db = yield* DatabaseEffect.Service
          return db.$client
        }),
      )
      expect(a).toBe(b)
    } finally {
      await rt1.dispose()
      await rt2.dispose()
    }
  })

  test("the handle stays open until the last consumer is disposed", async () => {
    const rt1 = ManagedRuntime.make(DatabaseEffect.layer, { memoMap })
    const rt2 = ManagedRuntime.make(DatabaseEffect.layer, { memoMap })

    // Each runtime registers an observer on the memoMap entry only when it
    // first builds the layer, so both must run something through their
    // service tag before we can test refcounted release.
    const captured = await rt1.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseEffect.Service
        return db.$client
      }),
    )
    await rt2.runPromise(Effect.gen(function* () { yield* DatabaseEffect.Service }))
    expect(captured.prepare("SELECT 1 as n").get()).toEqual({ n: 1 })

    // Disposing the first consumer must NOT close the handle while the
    // second still references the layer through the shared memoMap.
    await rt1.dispose()
    expect(captured.prepare("SELECT 1 as n").get()).toEqual({ n: 1 })

    // Disposing the last consumer triggers the release.
    await rt2.dispose()
    expect(() => captured.prepare("SELECT 1 as n").get()).toThrow()
  })
})
