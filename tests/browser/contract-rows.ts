import type { ControlKind, ControlView, InstanceView, ViewModel, ViewNode } from '@fhirq/core/view';

/**
 * The DOM contract's rows (docs/08-dom-contract.md §2, §3) as one check,
 * renderer-neutral: given the model a renderer drew and its `.fhirq-form`,
 * it returns every way the markup departs from the contract. Runs in the
 * page, against React's light DOM (M6) and the element's shadow root (M7).
 * Ids are compared with the model's, so the model must be the renderer's
 * own, or one built with the same id prefix.
 */
export function contractViolations(model: ViewModel, form: Element): string[] {
  const found: string[] = [];
  const tree = form.getRootNode() as Document | ShadowRoot;
  const byId = (id: string) => tree.getElementById(id);
  const check = (where: string) => (ok: boolean, what: string) => {
    if (!ok) found.push(`${where}: ${what}`);
  };

  /** Tag, class `fhirq-<stem>` and `part` token `<stem>` (§1), or the `part` §2 names where it differs. */
  const is = (element: Element | null | undefined, tag: string, stem: string, part = stem): element is HTMLElement =>
    element instanceof HTMLElement &&
    element.tagName.toLowerCase() === tag &&
    element.classList.contains(`fhirq-${stem}`) &&
    (element.getAttribute('part') ?? '').split(' ').includes(part);
  const text = (element: Element | null | undefined) => element?.textContent ?? null;
  const kids = (element: Element) => [...element.children];

  /** ARIA state as strings, never omitted; `aria-describedby` only while invalid (§1). */
  const aria = (ok: ReturnType<typeof check>, element: Element, node: ViewNode) => {
    ok(element.getAttribute('aria-required') === String(node.required), 'aria-required');
    ok(element.getAttribute('aria-invalid') === String(node.invalid), 'aria-invalid');
    ok(element.getAttribute('aria-describedby') === (node.invalid ? node.ids.error : null), 'aria-describedby');
  };

  /** The label's content, then the required marker as its last child (§3). */
  const label = (ok: ReturnType<typeof check>, element: Element | null, node: ViewNode, marker: boolean) => {
    if (element === null) return ok(false, 'label missing');
    const last = element.lastElementChild;
    const hasMarker = is(last, 'span', 'required');
    ok(hasMarker === (marker && node.required), 'required marker');
    if (hasMarker) ok(last.getAttribute('aria-hidden') === 'true' && text(last) === model.requiredMarker, 'marker text or aria-hidden');
    const content = [...element.childNodes].filter((child) => child !== (hasMarker ? last : null));
    if (node.richLabel === null) ok(content.map((child) => child.textContent).join('') === node.label, 'label text');
    else ok(content.length === 1 && content[0] instanceof Element && content[0].innerHTML === node.richLabel, 'rich label as given');
  };

  const choices = (ok: ReturnType<typeof check>, node: ControlView<'yes-no' | 'single-choice' | 'multi-choice'>, group: Element | undefined) => {
    const many = node.control === 'multi-choice';
    if (!is(group, 'div', 'choices')) return ok(false, 'choices group');
    ok(group.getAttribute('role') === (many ? 'group' : 'radiogroup'), 'group role');
    ok(group.getAttribute('aria-labelledby') === node.ids.label, 'group aria-labelledby');
    aria(ok, group, node);
    const kind = many ? 'checkbox' : 'radio';
    ok(kids(group).length === node.options.length, 'one choice per option');
    node.options.forEach((option, index) => {
      const choice = kids(group)[index];
      const input = choice?.firstElementChild;
      if (!is(choice, 'label', 'choice') || !(input instanceof HTMLInputElement) || !is(input, 'input', kind)) return ok(false, `choice ${option.key}`);
      ok(input.type === kind && input.value === option.key && input.checked === option.selected, `choice ${option.key} value or state`);
      ok(input.id === (index === 0 ? node.ids.control : ''), `choice ${option.key} id`);
      if (!many) ok(input.name === node.ids.control, `choice ${option.key} name`);
      ok(is(input.nextElementSibling, 'span', 'choice-label') && text(input.nextElementSibling) === option.label, `choice ${option.key} label`);
    });
  };

  const list = (ok: ReturnType<typeof check>, node: ControlView<'single-list' | 'single-menu' | 'multi-list'>, select: Element | null) => {
    if (!(select instanceof HTMLSelectElement) || !is(select, 'select', 'control')) return ok(false, 'select');
    aria(ok, select, node);
    ok(select.multiple === (node.control === 'multi-list'), 'multiple');
    ok(select.getAttribute('size') === (node.control === 'single-menu' ? null : String(Math.min(node.options.length, 8))), 'size');
    const options = [...select.options];
    if (node.control === 'single-menu') {
      const empty = options.shift();
      ok(empty?.value === '' && text(empty) === model.labels.choose && empty.selected === !node.options.some((option) => option.selected), 'empty menu option');
    }
    ok(options.length === node.options.length, 'one option per option');
    node.options.forEach((option, index) => {
      const element = options[index];
      ok(element?.value === option.key && text(element) === option.label && element.selected === option.selected, `option ${option.key}`);
    });
  };

  const entry = (ok: ReturnType<typeof check>, node: ControlView<'short-text' | 'long-text' | 'integer' | 'decimal' | 'calendar-date' | 'date-time' | 'quantity'>, item: Element) => {
    const tag = node.control === 'long-text' ? 'textarea' : 'input';
    const mode = { integer: 'numeric', decimal: 'decimal', quantity: 'decimal' }[node.control as string] ?? null;
    const field = (control: Element | null | undefined, value: string, named: boolean, where: string) => {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) || !is(control, tag, 'control')) return ok(false, `${where} control`);
      if (control instanceof HTMLInputElement) ok(control.type === 'text', `${where} type="text"`);
      ok(control.getAttribute('inputmode') === mode, `${where} inputmode`);
      ok(control.value === value, `${where} value`);
      ok(control.getAttribute('aria-labelledby') === (named ? node.ids.label : null), `${where} aria-labelledby`);
      aria(ok, control, node);
    };
    if (node.entries === null) field(byId(node.ids.control), node.entry, false, 'entry');
    else {
      const box = item.querySelector(':scope > .fhirq-entries');
      if (!is(box, 'div', 'entries')) return ok(false, 'entries');
      ok(kids(box).length === node.entries.length, 'one control per entry');
      node.entries.forEach((value, index) => {
        field(kids(box)[index], value, true, `entry ${index}`);
        ok(kids(box)[index]?.id === (index === 0 ? node.ids.control : ''), `entry ${index} id`);
      });
    }
    if (node.control === 'quantity') unitOf(ok, node, item);
  };

  const unitOf = (ok: ReturnType<typeof check>, node: ControlView<'quantity'>, item: Element) => {
    const unit = item.querySelector(':scope > .fhirq-unit');
    ok(unit?.getAttribute('aria-label') === model.labels.unit, 'unit aria-label');
    if (node.units.length === 0) return ok(unit instanceof HTMLInputElement && is(unit, 'input', 'unit') && unit.type === 'text' && unit.value === node.unit, 'typed unit');
    if (!(unit instanceof HTMLSelectElement) || !is(unit, 'select', 'unit')) return ok(false, 'unit list');
    const selected = node.units.find((option) => option.selected);
    const keys = [...(selected === undefined ? [''] : []), ...node.units.map((option) => option.key)];
    ok(JSON.stringify([...unit.options].map((option) => option.value)) === JSON.stringify(keys), 'unit options');
    ok(unit.value === (selected?.key ?? ''), 'unit selected');
  };

  const optionParts = (ok: ReturnType<typeof check>, node: ViewNode, item: Element) => {
    if (!('optionState' in node)) return;
    const status = item.querySelector(':scope > .fhirq-options-status');
    ok(node.optionMessage === null ? status === null : is(status, 'p', 'options-status') && text(status) === node.optionMessage, 'options status');
    const retry = item.querySelector(':scope > .fhirq-retry');
    ok(node.optionState === 'failed' ? is(retry, 'button', 'retry') && retry.getAttribute('type') === 'button' && text(retry) === model.labels.retry : retry === null, 'retry');
    const other = item.querySelector(':scope > .fhirq-other');
    if (node.other === null) return ok(other === null, 'no free text');
    const input = other?.querySelector('input');
    ok(is(other, 'label', 'other') && (other.firstChild?.textContent ?? '') === model.labels.other, 'free text label');
    ok(input instanceof HTMLInputElement && is(input, 'input', 'other-text') && input.type === 'text' && input.value === node.other, 'free text');
  };

  const errorsOf = (ok: ReturnType<typeof check>, node: ViewNode, element: Element) => {
    const errors = element.lastElementChild;
    if (!is(errors, 'div', 'error')) return ok(false, 'error container last');
    ok(errors.id === node.ids.error && errors.hidden === !node.invalid, 'error container id or hidden');
    const messages = kids(errors).map((p) => (is(p, 'p', 'error-message') ? text(p) : null));
    ok(JSON.stringify(messages) === JSON.stringify(node.issues.map((issue) => issue.message)), 'error messages');
  };

  /** §3.7, §3.8: a fieldset, its legend, and its children or instances. */
  const groupOf = (ok: ReturnType<typeof check>, node: ControlView<'group' | 'repeating-group'>, element: Element, level: number) => {
    ok(is(element, 'fieldset', node.control === 'group' ? 'group' : 'repeat'), 'group class');
    const legend = element.firstElementChild;
    ok(is(legend, 'legend', 'label') && legend.id === node.ids.label && legend.getAttribute('tabindex') === '-1', 'legend');
    label(ok, legend, node, true);
    ok(element.getAttribute('aria-describedby') === (node.invalid ? node.ids.error : null), 'fieldset aria-describedby');
    if (node.control === 'repeating-group') return repeat(ok, node, element, level);
    const children = kids(element).filter((child) => child.hasAttribute('data-path'));
    ok(children.length === node.children.length, 'one root per child');
    node.children.forEach((child, index) => item(child, children[index], level));
  };

  /** §3.6: read-only kinds, with no requirement and no focus stop of their own. */
  const readOnly = (ok: ReturnType<typeof check>, node: ControlView<'calculated' | 'statement' | 'unsupported'>, element: Element) => {
    if (node.control === 'calculated') {
      label(ok, byId(node.ids.label), node, true);
      const output = byId(node.ids.control);
      return ok(is(output, 'output', 'value') && output.getAttribute('aria-labelledby') === node.ids.label && text(output) === node.display, 'value');
    }
    if (node.control === 'statement') {
      const statement = byId(node.ids.label);
      return ok(is(statement, 'p', 'statement') && (node.richLabel === null ? text(statement) === node.label : statement.innerHTML === node.richLabel), 'statement');
    }
    const box = element.firstElementChild;
    ok(is(box, 'div', 'unsupported') && is(box.firstElementChild, 'span', 'label') && is(box.lastElementChild, 'p', 'notice') && text(box.lastElementChild) === (node.control === 'unsupported' ? node.notice : null), 'placeholder');
    ok(element.querySelector('input, select, textarea, button, [tabindex]') === null, 'no focus stop');
  };

  /** §3.1–§3.5: a label, then the control or group, then a value set's status and an open choice's text. */
  const answerable = (ok: ReturnType<typeof check>, node: ViewNode, element: Element) => {
    const own = byId(node.ids.label);
    if (among(node, ['yes-no', 'single-choice', 'multi-choice'])) {
      ok(is(own, 'span', 'label'), 'label span');
      choices(ok, node, [...element.querySelectorAll(':scope > .fhirq-choices')][0]);
    } else {
      ok(is(own, 'label', 'label') && own.getAttribute('for') === node.ids.control, 'label for the control');
      if (among(node, ['single-list', 'single-menu', 'multi-list'])) list(ok, node, byId(node.ids.control));
      else if (among(node, ['short-text', 'long-text', 'integer', 'decimal', 'calendar-date', 'date-time', 'quantity'])) entry(ok, node, element);
    }
    label(ok, own, node, true);
    optionParts(ok, node, element);
  };

  const item = (node: ViewNode, element: Element | undefined, level: number): void => {
    const ok = check(node.path);
    const group = among(node, ['group', 'repeating-group']);
    if (!is(element, group ? 'fieldset' : 'div', 'item') || element.getAttribute('data-path') !== node.path) return ok(false, 'item root');
    errorsOf(ok, node, element);
    if (among(node, ['group', 'repeating-group'])) groupOf(ok, node, element, level);
    else if (among(node, ['calculated', 'statement', 'unsupported'])) readOnly(ok, node, element);
    else answerable(ok, node, element);
  };

  const repeat = (ok: ReturnType<typeof check>, node: ControlView<'repeating-group'>, element: Element, level: number) => {
    const sections = kids(element).filter((child) => child.tagName === 'SECTION');
    ok(sections.length === node.instances.length, 'one section per instance');
    node.instances.forEach((instance: InstanceView, index) => {
      const at = check(instance.path);
      const section = sections[index];
      if (!is(section, 'section', 'instance') || section.getAttribute('data-path') !== instance.path) return at(false, 'instance root');
      at(section.getAttribute('aria-labelledby') === instance.ids.label, 'aria-labelledby');
      const heading = section.firstElementChild;
      at(is(heading, `h${Math.min(level, 6)}`, 'instance-label') && heading.id === instance.ids.label && text(heading) === instance.label, `h${level} name`);
      const remove = section.lastElementChild;
      at(is(remove, 'button', 'remove') && remove.getAttribute('type') === 'button' && remove.id === instance.ids.control && text(remove) === instance.removeLabel, 'remove');
      const children = kids(section).filter((child) => child.hasAttribute('data-path'));
      at(children.length === instance.children.length, 'one root per child');
      instance.children.forEach((child, i) => item(child, children[i], level + 1));
    });
    const add = element.querySelector(':scope > .fhirq-add');
    ok(is(add, 'button', 'add') && add.getAttribute('type') === 'button' && add.id === node.ids.control && text(add) === node.addLabel, 'add');
    ok(add?.getAttribute('aria-disabled') === (node.canAdd ? null : 'true'), 'add aria-disabled');
    ok(add?.getAttribute('aria-describedby') === (node.canAdd || node.reason === null ? null : node.ids.description), 'add aria-describedby');
    const reason = element.querySelector(':scope > .fhirq-reason');
    ok(node.reason === null ? reason === null : is(reason, 'p', 'reason') && reason.id === node.ids.description && text(reason) === node.reason, 'reason');
  };

  // §2: the form.
  const ok = check('form');
  ok(is(form, 'div', 'form'), 'form root');
  const children = kids(form);
  const summary = model.errorSummary;
  if (summary === null) ok(form.querySelector('.fhirq-summary') === null, 'no summary');
  else {
    const section = children.shift();
    ok(is(section, 'section', 'summary', 'error-summary') && section.id === summary.id && section.getAttribute('tabindex') === '-1', 'summary');
    const heading = byId(summary.headingId);
    ok(section?.getAttribute('aria-labelledby') === summary.headingId && is(heading, 'h2', 'summary-heading', 'error-summary-heading') && text(heading) === summary.heading, 'summary heading');
    const entries = [...(section?.querySelectorAll('li') ?? [])];
    ok(entries.length === summary.entries.length, 'one entry per issue');
    summary.entries.forEach((entry, index) => {
      const link = entries[index]?.querySelector('a');
      if (entry.focusId === null) return ok(link === null && text(entries[index]) === entry.message, `summary entry ${index}`);
      ok(is(link, 'a', 'summary-link', 'error-summary-link') && link.getAttribute('href') === `#${entry.focusId}` && text(link) === entry.message, `summary link ${index}`);
    });
  }
  const status = children.pop();
  ok(is(status, 'div', 'status') && status.getAttribute('role') === 'status', 'status last');
  ok(children.length === model.nodes.length, 'one root per node');
  model.nodes.forEach((node, index) => item(node, children[index], 3));

  // §1: no inline style, and every id reference resolves in the same tree.
  ok(form.querySelector('[style], style') === null, 'no style');
  for (const element of form.querySelectorAll('[for], [aria-labelledby], [aria-describedby], a[href^="#"]')) {
    const ids = [element.getAttribute('for'), element.getAttribute('aria-labelledby'), element.getAttribute('aria-describedby'), element.getAttribute('href')?.slice(1)];
    for (const id of ids.flatMap((value) => value?.split(' ') ?? [])) ok(byId(id) !== null, `unresolved #${id}`);
  }
  return found;
}

const among = <K extends ControlKind>(node: ViewNode, kinds: readonly K[]): node is ControlView<K> => (kinds as readonly ControlKind[]).includes(node.control);
