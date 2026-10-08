# Customizing: the four tiers

Each tier is a layer boundary, and each goes one layer deeper
([ADR-0013](../adr/0013-customization-tiers-as-layer-boundaries.md)). Use
the shallowest one that does the job: everything above the tier you pick
stays the kit's, accessibility included.

| Tier | You change | The kit keeps |
|---|---|---|
| 1. Default UI | Nothing | Everything |
| 2. Tokens | `--fhirq-*` custom properties | Markup, behaviour, accessibility |
| 3. A control | The control for one kind of question | The label, help, error text, required marker, and every rule |
| 4. Headless | All the markup | Every rule, and the view model: ids, announcements, error summary, focus targets |

## 1. The default UI

What the [React](react.md) and [element](element.md) quickstarts render. Its
markup is a contract of its own, [`08-dom-contract.md`](../08-dom-contract.md).

## 2. Tokens

`@fhirq/themes/base.css` reads nothing but `--fhirq-*` custom properties, so a
stylesheet of values is the whole theme. This one maps a host's design system
onto them, for both renderers, with no JavaScript:

<!-- snippet: examples/themed-host/theme.css -->
```css
fhir-questionnaire,
.intake {
  --fhirq-font-family: var(--ds-font);
  --fhirq-font-size: var(--ds-text);
  --fhirq-font-size-heading: calc(var(--ds-text) * 1.4);
  --fhirq-font-size-subheading: calc(var(--ds-text) * 1.2);
  --fhirq-space-1: var(--ds-unit);
  --fhirq-space-2: calc(var(--ds-unit) * 2);
  --fhirq-space-3: calc(var(--ds-unit) * 3);
  --fhirq-space-4: calc(var(--ds-unit) * 4);
  --fhirq-radius: var(--ds-radius);
  --fhirq-color-text: var(--ds-ink);
  --fhirq-color-text-muted: var(--ds-ink-soft);
  --fhirq-color-background: var(--ds-paper);
  --fhirq-color-control-background: var(--ds-surface);
  --fhirq-color-border: var(--ds-line);
  --fhirq-color-accent: var(--ds-brand);
  --fhirq-color-focus: var(--ds-brand);
  --fhirq-color-error: var(--ds-danger);
}
```

- **React:** set tokens on any ancestor of the form.
- **The element:** set them on `fhir-questionnaire` itself. Its preset
  declares every token on `:host`, which hides what it would inherit.
- **Contrast is yours** once you set a colour. The preset's own pairs are
  tested in light and dark; yours are not.

The full list, with the defaults, is in [`07-api.md` §8](../07-api.md#8-fhirqthemes).
The worked example is [`examples/themed-host`](../../examples/themed-host).

## 3. A control of your own

Replace the control for one kind of question, such as every yes/no, and
keep everything around it. Your component gets `ControlProps`: the view
node, its `ids`, and `set`, `clear` and `leave`.

<!-- snippet: docs/examples/src/tier3.tsx#control -->
```tsx
import { Questionnaire } from '@fhirq/react';
import type { ControlProps } from '@fhirq/core/view';

/** A switch in place of the two radio buttons, for every yes/no question. */
function Switch({ node, ids, set, leave }: ControlProps<'yes-no'>) {
  return (
    <input
      type="checkbox"
      role="switch"
      id={ids.control}
      checked={node.value === true}
      aria-invalid={node.invalid}
      aria-describedby={node.invalid ? ids.error : undefined}
      onChange={(event) => set(event.currentTarget.checked ? 'true' : 'false')}
      onBlur={leave}
    />
  );
}

export const Intake = () => <Questionnaire questionnaire={questionnaire} controls={{ 'yes-no': Switch }} />;
```

Your control's side of the contract: `ids.control` on the focusable element,
so the kit's label points at it; `aria-invalid` from `node.invalid`;
`aria-describedby` naming `ids.error` while there is an error; and `leave()`
when focus leaves, which is when the question's issues show. In development
the kit checks these after each render and reports `control-contract` through
`onDiagnostic` and `console.warn`.

The element takes the same map as a property, naming custom elements you have
defined: `form.controls = { 'yes-no': 'my-switch' }`. Your element gets the
props as its `props` property ([`07-api.md` §7](../07-api.md#7-fhirqelement)).

## 4. Headless

Render the view model yourself: every presentation decision is already in it,
so your markup only has to show it. `createView` turns a session into a
`ViewModel` you can subscribe to, as React's `useSyncExternalStore` does.

<!-- snippet: docs/examples/src/headless.ts#headless -->
```ts
import { createView, type ViewNode } from '@fhirq/core/view';

const view = createView(createSession(questionnaire), { idPrefix: 'intake', locale: 'en' });

/** A host's own renderer, here to plain lines: each question's label, its required marker, and its issues. */
const draw = (nodes: readonly ViewNode[], marker: string): string[] =>
  nodes.map((node) => [node.label, node.required ? marker : '', ...node.issues.map((issue) => issue.message)].filter(Boolean).join(' '));

const lines = draw(view.getSnapshot().nodes, view.getSnapshot().requiredMarker);
```

Each node carries its `control` kind, its label, its four `ids`, whether it is
`required` or `invalid`, its surfaced `issues` with their messages, and the
commands to answer it. The model also has the `announcement` to put in a live
region, the `errorSummary` after a refused completion, and the `focusTarget`
to move focus to ([`07-api.md` §5](../07-api.md#5-fhirqcoreview)).

At this tier the markup's accessibility is yours: the model tells you what
to say and where focus goes, but not how to build the elements.
