import { type CliRenderer } from "@opentui/core"
import * as addons from "@opentui/keymap/addons/opentui"
import {
  KeymapProvider,
  reactiveMatcherFromSignal,
  useBindings,
  useKeymap,
  useKeymapSelector,
} from "@opentui/keymap/solid"
import type { Accessor } from "solid-js"
import type { TuiConfig } from "./config/tui"
import { useTuiConfig } from "./context/tui-config"
import { formatKeySequence, LEADER_TOKEN } from "./keymap-format"

const LEADER_TIMEOUT_MS = 2000

export const OpencodeKeymapProvider = KeymapProvider
export const useOpencodeKeymap = useKeymap

export { reactiveMatcherFromSignal, useBindings, useKeymapSelector }
export { formatKeyBindings, formatKeySequence } from "./keymap-format"

export type OpenTuiKeymap = ReturnType<typeof useKeymap>

export function registerOpencodeKeymap(keymap: OpenTuiKeymap, renderer: CliRenderer, config: TuiConfig.Resolved) {
  const offCommaBindings = addons.registerCommaBindings(keymap)
  const offBaseLayout = addons.registerBaseLayoutFallback(keymap)
  const offLeader = addons.registerTimedLeader(keymap, {
    trigger: config.keymap.leader,
    name: LEADER_TOKEN,
    timeoutMs: LEADER_TIMEOUT_MS,
  })
  const offEscape = addons.registerEscapeClearsPendingSequence(keymap)
  const offBackspace = addons.registerBackspacePopsPendingSequence(keymap)
  const offInputBindings = addons.registerManagedTextareaLayer(keymap, renderer, {
    enabled: () => renderer.currentFocusedEditor !== null,
    bindings: config.keymap.sections.input,
  })

  return () => {
    offInputBindings()
    offBackspace()
    offEscape()
    offLeader()
    offBaseLayout()
    offCommaBindings()
  }
}

export function useCommandShortcut(command: string): Accessor<string> {
  const config = useTuiConfig()
  return useKeymapSelector((keymap) =>
    formatKeySequence(keymap.getCommandBindings({ visibility: "registered", commands: [command] }).get(command)?.[0]?.sequence, config),
  )
}

export function useLeaderActive(): Accessor<boolean> {
  return useKeymapSelector((keymap: OpenTuiKeymap) => keymap.getPendingSequence()[0]?.tokenName === LEADER_TOKEN)
}
