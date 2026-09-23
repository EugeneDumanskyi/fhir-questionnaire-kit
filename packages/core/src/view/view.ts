import type { Answer, Command, ItemPath, NodeState, Session, SessionState } from '../index.js';
import { announce } from './announce.js';
import { choiceParts, entryType, instanceView, nodeView, type Commands, type Context } from './build.js';
import { catalogue } from './catalogue.js';
import { controlKind, isChoice } from './controls.js';
import { entries, fromTexts, type Unit } from './drafts.js';
import { focusAfter } from './focus.js';
import { summarise } from './summary.js';
import type { InstanceView, View, ViewModel, ViewNode, ViewOptions } from './types.js';

/**
 * The presentation model (ADR-0007): a pure function of the session's
 * snapshot, the presentation options and the text being typed. Typed text is
 * the only thing the view holds, and it is not domain state: it never reaches
 * the engine until it is a value (INV-P-01, INV-P-06). A new view over the
 * same session starts without it.
 *
 * The view is a tree (M5 plan D1). A node is a new object only when its
 * `NodeState`, its option set, its draft or a node under it changed, so a
 * renderer skips an unchanged subtree by reference. Commands are bound once
 * per path, so they never change a node's identity.
 */

const NONE: readonly never[] = [];

/** The parent of a node path: a node, an instance (`meds[2]`), or the root (`''`). */
const parentOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** A unit's fields that are present, so a quantity never carries an `undefined` one. */
const unitFields = (fields: Readonly<Record<'unit' | 'system' | 'code', string | undefined>>): Unit => JSON.parse(JSON.stringify(fields)) as Unit;

/**
 * Creates the presentation model over a session. The options are fixed for
 * the view's life; another tier, theme or locale is another view over the
 * same session, which leaves the session untouched (INV-P-01).
 *
 * @alpha
 */
