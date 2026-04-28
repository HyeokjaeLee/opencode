import { rm } from "fs/promises"
import { Instance } from "../../src/project/instance"
import { AppRuntime } from "@/effect/app-runtime"
import { BootstrapRuntime } from "@/effect/bootstrap-runtime"
import { ExperimentalHttpApiServer } from "@/server/routes/instance/httpapi/server"
import { Database } from "@/storage/db"

// Disposes every runtime that consumes `DatabaseEffect.layer` so the shared
// layer memoMap drops its entry. Once all consumers are released, the
// layer's finalizer closes the SQLite handle and only then are the
// on-disk files safe to remove.
//
// The four module-scoped consumers are independent and can dispose in
// parallel. The DB runtime is disposed afterwards because its release is
// what fires the layer finalizer once the refcount hits zero, and the file
// removal must come last.
export async function resetDatabase() {
  await Promise.allSettled([
    Instance.disposeAll(),
    AppRuntime.dispose(),
    BootstrapRuntime.dispose(),
    ExperimentalHttpApiServer.disposeWebHandler(),
  ])
  await Database.close()
  await Promise.allSettled([
    rm(Database.Path, { force: true }),
    rm(`${Database.Path}-wal`, { force: true }),
    rm(`${Database.Path}-shm`, { force: true }),
  ])
}
