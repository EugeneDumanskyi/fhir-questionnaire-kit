import type { Answer, IssueCode, Quantity } from '../index.js';
import type { NodeIds } from './ids.js';

/**
 * The presentation model's public shape (ADR-0007, ADR-0013, ADR-0020).
 * Every field carries meaning, never markup: no field names an element, an
 * ARIA attribute or a CSS property (`packages/core/test/view-fields.test.ts`).
 * `label`, `clear` and `display` coincide with an element or a CSS property
 * and are each an accepted ADR's own name; `deny-lists.ts` says why.
 */

/** @alpha */
export interface ViewOptions {
  /** Prefixes every id, so two forms on one page or one React tree cannot collide. */
  readonly idPrefix: string;
  /** BCP 47 tag that every date, number and count is formatted in (ADR-0020). Never read from the environment. */
  readonly locale: string;
  /**
   * IANA zone a `dateTime` with a time is shown in, and a typed time of day is
   * read in. Without one, a `dateTime` is shown in its own offset, and a time
   * of day is taken only with its offset written out: the view never assumes UTC.
   */
  readonly timeZone?: string;
  /**
   * Message overrides (US-07.4, ADR-0020): any key of the built-in catalogue,
   * and the message keys an issue carries, such as a cross-field rule's. Each
   * key falls back on its own (INV-X-08): one that is missing, empty or
   * shaped wrong gets the built-in `en` text, and an issue whose key has no
   * text anywhere gets the generic issue message, never the key itself.
   */
  readonly messages?: Readonly<Record<string, string | { readonly one: string; readonly other: string }>>;
}

/**
 * What a node is for the respondent (INV-P-05). Which element and role each
 * maps to is the DOM contract's business, so none is named after one.
 *
 * - Entry: `yes-no`, `short-text`, `long-text`, `integer`, `decimal`,
 *   `calendar-date`, `date-time`, `quantity`.
 * - Options: `single-choice` (all shown, pick one), `single-list` (a list to
 *   scroll, pick one), `single-menu` (collapsed until opened, pick one),
 *   `multi-choice` (all shown, pick any), `multi-list` (a list, pick any).
 * - Read only: `calculated` (a value the form computes), `statement` (a
 *   `display` item), `unsupported` (a lenient-mode placeholder, AC-01.3.2).
 * - Structure: `group`, `repeating-group`.
 *
 * @alpha
 */
export type ControlKind =
  | 'yes-no'
  | 'short-text'
  | 'long-text'
  | 'integer'
  | 'decimal'
  | 'calendar-date'
  | 'date-time'
  | 'quantity'
  | 'single-choice'
  | 'single-list'
  | 'single-menu'
  | 'multi-choice'
  | 'multi-list'
  | 'calculated'
  | 'statement'
  | 'group'
  | 'repeating-group'
  | 'unsupported';

/** @alpha */
export interface ViewIssue {
  /**
   * The rule that raised it: an engine rule, or one of the view's two on text
   * that is not a value yet (INV-P-06). Not `code`, which names an element.
   */
  readonly rule: IssueCode | 'not-a-date' | 'not-a-number';
  /** Filled in: the authored limit and the entered value, formatted (AC-04.2.1). */
  readonly message: string;
}

/**
 * One option of a yes/no, choice or quantity-unit control. `key` is what
 * `set`, `toggle` and `setUnit` take: a string, so it can be a control's value as is.
 *
 * @alpha
 */
export interface ChoiceView {
  readonly key: string;
  readonly label: string;
  readonly selected: boolean;
}

/**
 * One instance of a repeating group, in position order. `ids.control` is its
 * remove control's id and `ids.label` its name's.
 *
 * @alpha
 */
export interface InstanceView {
  /** The instance path (`meds[2]`): the key for identity, React keys and patcher records. */
  readonly path: string;
  /** 1-based place in the group: the path's ordinal never changes, this does (T11). */
  readonly number: number;
  /** Tells instances apart by name (AC-11.2.1): the group's label and the number. */
  readonly label: string;
  readonly ids: NodeIds;
  readonly children: readonly ViewNode[];
  readonly removeLabel: string;
  /** Destroys the instance and its answers (AC-03.2.6). Never refused (INV-S-23). */
  readonly remove: () => void;
}

