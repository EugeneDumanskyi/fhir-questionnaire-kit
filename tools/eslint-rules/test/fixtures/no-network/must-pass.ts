// MUST PASS: the data arrives through an injected port (ADR-0012).

export interface OptionResolver {
  readonly resolve: (valueSet: string) => Promise<readonly string[]>;
}

export async function loadOptions(
  resolver: OptionResolver,
  valueSet: string,
): Promise<readonly string[]> {
  return resolver.resolve(valueSet);
}
