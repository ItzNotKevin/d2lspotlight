import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pipeline, env } from '@huggingface/transformers';
import { MODEL_ID } from '../src/search/semantic/config.js';
import { evaluateSearch } from '../benchmarks/search-evaluation.js';
const path = process.argv[2] || 'benchmarks/search-evaluation.example.json';
const data = JSON.parse(await readFile(path, 'utf8'));
env.allowRemoteModels = false;
env.localModelPath = `${resolve('semantic-assets')}/`;
const model = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8', device: 'cpu', local_files_only: true });
try {
  const report = await evaluateSearch(data, { embed: async text => (await model(text, { pooling: 'mean', normalize: true })).tolist()[0] });
  console.log(JSON.stringify({ dataset: path, description: data.description, ...report }, null, 2));
} finally { await model.dispose(); }
