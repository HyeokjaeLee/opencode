import { lazy } from "./lazy"

// Lazy single-value cache plus a uniform `dispose()` that tears down only the
// instance the factory built. Used for module-scoped disposables like
// ManagedRuntimes or HttpRouter web handlers, where production never disposes
// (the cached value lives for the process) and tests reset between runs.
//
// Example:
//   const rt = disposable(() => ManagedRuntime.make(layer, { memoMap }))
//   rt()             // build/get
//   rt.peek()        // current value or undefined (no build)
//   await rt.dispose() // tear down and clear the cache
export function disposable<T extends { dispose(): Promise<void> }>(make: () => T) {
  const get = lazy(make)
  return Object.assign(get, {
    async dispose() {
      const old = get.peek()
      get.reset()
      await old?.dispose()
    },
  })
}
