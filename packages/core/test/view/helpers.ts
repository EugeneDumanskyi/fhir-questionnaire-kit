import { createSession, emitResponse, type Questionnaire, type Session, type SessionOptions } from '../../src/index.js';
import { createView, type ControlKind, type ControlView, type InstanceView, type ViewModel, type ViewNode, type ViewOptions } from '../../src/view/index.js';
import { questionnaire } from '../slice.js';

/** Every node of a view tree in document order, instance children included. */
export function flatten(nodes: readonly ViewNode[]): ViewNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flatten(node.control === 'group' ? node.children : node.control === 'repeating-group' ? node.instances.flatMap((instance) => instance.children) : []),
  ]);
}

/** Every instance of every repeating group, in document order. */
export function instancesOf(nodes: readonly ViewNode[]): InstanceView[] {
  return flatten(nodes).flatMap((node) => (node.control === 'repeating-group' ? node.instances : []));
}

/** The node at `path`, asserted to be of `control`'s kind. */
export function find<K extends ControlKind>(model: ViewModel, path: string, control: K): ControlView<K> {
  const node = flatten(model.nodes).find((candidate) => candidate.path === path);
  if (node?.control !== control) throw new Error(`${path} is ${node?.control ?? 'not visible'}, not ${control}`);
  return node as ControlView<K>;
}

/** A session over these R4 items and a mounted view over it, `en` unless the options say otherwise. */
export function setup(items: Questionnaire['item'], options: Partial<ViewOptions> = {}, sessionOptions: SessionOptions = {}) {
  const session = createSession(questionnaire(items), sessionOptions);
  const view = createView(session, { idPrefix: 'fq', locale: 'en', ...options });
  // Mounted, as a renderer mounts it: the first model is built before any command.
  view.getSnapshot();
  const at = <K extends ControlKind>(path: string, control: K) => find(view.getSnapshot(), path, control);
  return { session, view, at, model: () => view.getSnapshot() };
}

export const EXT = 'http://hl7.org/fhir/StructureDefinition/';

/** An `itemControl` hint, as R4 authors it. */
export const hint = (code: string) => ({
  url: `${EXT}questionnaire-itemControl`,
  valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code }] },
});

/** `count` coded options: `o1`, `o2` … */
export const options = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ valueCoding: { system: 'urn:test', code: `o${i + 1}`, display: `Option ${i + 1}` } }));

/** The answers the emitted response carries for a root item: what the screen must never contradict. */
export function emitted(session: Session, linkId: string): readonly unknown[] {
  const items = (emitResponse(session, { authored: '2026-01-01T00:00:00Z' }).item ?? []) as readonly { readonly linkId: string; readonly answer?: readonly unknown[] }[];
  return items.find((item) => item.linkId === linkId)?.answer ?? [];
}
