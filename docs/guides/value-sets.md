# Value sets

A choice question whose options come from `answerValueSet` needs someone to
expand the value set. The kit does not call a terminology server itself:
you give the session a resolver, which does
([ADR-0012](../adr/0012-injected-option-resolver.md)).

<!-- snippet: docs/examples/src/resolver.ts#resolver -->
```ts
import { createSession } from '@fhirq/core';

const session = createSession(questionnaire, {
  resolver: (valueSet, { signal }) => terminology.expand(valueSet, { signal }),
});
```

- **The contract:** `(valueSet, { signal })` returns a promise of `{ system?,
  code, display? }` options. `terminology.expand` stands in for your client:
  a request to your server's `ValueSet/$expand`, with `signal` passed on so
  it is aborted when the session is disposed.
- **When it runs:** once per distinct canonical, as the session opens,
  whether or not the question is showing yet
  ([ADR-0005](../adr/0005-eager-option-resolution.md)). Never again unless you
  ask.
- **Until it settles** the set is `pending`, and a coded answer on its
  questions is refused. Free text on an `open-choice` is still accepted.
- **With no resolver**, each such question reports `unresolved-options` and
  takes no coded answer.

## When it fails

A rejection, a throw, or a list that is not options marks the set `failed`
and adds a `resolver-failed` diagnostic naming the canonical. What was thrown
goes to `onCollaboratorError`, never into state. The form stays usable, and
the question offers a retry. Your own code can retry too:

<!-- snippet: docs/examples/src/resolver.ts#retry -->
```ts
const retry = () => {
  if (session.getSnapshot().optionSets[VALUE_SET]?.status === 'failed') {
    session.dispatch({ type: 'RetryOptions', valueSet: VALUE_SET });
  }
};
```

The kit adds no retries, caching or backoff of its own: those are your
client's to decide.

## In the renderers

- **React:** pass `resolver` in the hook's or component's `options`. It is
  not called while rendering, so it never runs on the server
  ([ADR-0015](../adr/0015-react-adapter-session-ownership-and-ssr.md)).
- **The element:** set the `resolver` property, or set `value-set-base` to a
  FHIR server's base URL and the element's default resolver makes one `GET
  {base}/ValueSet/$expand?url={canonical}` per value set. Set either before
  the questionnaire: a session keeps the resolver it was made with.

The element's default resolver and its `src` request are the only network
access in the kit, and each happens only when you configure it.
