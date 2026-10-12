import { mkdir, writeFile, readFile } from 'node:fs/promises';
const root = 'models/Xenova/all-MiniLM-L6-v2';
await mkdir(`${root}/onnx`, { recursive: true });
let revision;
try { revision = JSON.parse(await readFile(`${root}/revision.json`, 'utf8')).sha; } catch {
  const response = await fetch('https://huggingface.co/api/models/Xenova/all-MiniLM-L6-v2');
  if (!response.ok) throw new Error(`Model metadata: HTTP ${response.status}`);
  revision = (await response.json()).sha;
}
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid model revision.');
for (const file of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx']) {
  const response = await fetch(`https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/${revision}/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  await writeFile(`${root}/${file}`, Buffer.from(await response.arrayBuffer()));
  console.log(`Saved ${file}`);
}
await writeFile(`${root}/revision.json`, JSON.stringify({ sha: revision }, null, 2));
console.log('Local model ready. Run npm run build, then reload the extension and browser tabs.');
