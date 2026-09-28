// MUST PASS, linted as apps/playground/src/__lint-fixture__.ts: published
// entry points, a sibling, a file of the app outside src, and the fixtures the
// app bundles as data.

import { createSession } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import '@fhirq/themes/default.css';

import demo from '../../../fixtures/demo/questionnaire.json' with { type: 'json' };
import { tier } from './tier.js';
import tierSource from './tier.tsx?raw';
import { config } from '../vite/config.js';

export const used = [createSession, Questionnaire, demo, tier, tierSource, config];
