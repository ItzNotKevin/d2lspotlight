import test from 'node:test';
import assert from 'node:assert/strict';
import { mathSearchAliases } from '../src/search/ocr/math.js';

test('explicit Unicode and LaTeX operators gain searchable names', () => {
  for (const text of ['∑ rⁱ', '\\sum_{i=0}^{\\infty} r^i']) assert.match(mathSearchAliases(text), /summation/);
  assert.match(mathSearchAliases('\\int_0^1 f(x) dx'), /integral/);
  assert.match(mathSearchAliases('∂f/∂x'), /partial derivative/);
  assert.match(mathSearchAliases('∞'), /infinity/);
});
test('variable Sigma and similarly named commands do not invent operator matches', () => {
  for (const text of ['Σ = covariance', '\\Sigma', '\\summary', '\\integer', 'S r i', 'geometric series']) assert.equal(mathSearchAliases(text), '');
  assert.equal(mathSearchAliases(null), '');
});
