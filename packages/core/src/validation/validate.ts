import type { Diagnostic } from '../kernel/diagnostic.js';
import type { Issue } from '../kernel/issue.js';
import type { Definition } from '../definition/compile.js';
import type { Validator, VisibleProjection } from '../session/projection.js';
import { builtInIssues } from './built-in.js';
import { ruleIssues, type CompiledRule } from './rules.js';

/**
 * The validation result (BC3, AC-04.4.1): a pure function of the visible
 * projection and the registered rules (INV-V-09). Ordered by document order,
 * then repeat position (INV-V-06): form-level issues first, since they have
 * no place in the document, then each node's built-in issues and its rule
 * issues in registration order.
 */
export function validator(definition: Definition, rules: readonly CompiledRule[]): Validator {
  // One `rule-threw` per rule per session: a rule that throws on every keystroke
  // would otherwise grow the diagnostics without bound. M4 settles the full contract.
  const threw = new Set<string | null>();
  return (projection: VisibleProjection, report: (diagnostic: Diagnostic) => void): readonly Issue[] => {
    const once = (finding: Diagnostic): void => {
      if (threw.has(finding.detail)) return;
      threw.add(finding.detail);
      report(finding);
    };
    const builtIn = builtInIssues(projection);
    const fromRules = ruleIssues(definition, rules, projection, once);
    if (fromRules.length === 0) return builtIn;
    const position = new Map<string | null, number>(projection.nodes.map((node, index) => [node.path, index]));
    position.set(null, -1);
    // Stable: built-in issues come before rule issues on the same node.
    return [...builtIn, ...fromRules].sort((a, b) => (position.get(a.path) ?? 0) - (position.get(b.path) ?? 0));
  };
}
