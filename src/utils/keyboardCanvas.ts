/**
 * When true, canvas-level shortcuts (Delete, arrow nudge) should not run — the user is editing
 * a field or control that should receive the key instead.
 */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const field = target.closest('input, textarea, select')
  if (!field) {
    return false
  }
  if (field instanceof HTMLInputElement) {
    const t = field.type
    if (
      t === 'button' ||
      t === 'submit' ||
      t === 'reset' ||
      t === 'checkbox' ||
      t === 'radio' ||
      t === 'file' ||
      t === 'image'
    ) {
      return false
    }
    return !field.disabled
  }
  if (field instanceof HTMLTextAreaElement) {
    return !field.disabled
  }
  if (field instanceof HTMLSelectElement) {
    return !field.disabled
  }
  return true
}
