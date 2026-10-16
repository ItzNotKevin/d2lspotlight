import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { mathSearchAliases } from '../src/search/ocr/math.js';

const [manifestFile, ...reports] = process.argv.slice(2);
if (!manifestFile || !reports.length) throw new Error('Usage: node scripts/preview-ocr.mjs <local-manifest.json> <report.json> [...]');
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
const pages = [];
for (const file of reports) {
  const report = JSON.parse(await readFile(file, 'utf8'));
  for (const sample of report.samples) {
    const source = manifest.samples.find(item => item.id === sample.id);
    if (!source || sample.crop || !sample.imageSize || !sample.regions) throw new Error('Preview requires matching uncropped page samples with region coordinates.');
    const path = resolve(dirname(manifestFile), source.image);
    const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(path).toLowerCase()];
    if (!type) throw new Error('Unsupported local preview image.');
    pages.push({ id: sample.id, model: report.model, size: sample.imageSize,
      image: `data:${type};base64,${(await readFile(path)).toString('base64')}`,
      ms: sample.inferenceMs, capped: sample.segmentationPartial,
      regions: sample.regions.map(region => ({ ...region, aliases: mathSearchAliases(region.text) })) });
  }
}
const serialized = JSON.stringify(pages).replaceAll('<', '\\u003c');
const output = resolve('benchmark-results/ocr-preview.html');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Local OCR evaluation</title>
<style>body{font:16px system-ui;margin:24px;background:#faf9f6;color:#203735}input{font:inherit;padding:12px;width:min(90%,480px)}article{margin:30px 0;padding:20px;border:1px solid #ccc;border-radius:12px}svg{width:100%;max-height:650px;background:white}rect{fill:#eead2233;stroke:#df6819;stroke-width:2}li{margin:12px 0;white-space:pre-wrap;overflow-wrap:anywhere}small{color:#666}#pages{max-width:1100px}</style>
<h1>Local OCR evaluation</h1><p>Experimental recognition; transcription errors and missed regions remain. This preview uses local images and makes no network requests. Enter a keyword to highlight matching regions.</p>
<label>Search recognized text or symbol names <input id="query" value="parametric" placeholder="Try summation or explicitly"></label><div id="pages"></div>
<script>const pages=${serialized};const ns='http://www.w3.org/2000/svg';
function draw(){const query=document.getElementById('query').value.trim().toLowerCase();const root=document.getElementById('pages');root.replaceChildren();
for(const page of pages){const article=document.createElement('article');const heading=document.createElement('h2');heading.textContent=page.id;article.append(heading);
const info=document.createElement('p');info.textContent=page.model+' · '+page.ms+' ms inference · '+page.regions.length+' candidate regions'+(page.capped?' · region cap reached':'');article.append(info);
const matches=page.regions.filter(region=>!query||(region.text+' '+region.aliases).toLowerCase().includes(query));const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 '+page.size.join(' '));
const image=document.createElementNS(ns,'image');image.setAttribute('href',page.image);image.setAttribute('width',page.size[0]);image.setAttribute('height',page.size[1]);svg.append(image);
for(const region of matches){const [x,y,right,bottom]=region.box;const rect=document.createElementNS(ns,'rect');for(const [key,value] of Object.entries({x,y,width:right-x+1,height:bottom-y+1}))rect.setAttribute(key,value);const title=document.createElementNS(ns,'title');title.textContent=region.text;rect.append(title);svg.append(rect);}article.append(svg);
const count=document.createElement('p');count.textContent=matches.length+' matching regions';article.append(count);const list=document.createElement('ol');for(const region of matches){const li=document.createElement('li');li.textContent=region.text+(region.aliases?' — searchable aliases: '+region.aliases:'');list.append(li);}article.append(list);root.append(article);}}
document.getElementById('query').addEventListener('input',draw);draw();</script></html>`);
console.log(output);
