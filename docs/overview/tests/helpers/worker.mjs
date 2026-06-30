/**
 * Test helper: extracts search-related functions from the WORKER_CODE
 * string in index.html for testing move ordering, TT, and search logic.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '..', '..', 'index.html');

const html = readFileSync(htmlPath, 'utf-8');

// Extract the WORKER_CODE string from index.html
const workerStart = html.indexOf("const WORKER_CODE = `");
const workerEnd = html.indexOf("`;", workerStart + 20);
if (workerStart === -1 || workerEnd === -1) throw new Error('Could not find WORKER_CODE in index.html');

// Extract the template literal content (between the backticks)
const workerCode = html.substring(
  workerStart + "const WORKER_CODE = `".length,
  workerEnd
);

// Remove the self.onmessage handler (references self which doesn't exist in Node)
const onmsgStart = workerCode.indexOf('self.onmessage');
const cleanCode = onmsgStart !== -1 ? workerCode.substring(0, onmsgStart) : workerCode;

// Create a module by appending exports
const moduleCode = `
${cleanCode}

export {
  HOUSES, SIDE, clone, belongs, sideSeeds, boardSeeds, capturable,
  simulate, legalMoves, applyMove, isOver, collectSides,
  TT_SIZE, tt, ttClear, ttStore, ttProbe, computeHash, hashToInt,
  capCount, orderMoves,
  negamax, rootSearch,
  countEmpty, countReach, countKroo, extractFeatures,
  evalDecisionTree, EVAL_TREE,
  PRESETS, blunderToMargin, difficultyToConfig
};
`;

const tmpFile = join(tmpdir(), `oware-worker-${Date.now()}.mjs`);
writeFileSync(tmpFile, moduleCode);

const worker = await import(tmpFile);
unlinkSync(tmpFile);

export const {
  HOUSES, SIDE, clone, belongs, sideSeeds, boardSeeds, capturable,
  simulate, legalMoves, applyMove, isOver, collectSides,
  TT_SIZE, tt, ttClear, ttStore, ttProbe, computeHash, hashToInt,
  capCount, orderMoves,
  negamax, rootSearch,
  countEmpty, countReach, countKroo, extractFeatures,
  evalDecisionTree, EVAL_TREE,
  PRESETS, blunderToMargin, difficultyToConfig
} = worker;
