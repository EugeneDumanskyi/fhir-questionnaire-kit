import type { Answer } from './answer.js';
import type { ItemType, LinkId, Operator } from './item-type.js';

/**
 * Version-neutral questionnaire input (ADR-0016). The R4 codec produces it and
 * the definition compiler checks it; engine tests may build it directly. It
 * records what was authored, including what the kit does not support, and
 * decides nothing: every strict/lenient consequence is the compiler's.
 */
export interface DefinitionInput {
  /** The canonical the questionnaire declares, for snapshots and emission (M3). */
  readonly url: string | null;
  readonly version: string | null;
  readonly items: readonly ItemInput[];
  /** Expression extensions on the questionnaire itself (`variable`, `launchContext`). */
  readonly expressions: readonly ExpressionUse[];
}

export interface ItemInput {
  readonly linkId: LinkId;
  /** `null` when the authored type is outside the supported set (INV-D-03). */
  readonly type: ItemType | null;
  /** The type as authored, named in diagnostics. */
  readonly authoredType: string;
  /** Plain text; `''` when none is authored. */
  readonly text: string;
  readonly required: boolean;
  readonly repeats: boolean;
  readonly children: readonly ItemInput[];
  readonly enableWhen: readonly ConditionInput[];
  /** `null` when not authored; the compiler applies INV-D-16. */
  readonly enableBehavior: 'all' | 'any' | null;
  readonly options: readonly OptionInput[];
  /** A value set canonical. Recorded only; resolution is M4 (INV-D-08). */
  readonly valueSet: string | null;
  readonly maxLength: number | null;
  /** The `minValue` and `maxValue` extensions; a value of a kind no item can hold is recorded with `value: null`. */
  readonly minValue: OptionInput | null;
  readonly maxValue: OptionInput | null;
  readonly maxDecimalPlaces: number | null;
  readonly minOccurs: number | null;
  readonly maxOccurs: number | null;
  /** The `itemControl` code, recorded and not interpreted (`04-domain.md` BC1). */
  readonly itemControl: string | null;
  /** Authored XHTML. Never rendered without a host sanitizer (INV-X-06). */
  readonly renderingXhtml: string | null;
  readonly expressions: readonly ExpressionUse[];
  /** Whether `initial[x]` or an option's `initialSelected` was authored (INV-D-18). */
  readonly hasInitial: boolean;
}

export interface ConditionInput {
  readonly question: LinkId;
  readonly operator: Operator;
  /** `null` for an answer kind no supported item can hold, such as a time or a reference. */
  readonly answer: Answer | null;
  /** The answer's type as authored (`Coding`, `Time` …), named in diagnostics. */
  readonly answerType: string;
}

/** An authored `value[x]`: an answer option, or a `minValue`/`maxValue` limit. */
export interface OptionInput {
  /** `null` for a value kind the kit does not support (INV-D-19, INV-D-20). */
  readonly value: Answer | null;
  readonly valueType: string;
}

export type ExpressionKind = 'calculated' | 'enableWhen' | 'answer' | 'candidate' | 'initial' | 'variable' | 'launchContext';

export interface ExpressionUse {
  readonly kind: ExpressionKind;
  /** The extension URL, named in diagnostics (INV-D-15). */
  readonly url: string;
  readonly language: string | null;
  readonly expression: string | null;
  /** The expression's `name`, which an evaluator may use (ADR-0017). */
  readonly name: string | null;
}
