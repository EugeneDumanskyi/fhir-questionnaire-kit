import { Questionnaire } from '@fhirq/react';
import '@fhirq/themes/base.css';
import '@fhirq/themes/default.css';
import { intake } from './intake.js';

export const Form = () => <Questionnaire questionnaire={intake} />;
