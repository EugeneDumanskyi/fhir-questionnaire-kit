// Node, CommonJS: the same entry points through `require`. The element has no
// CommonJS build (M7 D9), so it is not required here.
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const { createSession, emitResponse } = require('@fhirq/core');
const { restoreSession, snapshot } = require('@fhirq/core/resume');
const { createView } = require('@fhirq/core/view');
const { Questionnaire } = require('@fhirq/react');
const { TOKENS } = require('@fhirq/themes');
const { createElement } = require('react');
const { renderToString } = require('react-dom/server');

const questionnaire = JSON.parse(readFileSync(join(__dirname, 'questionnaire.json'), 'utf8'));
const question = /Are you in pain today\?/;

const session = createSession(questionnaire);
const authored = '2026-10-09T12:00:00Z';
const response = emitResponse(session, { authored });
assert.equal(response.resourceType, 'QuestionnaireResponse');
assert.deepEqual(emitResponse(restoreSession(questionnaire, JSON.parse(JSON.stringify(snapshot(session)))), { authored }), response);
assert.match(JSON.stringify(createView(session, { idPrefix: 'node', locale: 'en' }).getSnapshot()), question);
assert.match(renderToString(createElement(Questionnaire, { questionnaire })), question);
assert.ok(TOKENS.length > 0);
for (const sheet of ['@fhirq/themes/base.css', '@fhirq/themes/default.css']) assert.ok(existsSync(require.resolve(sheet)), sheet);
console.log(`node ${process.version} cjs: core, view, resume, react (server render), themes`);
