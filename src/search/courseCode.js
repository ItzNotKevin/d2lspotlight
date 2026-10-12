export function extractCourseCode(value = '') {
  // LEARN codes use underscores, which JavaScript treats as word characters.
  const text = String(value).toUpperCase().replace(/[_-]/g, ' ');
  const match = text.match(/\b([A-Z]{2,8})\s*(\d{2,4}[A-Z]?)\b/);
  return match ? `${match[1]} ${match[2]}` : '';
}
