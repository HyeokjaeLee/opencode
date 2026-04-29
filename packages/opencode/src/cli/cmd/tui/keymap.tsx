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

function registerOpencodeLeader(keymap: OpenTuiKeymap, config: TuiConfig.Resolved) {
  const trigger = config.keymap.leader
  return addons.registerTimedLeader(keymap, {
    trigger,
    name: LEADER_TOKEN,
    timeoutMs: LEADER_TIMEOUT_MS,
  })
}

export function registerOpencodeKeymap(keymap: OpenTuiKeymap, renderer: CliRenderer, config: TuiConfig.Resolved) {
  const offCommaBindings = addons.registerCommaBindings(keymap)
  const offBaseLayout = addons.registerBaseLayoutFallback(keymap)
  const offLeader = registerOpencodeLeader(keymap, config)
  const offEscape = addons.registerEscapeClearsPendingSequence(keymap)
  const offBackspace = addons.registerBackspacePopsPendingSequence(keymap)
  const offInputCommands = addons.registerEditBufferCommands(keymap, renderer)
  const offInputSuspension = addons.registerTextareaMappingSuspension(keymap, renderer)
  const offInputBindings = keymap.registerLayer({
    enabled: () => renderer.currentFocusedEditor !== null,
    bindings: config.keymap.sections.input,
  })

  return () => {
    offInputBindings()
    offInputSuspension()
    offInputCommands()
    offBackspace()
    offEscape()
    offLeader()
    offBaseLayout()
    offCommaBindings()
  }
}

function firstRegisteredBinding(command: string, config: TuiConfig.Resolved) {
  return (keymap: OpenTuiKeymap) => {
    const entry = keymap
      .getCommandEntries({ visibility: "registered" })
      .find((candidate: { command: { name: string } }) => candidate.command.name === command)
    return formatKeySequence(entry?.bindings[0]?.sequence, config)
  }
}

export function useCommandShortcut(command: string): Accessor<string> {
  const config = useTuiConfig()
  return useKeymapSelector(firstRegisteredBinding(command, config))
}

export function useLeaderActive(): Accessor<boolean> {
  return useKeymapSelector((keymap: OpenTuiKeymap) => keymap.getPendingSequence()[0]?.tokenName === LEADER_TOKEN)
}

export function useDispatchCommand() {
  const keymap = useOpencodeKeymap()
  return (command: string) => {
    keymap.dispatchCommand(command)
  }
}
