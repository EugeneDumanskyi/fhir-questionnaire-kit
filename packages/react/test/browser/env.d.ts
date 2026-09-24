/** Set per project in vitest.browser.config.ts: the React major the project resolves. */
interface ImportMetaEnv {
  readonly FHIRQ_REACT_MAJOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
