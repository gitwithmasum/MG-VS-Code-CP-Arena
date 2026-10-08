const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('Marketplace metadata is publish-ready', () => {
  assert.equal(pkg.publisher, 'gitwithmasum');
  assert.equal(pkg.pricing, 'Free');
  assert.ok(pkg.icon);
  assert.match(pkg.icon, /\.png$/i);
  assert.ok(fs.existsSync(path.join(root, pkg.icon)));
  assert.ok(Array.isArray(pkg.keywords));
  assert.ok(pkg.keywords.length <= 30);
  assert.ok(pkg.repository && pkg.repository.url);
  assert.ok(pkg.homepage);
  assert.ok(pkg.bugs && pkg.bugs.url);
});

test('Marketplace documentation files and banner exist', () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE', 'SUPPORT.md']) {
    assert.ok(fs.existsSync(path.join(root, file)), file + ' must exist');
  }

  assert.ok(fs.existsSync(path.join(root, 'media', 'cp-arena-banner.png')));
  assert.match(readme, /media\/cp-arena-banner\.png/);
});

test('README avoids local absolute paths and SVG images', () => {
  assert.doesNotMatch(readme, /[A-Za-z]:\\\\/);
  assert.doesNotMatch(readme, /!\[[^\]]*\]\([^)]*\.svg(?:\?[^)]*)?\)/i);
});
