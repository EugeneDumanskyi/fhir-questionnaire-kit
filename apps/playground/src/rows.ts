import type { DiagnosticCode } from '@fhirq/core';

/** A conformance matrix row, as much of it as a diagnostic shows. */
export interface Row {
  readonly id: string;
  readonly feature: string;
  readonly status: string;
  readonly reason: string | null;
  /** Where the row starts on GitHub. */
  readonly href: string;
}

interface MatrixRow {
  readonly id: string;
  readonly feature: string;
  readonly status: string;
  readonly reason: string | null;
  readonly diagnostics?: readonly DiagnosticCode[];
}

/** The matrix on GitHub, until M10 publishes it as a page (M9 plan D5). */
export const MATRIX = 'https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/conformance/matrix.json';

/**
 * The conformance rows for each diagnostic code, from the matrix's own text
 * (`docs/conformance/matrix.json`, its `diagnostics` field). Each row links
 * to its line, found in the same text, so the link is to the row as bundled.
 */
export function rowsByCode(text: string): ReadonlyMap<DiagnosticCode, readonly Row[]> {
  const { rows } = JSON.parse(text) as { readonly rows: readonly MatrixRow[] };
  const lines = text.split('\n');
  const byCode = new Map<DiagnosticCode, Row[]>();
  for (const { id, feature, status, reason, diagnostics = [] } of rows) {
    const line = lines.findIndex((candidate) => candidate.trim() === `"id": ${JSON.stringify(id)},`) + 1;
    const row: Row = { id, feature, status, reason, href: line > 0 ? `${MATRIX}#L${line}` : MATRIX };
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
