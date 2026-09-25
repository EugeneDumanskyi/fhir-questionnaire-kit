import { createSession, itemPath, type Diagnostic, type Session } from '@fhirq/core';
import { createView, type ControlKind, type ControlProps, type ControlView, type View } from '@fhirq/core/view';
import { defineQuestionnaireElement, FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { contractViolations } from '../../../../tests/browser/contract-rows.js';
import { questionnaire } from '../../../core/test/slice.js';
import { KINDS, KINDS_OPTIONS } from '../kinds.js';

/**
 * Tier 3 on the element (ADR-0013, ADR-0014, DOM contract §3.9, M7 plan step
 * 7): a host's custom element in the kit's chrome, given `props` and heard
 * through `fhirq-set`, `fhirq-clear` and `fhirq-leave`; the development check
 * through `fhirq-diagnostic`; and a host control that answers during a paint.
 */

const BORN = itemPath('born');
const SEEN = itemPath('seen');

type Props = ControlProps<'calendar-date'>;

/** How a test control answers: by its `props`, or by an event on itself, which does not bubble. */
type Via = 'props' | 'event';

/**
 * A host's text control as a custom element: an `input` in its own light DOM,
 * so it sits in the kit's tree. `duties` says which of ADR-0013's attributes
 * it applies; `sets` counts the `props` it was given, by path.
 */
abstract class TestControl extends HTMLElement {
  static duties: readonly ('id' | 'aria')[] = ['id', 'aria'];
  static via: Via = 'event';
  static readonly sets = new Map<string, number>();
  readonly input = document.createElement('input');
  current: Props | null = null;

  constructor() {
    super();
    this.input.className = 'picker';
    this.input.addEventListener('input', () => this.send('fhirq-set', this.input.value));
    this.input.addEventListener('focusout', () => this.send('fhirq-leave'));
  }

  send(type: 'fhirq-set' | 'fhirq-clear' | 'fhirq-leave', detail?: string): void {
    const props = this.current;
    if (this.#via() === 'event') this.dispatchEvent(new CustomEvent(type, { detail }));
    else if (type === 'fhirq-set') props?.set(detail ?? '');
    else if (type === 'fhirq-clear') props?.clear();
    else props?.leave();
  }

  #via(): Via {
    return (this.constructor as typeof TestControl).via;
  }

  set props(props: Props) {
    this.current = props;
    const { duties, sets } = this.constructor as typeof TestControl;
    sets.set(props.node.path, (sets.get(props.node.path) ?? 0) + 1);
    if (!this.input.isConnected) this.append(this.input);
    if (duties.includes('id')) this.input.id = props.ids.control;
    if (duties.includes('aria')) {
      this.input.setAttribute('aria-invalid', String(props.node.invalid));
      if (props.node.invalid) this.input.setAttribute('aria-describedby', props.ids.error);
      else this.input.removeAttribute('aria-describedby');
    }
    if (this.input.value !== props.node.entry) this.input.value = props.node.entry;
    this.answer?.(props);
  }

  /** What a control does on receiving its props, besides drawing them. */
  answer?(props: Props): void;
}

/** Defines a test control under a fresh tag, so each test has its own class, duties and counts. */
let defined = 0;
function control(duties: readonly ('id' | 'aria')[] = ['id', 'aria'], via: Via = 'event', answer?: (this: TestControl, props: Props) => void): string {
  const tag = `x-control-${++defined}`;
  customElements.define(
    tag,
    class extends TestControl {
      static override duties = duties;
      static override via = via;
      static override readonly sets = new Map<string, number>();
      override answer(props: Props): void {
        answer?.call(this, props);
      }
    },
  );
  return tag;
}

const counts = (tag: string) => Object.fromEntries((customElements.get(tag) as unknown as typeof TestControl).sets);

/** Lets the development check's microtask, and anything it queued, run. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

function type(field: Element | null | undefined, value: string): void {
  if (!(field instanceof HTMLInputElement)) throw new Error('no field');
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function focus(target: Element | null | undefined): void {
  if (!(target instanceof HTMLElement)) throw new Error('nothing to focus');
  target.focus();
}

let session: Session;
let element: FhirQuestionnaireElement;
let shadow: ShadowRoot;
let probe: View;
let diagnostics: Diagnostic[];

/** An element over `form` with these controls, connected. */
function mount(controls: FhirQuestionnaireElement['controls'], form = KINDS as Parameters<typeof createSession>[0]): void {
  session = createSession(form, KINDS_OPTIONS);
  element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
  element.controls = controls;
  element.session = session;
  diagnostics = [];
  element.addEventListener('fhirq-diagnostic', (event) => diagnostics.push(event.detail));
  document.body.append(element);
  shadow = element.shadowRoot as ShadowRoot;
  probe = createView(session, { idPrefix: 'fhirq', locale: 'en' });
}

const at = (path: string, selector?: string) => {
  const item = shadow.querySelector(`[data-path="${path}"]`);
  return selector === undefined ? item : item?.querySelector(selector);
};
const answers = (path: string) => session.getSnapshot().nodes.find((node) => node.path === path)?.answers.map((answer) => answer.value);
/** The rows of the DOM contract, §3.9's chrome for `overridden`, against a second view over the session, which holds no drafts. */
const violations = (overridden: readonly ControlKind[]) => contractViolations(probe.getSnapshot(), shadow.querySelector('.fhirq-form') as Element, overridden);

beforeEach(() => {
  defineQuestionnaireElement();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  element.remove();
  vi.restoreAllMocks();
});

describe('a host control in the kit chrome (DOM contract §3.9)', () => {
  it('renders an accessible override: label, error and aria-invalid associations hold (AC-10.3.1)', async () => {
    mount({ 'calendar-date': control() });
    expect(violations(['calendar-date'])).toEqual([]);

    const input = at(BORN, 'input.picker');
    if (!(input instanceof HTMLInputElement)) throw new Error('no override');
    expect(input.labels?.[0]?.textContent).toBe('Born');
    expect(input.labels?.[0]?.classList.contains('fhirq-label')).toBe(true);
    expect(at(SEEN, 'input.fhirq-control')).toBeInstanceOf(HTMLInputElement);

    focus(input);
    type(input, '2024-13');
    focus(at(SEEN, 'input'));
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const error = shadow.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(error).toBe(at(BORN, ':scope > .fhirq-error'));
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).not.toBe('');

    type(input, '2024-05-01');
    expect(answers(BORN)).toEqual(['2024-05-01']);
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(violations(['calendar-date'])).toEqual([]);

    await settled();
    expect(diagnostics).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('hears fhirq-clear, and the same commands called on props', () => {
    mount({ 'calendar-date': control(['id', 'aria'], 'props') });
    const override = at(BORN, 'input.picker')?.parentElement as TestControl;
    type(override.input, '2024-05');
    expect(answers(BORN)).toEqual(['2024-05']);
    override.dispatchEvent(new CustomEvent('fhirq-clear'));
    expect(answers(BORN)).toEqual([]);
    expect(override.input.value).toBe('');
  });

  it('leaves the kind extras to props.node: a multi-choice override toggles its options', () => {
    const tag = control(['id', 'aria'], 'props');
    mount({ 'multi-choice': tag });
    const override = at(itemPath('pets'), tag) as TestControl;
    const node = override.current?.node as unknown as ControlView<'multi-choice'>;
    node.toggle(node.options[1]?.key ?? '');
    expect(answers(itemPath('pets'))).toEqual([{ system: 'urn:test', code: 'o2', display: 'Option 2' }]);
    expect(violations(['multi-choice'])).toEqual([]);
  });

  it('is only for answerable kinds: a group, a repeating group and the read-only kinds keep their own markup', () => {
    const tag = control();
    mount({ group: tag, 'repeating-group': tag, calculated: tag, statement: tag, unsupported: tag } as unknown as FhirQuestionnaireElement['controls']);
    expect(shadow.querySelector(tag)).toBeNull();
    expect(violations([])).toEqual([]);
  });

  it('draws every item again over the same view when controls change, and the default control with none', () => {
    mount({});
    type(at(BORN, 'input'), '2024-05');
    const tag = control();
    element.controls = { 'calendar-date': tag };
    expect(at(BORN, 'input.picker')).toBeInstanceOf(HTMLInputElement);
    expect((at(BORN, 'input.picker') as HTMLInputElement).value).toBe('2024-05');
    expect(violations(['calendar-date'])).toEqual([]);

    element.controls = null;
    expect(element.controls).toEqual({});
    expect(shadow.querySelector(tag)).toBeNull();
    expect(violations([])).toEqual([]);
  });

  it('takes up controls set before the element is defined', () => {
    const tag = control();
    const name = 'fhirq-early-controls';
    const early = document.createElement(name);
    const controls = { 'calendar-date': tag };
    Object.assign(early, { controls, session: createSession(KINDS, KINDS_OPTIONS) });
    document.body.append(early);
    customElements.define(name, class extends FhirQuestionnaireElement {});
    try {
      expect(Object.hasOwn(early, 'controls')).toBe(false);
      expect((early as FhirQuestionnaireElement).controls).toBe(controls);
      expect(early.shadowRoot?.querySelector(`[data-path="${BORN}"] ${tag}`)).not.toBeNull();
    } finally {
      early.remove();
    }
  });
});

describe('the development check (ADR-0013, fhirq-diagnostic)', () => {
  it('raises control-contract naming calendar-date and id, once, for an override without its id (M6 AC-7)', async () => {
    mount({ 'calendar-date': control(['aria']) });
    await settled();
    type(at(BORN, 'input.picker'), '2024');
    await settled();

    expect(diagnostics).toEqual([{ code: 'control-contract', severity: 'warning', path: BORN, detail: 'calendar-date', expected: 'id', related: [] }]);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('fhirq: control-contract (calendar-date)');
  });

  it('raises each ARIA duty the override misses, when it applies', async () => {
    mount({ 'calendar-date': control(['id']) });
    await settled();
    expect(diagnostics.map((diagnostic) => diagnostic.expected)).toEqual(['aria-invalid']);

    focus(at(BORN, 'input.picker'));
    type(at(BORN, 'input.picker'), '2024-13');
    focus(at(SEEN, 'input'));
    await settled();
    expect(diagnostics.map((diagnostic) => diagnostic.expected)).toEqual(['aria-invalid', 'aria-describedby']);
  });

  it('bubbles out of the element, and waits for a control that draws in a microtask, as Lit does', async () => {
    const seen: Event[] = [];
    document.body.addEventListener('fhirq-diagnostic', (event) => seen.push(event));
    const lazy = control([], 'event', function (props) {
      queueMicrotask(() => {
        this.input.id = props.ids.control;
        this.input.setAttribute('aria-invalid', String(props.node.invalid));
      });
    });
    mount({ 'calendar-date': lazy, 'date-time': control(['aria']) });
    await settled();
    expect(diagnostics.map(({ path, expected }) => [path, expected])).toEqual([[SEEN, 'id']]);
    expect(seen).toHaveLength(1);
  });

  it('checks nothing for an item gone before the check runs', async () => {
    mount({ 'calendar-date': control(['aria']) });
    element.remove();
    await settled();
    expect(diagnostics).toEqual([]);
  });
});

describe('a host control patches only its own item', () => {
  const FORM = questionnaire([
    { linkId: 'first', type: 'string', text: 'First' },
    { linkId: 'second', type: 'string', text: 'Second' },
    { linkId: 'third', type: 'string', text: 'Third' },
  ]);

  it('typing into one override writes into its item alone, and gives no other override new props', () => {
    const tag = control();
    mount({ 'short-text': tag }, FORM);
    expect(counts(tag)).toEqual({ first: 1, second: 1, third: 1 });
    const second = at(itemPath('second'));
    const observer = new MutationObserver(() => undefined);
    observer.observe(shadow, { subtree: true, childList: true, attributes: true, characterData: true });

    type(at(itemPath('second'), 'input'), 'a');
    type(at(itemPath('second'), 'input'), 'ab');
    const outside = observer.takeRecords().filter((record) => !second?.contains(record.target));
    observer.disconnect();

    expect(outside).toEqual([]);
    expect(counts(tag)).toEqual({ first: 1, second: 3, third: 1 });
    expect(answers(itemPath('second'))).toEqual(['ab']);
  });
});

describe('a host control that answers during a paint (M7 plan step 3a)', () => {
  const FORM = questionnaire([
    { linkId: 'answer', type: 'string', text: 'Answer' },
    { linkId: 'follow', type: 'string', text: 'Follow-up', enableWhen: [{ question: 'answer', operator: '=', answerString: 'yes' }] },
    { linkId: 'last', type: 'string', text: 'Last' },
  ]);

  it.each<Via>(['props', 'event'])('answered by %s: the render it asks for runs after the paint, never inside it', (via) => {
    /** What the form showed when each answer returned: the item it enables is not drawn mid-paint. */
    const during: (Element | null)[] = [];
    const tag = control(['id', 'aria'], via, function (props) {
      // A control with a default: given no answer, it answers at once, from inside the kit's paint.
      if (props.node.path !== 'answer' || props.node.entry !== '') return;
      this.send('fhirq-set', 'yes');
      during.push(shadow.querySelector('[data-path="follow"]'));
    });
    const changes: unknown[] = [];
    element?.remove();
    session = createSession(FORM);
    element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
    element.controls = { 'short-text': tag };
    element.session = session;
    element.addEventListener('fhirq-change', (event) => changes.push(event.detail));
    shadow = element.shadowRoot as ShadowRoot;
    document.body.append(element);
    probe = createView(session, { idPrefix: 'fhirq', locale: 'en' });

    expect(during).toEqual([null]);
    expect(answers('answer')).toEqual(['yes']);
    expect(changes).toHaveLength(1);
    expect([...shadow.querySelectorAll('[data-path]')].map((item) => item.getAttribute('data-path'))).toEqual(['answer', 'follow', 'last']);
    expect(shadow.querySelectorAll(tag)).toHaveLength(3);
    expect((at('answer', 'input') as HTMLInputElement).value).toBe('yes');
    expect(counts(tag)).toEqual({ answer: 2, follow: 1, last: 1 });
    expect(violations(['short-text'])).toEqual([]);
  });
});
