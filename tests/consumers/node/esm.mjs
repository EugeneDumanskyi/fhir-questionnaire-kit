// Node, ESM: every entry point a server can load, imported by name. The
// element is browser-only and ESM-only (M7 D9), so it is resolved, not run.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createSession, emitResponse } from '@fhirq/core';
import { restoreSession, snapshot } from '@fhirq/core/resume';
import { createView } from '@fhirq/core/view';
import { Questionnaire } from '@fhirq/react';
import { TOKENS } from '@fhirq/themes';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const questionnaire = JSON.parse(readFileSync(new URL('questionnaire.json', import.meta.url), 'utf8'));
const question = /Are you in pain today\?/;

const session = createSession(questionnaire);
const authored = '2026-10-09T12:00:00Z';
const response = emitResponse(session, { authored });
assert.equal(response.resourceType, 'QuestionnaireResponse');
assert.deepEqual(emitResponse(restoreSession(questionnaire, JSON.parse(JSON.stringify(snapshot(session)))), { authored }), response);
assert.match(JSON.stringify(createView(session, { idPrefix: 'node', locale: 'en' }).getSnapshot()), question);
assert.match(renderToString(createElement(Questionnaire, { questionnaire })), question);
assert.ok(TOKENS.length > 0);
for (const sheet of ['@fhirq/themes/base.css', '@fhirq/themes/default.css']) assert.ok(existsSync(fileURLToPath(import.meta.resolve(sheet))), sheet);
assert.ok(existsSync(fileURLToPath(import.meta.resolve('@fhirq/element'))));
console.log(`node ${process.version} esm: core, view, resume, react (server render), themes`);
