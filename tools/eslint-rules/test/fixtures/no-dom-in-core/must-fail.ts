// MUST FAIL: every line here is a thing packages/core is not allowed to touch.
// Linted only by the rule's own test; the repository lint run ignores this tree.

export function focusFirstInvalid(): void {
  const field = document.querySelector('[aria-invalid="true"]');
  if (field !== null) {
    (field as HTMLElement).focus();
  }
  window.setTimeout(() => undefined, 0);
  localStorage.setItem('fhirq.session', '1');
  globalThis.document.title = 'x';
}
