import type { KeyEvent, Renderable } from "@opentui/core"
import { resolveBindingSections, type BindingSectionsConfig } from "@opentui/keymap/extras"

export function resolvePluginBindingSections<Section extends string>(
  config: BindingSectionsConfig<Renderable, KeyEvent> | undefined,
  options: { sections: readonly Section[] },
) {
  return resolveBindingSections<Renderable, KeyEvent, BindingSectionsConfig<Renderable, KeyEvent>, Section>(config ?? {}, options)
}
