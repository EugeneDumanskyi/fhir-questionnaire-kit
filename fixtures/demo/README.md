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

**Later versions** add what AC-15.1.1 also asks for once the engine has it: a
cross-field validation rule (M3) and a scored block (M4).

Codes in `answerOption` carry no `system`: they are local to this form, and no
code system is invented for them.
