// The browser app the Vite and webpack projects build, as a consumer writes
// it: the React form with the kit's stylesheets, and the custom element
// registered through its side-effect entry. Plain JavaScript, so neither
// bundler needs a plugin. The runner copies this file, and the demonstration
// form as questionnaire.json, into each project.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Questionnaire } from '@fhirq/react';
import '@fhirq/element/define';
import '@fhirq/themes/base.css';
import '@fhirq/themes/default.css';
import questionnaire from './questionnaire.json';

createRoot(document.getElementById('react')).render(createElement(Questionnaire, { questionnaire }));

const element = document.createElement('fhir-questionnaire');
element.questionnaire = questionnaire;
document.getElementById('element').append(element);
