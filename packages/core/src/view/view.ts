import type { IssueCode, ItemPath, NodeState, Session, SessionChange, SessionState } from '../index.js';
import { fill, plural } from './format.js';
import { nodeIds, type NodeIds } from './ids.js';
import { en, type Messages } from './messages/en.js';

/**
 * The presentation model's S1 field list (ADR-0007, `06-roadmap.md` M1 AC-3).
 * Every field carries meaning, never markup: no field names an element, an
 * ARIA attribute or a CSS property. `label` and `clear` are the two names
 * that coincide with an HTML element and a CSS property; both are ADR-0007's
 * own field names and are recorded as such in the deny-list test.
 */

/** @alpha */
export interface ViewOptions {
  /** Prefixes every id, so two forms on one page or one React tree cannot collide. */
  readonly idPrefix: string;
}

/**
 * Semantic control kinds. Which element and role each maps to is the DOM contract's business.
 *
 * @alpha
 */
export type ControlKind = 'yes-no' | 'short-text';

/** @alpha */
export interface ViewIssue {
  /** The rule that raised it. Not `code`, which names an HTML element. */
  readonly rule: IssueCode;
  readonly message: string;
}

interface ViewNodeCommon {
  /** Item path: the key for identity, React keys and patcher records. */
  readonly path: string;
  readonly label: string;
  /** Help text; the slice has none, so always `null`. */
  readonly description: string | null;
  readonly ids: NodeIds;
  readonly required: boolean;
  /** `true` exactly when there are surfaced issues. */
  readonly invalid: boolean;
  /** Surfaced issues only (SM-03). */
  readonly issues: readonly ViewIssue[];
  readonly clear: () => void;
  /** The domain meaning of blur: `NoteItemLeft`. */
  readonly leave: () => void;
}

/** @alpha */
export interface YesNoChoice {
  readonly value: boolean;
  readonly label: string;
  readonly selected: boolean;
}

/** @alpha */
export interface YesNoViewNode extends ViewNodeCommon {
  readonly control: 'yes-no';
  /** `null` is unanswered, which FHIR `boolean` allows and a two-state control cannot show. */
  readonly value: boolean | null;
  readonly choices: readonly YesNoChoice[];
  readonly set: (value: boolean) => void;
}

/** @alpha */
export interface ShortTextViewNode extends ViewNodeCommon {
  readonly control: 'short-text';
  /** `''` when unanswered. */
  readonly value: string;
  /** `set('')` clears the answer: FHIR has no empty string. */
  readonly set: (value: string) => void;
}

/** @alpha */
export type ViewNode = YesNoViewNode | ShortTextViewNode;

/** @alpha */
export interface ErrorSummaryEntry {
  readonly path: string;
  /** The issue and the question it is about, so the link makes sense out of context. */
  readonly message: string;
  /** The id to move focus to: the node's control. Not `target`, which on `<a>` names a browsing context. */
  readonly focusId: string;
}

/** @alpha */
export interface ErrorSummary {
  readonly id: string;
  readonly headingId: string;
  readonly heading: string;
  readonly entries: readonly ErrorSummaryEntry[];
}

/**
 * One coalesced message per cycle (INV-P-03). `cycle` lets a renderer tell a repeat from a re-render.
 *
 * @alpha
 */
export interface Announcement {
  readonly text: string;
  readonly cycle: number;
}

/** @alpha */
export interface FocusTarget {
  readonly id: string;
  readonly cycle: number;
}

/** @alpha */
export interface ViewModel {
  readonly completed: boolean;
  readonly requiredMarker: string;
  /** Visible nodes in document order. Unchanged nodes keep their object identity. */
  readonly nodes: readonly ViewNode[];
  readonly announcement: Announcement | null;
  /** Present after a refused completion while any issue is still surfaced (AC-11.3.1). */
  readonly errorSummary: ErrorSummary | null;
  readonly focusTarget: FocusTarget | null;
}

/**
 * A view over one session. `getSnapshot` is a pure function of the session's
 * snapshot, memoised on its identity, so it can be handed straight to
 * `useSyncExternalStore`.
 *
 * @alpha S1 spike surface.
 */
export interface View {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => ViewModel;
}

interface Commands {
  readonly setYesNo: (value: boolean) => void;
  readonly setText: (value: string) => void;
  readonly clear: () => void;
  readonly leave: () => void;
}

const NO_ISSUES: readonly ViewIssue[] = [];

const ISSUE_MESSAGE: Readonly<Record<IssueCode, (messages: Messages) => string>> = {
  required: (messages) => messages.issueRequired,
};

