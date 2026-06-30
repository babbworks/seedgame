/**
 * Property-based tests for numeral formatting (Task 15.2)
 * Property 23 from the design document.
 * **Validates: Requirements 20.2, 20.3**
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

// --- Extract formatNumeral and toRoman from index.html ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '..', '..', 'index.html');
const html = readFileSync(htmlPath, 'utf-8');

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('Could not find <script> block in index.html');
const scriptCode = scriptMatch[1];

// Extract the numeral formatter section
const numeralStart = scriptCode.indexOf("const NUMERAL_MODES = ['arabic', 'binary', 'hex', 'tally', 'roman'];");
if (numeralStart === -1) throw new Error('Could not locate NUMERAL_MODES declaration');

// Extract toRoman and formatNumeral functions
const toRomanStart = scriptCode.indexOf('function toRoman(');
const formatNumeralEnd = scriptCode.indexOf('function numeralLoad(');
if (toRomanStart === -1 || formatNumeralEnd === -1) throw new Error('Could not locate numeral functions');

const numeralCode = scriptCode.substring(toRomanStart, formatNumeralEnd);

const moduleCode = `
${numeralCode}
export { toRoman, formatNumeral };
`;

const tmpFile = join(tmpdir(), `oware-numeral-${Date.now()}.mjs`);
writeFileSync(tmpFile, moduleCode);
const numeralModule = await import(tmpFile);
unlinkSync(tmpFile);

const { formatNumeral, toRoman } = numeralModule;

// --- Independent Roman numeral converter for verification ---

function independentToRoman(n) {
  if (n === 0) return '';
  const vals = [40, 10, 9, 5, 4, 1];
  const syms = ['XL', 'X', 'IX', 'V', 'IV', 'I'];
  let out = '';
  let rem = n;
  for (let i = 0; i < vals.length; i++) {
    while (rem >= vals[i]) { out += syms[i]; rem -= vals[i]; }
  }
  return out;
}

// --- Generator ---

/** Seed count in the valid range 0–48 */
function arbSeedCount() {
  return fc.integer({ min: 0, max: 48 });
}

// ========================================================================
// Property 23: Numeral formatting correctness
// ========================================================================

describe('Property 23: Numeral formatting correctness', () => {

  /**
   * **Validates: Requirements 20.2, 20.3**
   *
   * For any seed count n in range 0–48: Arabic mode produces String(n),
   * Binary mode produces a 6-character string of 0s and 1s equal to the
   * binary representation, Hexadecimal mode produces n.toString(16).toUpperCase(),
   * Tally mode produces floor(n/5) tally marks followed by n%5 dots, and
   * Roman mode produces the standard Roman numeral for n (with 0 yielding empty).
   */

  it('Arabic mode produces String(n)', () => {
    fc.assert(
      fc.property(
        arbSeedCount(),
        (n) => {
          const result = formatNumeral(n, 'arabic');
          assert.equal(result, String(n),
            `Arabic: formatNumeral(${n}, 'arabic') = "${result}", expected "${String(n)}"`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Binary mode produces a 6-character string of 0s and 1s', () => {
    fc.assert(
      fc.property(
        arbSeedCount(),
        (n) => {
          const result = formatNumeral(n, 'binary');
          // Must be exactly 6 characters
          assert.equal(result.length, 6,
            `Binary: formatNumeral(${n}, 'binary') = "${result}" has length ${result.length}, expected 6`);
          // Must contain only 0s and 1s
          assert.match(result, /^[01]{6}$/,
            `Binary: formatNumeral(${n}, 'binary') = "${result}" contains non-binary characters`);
          // Must parse back to n
          assert.equal(parseInt(result, 2), n,
            `Binary: parseInt("${result}", 2) = ${parseInt(result, 2)}, expected ${n}`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Hex mode produces uppercase hexadecimal', () => {
    fc.assert(
      fc.property(
        arbSeedCount(),
        (n) => {
          const result = formatNumeral(n, 'hex');
          const expected = n.toString(16).toUpperCase();
          assert.equal(result, expected,
            `Hex: formatNumeral(${n}, 'hex') = "${result}", expected "${expected}"`);
          // Verify it's all uppercase (no lowercase a-f)
          assert.equal(result, result.toUpperCase(),
            `Hex: result "${result}" is not fully uppercase`);
          // Verify it parses back to n
          assert.equal(parseInt(result, 16), n,
            `Hex: parseInt("${result}", 16) = ${parseInt(result, 16)}, expected ${n}`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Tally mode produces correct mark/dot counts', () => {
    fc.assert(
      fc.property(
        arbSeedCount(),
        (n) => {
          const result = formatNumeral(n, 'tally');
          // Count tally marks (𝍸 = U+1D378) and dots (·)
          const tallyMarks = [...result].filter(c => c === '\u{1D378}').length;
          const dots = [...result].filter(c => c === '·').length;
          const expectedFives = Math.floor(n / 5);
          const expectedOnes = n % 5;

          assert.equal(tallyMarks, expectedFives,
            `Tally: formatNumeral(${n}, 'tally') has ${tallyMarks} marks, expected ${expectedFives}`);
          assert.equal(dots, expectedOnes,
            `Tally: formatNumeral(${n}, 'tally') has ${dots} dots, expected ${expectedOnes}`);
          // Total represented value must equal n
          assert.equal(tallyMarks * 5 + dots, n,
            `Tally: ${tallyMarks}×5 + ${dots} = ${tallyMarks * 5 + dots}, expected ${n}`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Roman mode produces standard Roman numeral representation', () => {
    fc.assert(
      fc.property(
        arbSeedCount(),
        (n) => {
          const result = formatNumeral(n, 'roman');
          const expected = independentToRoman(n);
          assert.equal(result, expected,
            `Roman: formatNumeral(${n}, 'roman') = "${result}", expected "${expected}"`);
          // For n=0, result should be empty string
          if (n === 0) {
            assert.equal(result, '',
              `Roman: formatNumeral(0, 'roman') should be empty, got "${result}"`);
          }
          // For n>0, result should only contain valid Roman numeral characters
          if (n > 0) {
            assert.match(result, /^[IVXL]+$/,
              `Roman: formatNumeral(${n}, 'roman') = "${result}" contains invalid Roman chars`);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