export function createView(session: Session, options: ViewOptions): View {
  const { idPrefix, locale, timeZone } = options;
  const messages = catalogue(options.messages);
  const labels = { retry: messages.optionsRetry, other: messages.other, unit: messages.unit, choose: messages.optionsChoose };
  /** Text as typed, by path: one entry per answer (INV-P-06). */
  const drafts = new Map<string, readonly string[]>();
  /** A unit chosen before a value is typed, by path. */
  const units = new Map<string, string>();
  /** Paths the respondent has left: a draft's issue shows once its node is left (blur-then-live, as SM-03). */
  const left = new Set<string>();
  /** Paths whose draft issue a `leave` surfaced since the last model, for its announcement. */
  let surfacedDrafts = new Set<string>();
  const commands = new Map<string, Commands>();
  const memo = new Map<string, { readonly inputs: readonly unknown[]; readonly value: unknown }>();
  const listeners = new Set<() => void>();
  let version = 0;
  let lastState: SessionState | undefined;
  let lastVersion = -1;
  let lastModel: ViewModel | undefined;
  let lastIndex: ReadonlyMap<string, ViewNode | InstanceView> = new Map();

  const stateOf = (path: string): NodeState | undefined => session.getSnapshot().nodes.find((node) => node.path === path);

  /** Runs a command. A change the view made itself reaches the listeners even when the session had nothing to notify. */
  const run = (command: Command | null, changed: boolean): void => {
    if (changed) version += 1;
    const outcome = command === null ? null : session.dispatch(command).outcome;
    if (changed && outcome !== 'applied' && outcome !== 'deferred') for (const listener of [...listeners]) listener();
  };

  /** A quantity's unit: its answer's, else the one chosen while there was no value. */
  const chosenUnit = (state: NodeState): Unit => {
    const chosen = units.get(state.path);
    if (chosen === undefined || chosen === '') return {};
    if (state.item.units.length === 0) return { unit: chosen };
    const coding = state.item.units[Number(chosen)];
    return coding === undefined ? {} : unitFields({ unit: coding.display ?? coding.code, system: coding.system, code: coding.code });
  };
  const unitOf = (state: NodeState): Unit => {
    const [first] = state.answers;
    return first?.kind === 'quantity' ? unitFields({ unit: first.value.unit, system: first.value.system, code: first.value.code }) : chosenUnit(state);
  };

  const textsOf = (state: NodeState) => entries(entryType(state) ?? 'string', state.answers, drafts.get(state.path), timeZone, unitOf(state));

  /** Types `texts` into the node: the entries that are values become its answers, the rest stay a draft (INV-P-06). */
  const type = (state: NodeState, typed: readonly string[], unit = unitOf(state)): void => {
    const texts = [...typed];
    while (texts.at(-1) === '') texts.pop();
    drafts.set(state.path, texts);
    const { answers } = fromTexts(entryType(state) ?? 'string', texts, timeZone, unit);
    const path = state.path;
    run(answers.length > 0 ? { type: 'SetAnswer', path, answers } : { type: 'ClearAnswer', path }, true);
  };

  /** Sends a choice's answers: the picked options, then the free text, if any. */
  const choose = (state: NodeState, picked: readonly Answer[], other: string | null): void => {
    const answers = other === null || other === '' ? picked : [...picked, { kind: 'string' as const, value: other }];
    const path = state.path;
    run(answers.length > 0 ? { type: 'SetAnswer', path, answers } : { type: 'ClearAnswer', path }, false);
  };

  const commandsFor = (path: string): Commands => {
    let bound = commands.get(path);
    if (bound !== undefined) return bound;
    const at = path as ItemPath;
    /** Runs `act` on the node's current state, if it is still visible. */
    const on = <A extends unknown[]>(act: (state: NodeState, ...args: A) => void) => (...args: A) => {
      const state = stateOf(path);
      if (state !== undefined) act(state, ...args);
    };
    const choices = (state: NodeState) => choiceParts(state, { sets: session.getSnapshot().optionSets, messages, locale, timeZone });
    const setAt = on((state, index: number, text: string) => {
      const texts = [...textsOf(state).texts];
      texts[index] = text;
      type(state, Array.from(texts, (entry) => entry ?? ''));
    });
    bound = {
      set: on((state, value: string | readonly string[]) => {
        const kind = controlKind(state.item, 0);
        if (kind === 'yes-no') run({ type: 'SetAnswer', path: at, answers: [{ kind: 'boolean', value: value === 'true' }] }, false);
        else if (!isChoice(kind)) setAt(0, String(value));
        else {
          const { options, answers, other } = choices(state);
          const keys: readonly string[] = typeof value === 'string' ? [value] : value;
          choose(state, answers.filter((_, i) => keys.includes(options[i]?.key ?? '')), state.item.repeats ? other : null);
        }
      }),
      setAt,
      setUnit: on((state, unit: string) => {
        units.set(path, unit);
        // Re-sent with the new unit; with no value yet, the choice waits for one.
        if (state.answers.length > 0) type(state, textsOf(state).texts, chosenUnit(state));
        else run(null, true);
      }),
      setOther: on((state, text: string) => {
        const { answers, options } = choices(state);
        choose(state, state.item.repeats ? answers.filter((_, i) => options[i]?.selected === true) : NONE, text);
      }),
      toggle: on((state, key: string) => {
        const { options, answers, other } = choices(state);
        choose(state, answers.filter((_, i) => (options[i]?.key === key) !== (options[i]?.selected === true)), other);
      }),
      clear: () => {
        drafts.delete(path);
        run({ type: 'ClearAnswer', path: at }, true);
      },
      leave: () => {
        const state = stateOf(path);
        const surfaces = !left.has(path) && state !== undefined && entryType(state) !== null && textsOf(state).invalid;
        left.add(path);
        if (surfaces) surfacedDrafts.add(path);
        run({ type: 'NoteItemLeft', path: at }, surfaces);
      },
      retry: on((state) => {
        if (state.item.valueSet !== null) run({ type: 'RetryOptions', valueSet: state.item.valueSet }, false);
      }),
      add: () => run({ type: 'AddRepeatInstance', path: at }, false),
      remove: () => {
        const open = path.lastIndexOf('[');
        run({ type: 'RemoveRepeatInstance', path: path.slice(0, open) as ItemPath, ordinal: Number(path.slice(open + 1, -1)) }, false);
      },
    };
    commands.set(path, bound);
    return bound;
  };

  /**
   * The view tree: nodes under their parents, instances under their groups,
   * each kept by identity while nothing it is built from changed (M5 plan D1).
   * Also indexes every node and instance by path, for focus targets.
   */
  const tree = (state: SessionState) => {
    const cx: Context = { messages, locale, timeZone, idPrefix, sets: state.optionSets, commands: commandsFor, texts: textsOf, unit: unitOf };
    const under = new Map<string, NodeState[]>();
    for (const node of state.nodes) {
      const parent = parentOf(node.path);
      const siblings = under.get(parent) ?? [];
      siblings.push(node);
      under.set(parent, siblings);
    }
    const seen = new Set<string>();
    const index = new Map<string, ViewNode | InstanceView>();
    /** The cached value when every input is the same object as last time; otherwise a new one. */
    const keep = <T extends ViewNode | InstanceView>(key: string, inputs: readonly unknown[], make: () => T): T => {
      seen.add(key);
      const hit = memo.get(key);
      const same = hit !== undefined && hit.inputs.length === inputs.length && hit.inputs.every((input, i) => input === inputs[i]);
      const value = same ? (hit.value as T) : make();
      if (!same) memo.set(key, { inputs, value });
      index.set(key, value);
      return value;
    };
    const make = (node: NodeState): ViewNode => {
      const { path, item } = node;
      const children = (under.get(path) ?? NONE).map(make);
      const instances = node.instances.map((ordinal, position) => {
        const at = `${path}[${ordinal}]`;
        const inside = (under.get(at) ?? NONE).map(make);
        return keep(at, [item, position, ...inside], () => instanceView(at, position + 1, item.text, inside, cx));
      });
      const draft = drafts.get(path);
      // A draft's issue shows once the node is left or a completion is refused.
      const shown = draft !== undefined && (left.has(path) || state.completionRefused);
      const set = item.valueSet === null ? null : state.optionSets[item.valueSet];
      return keep(path, [node, set, draft, units.get(path), shown, ...children, NONE, ...instances], () => nodeView(node, children, instances, shown, cx));
    };
    const nodes = (under.get('') ?? NONE).map(make);
    for (const key of memo.keys()) if (!seen.has(key)) memo.delete(key);
    return { nodes, index };
  };

  const build = (state: SessionState, previous: ViewModel | undefined): ViewModel => {
    const { nodes: built, index } = tree(state);
    const same = previous !== undefined && built.length === previous.nodes.length && built.every((node, i) => node === previous.nodes[i]);
    const nodes = same ? previous.nodes : built;
    // A view announces and moves focus for the cycles it sees after its first model, not for one before it existed.
    const fresh = lastState !== undefined && state !== lastState;
    const errorSummary = summarise(state, nodes, idPrefix, messages, locale, timeZone, previous?.errorSummary ?? null);
    const surfaced = surfacedDrafts;
    surfacedDrafts = new Set();
    const announcement = fresh || surfaced.size > 0 ? announce(state, lastState, fresh, surfaced, errorSummary, messages, locale) : (previous?.announcement ?? null);
    const focusTarget = fresh ? focusAfter(state, index, lastIndex, errorSummary) : (previous?.focusTarget ?? null);
    lastIndex = index;
    return {
      completed: state.status === 'completed',
      requiredMarker: messages.requiredMarker,
      labels,
      nodes,
      announcement,
      errorSummary,
      focusTarget,
    };
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      const unsubscribe = session.subscribe(() => listener());
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
    getSnapshot() {
      const state = session.getSnapshot();
      if (state !== lastState || version !== lastVersion || lastModel === undefined) {
        lastModel = build(state, lastModel);
        lastState = state;
        lastVersion = version;
      }
      return lastModel;
    },
  };
}
