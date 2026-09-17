import { FhirqError } from './error.js';

/**
 * An item node's address (`04-domain.md` §1): the chain of `linkId`s from the
 * root, with the repeat ordinal of each repeating group instance on the way.
 *
 * Written as segments joined by `/`. Each `linkId` is percent-encoded, so an
 * authored `/`, `[` or `]` can never be read as structure, and an instance adds
 * `[ordinal]` to its group's segment: `meds[2]/dose`. Ordinals are identity,
 * never position, so a path stays the same when other instances come and go
 * (AC-03.4.1, `04-domain.md` T11). A node computes its path once, when it is
 * created, and the session keys every table on that one string.
 */
export type ItemPath = string & { readonly __brand: 'ItemPath' };

/**
 * Builds a path from `linkId`s and ordinals: `itemPath('smoker')`,
 * `itemPath('meds', 2, 'dose')`. A number is the ordinal of the repeating group
 * named just before it. Throws `FhirqError` with `invalid-path` on anything
 * else, since a malformed path is an integration error, not a respondent's.
 */
export function itemPath(...parts: readonly (string | number)[]): ItemPath {
  let path: ItemPath | null = null;
  let afterLinkId = false;
  for (const part of parts) {
    if (typeof part === 'string' && part !== '') {
      path = childPath(path, part);
      afterLinkId = true;
    } else if (typeof part === 'number' && afterLinkId && Number.isSafeInteger(part) && part >= 0 && path !== null) {
      path = instancePath(path, part);
      afterLinkId = false;
    } else {
      throw new FhirqError('invalid-path');
    }
  }
  if (path === null) throw new FhirqError('invalid-path');
  return path;
}

/** The path of a child item under `parent`, or of a root item when `parent` is `null`. */
export function childPath(parent: ItemPath | null, linkId: string): ItemPath {
  const segment = encodeURIComponent(linkId);
  return (parent === null ? segment : `${parent}/${segment}`) as ItemPath;
}

/** The path of one instance of the repeating group at `group`. */
export function instancePath(group: ItemPath, ordinal: number): ItemPath {
  return `${group}[${ordinal}]` as ItemPath;
}
