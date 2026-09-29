import type { DiagnosticCode } from '@fhirq/core';

/** A conformance matrix row, as much of it as a diagnostic shows. */
export interface Row {
  readonly id: string;
  readonly feature: string;
  readonly status: string;
  readonly reason: string | null;
  /** The row on the docs site's matrix page. */
  readonly href: string;
}

interface MatrixRow {
  readonly id: string;
  readonly feature: string;
  readonly status: string;
  readonly reason: string | null;
  readonly diagnostics?: readonly DiagnosticCode[];
}

/**
 * The matrix's page on the docs site (M9 plan D5), which Pages publishes at
 * the site's root, one level above the playground (M10 plan D2). Relative,
 * so it holds under any path the two are served from together.
 */
export const MATRIX = '../conformance.html';

/**
 * The conformance rows for each diagnostic code, from the matrix's own text
 * (`docs/conformance/matrix.json`, its `diagnostics` field). Each row links
 * to its anchor on the matrix page, which is its id.
 */
export function rowsByCode(text: string): ReadonlyMap<DiagnosticCode, readonly Row[]> {
  const { rows } = JSON.parse(text) as { readonly rows: readonly MatrixRow[] };
  const byCode = new Map<DiagnosticCode, Row[]>();
  for (const { id, feature, status, reason, diagnostics = [] } of rows) {
    const row: Row = { id, feature, status, reason, href: `${MATRIX}#${id}` };
    for (const code of diagnostics) byCode.set(code, [...(byCode.get(code) ?? []), row]);
  }
  return byCode;
}

/**
 * The rows for one finding: its code's rows, narrowed to the one whose id
 * ends in the finding's detail when there is one (`item-type.attachment` for
 * an unsupported `attachment`), else all of them.
 */
export function rowsFor(byCode: ReadonlyMap<DiagnosticCode, readonly Row[]>, code: DiagnosticCode, detail: string | null): readonly Row[] {
  const rows = byCode.get(code) ?? [];
  const named = rows.filter(({ id }) => detail !== null && id.endsWith(`.${detail}`));
  return named.length === 1 ? named : rows;
}
