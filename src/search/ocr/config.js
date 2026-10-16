export const OCR_VERSION = 'handwriting-v1';
export const OCR_MODELS = [
  { role: 'handwriting', id: 'Xenova/trocr-small-handwritten', revision: '2432e24d184b1d964d07ed04f5d9e21d31a59141' },
  { role: 'math', id: 'onnx-community/TexTeller3-ONNX', revision: 'ed90c6164810242882ca90863bb85697a76f4841' }
];
export const OCR_BATCHES_PER_SESSION = 8;
