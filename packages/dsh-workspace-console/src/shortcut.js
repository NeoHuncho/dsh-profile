/**
 * Shortcut-string parsing for the terminal panel.
 *
 * Pure module: no DOM, no React, so it is unit-testable in isolation.
 *
 * Format: "mod+mod+key" — e.g. "ctrl+`", "ctrl+shift+d", "alt+f4".
 * Modifiers: ctrl, shift, alt, meta (aliases control/option/cmd/win/command).
 *
 * Matching uses `KeyboardEvent.code`, which is layout-independent: ctrl+j still
 * matches KeyJ on a German keyboard, where `key` would differ.
 */

const NAMED_KEYS = {
  '`': 'Backquote',
  backquote: 'Backquote',
  grave: 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  space: 'Space',
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
}

const MODIFIERS = {
  ctrl: 'ctrl',
  control: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  meta: 'meta',
  cmd: 'meta',
  win: 'meta',
  command: 'meta',
}

const MOD_LABEL = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Meta' }

/**
 * Parse a shortcut string into a matchable spec.
 * @returns {{ctrl:boolean,shift:boolean,alt:boolean,meta:boolean,code:string,label:string}|null}
 */
export function parseShortcut(input) {
  if (typeof input !== 'string') return null
  const parts = input
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
  if (parts.length === 0) return null

  const spec = { ctrl: false, shift: false, alt: false, meta: false, code: null, label: null }
  const mods = []
  while (parts.length > 1) {
    const mod = MODIFIERS[parts.shift()]
    if (mod === undefined || spec[mod]) return null
    spec[mod] = true
    mods.push(mod)
  }

  const token = parts[0]
  if (token === undefined) return null

  let code = null
  let keyLabel = null
  if (/^[a-z]$/.test(token)) {
    code = 'Key' + token.toUpperCase()
    keyLabel = token.toUpperCase()
  } else if (/^[0-9]$/.test(token)) {
    code = 'Digit' + token
    keyLabel = token
  } else if (NAMED_KEYS[token] !== undefined) {
    code = NAMED_KEYS[token]
    keyLabel = token === 'backquote' || token === 'grave' ? '`' : token
  } else if (/^f([1-9]|1[0-2])$/.test(token)) {
    code = 'F' + token.slice(1)
    keyLabel = code
  } else {
    return null
  }

  spec.code = code
  spec.label = [...mods.map((m) => MOD_LABEL[m]), keyLabel].join('+')
  return spec
}

/** Does a KeyboardEvent match the parsed spec? */
export function matchesShortcut(spec, event) {
  if (spec === null || spec === undefined) return false
  if (event.code !== spec.code) return false
  return (
    event.ctrlKey === spec.ctrl &&
    event.shiftKey === spec.shift &&
    event.altKey === spec.alt &&
    event.metaKey === spec.meta
  )
}
