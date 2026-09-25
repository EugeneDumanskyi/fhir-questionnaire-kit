/**
 * The kit's whole network path (ADR-0012 and its M7 note): the only file the
 * `no-network` lint lets make a request. It holds the `src` loader and, from
 * M7 plan step 6, the default value-set resolver, and nothing else. No
 * retries, no caching, no logging.
 */
import { FhirqError, type Questionnaire } from '@fhirq/core';

/**
 * One `GET` of `src`, resolved against the document's base URL, for the JSON
 * it holds. A network error, a response that is not a success and a body that
 * is not JSON each reject with `FhirqError` `request-failed`, what failed as
 * its `cause`. The JSON is not checked here: the session that loads it is.
 */
export async function loadQuestionnaire(src: string, signal: AbortSignal): Promise<Questionnaire> {
  const fail = (cause: unknown) => new FhirqError('request-failed', [], { cause });
  let response: Response;
  try {
    response = await fetch(src, { headers: { Accept: 'application/fhir+json' }, credentials: 'same-origin', signal });
  } catch (cause) {
    throw fail(cause);
  }
  if (!response.ok) throw fail(response);
  try {
    return (await response.json()) as Questionnaire;
  } catch (cause) {
    throw fail(cause);
  }
}
