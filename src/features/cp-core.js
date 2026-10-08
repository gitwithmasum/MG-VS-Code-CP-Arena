function normalizeOutput(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

function verdictFromResult(result, expectedOutput = '') {
  if (result?.timedOut) return 'TLE';
  if (Number(result?.exitCode ?? -1) !== 0) return 'RUNTIME ERROR';

  if (
    String(expectedOutput || '').trim() &&
    normalizeOutput(result?.stdout) !== normalizeOutput(expectedOutput)
  ) {
    return 'WRONG ANSWER';
  }

  return 'PASS';
}

function buildOutputDiff(expectedOutput, actualOutput) {
  const expected = normalizeOutput(expectedOutput);
  const actual = normalizeOutput(actualOutput);
  if (expected === actual) return null;

  const expectedTokens = expected.split(/\s+/).filter(Boolean);
  const actualTokens = actual.split(/\s+/).filter(Boolean);
  const max = Math.max(expectedTokens.length, actualTokens.length);
  let tokenIndex = 0;

  while (
    tokenIndex < max &&
    expectedTokens[tokenIndex] === actualTokens[tokenIndex]
  ) {
    tokenIndex += 1;
  }

  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const lineMax = Math.max(expectedLines.length, actualLines.length);
  let lineIndex = 0;

  while (
    lineIndex < lineMax &&
    expectedLines[lineIndex] === actualLines[lineIndex]
  ) {
    lineIndex += 1;
  }

  return {
    tokenIndex: tokenIndex + 1,
    lineIndex: lineIndex + 1,
    expectedToken: expectedTokens[tokenIndex] ?? '[missing]',
    actualToken: actualTokens[tokenIndex] ?? '[missing]',
    expectedLine: expectedLines[lineIndex] ?? '[missing]',
    actualLine: actualLines[lineIndex] ?? '[missing]',
    expectedTokens: expectedTokens.length,
    actualTokens: actualTokens.length
  };
}

function splitCases(value) {
  let text = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n');

  // Some clipboard/webview paths can preserve "\\n" as literal text.
  if (!text.includes('\n') && /\\n/.test(text)) {
    text = text.replace(/\\n/g, '\n');
  }

  text = text.trim();
  if (!text) return [''];

  const separator = /^[\t \u00a0]*(?:-{3,}|[‐‑‒–—―]{3,})[\t \u00a0]*$/u;
  const lines = text.split('\n');
  const cases = [];
  let current = [];
  let foundSeparator = false;

  for (const line of lines) {
    if (separator.test(line)) {
      foundSeparator = true;
      cases.push(current.join('\n').trim());
      current = [];
    } else {
      current.push(line);
    }
  }

  if (foundSeparator) {
    cases.push(current.join('\n').trim());
    return cases;
  }

  // Last-resort clipboard fallback when line breaks around --- were flattened.
  if (text.includes('---')) {
    const fallback = text
      .split(/[\t \u00a0]*---+[\t \u00a0]*/g)
      .map((item) => item.trim());

    if (fallback.length > 1) return fallback;
  }

  return [text];
}

function statusFromVerdict(verdict) {
  if (verdict === 'WRONG ANSWER' || verdict === 'MISMATCH') return 'WA';
  if (verdict === 'TLE') return 'TLE';
  if (verdict === 'RUNTIME ERROR') return 'RE';
  if (verdict === 'COMPILE ERROR') return 'CE';
  return '';
}

module.exports = {
  normalizeOutput,
  verdictFromResult,
  buildOutputDiff,
  splitCases,
  statusFromVerdict
};
