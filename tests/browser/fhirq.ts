/** What the test pages put on `window` (tests/browser/pages). */
export interface TestWindow {
  fhirq: {
    ready: boolean;
    react?: string;
    /** The value-set page's resolver: the value sets it was asked for, and the call that lets it answer. */
    calls?: readonly string[];
    release?: () => void;
    /** The quickstart's page: each response its host was handed on completion. */
    completed?: readonly { status: string; item?: readonly { linkId: string; answer?: readonly Record<string, unknown>[] }[] }[];
    session: {
      dispatch(command: { type: string }): unknown;
      getSnapshot(): { cycle: number; nodes: { path: string; answers: readonly { value: unknown }[] }[] };
    };
  };
}
