import optionResolution from '../../../fixtures/option-resolution/questionnaire.json?raw';
import scenario from '../../../fixtures/option-resolution/scenario.json?raw';
import { inMemory, valueSets } from './resolver.js';

/** The value sets the `option-resolution` fixture's resolver holds, answered from memory (plan D9). */
export const resolver = inMemory(valueSets(scenario));

/** Fixtures past the demo, each with what it shows. */
export const SAMPLES = [{ name: 'Value sets (option-resolution)', text: optionResolution }] as const;