/**
 * A node of the view tree: one per visible item node, in document order,
 * a group's children under it and a repeating group's under its instances.
 * A node is a new object only when it, or something under it, changed; an
 * unchanged node keeps its identity, so a renderer skips it by reference.
 *
 * Entry controls take text as typed (`set`): a date or number that is not a
 * value yet stays on screen as `entry`, clears the answer, and raises
 * `not-a-date` or `not-a-number` (INV-P-06). `value` is the domain value and
 * `display` the same value formatted for reading (ADR-0020).
 *
 * @alpha
 */
export type ViewNode = {
  /** Item path: the key for identity, React keys and patcher records. */
  readonly path: string;
  readonly control: ControlKind;
  /** Plain text, never markup. */
  readonly label: string;
  /** The item's `rendering-xhtml` as the host's sanitizer returned it, to show in place of `label`; otherwise `null` (INV-X-06). */
  readonly richLabel: string | null;
  /** Help text. Always `null` in v1: R4 carries help as an item nested under a question, which the kit rejects (INV-D-17). */
  readonly description: string | null;
  readonly ids: NodeIds;
  readonly required: boolean;
  /** `true` exactly when there are surfaced issues. */
  readonly invalid: boolean;
  /** Surfaced issues only (SM-03), engine rules first, then the view's own. */
  readonly issues: readonly ViewIssue[];
  /** The domain meaning of focus leaving the item: `NoteItemLeft` (DOM contract: the leave rule). */
  readonly leave: () => void;
} & (
  | {
      readonly control: 'yes-no';
      /** `null` is unanswered, which FHIR `boolean` allows and a two-state control cannot show. */
      readonly value: boolean | null;
      readonly display: string;
      /** Keys `true` and `false`. */
      readonly options: readonly ChoiceView[];
      readonly set: (key: string) => void;
      readonly clear: () => void;
    }
  | ({
      /** The first answer, or `null`; `display` and `entries` hold them all. */
      readonly value: string | number | Quantity | null;
      readonly display: string;
      /** The first entry as typed, or the first answer written in the entry form (FHIR's: `2024-05`, `0.50`). */
      readonly entry: string;
      /** A repeating question's entries, one per answer plus an empty one while another is allowed; `null` when the item does not repeat (AC-03.3.1). */
      readonly entries: readonly string[] | null;
      /** Sets the first entry. `''` clears it: FHIR has no empty value. */
      readonly set: (text: string) => void;
      /** Sets entry `index`; one past the end adds an answer, `''` removes one. */
      readonly setAt: (index: number, text: string) => void;
      readonly clear: () => void;
    } & (
      | { readonly control: 'short-text' | 'long-text' | 'calendar-date' | 'date-time'; readonly value: string | null }
      | { readonly control: 'integer' | 'decimal'; readonly value: number | null }
      | {
          readonly control: 'quantity';
          readonly value: Quantity | null;
          /** The units the questionnaire permits (`questionnaire-unitOption`); empty when it names none, and the unit is then typed. */
          readonly units: readonly ChoiceView[];
          /** The typed unit, when `units` is empty. */
          readonly unit: string;
          /** A key of `units`, or the unit's text when `units` is empty. One unit applies to every value. */
          readonly setUnit: (unit: string) => void;
        }
    ))
  | ({
      readonly display: string;
      readonly options: readonly ChoiceView[];
      /** SM-04 for a value set: `ready` once options are known, `unavailable` with no resolver (INV-D-08). Inline options are `ready`. */
      readonly optionState: 'ready' | 'pending' | 'failed' | 'unavailable';
      /** Says why there are no options yet; `null` while `ready`. */
      readonly optionMessage: string | null;
      /** Looks a failed value set up again (`RetryOptions`, AC-07.1.2); refused unless `optionState` is `failed`. */
      readonly retry: () => void;
      /** An `open-choice` item's free text (AC-01.2.3); `null` when the item takes none. */
      readonly other: string | null;
      /** Sets the free text, which replaces a selected option on a single choice (T10). `''` clears it. */
      readonly setOther: (text: string) => void;
      readonly clear: () => void;
    } & (
      | {
          readonly control: 'single-choice' | 'single-list' | 'single-menu';
          readonly value: Answer | null;
          readonly set: (key: string) => void;
        }
      | {
          readonly control: 'multi-choice' | 'multi-list';
          readonly value: readonly Answer[];
          /** Selects exactly these options; the free text, if any, stays. */
          readonly set: (keys: readonly string[]) => void;
          readonly toggle: (key: string) => void;
        }
    ))
  | {
      readonly control: 'calculated';
      readonly value: Answer | null;
      /** The value formatted, or the catalogue's `scoreUnavailable` while there is none. */
      readonly display: string;
    }
  | { readonly control: 'statement' }
  | { readonly control: 'unsupported'; readonly notice: string }
  | { readonly control: 'group'; readonly children: readonly ViewNode[] }
  | {
      readonly control: 'repeating-group';
      readonly instances: readonly InstanceView[];
      /** `false` at `maxOccurs` (INV-P-04): the add control stays, inert, and `reason` says why. `ids.control` is the add control's id. */
      readonly canAdd: boolean;
      readonly reason: string | null;
      readonly addLabel: string;
      /** Appends an empty instance (AC-03.2.1); refused at `maxOccurs`. */
      readonly add: () => void;
    }
);

