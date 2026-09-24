import { act } from 'react';

/** Types into a controlled field as a keyboard would: the native setter, then `input`. */
export function type(element: Element | null, text: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, text);
    element?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Chooses these option values in a select, then `change`. */
export function choose(element: Element | null, ...values: string[]): void {
  if (!(element instanceof HTMLSelectElement)) throw new Error('not a select');
  act(() => {
    for (const option of element.options) option.selected = values.includes(option.value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export const press = (element: Element | null) => act(() => (element as HTMLElement | null)?.click());
export const focus = (element: Element | null) => act(() => (element as HTMLElement | null)?.focus());
