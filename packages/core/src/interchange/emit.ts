import { encodeItems, encodeResponse } from '../fhir/r4/encode.js';
import type { QuestionnaireResponse } from '../fhir/r4/types.js';
import { FhirqError } from '../kernel/error.js';
import type { ResponseItem } from '../kernel/response.js';
import { parseDateTime } from '../kernel/temporal.js';
import { projectionOf, type VisibleNode, type VisibleProjection } from '../session/projection.js';

/**
 * Emission (BC4, US-05.1). The response is built from the visible projection
 * and nothing else — this module's only door into a session (§4.1, AC-05.3.2) —
 * so a disabled node cannot reach it in any shape (INV-E-01, INV-E-02).
 * Enabled, answered questions only; a group only with such a descendant; the
 * item tree mirrors the definition and repeat instances come in position
 * order (INV-E-03). Unsupported placeholders never appear (INV-E-04).
 */

/** Encoded items per projection: a session publishes one per cycle, so a response is built at most once per cycle. */
const encoded = new WeakMap<VisibleProjection, readonly object[] | undefined>();

/** `emitResponse`, for any object: this module may not name the session type (§4.1). */
export function emit(session: object, options: { readonly authored?: string } = {}): QuestionnaireResponse {
  const projection = projectionOf(session);
  if (projection === undefined) throw new FhirqError('unknown-session');
  const authored: unknown = typeof options === 'object' && options !== null ? options.authored : null;
  if (authored === null || (authored !== undefined && (typeof authored !== 'string' || parseDateTime(authored) === null))) {
    throw new FhirqError('invalid-options');
  }
  if (!encoded.has(projection)) encoded.set(projection, encodeItems(responseItems(projection.roots)));
  const { definition, status, hostIdentity } = projection;
  return encodeResponse(
    { url: definition.url, version: definition.version, status, authored: authored ?? new Date().toISOString(), identity: hostIdentity },
    encoded.get(projection),
  );
}

function responseItems(nodes: readonly VisibleNode[]): ResponseItem[] {
  return nodes.flatMap((node): ResponseItem[] => {
    const { linkId, text, type, repeats } = node.item;
    if (type === 'group') {
      const groups = repeats ? node.instances.map((instance) => responseItems(instance.children)) : [responseItems(node.children)];
      return groups.filter((items) => items.length > 0).map((items) => ({ linkId, text, answers: [], items }));
    }
    return node.answers.length > 0 ? [{ linkId, text, answers: node.answers, items: [] }] : [];
  });
}
