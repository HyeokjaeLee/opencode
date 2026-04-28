import { defaultTextareaKeyBindings, type CliRenderer } from "@opentui/core"
import {
  stringifyKeyStroke,
  type BindingInput,
  type KeySequencePart,
} from "@opentui/keymap"
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

const textareaActions = new Set<string>([...defaultTextareaKeyBindings.map((binding) => binding.action), "submit"])

export function resolveBindingKey(config: TuiConfig.Info, keybind?: string) {
  if (!keybind) return
  const value = config.keybinds?.[keybind as keyof NonNullable<TuiConfig.Info["keybinds"]>] ?? keybind
  if (!value || value === "none") return
  return value
}

function leaderSequence(config: TuiConfig.Info) {
  return resolveBindingKey(config, "leader") || "ctrl+x"
}

function leaderStroke(config: TuiConfig.Info) {
  return resolveBindingKey(config, "leader") || "ctrl+x"
}

function formatKeyName(name: string) {
  if (name === "pageup") return "pgup"
  if (name === "pagedown") return "pgdn"
  if (name === "delete") return "del"
  if (name === "return") return "enter"
  return name
}

function formatStroke(part: KeySequencePart, config: TuiConfig.Info) {
  if (part.tokenName === LEADER_TOKEN) return leaderSequence(config)
  if (part.tokenName) return part.display

  const pieces: string[] = []
  if (part.stroke.ctrl) pieces.push("ctrl")
  if (part.stroke.meta) pieces.push("alt")
  if (part.stroke.super) pieces.push("super")
  if (part.stroke.shift) pieces.push("shift")
  pieces.push(formatKeyName(part.stroke.name || stringifyKeyStroke(part, { preferDisplay: true })))
  return pieces.join("+")
}

export function formatKeySequence(parts: readonly KeySequencePart[] | undefined, config: TuiConfig.Info) {
  if (!parts || parts.length === 0) return ""
  return parts.map((part) => formatStroke(part, config)).join(" ")
}

export function formatBindingLabel(config: TuiConfig.Info, keybind?: string) {
  const resolved = resolveBindingKey(config, keybind)
  if (!resolved) return ""
  return resolved.replaceAll(LEADER_TOKEN, leaderSequence(config))
}

function registerOpencodeLeader(keymap: OpenTuiKeymap, config: TuiConfig.Info) {
  const trigger = leaderStroke(config)
  return addons.registerTimedLeader(keymap, {
    trigger,
    name: LEADER_TOKEN,
    timeoutMs: LEADER_TIMEOUT_MS,
  })
}

function resolveTextareaAction(keybind: string) {
  if (!keybind.startsWith("input_")) return
  const action = keybind.slice("input_".length).replaceAll("_", "-")
  if (!textareaActions.has(action)) return
  return action
}

function createTextareaCommandNames(config: TuiConfig.Info) {
  return Object.keys(config.keybinds ?? {}).reduce<Record<string, string>>((acc, keybind) => {
    const action = resolveTextareaAction(keybind)
    if (!action) return acc
    acc[action] = keybind
    return acc
  }, {})
}

function createTextareaBindings(config: TuiConfig.Info): BindingInput[] {
  return Object.keys(config.keybinds ?? {}).flatMap((keybind) => {
    const action = resolveTextareaAction(keybind)
    if (!action) return []
    const key = resolveBindingKey(config, keybind)
    if (!key) return []
    return {
      key,
      cmd: keybind,
    }
  })
}

export function registerOpencodeKeymap(keymap: OpenTuiKeymap, renderer: CliRenderer, config: TuiConfig.Info) {
  const offCommaBindings = addons.registerCommaBindings(keymap)
  const offBaseLayout = addons.registerBaseLayoutFallback(keymap)
  const offLeader = registerOpencodeLeader(keymap, config)
  const offEscape = addons.registerEscapeClearsPendingSequence(keymap)
  const offBackspace = addons.registerBackspacePopsPendingSequence(keymap)
  const offInputBindings = addons.registerManagedTextareaLayer(
    keymap,
    renderer,
    {
      enabled: () => renderer.currentFocusedEditor !== null,
      bindings: createTextareaBindings(config),
    },
    {
      commandNames: createTextareaCommandNames(config),
    },
  )

  return () => {
    offInputBindings()
    offBackspace()
    offEscape()
    offLeader()
    offBaseLayout()
    offCommaBindings()
  }
}

function firstRegisteredBinding(command: string, config: TuiConfig.Info) {
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

export function useCommandSequence(command: string): Accessor<readonly KeySequencePart[] | undefined> {
  return useKeymapSelector((keymap: OpenTuiKeymap) => {
    const entry = keymap
      .getCommandEntries({ visibility: "registered" })
      .find((candidate: { command: { name: string } }) => candidate.command.name === command)
    return entry?.bindings[0]?.sequence
  })
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

export function useCommandEntries() {
  return useKeymapSelector((keymap: OpenTuiKeymap) => keymap.getCommandEntries({ visibility: "reachable" }))
}
