export function extractCourseCode(value = '') {
  // LEARN codes use underscores, which JavaScript treats as word characters.
  const text = String(value).toUpperCase().replace(/[_-]/g, ' ');
  const match = text.match(/\b([A-Z]{2,8})\s*(\d{1,4}[A-Z]{0,3})\b/);
  return match ? `${match[1]} ${match[2]}` : '';
}
