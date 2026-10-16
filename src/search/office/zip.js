// Read only the XML parts we need from an OOXML ZIP. No files are written and
// no archive-provided code is evaluated. See PKWARE APPNOTE 4.3.12–4.3.16.
const MAX_XML_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const invalid = () => { throw new Error('Unsupported or damaged Office archive.'); };

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

export function openOfficeZip(bytes, signal) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = offset => view.getUint16(offset, true);
  const u32 = offset => view.getUint32(offset, true);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break;
  }
  if (end < 0 || u32(end) !== 0x06054b50) invalid();
  const count = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || count !== u16(end + 8) || count > 4096 || start + size !== end) invalid();
  const entries = new Map();
  let offset = start;
  for (let number = 0; number < count; number++) {
    signal?.throwIfAborted();
    if (offset + 46 > end || u32(offset) !== 0x02014b50) invalid();
    const nameLength = u16(offset + 28), extraLength = u16(offset + 30), commentLength = u16(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end) invalid();
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (entries.has(name) || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) invalid();
    const entry = { flags: u16(offset + 8), method: u16(offset + 10), crc: u32(offset + 16),
      compressed: u32(offset + 20), size: u32(offset + 24), offset: u32(offset + 42) };
    if (entry.offset + 30 > start || u16(offset + 34) || entry.compressed === 0xffffffff || entry.size === 0xffffffff) invalid();
    entries.set(name, entry);
    offset = next;
  }
  if (offset !== end) invalid();
  let total = 0;
  return async function read(name) {
    signal?.throwIfAborted();
    const entry = entries.get(name);
    if (!entry) throw new Error(`Office document is missing ${name}.`);
    if (entry.size > MAX_XML_BYTES || total + entry.size > MAX_TOTAL_BYTES) throw new Error('Office XML exceeds the extraction limit.');
    const position = entry.offset;
    if (entry.flags & 1 || ![0, 8].includes(entry.method) || u32(position) !== 0x04034b50
      || u16(position + 8) !== entry.method || u16(position + 6) !== entry.flags) invalid();
    const dataStart = position + 30 + u16(position + 26) + u16(position + 28);
    if (dataStart + entry.compressed > start || decoder.decode(bytes.subarray(position + 30, position + 30 + u16(position + 26))) !== name) invalid();
    const compressed = bytes.subarray(dataStart, dataStart + entry.compressed);
    let output;
    if (entry.method === 0) output = compressed;
    else {
      // Feed compressed input in small chunks; enforce the actual inflated size
      // as it arrives, even when the directory lies about the original size.
      let cursor = 0;
      const stream = new ReadableStream({ pull(controller) {
        signal?.throwIfAborted();
        if (cursor >= compressed.length) return controller.close();
        controller.enqueue(compressed.subarray(cursor, cursor += Math.min(1024, compressed.length - cursor)));
      } }).pipeThrough(new DecompressionStream('deflate-raw'), { signal });
      const reader = stream.getReader(), chunks = [];
      let length = 0;
      try {
        while (true) {
          signal?.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > entry.size || length > MAX_XML_BYTES || total + length > MAX_TOTAL_BYTES) throw new Error('Office XML exceeds the extraction limit.');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      output = new Uint8Array(length);
      let position = 0;
      for (const chunk of chunks) { output.set(chunk, position); position += chunk.length; }
    }
    if (output.length !== entry.size || crc32(output) !== entry.crc) invalid();
    total += output.length;
    return decoder.decode(output);
  };
}
