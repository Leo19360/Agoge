const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeText, parsePositiveInt, normalizeDate, escapeLikeTerm } = require('../server/db');

test('sanitizeText trims and caps input safely', () => {
  assert.equal(sanitizeText('  hello world  ', { maxLength: 20 }), 'hello world');
  assert.equal(sanitizeText('drop table users', { maxLength: 30 }), 'drop table users');
  assert.equal(sanitizeText('', { allowEmpty: false }), null);
});

test('parsePositiveInt rejects invalid and unsafe values', () => {
  assert.equal(parsePositiveInt('10', 1, 100), 10);
  assert.equal(parsePositiveInt('0', 1, 100), null);
  assert.equal(parsePositiveInt('abc', 1, 100), null);
});

test('normalizeDate and escapeLikeTerm sanitize user input', () => {
  assert.equal(normalizeDate('2026-08-04'), '2026-08-04');
  assert.equal(normalizeDate('not-a-date'), null);
  assert.equal(escapeLikeTerm('%foo_bar%'), '\\%foo\\_bar\\%');
});
