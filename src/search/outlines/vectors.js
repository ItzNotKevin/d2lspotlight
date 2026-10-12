import { validVector } from '../semantic/model.js';

export function encodeOutlineVectors(vectors, dimensions) {
  const bytes = new Uint8Array(vectors.length * dimensions * 4);
  const view = new DataView(bytes.buffer);
  vectors.forEach((vector, index) => {
    if (!validVector(vector, dimensions)) throw new Error('Cannot save an invalid outline vector.');
    vector.forEach((value, position) => view.setFloat32((index * dimensions + position) * 4, value, true));
  });
  return bytes;
}

export function decodeOutlineVectors(bytes, dimensions, count) {
  if (!Number.isInteger(dimensions) || dimensions < 1 || !Number.isInteger(count) || count < 0 || bytes.byteLength !== dimensions * count * 4) {
    throw new Error('Outline vector file size does not match its manifest.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: count }, (_, index) => {
    const vector = Float32Array.from({ length: dimensions }, (_, position) => view.getFloat32((index * dimensions + position) * 4, true));
    if (!validVector(vector, dimensions)) throw new Error('Outline vector file contains an invalid vector.');
    return vector;
  });
}
