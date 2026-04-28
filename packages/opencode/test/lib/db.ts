import { Effect, Layer } from "effect"
import { Database } from "@/storage/db"

// Returns a layer that, on build, truncates the given tables. Useful as a
// test setup layer to start each test from a known empty state without
// tearing down the full DB connection.
export const truncate = (...tables: string[]) =>
  Layer.effectDiscard(
    Effect.sync(() =>
      Database.use((db) => {
        for (const table of tables) db.run(`DELETE FROM ${table}`)
      }),
    ),
  )
