import { Layer, ManagedRuntime } from "effect"
import { memoMap } from "@opencode-ai/core/effect/memo-map"

import { Plugin } from "@/plugin"
import { LSP } from "@/lsp/lsp"
import { FileWatcher } from "@/file/watcher"
import { Format } from "@/format"
import { ShareNext } from "@/share/share-next"
import { File } from "@/file"
import { Vcs } from "@/project/vcs"
import { Snapshot } from "@/snapshot"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { disposable } from "@/util/disposable"
import * as Observability from "@opencode-ai/core/effect/observability"

// BootstrapRuntime exists only to break a structural import cycle: AppLayer
// imports `Worktree.defaultLayer`, and `Worktree.create` needs a runtime to
// run `InstanceBootstrap` against in a freshly-provided directory. Going
// through AppRuntime there would form `app-runtime → worktree → app-runtime`.
// BootstrapRuntime carries the smaller set of services InstanceBootstrap
// actually requires and imports nothing from `app-runtime.ts`.
export const BootstrapLayer = Layer.mergeAll(
  Config.defaultLayer,
  Plugin.defaultLayer,
  ShareNext.defaultLayer,
  Format.defaultLayer,
  LSP.defaultLayer,
  File.defaultLayer,
  FileWatcher.defaultLayer,
  Vcs.defaultLayer,
  Snapshot.defaultLayer,
  Bus.defaultLayer,
).pipe(Layer.provide(Observability.layer))

const rt = disposable(() => ManagedRuntime.make(BootstrapLayer, { memoMap }))
type Runtime = Pick<ReturnType<typeof rt>, "runPromise" | "dispose">

export const BootstrapRuntime: Runtime = {
  runPromise: (effect, options) => rt().runPromise(effect, options),
  dispose: rt.dispose,
}
