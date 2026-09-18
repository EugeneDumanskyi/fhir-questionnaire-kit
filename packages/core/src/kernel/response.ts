import type { Answer } from './answer.js';
import type { LinkId } from './item-type.js';

/**
 * A response as the engine knows it, in both directions, without an R4 shape
 * (ADR-0016): the codec encodes `ResponseContent` and `ResponseItem`s for
 * emission, and decodes a stored response into `StoredResponse` for hydration.
 */
export interface ResponseItem {
  readonly linkId: LinkId;
  /** The item's text, repeated in the response for a reader; `''` for none. */
  readonly text: string;
  readonly answers: readonly Answer[];
  readonly items: readonly ResponseItem[];
}

/** Everything a response holds besides its items, which are encoded apart so they can be kept per cycle. */
export interface ResponseContent {
  readonly url: string | null;
  readonly version: string | null;
  readonly status: 'in-progress' | 'completed';
  readonly authored: string;
  /** Host identity, verbatim (INV-S-32). */
  readonly identity: object | null;
}

/**
 * A stored answer: typed when its `value[x]` is a well-formed value of a kind
 * the kit holds, `null` otherwise. `found` names what it is, for a diagnostic
 * (INV-E-09): the answer kind, an R4 type no item holds (`Time`), or
 * `malformed`. Never the value.
 */
export interface StoredAnswer {
  readonly answer: Answer | null;
  readonly found: string;
}

export interface StoredItem {
  readonly linkId: LinkId;
  readonly answers: readonly StoredAnswer[];
  readonly items: readonly StoredItem[];
  /** Items nested under an answer, which no supported item has (INV-D-17): reported, never loaded. */
  readonly answerItems: readonly StoredItem[];
}

export interface StoredResponse {
  /** The `questionnaire` canonical as stored, version included; `null` when absent. */
  readonly questionnaire: string | null;
  /** `subject`, `author`, `encounter` and `identifier` as stored, when any is present. */
  readonly identity: object | null;
  readonly items: readonly StoredItem[];
}
