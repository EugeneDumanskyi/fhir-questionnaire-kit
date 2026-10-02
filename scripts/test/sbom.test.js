import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { layout, stem, verify } from '../sbom.mjs';

/**
 * The SBOM script's two decisions, without packing anything: where each
 * package's tree is laid out, and what an SBOM may name. The packing itself
 * runs in CI's `Engine gates`, after the package build.
 */

const bom = (name, components) => ({ bomFormat: 'CycloneDX', specVersion: '1.6', metadata: { component: { group: '@fhirq', name } }, components });

describe('the SBOM per published package (M10 AC-6, plan D5 and step 8)', () => {
  it('lays each published package out with every kit package it reaches, once, as npm would', () => {
    const trees = layout([
      { name: '@fhirq/core' },
      { name: '@fhirq/view', dependencies: { '@fhirq/core': '0.0.0' } },
      { name: '@fhirq/react', dependencies: { '@fhirq/view': '0.0.0', '@fhirq/core': '0.0.0' }, peerDependencies: { react: '^19.0.0' } },
      { name: '@fhirq/playground', private: true, dependencies: { vite: '7.3.6' } },
    ]);
    expect([...trees.keys()]).toEqual(['@fhirq/core', '@fhirq/view', '@fhirq/react']);
    expect(trees.get('@fhirq/core')).toEqual([{ name: '@fhirq/core', into: '' }]);
    expect(trees.get('@fhirq/react')).toEqual([
      { name: '@fhirq/react', into: '' },
      { name: '@fhirq/view', into: 'node_modules/@fhirq/view' },
      { name: '@fhirq/core', into: 'node_modules/@fhirq/core' },
    ]);
  });

  it('refuses a dependency outside the kit, naming it, since NFR-S-01 allows none', () => {
    expect(() => layout([{ name: '@fhirq/core', dependencies: { 'left-pad': '1.3.0' } }])).toThrow('@fhirq/core depends on left-pad, outside the kit (NFR-S-01 allows none)');
    expect(() => layout([{ name: '@fhirq/react', dependencies: { '@fhirq/gone': '0.0.0' } }])).toThrow('depends on @fhirq/gone, outside the kit');
  });

  it('passes an SBOM naming only kit packages, and fails one naming anything else, or describing the wrong package', () => {
    expect(verify(bom('react', [{ group: '@fhirq', name: 'core', version: '0.0.0' }]), '@fhirq/react')).toEqual([]);
    expect(verify(bom('core', []), '@fhirq/core')).toEqual([]);
    expect(verify(JSON.parse(readFileSync(new URL('./fixtures/sbom/outside.cdx.json', import.meta.url), 'utf8')), '@fhirq/react')).toEqual([
      '@fhirq/react: names react@19.3.0, outside the kit',
      '@fhirq/react: names left-pad@1.3.0, outside the kit',
    ]);
    expect(verify(bom('core', []), '@fhirq/react')).toEqual(['@fhirq/react: describes @fhirq/core']);
    expect(verify({}, '@fhirq/core')).toEqual(['@fhirq/core: not a CycloneDX document', '@fhirq/core: describes nothing']);
  });

  it('names each file after its package', () => {
    expect(stem('@fhirq/core')).toBe('fhirq-core');
    expect(stem('@fhirq/element')).toBe('fhirq-element');
  });
});
