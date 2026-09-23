import type { NodeState, SessionState } from '../index.js';
import type { Catalogue } from './catalogue.js';
import type { PluralMessage } from './messages/en.js';
import { plural } from './format.js';
import type { Announcement, ErrorSummary } from './types.js';

/**
 * One announcement per cycle at most, naming what changed and how many
 * (INV-P-03, AC-11.3.2). The parts of one cycle are joined into one message;
 * a cycle with nothing to say has none. An option set settling is a cycle of
 * its own (T12) and is announced as one. A question is an item a respondent
 * answers or reads: a group appearing is not counted, its questions are.
 */
export function announce(
  state: SessionState,
  previous: SessionState | undefined,
  fresh: boolean,
  surfacedDrafts: ReadonlySet<string>,
  summary: ErrorSummary | null,
  messages: Catalogue,
  locale: string,
): Announcement | null {
  const change = fresh ? state.change : null;
  const refused = change?.completion === 'refused';
  const counts: [PluralMessage, number][] = [[messages.announceIssues, refused ? 0 : new Set([...(change?.surfaced ?? []), ...surfacedDrafts]).size]];
  if (change !== null) {
    counts.unshift(
      [messages.announceRefused, refused ? (summary?.entries.length ?? 0) : 0],
      ...settled(state, previous, change.command === 'OptionsSettled', messages),
      [messages.announceShown, questions(change.enabled, state.nodes)],
      [messages.announceHidden, questions(change.disabled, previous?.nodes)],
      [messages.announceAdded, change.added.length],
      [messages.announceRemoved, change.removed.length],
    );
  }
  const parts = counts.filter(([, count]) => count > 0).map(([message, count]) => plural(message, count, locale));
  if (change?.completion === 'completed') parts.push(messages.announceCompleted);
  return parts.length > 0 ? { text: parts.join(' '), cycle: state.cycle } : null;
}

/** How many of the paths are questions: a group appearing is not counted, its questions are. */
function questions(paths: readonly string[], nodes: readonly NodeState[] = []): number {
  const listed = new Set(paths);
  return nodes.filter((node) => listed.has(node.path) && node.item.type !== 'group').length;
}

/** T12: the visible questions whose value set settled in this cycle, loaded and failed. */
function settled(state: SessionState, previous: SessionState | undefined, settling: boolean, messages: Catalogue): [PluralMessage, number][] {
  let loaded = 0;
  let failed = 0;
  for (const { item } of settling ? state.nodes : []) {
    const set = item.valueSet === null ? undefined : state.optionSets[item.valueSet];
    if (set === undefined || set === previous?.optionSets[item.valueSet ?? '']) continue;
    if (set.status === 'resolved') loaded += 1;
    if (set.status === 'failed') failed += 1;
  }
  return [
    [messages.announceOptionsLoaded, loaded],
    [messages.announceOptionsFailed, failed],
  ];
}
