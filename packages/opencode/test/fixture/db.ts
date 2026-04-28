import { rm } from "fs/promises"
import { Instance } from "../../src/project/instance"
import { AppRuntime } from "@/effect/app-runtime"
import { BootstrapRuntime } from "@/effect/bootstrap-runtime"
import { ExperimentalHttpApiServer } from "@/server/routes/instance/httpapi/server"
import { Database } from "@/storage/db"

// Disposes every runtime that consumes `DatabaseEffect.layer` so the shared
// layer memoMap drops its entry. Once all consumers are released, the
// layer's finalizer closes the SQLite handle and only then are the
// on-disk files safe to remove. Order among the runtime disposals does not
// matter — the file cleanup must come last.
export async function resetDatabase() {
  await Instance.disposeAll().catch(() => undefined)
  await AppRuntime.dispose().catch(() => undefined)
  await BootstrapRuntime.dispose().catch(() => undefined)
  await ExperimentalHttpApiServer.disposeWebHandler().catch(() => undefined)
  await Database.close()
  await rm(Database.Path, { force: true }).catch(() => undefined)
  await rm(`${Database.Path}-wal`, { force: true }).catch(() => undefined)
  await rm(`${Database.Path}-shm`, { force: true }).catch(() => undefined)
}
