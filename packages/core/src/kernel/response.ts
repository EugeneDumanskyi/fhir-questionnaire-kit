import type { Answer } from './answer.js';
import type { LinkId } from './item-type.js';

/**
 * A response as the engine knows it, without an R4 shape (ADR-0016): the
 * codec encodes `ResponseContent` and `ResponseItem`s for emission.
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
