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
the form, since R4 has no standard way to author one.

Codes in `answerOption` carry no `system`: they are local to this form, and no
code system is invented for them.
