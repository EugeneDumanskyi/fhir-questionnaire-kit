// The element outside src/locale.ts: the browser's language, by any route.
export const language = navigator.language;
export const languages = navigator.languages;
export const { language: destructured } = navigator;
export const viaWindow = window.navigator.language;
export const viaSelf = self.navigator.languages;
export const viaGlobal = globalThis.navigator.language;
// Still a renderer: no Intl and no ambient locale.
export const formatted = new Date(0).toLocaleDateString();
export const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
