/** ADR-0013's four tiers, each stopping at a layer boundary. */
export type Tier = 1 | 2 | 3 | 4;

/** The page's colour scheme: the system's, or light or dark set with tier-2 tokens (plan D8). */
export type Scheme = 'system' | 'light' | 'dark';
