// Outside view/format: Intl at all.
declare const count: number;
export const formatted = new Intl.NumberFormat('en').format(count);
// Anywhere in core: the environment's locale and zone.
export const date = new Date(0).toLocaleDateString();
declare const process: { env: Record<string, string | undefined> };
export const zone = process.env['TZ'];
declare const format: { resolvedOptions(): { locale: string } };
export const locale = format.resolvedOptions().locale;
// Both at once.
export const sniffed = Intl.DateTimeFormat().resolvedOptions().timeZone;
