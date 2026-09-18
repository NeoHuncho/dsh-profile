/**
 * dsh-model-shortcuts — host half.
 *
 * Deliberately inert: the feature is entirely browser-side (two keyboard
 * shortcuts driving the composer's existing model selector), and nothing on the
 * host consumes the bindings.
 *
 * An earlier version published the shortcuts on a small host route and let the
 * client read them. That was wrong in a way worth recording: a host plugin
 * instance is pinned for the life of the `dsh web` process, so a binding served
 * from here could not be corrected without a full restart — which kills every
 * live agent. Keeping browser-only preferences in the browser means a change
 * takes effect on reload. The bindings now live in localStorage under
 * `dsh-model-shortcuts:prefs`.
 *
 * This half remains so the package composes as one ordinary row with both a
 * host and a client entry, and so there is an obvious place for any future
 * host-side work (which the shortcuts themselves do not need).
 */

export const name = 'dsh-model-shortcuts'

export function apply() {
  // No host-side effects by design; see the module note above.
}
