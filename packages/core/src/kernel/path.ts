/**
 * An item node's address (`04-domain.md` §1): the chain of `linkId`s from the
 * root, with a repeat ordinal at each repeating group. The S1 slice has no
 * groups and no repeats, so a path is one encoded `linkId`; M2 adds segments
 * and ordinals without changing the type's meaning.
 */
export type ItemPath = string & { readonly __brand: 'ItemPath' };

/**
 * The path of a root item. The `linkId` is percent-encoded so that a `/` in
 * an authored `linkId` can never be read as a segment separator later.
 *
 * @alpha S1 spike surface; M2 replaces it.
 */
export function itemPath(linkId: string): ItemPath {
  return encodeURIComponent(linkId) as ItemPath;
}
