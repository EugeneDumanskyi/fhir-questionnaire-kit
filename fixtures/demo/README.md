# `demo`: pre-visit intake

> **Not for clinical use.** This is a demonstration form for the kit. It is not
> a validated instrument, and its wording has not been reviewed by a clinician.

**Purpose:** the playground's and docs' demo questionnaire (AC-15.1.1,
`02-requirements.md` R9). It is **authored** for the kit, in original wording;
nothing is copied from a published instrument.

**Version 1 (M2)** exercises what the engine does so far, and
`packages/core/test/conformance/demo.test.ts` holds it to that:

- a chain of conditions three deep: `pain-now` → `pain-score` → `pain-onset` →
  `pain-tell-reception`;
- a repeating group, `medicine`, whose `medicine-how-often` reads the answer in
  its own instance;
- `enableBehavior` `all` (`smoking-support`) and `any` (`arrival-note`);
- all twelve supported item types: `group`, `display`, `boolean`, `decimal`,
  `integer`, `date`, `dateTime`, `string`, `text`, `choice`, `open-choice` and
  `quantity`.

**Version 2 (M4)** adds a scored block, `wellbeing`: two questions on energy
and sleep over the last two weeks, each answered on a four-point scale (never,
some days, most days, every day) whose options carry an ordinal score of 0–3
through the registered HL7 extension
`http://hl7.org/fhir/StructureDefinition/ordinalValue`. The block is shaped
like a two-item screener but its wording is original; it is not the PHQ-2 and
is not to be read as one. The kit does not interpret it: `demo.test.ts` scores
it with a test-only scorer that adds the ordinals (US-07.2), and holds the
demo's cross-field rule there too: the date someone stopped smoking may not
come after the visit date (M3's rule shape, AC-15.1.1). The rule lives in the test, not
the form, since R4 has no standard way to author one. The scoring guide,
`docs/guides/scoring.md`, is the worked example over this block (M10 plan D8),
run by `docs/examples/test/examples.test.ts`.

**Version 3 (M9)** moves the `pain` group up, straight after `notice`, and
changes nothing else. The playground opens on this form, and its first
question, `pain-now`, now reveals the next one (`pain-score`) when it is
answered yes (M9 AC-2, AC-12.1.2). In version 2 the first question was
`visit-date`, which reveals nothing. Paths are unchanged, since they follow
linkIds rather than position; only the order of items, and of answers in an
emitted response, moves.

Codes in `answerOption` carry no `system`: they are local to this form, and no
code system is invented for them.
