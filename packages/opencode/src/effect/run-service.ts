import { Effect, Layer, ManagedRuntime } from "effect"
import * as Context from "effect/Context"
import { Instance } from "@/project/instance"
import { InstanceRef, WorkspaceRef } from "./instance-ref"
import * as Observability from "@opencode-ai/core/effect/observability"
import { WorkspaceContext } from "@/control-plane/workspace-context"
import type { InstanceContext } from "@/project/instance"
import { memoMap } from "@opencode-ai/core/effect/memo-map"
import { disposable } from "@/util/disposable"

type Refs = {
  instance?: InstanceContext
  workspace?: string
}

export function attachWith<A, E, R>(effect: Effect.Effect<A, E, R>, refs: Refs): Effect.Effect<A, E, R> {
  if (!refs.instance && !refs.workspace) return effect
  if (!refs.instance) return effect.pipe(Effect.provideService(WorkspaceRef, refs.workspace))
  if (!refs.workspace) return effect.pipe(Effect.provideService(InstanceRef, refs.instance))
  return effect.pipe(
    Effect.provideService(InstanceRef, refs.instance),
    Effect.provideService(WorkspaceRef, refs.workspace),
  )
}

export function attach<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  return attachWith(effect, {
    instance: Instance.peekCurrent,
    workspace: WorkspaceContext.workspaceID,
  })
}

export function makeRuntime<I, S, E>(service: Context.Service<I, S>, layer: Layer.Layer<I, E>) {
  const rt = disposable(() =>
    ManagedRuntime.make<I, E>(Layer.provideMerge(layer, Observability.layer), { memoMap }),
  )
  return {
    runSync: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) => rt().runSync(attach(service.use(fn))),
    runPromiseExit: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>, options?: Effect.RunOptions) =>
      rt().runPromiseExit(attach(service.use(fn)), options),
    runPromise: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>, options?: Effect.RunOptions) =>
      rt().runPromise(attach(service.use(fn)), options),
    runFork: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) => rt().runFork(attach(service.use(fn))),
    runCallback: <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, I>) => rt().runCallback(attach(service.use(fn))),
    dispose: rt.dispose,
  }
}
