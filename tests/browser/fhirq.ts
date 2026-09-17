/** What the test pages put on `window` (tests/browser/pages). */
export interface TestWindow {
  fhirq: {
    ready: boolean;
    react?: string;
    session: {
      dispatch(command: { type: string }): unknown;
      getSnapshot(): { cycle: number; nodes: { answer?: unknown }[] };
    };
  };
}
