const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { escapeLoggingValue, parse } = require('../index');
const scriptPath = path.join(__dirname, '..', 'bin', 'load-pipeline-env');

function runLoader(content) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'load-env-file-'));
  const filePath = path.join(directory, '.env.test');
  fs.writeFileSync(filePath, content);

  try {
    return spawnSync(process.execPath, [scriptPath, filePath], { encoding: 'utf8' });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('parses supported dotenv values', () => {
  assert.deepEqual(parse(
    '\n# comment\n' +
    'DOUBLE="value # preserved"\n' +
    "SINGLE=' spaced value '\n" +
    'PLAIN=value # removed\n' +
    'HASH=value#preserved\n' +
    'EMPTY=\n' +
    'QUOTED_EMPTY=""\n' +
    ' export EXPORTED = yes \n' +
    'DUPLICATE=first\nDUPLICATE=last\n',
  ), {
    DOUBLE: 'value # preserved',
    SINGLE: ' spaced value ',
    PLAIN: 'value',
    HASH: 'value#preserved',
    EMPTY: '',
    QUOTED_EMPTY: '',
    EXPORTED: 'yes',
    DUPLICATE: 'last',
  });
});

test('does not interpolate variables or decode escapes', () => {
  assert.deepEqual(parse('VALUE="${OTHER}\\n"'), { VALUE: '${OTHER}\\n' });
});

test('rejects malformed lines', () => {
  for (const line of ['not an assignment', '1KEY=value', 'KEY-NAME=value']) {
    assert.throws(() => parse(`VALID=value\n${line}`), /line 2: cannot parse/);
  }
});

test('rejects multiline values', () => {
  assert.throws(() => parse('VALUE="first\nsecond"'), /line 2: cannot parse/);
});

test('loads UTF-8 BOM and CRLF files', () => {
  const result = runLoader(Buffer.from('\uFEFFKEY="value"\r\nEMPTY=\r\n'));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /##vso\[task.setvariable variable=KEY\]value\n/);
  assert.match(result.stdout, /##vso\[task.setvariable variable=EMPTY\]\n/);
});

test('rejects secret keys before exporting any variables', () => {
  const result = runLoader('PUBLIC=value\nSECRET_TOKEN=private-value\n');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /contains secret keys: SECRET_TOKEN/);
  assert.doesNotMatch(result.stdout, /task\.setvariable|private-value/);
});

test('escapes Azure Pipelines logging sequences', () => {
  const value = '100% %0A %0D %AZP25\r\n';
  const escaped = escapeLoggingValue(value);
  assert.equal(escaped, '100%AZP25 %AZP250A %AZP250D %AZP25AZP25%0D%0A');

  const decoded = escaped
    .replace(/%0D/g, '\r')
    .replace(/%0A/g, '\n')
    .replace(/%AZP25/g, '%');
  assert.equal(decoded, value);
});

test('escapes literal logging sequences when exporting values', () => {
  const result = runLoader('VALUE=100% %0A %0D %AZP25\n');
  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /##vso\[task\.setvariable variable=VALUE\]100%AZP25 %AZP250A %AZP250D %AZP25AZP25\n/,
  );
});
