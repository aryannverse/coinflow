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
 * - `submit`: Enter on a CATEGORY CHIP (`role="radio"` with `data-cat`) saves, like clicking Save.
 * - `swallow`: a held-down Enter on a chip does nothing (no repeated saves).
 * - `ignore`: leave the browser alone. Typing in a field already submits natively; the keypad, Save and the
 *   summary keep their own Enter activation; an IME composition must be allowed to finish. The Expense/Income
 *   and "Paid with" toggles keep native Enter too: the form's preventDefault would cancel their activation and
 *   save the OLD value.
 */
export function enterOnChoice(ev: KeyLike, target: TargetLike): 'submit' | 'swallow' | 'ignore' {
  if (ev.key !== 'Enter' || ev.isComposing || ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return 'ignore'
  if (target.tagName === 'TEXTAREA' || target.getAttribute('role') !== 'radio' || target.getAttribute('data-cat') === null) return 'ignore'
  return ev.repeat ? 'swallow' : 'submit'
}
