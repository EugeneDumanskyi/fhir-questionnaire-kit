# Themed host

A form that looks like the page around it, in both renderers, from one
stylesheet of the host's own: 20 lines of CSS and no JavaScript (NFR-U-02,
ADR-0013 tier 2).

[`design-system.css`](design-system.css) stands in for a host's design system:
the variables its own components already read, light and dark, and its page.
[`theme.css`](theme.css) is all the form needs. It maps those variables onto
the kit's tokens:

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

- The element takes tokens on `fhir-questionnaire` itself: its preset sets
  them on `:host`, which hides an ancestor's value (ADR-0014). React has no
  shadow root, so any ancestor of the form will do; here it is `.intake`.
- Every value is the design system's own variable, so the form follows the
  host's dark scheme, not the kit's, with nothing more written.
- Tokens not named keep the preset's values: type weight, line height,
  border, error bar and focus ring widths, and the 44 px target size.
- The host's colours are the host's to keep at WCAG AA contrast. These are.

## The element

[`index.html`](index.html) is the [element embed](../element-embed) with the
two stylesheets linked. The element carries `base.css` and the preset inside
it, so there is nothing else to load.

## React

The same `theme.css`, imported after the kit's two stylesheets, with the form
inside an element of class `intake`:

```tsx
import '@fhirq/themes/default.css';
import '@fhirq/themes/base.css';
import './design-system.css';
import './theme.css';
```

## Running it

From the repository root:

```sh
pnpm build:element
cp packages/element/dist/fhirq-element.js examples/themed-host/
python3 -m http.server --directory examples/themed-host 8000
```

Then open <http://localhost:8000>.

CI serves this directory as it is, with the script built from the sources,
and renders the demo in React with the same two stylesheets, in Chromium,
Firefox and WebKit. It checks that the form reads the design system's values
in both renderers, light and dark (`tests/browser/themed-host.spec.ts`), and
that `theme.css` is at most 30 lines, declares tokens only, and is what this
README shows (`packages/themes/test/themed-host.test.ts`).
