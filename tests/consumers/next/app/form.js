'use client';

import { Questionnaire } from '@fhirq/react';

import questionnaire from '../questionnaire.json';

export function Form() {
  return <Questionnaire questionnaire={questionnaire} />;
}
