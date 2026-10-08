/**
 * The API surface gate (NFR-M-04, NFR-U-05, M11 AC-5; plan step 4).
 *
 * Each entry point's API Extractor report in `packages/*\/etc/` holds no `any`,
 * and the reports together declare at most 60 public symbols. `pnpm api:check`
 * fails when a report is out of step with the built declarations, so what this
 * reads is the surface that ships.
 *
 * `any` is read as a type: inside the report's declarations, outside comments
 * and string literals, and not as a property name.
 *
 * A re-export of another `@fhirq/*` package's declaration, such as
 * `@fhirq/react`'s `createSession` (ADR-0015), is one symbol under two names,
 * so it is listed but not counted again (M6 plan D5). A report shows it as
 * `export { name }` with `name` imported from that package.
 *
 *   node scripts/check-api.mjs    exit 1 naming each `any`, and a count over the limit
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The most public symbols all packages may export together (NFR-U-05). */
export const LIMIT = 60;

/** Each published entry point and its report. */
export const ENTRY_POINTS = [
  { name: '@fhirq/core', report: 'packages/core/etc/core.api.md' },
  { name: '@fhirq/core/view', report: 'packages/core/etc/core-view.api.md' },
  { name: '@fhirq/core/resume', report: 'packages/core/etc/core-resume.api.md' },
  { name: '@fhirq/react', report: 'packages/react/etc/react.api.md' },
  { name: '@fhirq/element', report: 'packages/element/etc/element.api.md' },
  { name: '@fhirq/themes', report: 'packages/themes/etc/themes.api.md' },
];

/** The names a report declares, in order. */
export const declared = (report) => [...report.matchAll(/^export (?:declare )?(?:abstract )?(?:type|interface|function|class|const|enum|namespace) (\w+)/gm)].map((match) => match[1]);

/** `export { name }` lines, each with the `@fhirq/*` specifier its import names, or null when none does. */
export const reexports = (report) => {
  const imported = new Map(
    [...report.matchAll(/^import (?:type )?\{([^}]*)\} from '(@fhirq\/[^']+)';$/gm)].flatMap((match) => match[1].split(',').map((name) => [name.replace(/\btype\b/, '').trim(), match[2]])),
  );
  return [...report.matchAll(/^export \{([^}]*)\}/gm)].flatMap((match) => match[1].split(',').map((name) => name.trim()).filter(Boolean)).map((name) => ({ name, from: imported.get(name) ?? null }));
};

/** Each entry point's declared symbols, by name, read from the reports under `base`. */
export function symbols(base = root) {
  return Object.fromEntries(ENTRY_POINTS.map(({ name, report }) => [name, declared(readFileSync(join(base, report), 'utf8'))]));
}

/** The declarations a report's `ts` block holds, one string per line, with comments and string literals blanked. */
function code(report) {
  const block = /^```ts\n([\s\S]*?)^```/m.exec(report)?.[1] ?? '';
  return block
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (literal) => literal.replace(/[^\n]/g, ' '))
    .split('\n');
}

/** Each `any` in a report, as `{ line, text }`, its line numbered within the report; empty when there is none. */
export function anys(report) {
  const offset = report.slice(0, report.indexOf('```ts\n')).split('\n').length;
  const lines = report.split('\n');
  return code(report).flatMap((line, index) => (/\bany\b(?!\s*\??\s*:)/.test(line) ? [{ line: offset + index + 1, text: lines[offset + index].trim() }] : []));
}

/** Every problem with the reports under `base`: a missing report, each `any`, and a count over the limit. Empty when there is none. */
export function problems(base = root) {
  const found = [];
  for (const { report } of ENTRY_POINTS) {
    if (!existsSync(join(base, report))) {
      found.push(`${report}: missing; run pnpm api:update`);
      continue;
    }
    for (const { line, text } of anys(readFileSync(join(base, report), 'utf8'))) found.push(`${report}:${line}: \`any\` in the public surface: ${text}`);
  }
  if (found.length > 0) return found;
  const total = Object.values(symbols(base)).flat().length;
  if (total > LIMIT) found.push(`${total} public symbols across all packages, over NFR-U-05's ${LIMIT}`);
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = problems();
  if (found.length > 0) {
    for (const problem of found) console.error(problem);
    process.exit(1);
  }
  const total = Object.values(symbols()).flat().length;
  console.log(`api: ${ENTRY_POINTS.length} reports, no \`any\`; ${total} of at most ${LIMIT} public symbols (NFR-U-05)`);
}
