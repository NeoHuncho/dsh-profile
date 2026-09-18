/**
 * Ctrl+Shift+<digit> — switch Spaces.
 *
 * The digit selects the n-th space in display order (Default is 1). The
 * listener runs in the capture phase so a focused composer or search input
 * cannot swallow the chord, and it reads `event.code` rather than `event.key`
 * because with Shift held `key` is shifted punctuation on most layouts.
 */

/** Ctrl (or Cmd) plus Shift, with no other modifier mixed in. */
function chordActive(event) {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey
}

/**
 * Invoke `onActivate(n)` when Ctrl+Shift+<digit 1-9> is pressed.
 *
 * `onActivate` is read through a ref so the listener is installed once and
 * never reinstalled as the space list changes underneath it.
 *
 * @param React - the shell's React runtime.
 * @param enabled - false disables the binding.
 * @param onActivate - receives the 1-based space number.
 */
export function useShortcutActivation(React, enabled, onActivate) {
  const handler = React.useRef(onActivate)
  handler.current = onActivate

  React.useEffect(() => {
    if (!enabled) return undefined

    const onKeyDown = (event) => {
      if (!chordActive(event)) return
      const match = /^Digit([1-9])$/.exec(event.code ?? '')
      if (match === null) return
      event.preventDefault()
      event.stopPropagation()
      handler.current?.(Number(match[1]))
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled])
}
