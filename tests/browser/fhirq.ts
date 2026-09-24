/** What the test pages put on `window` (tests/browser/pages). */
export interface TestWindow {
  fhirq: {
    ready: boolean;
    react?: string;
    /** The value-set page's resolver: the value sets it was asked for, and the call that lets it answer. */
    calls?: readonly string[];
    release?: () => void;
    session: {
      dispatch(command: { type: string }): unknown;
      getSnapshot(): { cycle: number; nodes: { answers: readonly { value: unknown }[] }[] };
    };
  };
}
