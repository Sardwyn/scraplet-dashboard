import { runCLI } from '@jest/core';
import path from 'path';
import { fileURLToPath } from 'url';
import { recordTestRun } from '../utils/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configModule = await import(path.resolve(__dirname, '../jest.config.js'));
const jestConfig = configModule.default ?? configModule;

const { results } = await runCLI({
  config: JSON.stringify(jestConfig)
}, [process.cwd()]);

recordTestRun({
  passed: results.numPassedTests,
  failed: results.numFailedTests,
  timestamp: Date.now()
});

if (!results.success) {
  process.exit(1);
}
