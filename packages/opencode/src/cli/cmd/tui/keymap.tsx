import { type CliRenderer } from "@opentui/core"
import { stringifyKeyStroke, type KeySequencePart } from "@opentui/keymap"
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

const LEADER_TIMEOUT_MS = 2000
const LEADER_TOKEN = "<leader>"

export const OpencodeKeymapProvider = KeymapProvider
export const useOpencodeKeymap = useKeymap

export { reactiveMatcherFromSignal, useBindings, useKeymapSelector }

export type OpenTuiKeymap = ReturnType<typeof useKeymap>

function formatKeyName(name: string) {
  if (name === "pageup") return "pgup"
  if (name === "pagedown") return "pgdn"
  if (name === "delete") return "del"
  if (name === "return") return "enter"
  return name
}

function formatStroke(part: KeySequencePart, config: TuiConfig.Resolved) {
  if (part.tokenName === LEADER_TOKEN) return config.keymap.leader
  if (part.tokenName) return part.display

  const pieces: string[] = []
  if (part.stroke.ctrl) pieces.push("ctrl")
  if (part.stroke.meta) pieces.push("alt")
  if (part.stroke.super) pieces.push("super")
  if (part.stroke.shift) pieces.push("shift")
  pieces.push(formatKeyName(part.stroke.name || stringifyKeyStroke(part, { preferDisplay: true })))
  return pieces.join("+")
}

export function formatKeySequence(parts: readonly KeySequencePart[] | undefined, config: TuiConfig.Resolved) {
  if (!parts || parts.length === 0) return ""
  return parts.map((part) => formatStroke(part, config)).join(" ")
}

export function formatKeyBindings(
  bindings: readonly { sequence: readonly KeySequencePart[] }[] | undefined,
  config: TuiConfig.Resolved,
) {
  if (!bindings?.length) return
  const seen = new Set<string>()
  return bindings
    .map((binding) => formatKeySequence(binding.sequence, config))
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
    .join(", ")
}

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
