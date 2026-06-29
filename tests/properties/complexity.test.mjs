/**
 * Property-based tests for complexity metric (Task 14.2)
 * Property 22 from the design document.
 * **Validates: Requirements 18.1, 18.2**
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '..', '..', 'index.html');

// --- Extract complexity functions from index.html ---
const html = readFileSync(htmlPath, 'utf-8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('Could not find <script> block in index.html');
const scriptCode = scriptMatch[1];

// Extract cxComb and complexityRating functions
const cxStart = scriptCode.indexOf('const _cxCombCache = new Map();');
const cxEnd = scriptCode.indexOf('function updateComplexity()');
if (cxStart === -1 || cxEnd === -1) throw new Error('Could not locate complexity functions');

let cxCode = scriptCode.substring(cxStart, cxEnd);

// Stub out getMaxLoadedLayer (depends on browser-only ProgressiveLoader)
// Property 22 only tests raw and normalised; solved is not part of this property.
cxCode = cxCode.replace(
  /function getMaxLoadedLayer\(\)\{[\s\S]*?\n\}/,
  'function getMaxLoadedLayer(){ return 0; }'
);

const moduleCode = `
${cxCode}

export { cxComb, complexityRating, FULL_STATE_SPACE };
`;

const tmpFile = join(tmpdir(), `oware-complexity-${Date.now()}.mjs`);
writeFileSync(tmpFile, moduleCode);

let cxComb, complexityRating, FULL_STATE_SPACE;
try {
  const mod = await import(tmpFile);
  cxComb = mod.cxComb;
  complexityRating = mod.complexityRating;
  FULL_STATE_SPACE = mod.FULL_STATE_SPACE;
} finally {
  unlinkSync(tmpFile);
}

// --- Independent reference implementation of binomial coefficient ---
function referenceComb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

// ========================================================================
// Property 22: Complexity metric computation
// ========================================================================

describe('Property 22: Complexity metric computation', () => {

  /**
   * **Validates: Requirements 18.1, 18.2**
   *
   * For any board state with s = boardSeeds, the raw complexity shall equal
   * C(s + 11, 11), and the normalised complexity shall be in the range [0, 100]
   * and shall be monotonically non-decreasing with respect to layer size.
   */

  it('raw === C(s + 11, 11) for any boardSeeds s in [0..48]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 48 }),
        (s) => {
          const { raw } = complexityRating(s);
          const expected = referenceComb(s + 11, 11);
          assert.equal(raw, expected,
            `raw for s=${s}: expected ${expected}, got ${raw}`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('normalised is in [0, 100] for any boardSeeds s in [0..48]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 48 }),
        (s) => {
          const { normalized } = complexityRating(s);
          assert.ok(normalized >= 0 && normalized <= 100,
            `normalised for s=${s}: got ${normalized}, expected in [0, 100]`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('normalised is monotonically non-decreasing with layer size', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 47 }),
        (s1) => {
          const s2 = s1 + 1;
          const n1 = complexityRating(s1).normalized;
          const n2 = complexityRating(s2).normalized;
          assert.ok(n1 <= n2,
            `monotonicity violated: normalised(${s1})=${n1} > normalised(${s2})=${n2}`);
        }
      ),
      { numRuns: 200 }
    );
  });
});
