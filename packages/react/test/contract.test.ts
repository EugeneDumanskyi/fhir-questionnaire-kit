import { afterEach, describe, expect, it, vi } from 'vitest';

/** The module fresh, so its development switch reads the environment as it is now. */
const load = async () => {
  vi.resetModules();
  return (await import('../src/contract.js')).contractCheck;
};

describe('the tier-3 development check exists in development only (ADR-0013)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is there in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(await load()).toBeTypeOf('function');
  });

  it('is not there in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await load()).toBeUndefined();
  });

  it('is not there, and throws nothing, where there is no `process`', async () => {
    vi.stubGlobal('process', undefined);
    const check = await load().finally(() => vi.unstubAllGlobals());
    expect(check).toBeUndefined();
  });
});
