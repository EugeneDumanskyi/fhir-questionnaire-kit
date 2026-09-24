// A structural attribute's whole value may be computed in braces; prose in any other attribute may not.

export function Group({ stem, name }: { readonly stem: string; readonly name: string }) {
  return (
    <fieldset className={`fhirq-item fhirq-${stem}`} part={`item ${stem}`}>
      <button type="button" aria-label={`Remove the ${name} entry`} />
    </fieldset>
  );
}
