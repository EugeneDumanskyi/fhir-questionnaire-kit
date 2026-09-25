/**
 * The kit's whole network path (ADR-0012 and its M7 note): the only file the
 * `no-network` lint lets make a request. It holds the `src` loader and the
 * default value-set resolver, and nothing else. No retries, no caching, no
 * logging.
 */
import { FhirqError, type OptionResolver, type Questionnaire } from '@fhirq/core';

type Option = Awaited<ReturnType<OptionResolver>>[number];

const fail = (cause: unknown) => new FhirqError('request-failed', [], { cause });

/**
 * One `GET` of `url`, resolved against the document's base URL, for the JSON
 * it holds. A network error, a response that is not a success and a body that
 * is not JSON each reject with `FhirqError` `request-failed`, what failed as
 * its `cause`.
 */
async function get(url: string, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/fhir+json' }, credentials: 'same-origin', signal });
  } catch (cause) {
    throw fail(cause);
  }
  if (!response.ok) throw fail(response);
  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw fail(cause);
  }
}

/** The questionnaire `src` names. The JSON is not checked here: the session that loads it is. */
export const loadQuestionnaire = (src: string, signal: AbortSignal) => get(src, signal) as Promise<Questionnaire>;

/**
 * The element's resolver when it has `value-set-base` and no `resolver`
 * (ADR-0012): one `GET {base}/ValueSet/$expand?url={canonical}` per call, and
 * the core calls it once per canonical per session. Its options are the
 * expansion's `contains`, nested ones flattened in document order, less the
 * entries a respondent cannot pick: an `abstract` one or one with no `code`.
 * A body that is not a `ValueSet` with an expansion of such entries rejects
 * as the request does, with the body as its `cause`.
 */
export function valueSetResolver(base: string): OptionResolver {
  const root = base.replace(/\/+$/, '');
  return async (valueSet, { signal }) => {
    const body = await get(`${root}/ValueSet/$expand?url=${encodeURIComponent(valueSet)}`, signal);
    const options: Option[] = [];
    const expansion = isObject(body) && body['resourceType'] === 'ValueSet' ? body['expansion'] : undefined;
    if (!isObject(expansion) || !flatten(expansion['contains'], options)) throw fail(body);
    return options;
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Adds `contains`' pickable entries to `options`, each followed by its own: `false` for a list that is not one of entries. */
function flatten(contains: unknown, options: Option[]): boolean {
  if (contains === undefined) return true;
  if (!Array.isArray(contains)) return false;
  for (const entry of contains as unknown[]) {
    if (!isObject(entry)) return false;
    const { system, code, display } = entry;
    if (typeof code === 'string' && entry['abstract'] !== true) {
      options.push({ ...(typeof system === 'string' ? { system } : {}), code, ...(typeof display === 'string' ? { display } : {}) });
    }
    if (!flatten(entry['contains'], options)) return false;
  }
  return true;
}
