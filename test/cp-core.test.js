const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOutput,
  verdictFromResult,
  buildOutputDiff,
  splitCases,
  statusFromVerdict
} = require('../src/features/cp-core');

test('CP output normalization ignores CRLF and trailing whitespace', () => {
  assert.equal(
    normalizeOutput('1 2 3   \r\nhello\t\r\n\r\n'),
    '1 2 3\nhello'
  );
});

test('CP verdict mapping handles pass, WA, TLE, and runtime errors', () => {
  assert.equal(
    verdictFromResult({ exitCode: 0, timedOut: false, stdout: '42\n' }, '42'),
    'PASS'
  );
  assert.equal(
    verdictFromResult({ exitCode: 0, timedOut: false, stdout: '41' }, '42'),
    'WRONG ANSWER'
  );
  assert.equal(
    verdictFromResult({ exitCode: 0, timedOut: true, stdout: '' }, ''),
    'TLE'
  );
  assert.equal(
    verdictFromResult({ exitCode: 1, timedOut: false, stdout: '' }, ''),
    'RUNTIME ERROR'
  );
});

test('output diff reports the first mismatching token and line', () => {
  assert.deepEqual(
    buildOutputDiff('12 7 9\n20', '12 8 9\n20'),
    {
      tokenIndex: 2,
      lineIndex: 1,
      expectedToken: '7',
      actualToken: '8',
      expectedLine: '12 7 9',
      actualLine: '12 8 9',
      expectedTokens: 4,
      actualTokens: 4
    }
  );
  assert.equal(buildOutputDiff('42\n', '42'), null);
});

test('multi-case parser splits on separator-only lines', () => {
  assert.deepEqual(
    splitCases('1\n---\n2\n---\n3'),
    ['1', '2', '3']
  );
  assert.deepEqual(splitCases(''), ['']);
});

test('multi-case parser tolerates clipboard and unicode separators', () => {
  assert.deepEqual(
    splitCases('1 2\\n---\\n5 7\\n---\\n10 20'),
    ['1 2', '5 7', '10 20']
  );
  assert.deepEqual(
    splitCases('1 2\n———\n5 7\n———\n10 20'),
    ['1 2', '5 7', '10 20']
  );
  assert.deepEqual(
    splitCases('1 2 --- 5 7 --- 10 20'),
    ['1 2', '5 7', '10 20']
  );
});

test('judge verdicts map to tracker states without auto-AC', () => {
  assert.equal(statusFromVerdict('WRONG ANSWER'), 'WA');
  assert.equal(statusFromVerdict('MISMATCH'), 'WA');
  assert.equal(statusFromVerdict('TLE'), 'TLE');
  assert.equal(statusFromVerdict('RUNTIME ERROR'), 'RE');
  assert.equal(statusFromVerdict('COMPILE ERROR'), 'CE');
  assert.equal(statusFromVerdict('PASS'), '');
});
