// Render the full visible page, including ink. Existing PDF text can itself be
// a poor hidden OCR layer, so masking every text box would erase handwriting.
// Search prefers native matches and uses OCR only for additional evidence.
export async function renderHandwriting(page, canvas, check = () => {}) {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3.5, 1600 / base.width, 2000 / base.height);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  // Hidden offscreen documents do not receive display animation frames. PDF.js
  // print intent renders without requestAnimationFrame and includes annotations.
  await page.render({ canvasContext: context, viewport, background: 'white', intent: 'print' }).promise;
  check();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