/** @alpha S1 spike surface. */
export function createView(session: Session, options: ViewOptions): View {
  const messages = en;
  const summaryId = `${options.idPrefix}-summary`;
  const cache = new Map<string, { readonly state: NodeState; readonly view: ViewNode }>();
  const commands = new Map<string, Commands>();
  let lastState: SessionState | undefined;
  let lastModel: ViewModel | undefined;

  const commandsFor = (path: ItemPath): Commands => {
    let bound = commands.get(path);
    if (bound === undefined) {
      const clear = () => void session.dispatch({ type: 'ClearAnswer', path });
      bound = {
        setYesNo: (value) => void session.dispatch({ type: 'SetAnswer', path, answers: [{ kind: 'boolean', value }] }),
        setText: (value) =>
          value === '' ? clear() : void session.dispatch({ type: 'SetAnswer', path, answers: [{ kind: 'string', value }] }),
        clear,
        leave: () => void session.dispatch({ type: 'NoteItemLeft', path }),
      };
      commands.set(path, bound);
    }
    return bound;
  };

  const nodeView = (state: NodeState): ViewNode => {
    const cached = cache.get(state.path);
    if (cached?.state === state) return cached.view;
    const view = buildNode(state, nodeIds(options.idPrefix, state.path), commandsFor(state.path), messages);
    cache.set(state.path, { state, view });
    return view;
  };

  const build = (state: SessionState, previous: ViewModel | undefined): ViewModel => {
    const built = state.nodes.filter(rendered).map(nodeView);
    const same = previous !== undefined && built.length === previous.nodes.length && built.every((node, i) => node === previous.nodes[i]);
    const nodes = same ? previous.nodes : built;
    const errorSummary = summarise(state, nodes, summaryId, messages, previous?.errorSummary ?? null);
    return {
      completed: state.status === 'completed',
      requiredMarker: messages.requiredMarker,
      nodes,
      announcement: announce(state.change, state.cycle, errorSummary, messages),
      errorSummary,
      focusTarget: state.change?.completion === 'refused' ? { id: summaryId, cycle: state.cycle } : null,
    };
  };

  return {
    subscribe: (listener) => session.subscribe(() => listener()),
    getSnapshot() {
      const state = session.getSnapshot();
      if (state !== lastState || lastModel === undefined) {
        lastModel = build(state, lastModel);
        lastState = state;
      }
      return lastModel;
    },
  };
}

/**
 * The two control kinds M1 built. Other item types reach the snapshot from M2
 * but are not rendered until M5 writes their controls (M2 plan D9).
 */
function rendered(state: NodeState): boolean {
  return state.item.type === 'boolean' || state.item.type === 'string';
}

function buildNode(state: NodeState, ids: NodeIds, commands: Commands, messages: Messages): ViewNode {
  const issues = state.surfaced && state.issues.length > 0
    ? state.issues.map((issue): ViewIssue => ({ rule: issue.code, message: ISSUE_MESSAGE[issue.code](messages) }))
    : NO_ISSUES;
  const common = {
    path: state.path,
    label: state.item.text,
    description: null,
    ids,
    required: state.item.required,
    invalid: issues.length > 0,
    issues,
    clear: commands.clear,
    leave: commands.leave,
  };
  const [answer] = state.answers;
  if (state.item.type === 'boolean') {
    const value = answer?.kind === 'boolean' ? answer.value : null;
    return {
      ...common,
      control: 'yes-no',
      value,
      choices: [
        { value: true, label: messages.yes, selected: value === true },
        { value: false, label: messages.no, selected: value === false },
      ],
      set: commands.setYesNo,
    };
  }
  return {
    ...common,
    control: 'short-text',
    value: answer?.kind === 'string' ? answer.value : '',
    set: commands.setText,
  };
}

function summarise(
  state: SessionState,
  nodes: readonly ViewNode[],
  id: string,
  messages: Messages,
  previous: ErrorSummary | null,
): ErrorSummary | null {
  if (!state.completionRefused || state.status === 'completed') return null;
  const entries = nodes.flatMap((node) =>
    node.issues.map((issue): ErrorSummaryEntry => ({
      path: node.path,
      message: fill(messages.errorSummaryEntry, { message: issue.message, label: node.label }),
      focusId: node.ids.control,
    })),
  );
  if (entries.length === 0) return null;
  const unchanged =
    previous !== null &&
    previous.entries.length === entries.length &&
    previous.entries.every((entry, i) => entry.path === entries[i]?.path && entry.message === entries[i]?.message);
  return unchanged ? previous : { id, headingId: `${id}-heading`, heading: messages.errorSummaryHeading, entries };
}

function announce(
  change: SessionChange | null,
  cycle: number,
  errorSummary: ErrorSummary | null,
  messages: Messages,
): Announcement | null {
  if (change === null) return null;
  const parts: string[] = [];
  if (change.completion === 'refused') parts.push(plural(messages.announceRefused, errorSummary?.entries.length ?? 0));
  if (change.completion === 'completed') parts.push(messages.announceCompleted);
  if (change.enabled.length > 0) parts.push(plural(messages.announceShown, change.enabled.length));
  if (change.disabled.length > 0) parts.push(plural(messages.announceHidden, change.disabled.length));
  if (change.completion === null && change.surfaced.length > 0) {
    parts.push(plural(messages.announceIssues, change.surfaced.length));
  }
  return parts.length > 0 ? { text: parts.join(' '), cycle } : null;
}
