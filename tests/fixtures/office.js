import { deflateRawSync } from 'node:zlib';

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
export function officeZip(parts, { stored = false, declaredSize } = {}) {
  const chunks = [], directories = [];
  let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    const filename = Buffer.from(name), source = Buffer.from(text);
    const compressed = stored ? source : deflateRawSync(source);
    const local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(stored ? 0 : 8, 8); local.writeUInt32LE(crc32(source), 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(declaredSize ?? source.length, 22);
    local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(stored ? 0 : 8, 10); central.writeUInt32LE(crc32(source), 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(declaredSize ?? source.length, 24);
    central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    chunks.push(local, filename, compressed); directories.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(directories), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(parts).length, 8); end.writeUInt16LE(Object.keys(parts).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, directory, end]));
}
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const p = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const wordXml = text => `<w:document xmlns:w="${w}"><w:body>${text}</w:body></w:document>`;
export const wordParagraph = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
export function wordFixture() {
  return officeZip({ 'word/document.xml': wordXml('<w:p><w:r><w:t>Permu</w:t></w:r><w:r><w:t>tation counts ordered arrangements.</w:t></w:r></w:p>'
    + `<w:tbl><w:tr><w:tc>${wordParagraph('Conditional probability uses given information.')}</w:tc></w:tr></w:tbl>`),
  'word/comments.xml': '<!-- comments must not be indexed -->' });
}
export function slideParts() {
  return {
    'ppt/presentation.xml': `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${r}/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="${r}/slide" Target="slides/slide2.xml"/></Relationships>`,
    'ppt/slides/slide1.xml': `<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><a:p><a:r><a:t>Permu</a:t></a:r><a:r><a:t>tation is an ordered arrangement.</a:t></a:r></a:p></p:cSld></p:sld>`,
    'ppt/slides/slide2.xml': `<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><a:p><a:r><a:t>Sample spaces and events.</a:t></a:r></a:p></p:cSld></p:sld>`
  };
}
export const slideFixture = () => officeZip(slideParts());
