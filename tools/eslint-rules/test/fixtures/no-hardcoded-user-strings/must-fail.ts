// MUST FAIL: three strings a person would read, none of them in the catalogue.

export function summarise(count: number): string {
  if (count === 0) {
    return 'No questions need your attention.';
  }
  return `There are ${String(count)} questions still to answer`;
}

export const requiredMessage = 'This question must be answered before you continue.';
