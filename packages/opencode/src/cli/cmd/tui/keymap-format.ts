import { stringifyKeyStroke, type KeySequencePart } from "@opentui/keymap"
import type { TuiConfig } from "./config/tui"

export const LEADER_TOKEN = "<leader>"

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
