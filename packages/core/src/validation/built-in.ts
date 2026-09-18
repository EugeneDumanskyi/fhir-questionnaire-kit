import type { Answer } from '../kernel/answer.js';
import { compare } from '../kernel/compare.js';
import type { Issue, IssueCode } from '../kernel/issue.js';
import type { VisibleNode, VisibleProjection } from '../session/projection.js';

/**
 * BC3's built-in rules (`04-domain.md` §3.3), derived from the definition:
 * required, repeat cardinality, `maxLength`, `maxDecimalPlaces`, `minValue`
 * and `maxValue`, and a quantity's unit. They read the visible projection
 * only, so a disabled item is never invalid (INV-V-01), and they never
 * change or coerce an answer (INV-V-02).
 *
 * One issue per rule per node, in a fixed rule order, nodes in document
 * order (INV-V-06). A range check that cannot be decided — a date of another
 * precision than its limit — raises nothing (M3 plan D8). Only typed answers
 * reach the engine, so "not a date" is the view's issue on a draft, not an
 * engine one (M3 plan D2).
 */
export function builtInIssues(projection: VisibleProjection): Issue[] {
  const issues: Issue[] = [];
  for (const node of projection.nodes) {
    // Most nodes have no rule to break; this runs every cycle, so they cost a check, not a closure.
    if (constrained(node)) nodeIssues(node, issues);
  }
  return issues;
}

type Raise = (code: IssueCode, limit?: string | number) => void;

/** Whether any built-in rule could raise on this node: a quantity answer can lack a unit whatever its item says. */
function constrained({ item }: VisibleNode): boolean {
  if (item.type === null || item.type === 'display') return false;
  const { required, repeats, maxLength, maxDecimalPlaces, minValue, maxValue } = item;
  return required || repeats || maxLength !== null || maxDecimalPlaces !== null || minValue !== null || maxValue !== null || item.type === 'quantity';
}

function nodeIssues(node: VisibleNode, issues: Issue[]): void {
  const { item } = node;
  const raise: Raise = (code, limit) => {
    issues.push({ code, severity: 'error', path: node.path, linkId: item.linkId, message: code, params: limit === undefined ? {} : { limit } });
  };
  if (item.required && !answered(node)) raise('required');
  if (item.repeats) cardinality(node, raise);
  values(node, raise);
}

/** SM-05: instances of a repeating group, answers of a repeating question. */
function cardinality(node: VisibleNode, raise: Raise): void {
  const { item } = node;
  const count = item.type === 'group' ? node.instances.length : node.answers.length;
  if (count < item.minOccurs) raise('min-occurs', item.minOccurs);
  if (item.maxOccurs !== null && count > item.maxOccurs) raise('max-occurs', item.maxOccurs);
}

/** The value rules, each raised once however many answers break it. */
function values(node: VisibleNode, raise: Raise): void {
  const { maxLength, maxDecimalPlaces, minValue, maxValue } = node.item;
  const any = (test: (answer: Answer) => boolean): boolean => node.answers.some(test);
  if (maxLength !== null && any((answer) => answer.kind === 'string' && [...answer.value].length > maxLength)) raise('max-length', maxLength);
  if (maxDecimalPlaces !== null && any((answer) => decimalPlaces(answer) > maxDecimalPlaces)) raise('max-decimal-places', maxDecimalPlaces);
  if (minValue !== null && any((answer) => compare(answer, minValue) === 'less')) raise('min-value', limitOf(minValue));
  if (maxValue !== null && any((answer) => compare(answer, maxValue) === 'greater')) raise('max-value', limitOf(maxValue));
  if (any((answer) => answer.kind === 'quantity' && answer.value.unit === undefined && answer.value.code === undefined)) raise('unit-missing');
}

/** Whether a question has an answer, or a group has an answered visible descendant. */
function answered(node: VisibleNode): boolean {
  return node.answers.length > 0 || node.children.some(answered) || node.instances.some((instance) => instance.children.some(answered));
}

/** Digits after the point of a decimal or a quantity's value, exponent notation included. */
function decimalPlaces(answer: Answer): number {
  const value = answer.kind === 'decimal' ? answer.value : answer.kind === 'quantity' ? answer.value.value : 0;
  const [mantissa = '', exponent = '0'] = String(value).split('e');
  const fraction = mantissa.split('.')[1] ?? '';
  return Math.max(0, fraction.length - Number(exponent));
}

/**
 * A limit is authored, not entered, so an issue may name it (M3 plan D1). The
 * compiler keeps only numeric and date limits (INV-D-20), so it is a number or
 * a string.
 */
function limitOf(limit: Answer): string | number {
  return limit.value as string | number;
}
