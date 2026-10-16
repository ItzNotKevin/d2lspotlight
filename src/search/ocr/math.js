// Add search words only for explicit recognized operators. Capital Sigma can
// name a variable, so it is deliberately not treated as a summation operator.
export function mathSearchAliases(text) {
  const aliases = new Set();
  const value = String(text || '');
  if (/∑|\\sum(?![a-zA-Z])/.test(value)) aliases.add('summation sum');
  if (/∫|\\(?:int|iint|iiint|oint)(?![a-zA-Z])/.test(value)) aliases.add('integral integration');
  if (/∂|\\partial(?![a-zA-Z])/.test(value)) aliases.add('partial derivative');
  if (/∞|\\infty(?![a-zA-Z])/.test(value)) aliases.add('infinity infinite');
  return [...aliases].join(' ');
}
