import { MODEL_ID, MODEL_REVISION } from '../src/search/semantic/config.js';

export const models = [
  { key: 'minilm', name: 'MiniLM L6', id: MODEL_ID, revision: MODEL_REVISION, pooling: 'mean',
    queryPrefix: '', documentPrefix: '', assetRoot: 'semantic-assets' },
  { key: 'bge', name: 'BGE small v1.5', id: 'Xenova/bge-small-en-v1.5',
    revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3', pooling: 'cls',
    queryPrefix: 'Represent this sentence for searching relevant passages: ', documentPrefix: '', assetRoot: 'benchmark-assets' },
  { key: 'e5', name: 'E5 small v2', id: 'Xenova/e5-small-v2',
    revision: '02af79985278377e65c724a76275707cb0333c70', pooling: 'mean',
    queryPrefix: 'query: ', documentPrefix: 'passage: ', assetRoot: 'benchmark-assets' }
];
