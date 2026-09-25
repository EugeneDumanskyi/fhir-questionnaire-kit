import type { ErrorSummary, ViewModel } from '@fhirq/core/view';

import { attr, el, on, text, textIn } from './dom.js';
import { patch, type List, type Records } from './patch.js';

type SummaryEntry = ErrorSummary['entries'][number];

/**
 * The summary's entries, keyed by what they link to, so an item's entry keeps
 * its link while entries before it come and go. A form-level issue has no
 * item to link to: its entry is text alone (DOM contract §2), keyed `''`.
 */
const ENTRIES: List<SummaryEntry, null> = {
  key: (entry) => entry.focusId ?? '',
  create({ focusId }) {
    const item = el('li', 'fhirq-summary-entry', 'summary-entry');
    const link = focusId === null ? null : el('a', 'fhirq-summary-link', 'summary-link', item);
    if (link !== null) {
      link.href = `#${focusId}`;
      // A fragment link cannot reach into a shadow root, so focus is moved by id.
      on(link, {
        click(event) {
          event.preventDefault();
          (link.getRootNode() as DocumentFragment).getElementById(focusId ?? '')?.focus();
        },
      });
    }
    const message = textIn(link ?? item);
    return { root: item, update: (next) => text(message, next.message) };
  },
};

/**
 * The error summary. Its section, heading and list are kept while it shows,
 * so focus on any of them survives a cycle. With no model, as when the
 * element's view is replaced, it is taken out.
 */
export function summaryPart(form: HTMLElement) {
  const section = el('section', 'fhirq-summary', 'summary');
  section.tabIndex = -1;
  const heading = el('h2', 'fhirq-summary-heading', 'summary-heading', section);
  const title = textIn(heading);
  const list = el('ul', 'fhirq-summary-list', 'summary-list', section);
  let entries: Records<SummaryEntry, null> = new Map();
  return (model: ViewModel | null) => {
    const summary = model?.errorSummary ?? null;
    if (summary === null) {
      section.remove();
      return;
    }
    if (section.parentNode !== form) form.prepend(section);
    attr(section, 'id', summary.id);
    attr(section, 'aria-labelledby', summary.headingId);
    attr(heading, 'id', summary.headingId);
    text(title, summary.heading);
    entries = patch(list, entries, summary.entries, ENTRIES, null);
  };
}
