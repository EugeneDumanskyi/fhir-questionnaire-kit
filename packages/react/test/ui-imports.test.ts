import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * M6 AC-2, ADR-0013: the default UI is a client of the public hook like any
 * host's tier-4 UI. `ui/` maps a view model to markup and reads only React
 * and the view's types; `<Questionnaire>` joins it to the hook the package
 * exports. Neither reaches the engine or a session's internals.
 */
const src = new URL('../src/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, src), 'utf8');

/** Every import and re-export in a module: its specifier and whether it is type-only. */
function imports(code: string): { readonly from: string; readonly typeOnly: boolean }[] {
  return [...code.matchAll(/^(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?'([^']+)'/gm)].map((match) => ({ from: match[2] ?? '', typeOnly: match[1] !== undefined }));
}

describe('the default UI reads only the public hook and the view types (M6 AC-2)', () => {
  const ui = readdirSync(new URL('ui/', src)).filter((file) => file.endsWith('.tsx'));

  it('finds the modules it restricts', () => {
    expect(ui).toEqual(expect.arrayContaining(['form.tsx', 'item.tsx', 'entry.tsx', 'options.tsx', 'parts.tsx']));
  });

  it.each(ui)('ui/%s imports React, view types and its siblings, nothing else', (file) => {
    const found = imports(read(`ui/${file}`));
    expect(found.length).toBeGreaterThan(0);
    for (const { from, typeOnly } of found) {
      const allowed = from === 'react' || /^\.\/[a-z-]+\.js$/.test(from) || (from === '@fhirq/core/view' && typeOnly);
      expect(allowed, `${file} imports ${typeOnly ? 'type ' : ''}${from}`).toBe(true);
    }
  });

  it('joins ui/ to the hook the package exports, with core types only for its props', () => {
    for (const { from, typeOnly } of imports(read('questionnaire.tsx'))) {
      const allowed = from === 'react' || from === './hook.js' || /^\.\/ui\/[a-z-]+\.js$/.test(from) || (from.startsWith('@fhirq/core') && typeOnly);
      expect(allowed, `questionnaire.tsx imports ${typeOnly ? 'type ' : ''}${from}`).toBe(true);
    }
    expect(read('index.ts')).toMatch(/^export \{ useQuestionnaire \} from '\.\/hook\.js';$/m);
  });

  it('reads an import the way the check needs: type-only or not, and its specifier', () => {
    expect(imports("import type { A } from '@fhirq/core';\nimport { b, type C } from './b.js';\nexport { d } from 'd';\nimport 'side';")).toEqual([
      { from: '@fhirq/core', typeOnly: true },
      { from: './b.js', typeOnly: false },
      { from: 'd', typeOnly: false },
      { from: 'side', typeOnly: false },
    ]);
  });
});
