# Guides

Task by task, from a first form to a scored one. Every code block on these
pages is copied from a file that CI typechecks and runs (NFR-Q-08), so what
you read is what passes. The API reference, [`07-api.md`](../07-api.md), is
the contract behind each of them.

> **Not a medical device.** The kit renders a questionnaire and records the
> answers; it does not interpret them. Validating an instrument, its wording
> and any score for clinical use is the adopter's responsibility.

| Guide | For |
|---|---|
| [React quickstart](react.md) | A form in a React app, completed by your own submit button |
| [Element quickstart](element.md) | A form on any page, from one script tag and one element |
| [Customizing: the four tiers](tiers.md) | Tokens, a control of your own, or your own markup over the view model |
| [Save and resume](save-and-resume.md) | Keeping a half-finished form, and opening it again |
| [Hidden answers](retention.md) | What happens to an answer when its question is hidden |
| [Value sets](value-sets.md) | Options from your terminology server, and what happens when it fails |
| [Scoring](scoring.md) | A worked example: a two-item scored block, summed by a scorer of your own |

The demonstration form the playground opens on is
[`fixtures/demo`](../../fixtures/demo). It is original wording, not a published
instrument, and not for clinical use.
