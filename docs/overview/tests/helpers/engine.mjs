/**
 * Test helper: extracts the rules engine from index.html for testing.
 * This is a temporary bridge until tools/oware-rules.mjs (task 3.1) is created.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '..', '..', 'index.html');

const html = readFileSync(htmlPath, 'utf-8');

// Extract the script block content from index.html
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('Could not find <script> block in index.html');

const scriptCode = scriptMatch[1];

// Extract just the engine functions (from HOUSES declaration to the AI section)
const engineStart = scriptCode.indexOf('const HOUSES = 12, SIDE = 6;');
const engineEnd = scriptCode.indexOf('/* ===========================================================================\n   AI');
if (engineStart === -1 || engineEnd === -1) throw new Error('Could not locate engine boundaries');

const engineCode = scriptCode.substring(engineStart, engineEnd);

// Also extract the feature extraction and decision-tree evaluator from the AI section
const featureStart = scriptCode.indexOf('/* ---- Feature extraction for DB-mined evaluation ---- */');
const featureEnd = scriptCode.indexOf('function evalState(');
if (featureStart === -1 || featureEnd === -1) throw new Error('Could not locate feature extraction boundaries');

const featureCode = scriptCode.substring(featureStart, featureEnd);

// Create a module from the engine code by wrapping and exporting
const moduleCode = `
${engineCode}
${featureCode}

export { HOUSES, SIDE, newState, clone, positionHash, checkRepetition,
  belongs, sideSeeds, boardSeeds, capturable, simulate, legalMoves,
  applyMove, collectSides, isOver,
  countEmpty, countReach, countKroo, extractFeatures,
  EVAL_TREE, evalDecisionTree };
`;

// Write to a temp file and import it
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';

const tmpFile = join(tmpdir(), `oware-engine-${Date.now()}.mjs`);
writeFileSync(tmpFile, moduleCode);

const engine = await import(tmpFile);
unlinkSync(tmpFile);

export const {
  HOUSES, SIDE, newState, clone, positionHash, checkRepetition,
  belongs, sideSeeds, boardSeeds, capturable, simulate, legalMoves,
  applyMove, collectSides, isOver,
  countEmpty, countReach, countKroo, extractFeatures,
  EVAL_TREE, evalDecisionTree
} = engine;
