# Security policy

## Reporting a vulnerability

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/security/advisories/new)
for this repository. Please do not open a public issue, pull request or
discussion about it.

Include what you can of: the package and version or commit, what an attacker
could do, and the steps or a questionnaire that shows it. Never include real
patient data: a made-up questionnaire and made-up answers reproduce anything
the kit does.

## What happens next

| Step | Within |
|---|---|
| Your report is acknowledged | **7 days** |
| The issue is patched, or publicly documented with its workaround | **30 days** |

These windows are the project's only published commitment (NFR-X-08). Beyond
them there is no support commitment: issues are triaged monthly, with no
timeline for features or questions (NFR-M-09).

## Supported versions

Nothing is published yet. Until 1.0.0, only the `main` branch is supported.
From 1.0.0, fixes go to the latest release.

## What is in scope

The published packages, `@fhirq/core`, `@fhirq/react`, `@fhirq/element` and
`@fhirq/themes`, and the playground and docs site built from this repository.
Among what counts:

- an answer value reaching a diagnostic, error, event or log;
- a request the kit makes that the host did not configure, or any request
  from `@fhirq/core`, `@fhirq/react` or the themes;
- authored rich text rendered without the host's sanitizer;
- a way to run script, load style or open a connection on the playground or
  the docs site despite their Content Security Policy.

A host's own storage, transport, identity or sanitizer is the host's. The kit
is not a medical device: a questionnaire's clinical content and any score
computed from it are out of scope.
