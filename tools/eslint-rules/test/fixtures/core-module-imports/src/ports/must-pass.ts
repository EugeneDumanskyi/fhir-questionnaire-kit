// A port is a shape: interfaces, type aliases, type-only imports and a global type augmentation.
import type { Answer } from '../kernel/answer';
import { type ItemPath } from '../kernel/path';

declare global {
  interface AbortSignal {
    readonly aborted: boolean;
  }
}

export interface Scorer {
  readonly score: (answers: readonly Answer[]) => unknown;
}

export type Resolver = (valueSet: string, context: { readonly signal: AbortSignal; readonly path: ItemPath }) => PromiseLike<readonly unknown[]>;

export type { Answer };
