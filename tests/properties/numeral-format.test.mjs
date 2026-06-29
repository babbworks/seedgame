/**
 * Property-based test for numeral formatting (Task 15.2)
 * Property 23: Numeral formatting correctness
 * Validates: Requirements 20.2, 20.3
 *
 * For seed counts 0–48, verify each numeral mode produces correct output.
 * Iterates all values directly (no fast-check needed — domain is small and finite).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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

// Extract toRoman and formatNumeral
const toRomanStart = scriptCode.indexOf('function toRoman(');
const formatEnd = scriptCode.indexOf('\n}', scriptCode.indexOf('function formatNumeral(')) + 2;
if (toRomanStart === -1 || formatEnd <= 0) throw new Error('Could not locate numeral functions');

const numeralCode = scriptCode.substring(toRomanStart, formatEnd);

const tmpFile = join(tmpdir(), `oware-numeral-${Date.now()}.mjs`);
writeFileSync(tmpFile, numeralCode + '\nexport { toRoman, formatNumeral };\n');
const { formatNumeral, toRoman } = await import(tmpFile);
unlinkSync(tmpFile);

// --- Independent reference implementations ---

function refRoman(n) {
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

// ========================================================================
// Property 23: Numeral formatting correctness
// ========================================================================

describe('Property 23: Numeral formatting correctness', () => {

  /**
   * **Validates: Requirements 20.2, 20.3**
   *
   * For all n in [0, 48]:
   * - arabic: String(n)
   * - binary: 6-char string of '0'/'1'
   * - hex: uppercase hexadecimal
   * - tally: correct 𝍸 groups + · remainder
   * - roman: standard representation ('' for 0)
   */

  it('arabic mode returns String(n) for all n in 0..48', () => {
    for (let n = 0; n <= 48; n++) {
      const result = formatNumeral(n, 'arabic');
      assert.equal(result, String(n), `arabic(${n}): expected "${String(n)}", got "${result}"`);
    }
  });

  it('binary mode returns 6-char string of 0/1 for all n in 0..48', () => {
    for (let n = 0; n <= 48; n++) {
      const result = formatNumeral(n, 'binary');
      assert.equal(result.length, 6, `binary(${n}): expected length 6, got ${result.length} ("${result}")`);
      assert.match(result, /^[01]{6}$/, `binary(${n}): expected only 0/1 chars, got "${result}"`);
      assert.equal(parseInt(result, 2), n, `binary(${n}): parsed value ${parseInt(result, 2)} !== ${n}`);
    }
  });

  it('hex mode returns uppercase hexadecimal for all n in 0..48', () => {
    for (let n = 0; n <= 48; n++) {
      const result = formatNumeral(n, 'hex');
      assert.match(result, /^[0-9A-F]+$/, `hex(${n}): expected uppercase hex, got "${result}"`);
      assert.equal(parseInt(result, 16), n, `hex(${n}): parsed value ${parseInt(result, 16)} !== ${n}`);
    }
  });

  it('tally mode has correct 𝍸 groups and · remainder for all n in 0..48', () => {
    for (let n = 0; n <= 48; n++) {
      const result = formatNumeral(n, 'tally');
      const fives = Math.floor(n / 5);
      const ones = n % 5;
      // Count tally marks (U+1D378) and dots using spread to handle astral codepoints
      const chars = [...result];
      const tallyCount = chars.filter(c => c === '\u{1D378}').length;
      const dotCount = chars.filter(c => c === '·').length;
      assert.equal(tallyCount, fives, `tally(${n}): expected ${fives} 𝍸 marks, got ${tallyCount}`);
      assert.equal(dotCount, ones, `tally(${n}): expected ${ones} dots, got ${dotCount}`);
      assert.equal(chars.length, fives + ones, `tally(${n}): expected ${fives + ones} total chars, got ${chars.length}`);
    }
  });

  it('roman mode returns standard representation for all n in 0..48', () => {
    for (let n = 0; n <= 48; n++) {
      const result = formatNumeral(n, 'roman');
      const expected = refRoman(n);
      assert.equal(result, expected, `roman(${n}): expected "${expected}", got "${result}"`);
      if (n === 0) {
        assert.equal(result, '', `roman(0) should be empty string`);
      } else {
        assert.match(result, /^[IVXL]+$/, `roman(${n}): expected only I/V/X/L chars, got "${result}"`);
      }
    }
  });
});
