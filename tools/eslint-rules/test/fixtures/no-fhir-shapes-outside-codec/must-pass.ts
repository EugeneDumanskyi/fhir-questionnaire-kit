// MUST PASS: domain types only; a property called `type` is not a FHIR resource shape.
interface ItemDefinition {
  readonly linkId: string;
  readonly type: 'boolean' | 'string';
}

export const item: ItemDefinition = { linkId: 'a', type: 'boolean' };
export const kind = item.type;
