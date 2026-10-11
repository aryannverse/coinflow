export type KeyLike = {
  key: string
  isComposing: boolean
  repeat: boolean
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}
export type TargetLike = { tagName: string; getAttribute(name: string): string | null }

/**
 * What Enter should do inside the quick-add form.
 * - `submit`: Enter on a choice control (a `role="radio"` chip or toggle) saves, like clicking Save.
 * - `swallow`: a held-down Enter on a choice control does nothing (no repeated clicks, no repeated saves).
 * - `ignore`: leave the browser alone (typing in a field already submits natively; the keypad, Save and the
 *   summary keep their own Enter activation; an IME composition must be allowed to finish).
 */
export function enterOnChoice(ev: KeyLike, target: TargetLike): 'submit' | 'swallow' | 'ignore' {
  if (ev.key !== 'Enter' || ev.isComposing || ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return 'ignore'
  if (target.tagName === 'TEXTAREA' || target.getAttribute('role') !== 'radio') return 'ignore'
  return ev.repeat ? 'swallow' : 'submit'
}
