import type { Answer } from '../kernel/answer.js';
import { slot } from '../kernel/dense.js';
import type { Diagnostic } from '../kernel/diagnostic.js';
import type { DefinitionInput } from '../kernel/input.js';
import type { ItemType, LinkId, Operator } from '../kernel/item-type.js';
import { checkItems, type Finding } from './checks.js';
import { buildGraph } from './graph.js';

/**
 * The Definition compiler (BC1, ADR-0009 "at load"). It turns version-neutral
 * input into flat, immutable tables that the session runs without re-checking:
 * dense ids in document order, conditions resolved to ids, dependency edges
 * labelled with the scope they resolve in, and a topological rank per item.
 * Or it refuses, listing every finding (AC-01.3.1, AC-02.5.1).
 *
 * Synchronous and I/O-free (INV-D-11). The strict/lenient matrix of INV-D-01…19
 * is `checks.ts`; cycles and depth are `graph.ts`.
 */

export type LoadMode = 'strict' | 'lenient';

/** A condition the session evaluates. `never` is one that load degraded to `false` (INV-D-04, 06, 13, 14). */
export type CompiledCondition =
  | { readonly kind: 'never' }
  | { readonly kind: 'test'; readonly question: number; readonly operator: Operator; readonly answer: Answer };

/**
 * A dependency edge from a question to an item whose condition reads it,
 * labelled with its scope (INV-D-13): the repeating group whose instance both
 * share, or `-1` when the question is outside every repeat and the edge is
 * global.
 */
export interface DependencyEdge {
  readonly dependent: number;
  readonly scope: number;
}

export interface ItemDef {
  /** Dense id: the item's position in document (pre-)order. */
  readonly id: number;
  readonly linkId: LinkId;
  /** The linkId path, encoded as in an item path, without ordinals. */
  readonly path: string;
  /** `null` for an unsupported item, which lenient mode keeps as a placeholder (INV-D-03). */
  readonly type: ItemType | null;
  readonly authoredType: string;
  readonly text: string;
  readonly required: boolean;
  readonly repeats: boolean;
  /** Parent id, or `-1` at the root. */
  readonly parent: number;
  readonly children: readonly number[];
  /** The nearest ancestor that is a repeating group, or `-1`. */
  readonly repeatScope: number;
  readonly conditions: readonly CompiledCondition[];
  readonly behavior: 'all' | 'any';
  /** Lenient `enableWhenExpression`: disabled whatever its conditions say (INV-D-15). */
  readonly forcedDisabled: boolean;
  /** Bound to `calculatedExpression`; commands on it are refused (ADR-0003). */
  readonly calculated: boolean;
  /** Supported inline option values, in authored order. */
  readonly options: readonly Answer[];
  readonly valueSet: string | null;
  readonly maxLength: number | null;
  /** From `questionnaire-minOccurs`; 0 when not authored. */
  readonly minOccurs: number;
  /** From `questionnaire-maxOccurs`; `null` is unbounded. */
  readonly maxOccurs: number | null;
  readonly itemControl: string | null;
  readonly renderingXhtml: string | null;
  /** Items whose conditions read this one, with the scope each resolves in. */
  readonly dependents: readonly DependencyEdge[];
  /** Strictly increases along every tree and dependency edge (ADR-0009 settle order). */
  readonly rank: number;
}

export interface Definition {
  readonly url: string | null;
  readonly version: string | null;
  readonly loadMode: LoadMode;
  /** Every item, indexed by id. */
  readonly items: readonly ItemDef[];
  readonly roots: readonly number[];
  readonly byLinkId: ReadonlyMap<LinkId, number>;
  /** Load findings that did not reject: degraded items in lenient mode, and warnings in both. */
  readonly diagnostics: readonly Diagnostic[];
}

export type CompileResult =
  | { readonly ok: true; readonly definition: Definition }
  | { readonly ok: false; readonly findings: readonly Diagnostic[] };

export function compile(input: DefinitionInput, loadMode: LoadMode): CompileResult {
  const checked = checkItems(input, loadMode);
  if (checked.items === null) return rejected(checked.findings, loadMode);

  const graph = buildGraph(checked.items);
  const findings: readonly Finding[] = [...checked.findings, ...graph.findings];
  const rejecting = findings.filter((finding) => rejects(finding, loadMode));
  if (rejecting.length > 0) return rejected(findings, loadMode);

  const items = checked.items.map(
    (item, id): ItemDef => ({ ...item, dependents: slot(graph.dependents, id), rank: slot(graph.ranks, id) }),
  );
  return {
    ok: true,
    definition: {
      url: input.url,
      version: input.version,
      loadMode,
      items,
      roots: items.filter((item) => item.parent === -1).map((item) => item.id),
      byLinkId: new Map(items.map((item) => [item.linkId, item.id])),
      diagnostics: findings.map((finding) => finding.diagnostic),
    },
  };
}

function rejects(finding: Finding, mode: LoadMode): boolean {
  return finding.rejects === 'always' || (finding.rejects === 'strict' && mode === 'strict');
}

function rejected(findings: readonly Finding[], mode: LoadMode): CompileResult {
  return { ok: false, findings: findings.filter((finding) => rejects(finding, mode)).map((finding) => finding.diagnostic) };
}
