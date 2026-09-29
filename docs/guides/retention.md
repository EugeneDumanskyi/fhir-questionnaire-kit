# Hidden answers

A respondent answers "yes, I smoke" and "5 a day", then changes the first
answer to "no". The second question is hidden. What happens to the 5?

It is **never in the response** while the question is hidden, whatever the
policy (INV-E-01): a response holds only what the respondent can see. The
retention policy decides only whether the 5 comes back when the question is
shown again ([ADR-0011](../adr/0011-retain-hidden-answers-exclude-from-response.md)).

<!-- snippet: docs/examples/src/retention.ts#retention -->
```ts
import { createSession, emitResponse, itemPath } from '@fhirq/core';

const kept = createSession(questionnaire); // retention: 'retain-exclude', the default
const erased = createSession(questionnaire, { retention: 'discard' });

for (const session of [kept, erased]) {
  set(session, 'smoker', { kind: 'boolean', value: true }); // shows "per-day"
  set(session, 'per-day', { kind: 'integer', value: 5 });
  set(session, 'smoker', { kind: 'boolean', value: false }); // hides it
}
// Hidden, so neither response holds "per-day".
const responses = [emitResponse(kept), emitResponse(erased)];

for (const session of [kept, erased]) set(session, 'smoker', { kind: 'boolean', value: true });
// Shown again: `kept` has 5 once more; `erased` has nothing.
```

| `retention` | While hidden | Shown again |
|---|---|---|
| `retain-exclude` (default) | Kept by the session, left out of the response | The answer is back |
| `discard` | Erased, and a repeating group reset | Empty |

Keep the default unless your process says a hidden answer must not survive:
`retain-exclude` spares a respondent who flips an answer and back from typing
everything again.

**Retained answers are data you hold.** The session keeps them and a
[snapshot](save-and-resume.md) saves them, though they are never in the
response, on screen, or in what a scorer or evaluator reads.

- **React:** `useQuestionnaire(q, { options: { retention: 'discard' } })`, or
  the component's `options`.
- **The element:** make the session yourself and set the `session` property.