/**
 * The view node of one control kind: `ControlView<'calendar-date'>`.
 *
 * @alpha
 */
export type ControlView<K extends ControlKind> = ViewNode & { readonly control: K };

/**
 * The tier-3 control contract (ADR-0013): what a host's replacement control
 * receives. It renders the control only; the kit renders the label, help,
 * error text and required marker around it with the same ids. Its obligations:
 * `ids.control` on its focusable element, `aria-describedby` naming
 * `ids.description` and `ids.error` while they hold text, `aria-invalid`
 * from `node.invalid`, and `leave()` when focus leaves it.
 *
 * `set` takes what the control holds (amendment note on ADR-0013): typed text
 * for entry kinds, since a draft is not a value yet (INV-P-06), and an option
 * key for option kinds. The domain value is `node.value`.
 *
 * @alpha
 */
export interface ControlProps<K extends ControlKind> {
  readonly node: ControlView<K>;
  readonly ids: NodeIds;
  /**
   * The kind's own `set`. Read member by member: `ViewNode` joins kinds in
   * one member, and a member whose `control` cannot be `K` is dropped, which
   * a check on the whole union would not do.
   */
  readonly set: ControlView<K> extends infer N ? (N extends { readonly control: infer C; readonly set: infer S } ? ([C] extends [never] ? never : S) : never) : never;
  readonly clear: () => void;
  readonly leave: () => void;
}

/** @alpha */
export interface ErrorSummary {
  readonly id: string;
  readonly headingId: string;
  readonly heading: string;
  /**
   * The surfaced issues in `SessionState.issues` order: form-level ones first,
   * then document order and position (INV-V-06), the view's own at their node.
   * `focusId` is where the link moves focus; `null` for a form-level issue,
   * which has no item to link to. Not `target`, which on `<a>` names a browsing context.
   */
  readonly entries: readonly { readonly path: string | null; readonly message: string; readonly focusId: string | null }[];
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

/**
 * Where focus goes after a cycle that implies it: the error summary after a
 * refused completion, a new instance's first control after an add, the
 * neighbouring instance after a removal. A new object means "move now".
 *
 * @alpha
 */
export interface FocusTarget {
  readonly id: string;
  readonly cycle: number;
}

/** @alpha */
export interface ViewModel {
  readonly completed: boolean;
  readonly requiredMarker: string;
  /** Fixed text the renderers show beside controls, from the catalogue. */
  readonly labels: {
    /** On a failed value set's retry control. */
    readonly retry: string;
    /** Names an `open-choice` item's free text. */
    readonly other: string;
    /** Names a quantity's unit. */
    readonly unit: string;
    /** The empty entry of a `single-menu`, before anything is chosen. */
    readonly choose: string;
  };
  /** The top-level visible nodes, in document order. Unchanged nodes keep their object identity. */
  readonly nodes: readonly ViewNode[];
  readonly announcement: Announcement | null;
  /** Present after a refused completion while any issue is still surfaced (AC-11.3.1). */
  readonly errorSummary: ErrorSummary | null;
  readonly focusTarget: FocusTarget | null;
}

/**
 * A view over one session. `getSnapshot` is a pure function of the session's
 * snapshot and of the text being typed, memoised on both, so it can be handed
 * straight to `useSyncExternalStore`.
 *
 * @alpha
 */
export interface View {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => ViewModel;
}
