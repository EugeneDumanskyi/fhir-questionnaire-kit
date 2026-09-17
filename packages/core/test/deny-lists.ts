/**
 * The three deny-lists behind ADR-0007's review rule and M1 AC-3: a view-model
 * field may not name an HTML element, an ARIA attribute or a CSS property.
 *
 * Written out rather than pulled from a package: they are reviewed by reading,
 * and a dependency for three word lists would cost more than it saves.
 * Sources: the WHATWG HTML element index (with obsolete elements), WAI-ARIA 1.2
 * plus the 1.3 draft's additions, and the CSS property index.
 */

const words = (list: string): ReadonlySet<string> => new Set(list.trim().split(/\s+/));

export const HTML_ELEMENTS = words(`
  a abbr acronym address applet area article aside audio b base basefont bdi bdo bgsound big blink
  blockquote body br button canvas caption center cite code col colgroup data datalist dd del details
  dfn dialog dir div dl dt em embed fieldset figcaption figure font footer form frame frameset h1 h2 h3
  h4 h5 h6 head header hgroup hr html i iframe image img input ins isindex kbd keygen label legend li
  link listing main map mark marquee math menu menuitem meta meter multicol nav nextid nobr noembed
  noframes noscript object ol optgroup option output p param picture plaintext portal pre progress q rb
  rp rt rtc ruby s samp script search section select selectedcontent slot small source spacer span
  strike strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr
  track tt u ul var video wbr xmp
`);

export const ARIA_ATTRIBUTES = words(`
  activedescendant atomic autocomplete braillelabel brailleroledescription busy checked colcount
  colindex colindextext colspan controls current describedby description details disabled dropeffect
  errormessage expanded flowto grabbed haspopup hidden invalid keyshortcuts label labelledby level live
  modal multiline multiselectable orientation owns placeholder posinset pressed readonly relevant
  required roledescription rowcount rowindex rowindextext rowspan selected setsize sort valuemax
  valuemin valuenow valuetext
`);

export const CSS_PROPERTIES = words(`
  accent-color align-content align-items align-self all anchor-name animation animation-composition
  animation-delay animation-direction animation-duration animation-fill-mode animation-iteration-count
  animation-name animation-play-state animation-timeline animation-timing-function appearance
  aspect-ratio backdrop-filter backface-visibility background background-attachment background-blend-mode
  background-clip background-color background-image background-origin background-position
  background-repeat background-size block-size border border-block border-block-color
  border-block-end border-block-start border-block-style border-block-width border-bottom border-collapse
  border-color border-image border-inline border-inline-end border-inline-start border-left border-radius
  border-right border-spacing border-style border-top border-width bottom box-decoration-break
  box-shadow box-sizing break-after break-before break-inside caption-side caret caret-color clear clip
  clip-path clip-rule color color-scheme column-count column-fill column-gap column-rule column-span
  column-width columns contain contain-intrinsic-size container container-name container-type content
  content-visibility counter-increment counter-reset counter-set cursor cx cy d direction display
  dominant-baseline empty-cells field-sizing fill fill-opacity fill-rule filter flex flex-basis
  flex-direction flex-flow flex-grow flex-shrink flex-wrap float flood-color flood-opacity font
  font-family font-feature-settings font-kerning font-optical-sizing font-palette font-size
  font-size-adjust font-stretch font-style font-synthesis font-variant font-variation-settings
  font-weight forced-color-adjust gap grid grid-area grid-auto-columns grid-auto-flow grid-auto-rows
  grid-column grid-row grid-template grid-template-areas grid-template-columns grid-template-rows
  hanging-punctuation height hyphenate-character hyphens image-orientation image-rendering
  initial-letter inline-size inset inset-block inset-block-end inset-block-start inset-inline
  inset-inline-end inset-inline-start interactivity interpolate-size isolation
  justify-content justify-items justify-self left letter-spacing lighting-color line-break line-clamp
  line-height list-style list-style-image list-style-position list-style-type margin margin-block
  margin-block-end margin-block-start margin-bottom margin-inline margin-inline-end margin-inline-start
  margin-left margin-right margin-top marker marker-end marker-mid marker-start mask mask-image mask-mode
  mask-type math-depth math-style max-block-size max-height max-inline-size max-width min-block-size
  min-height min-inline-size min-width mix-blend-mode object-fit object-position offset opacity order
  orphans outline outline-color outline-offset outline-style outline-width overflow overflow-anchor
  overflow-block overflow-clip-margin overflow-inline overflow-wrap overflow-x overflow-y
  overscroll-behavior padding padding-block padding-block-end padding-block-start padding-bottom
  padding-inline padding-inline-end padding-inline-start padding-left padding-right padding-top page
  paint-order perspective perspective-origin place-content place-items place-self pointer-events
  position position-anchor position-area print-color-adjust quotes r resize right rotate row-gap
  ruby-align ruby-position rx ry scale scroll-behavior scroll-margin scroll-padding scroll-snap-align
  scroll-snap-stop scroll-snap-type scrollbar-color scrollbar-gutter scrollbar-width shape-image-threshold
  shape-margin shape-outside speak stop-color stop-opacity stroke stroke-dasharray stroke-dashoffset
  stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width tab-size table-layout
  text-align text-align-last text-anchor text-box text-combine-upright text-decoration
  text-decoration-color text-decoration-line text-decoration-style text-decoration-thickness
  text-emphasis text-indent text-justify text-orientation text-overflow text-rendering text-shadow
  text-size-adjust text-transform text-underline-offset text-underline-position text-wrap top
  touch-action transform transform-box transform-origin transform-style transition transition-behavior
  transition-delay transition-duration transition-property transition-timing-function translate
  unicode-bidi user-select vector-effect vertical-align view-timeline view-transition-name visibility
  white-space white-space-collapse widows width will-change word-break word-spacing writing-mode x y
  z-index zoom
`);

/**
 * Field names that coincide with a denied word and are allowed anyway, each
 * with its reason. The rule is about fields that describe markup or styling;
 * these are domain names an accepted ADR gave the field. Every entry here is a
 * question for the AC-3 reviewer, not a silent pass.
 */
export const ALLOWED_COINCIDENCES: Readonly<Record<string, string>> = {
  label: 'ADR-0007 Decision names the view node field "label" and the id "label" (the item text); it is not <label>',
  clear: 'ADR-0007 Decision and ADR-0013 ControlProps name the bound command "clear"; it is not the CSS property',
};

const kebab = (name: string): string => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** `<input type>` values: a control kind named after one is markup by another name. */
export const INPUT_TYPES = words(`
  button checkbox color date datetime-local email file hidden image month number password radio range
  reset search submit tel text time url week
`);

/** Which deny-list, if any, a field name hits. */
export function deniedBy(name: string): string | null {
  const lower = name.toLowerCase();
  if (HTML_ELEMENTS.has(lower)) return 'an HTML element';
  // A literal is `aria-describedby` or its reflection `ariaDescribedBy`, or
  // `role`. The bare concepts (`required`, `invalid`) are ADR-0007's own fields.
  if (lower === 'role' || (lower.startsWith('aria') && ARIA_ATTRIBUTES.has(lower.replace(/^aria-?/, '')))) {
    return 'an ARIA attribute';
  }
  if (CSS_PROPERTIES.has(kebab(name)) || CSS_PROPERTIES.has(lower)) return 'a CSS property';
  return null;
}
