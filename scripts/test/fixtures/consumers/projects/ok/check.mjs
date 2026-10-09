import { readFileSync } from 'node:fs';
import { answer } from '@fhirq/core';

if (answer !== 42) throw new Error(`answer ${answer}`);
if (JSON.parse(readFileSync('questionnaire.json', 'utf8')).resourceType !== 'Questionnaire') throw new Error('no questionnaire');
