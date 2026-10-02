#!/usr/bin/env node

const fs = require('node:fs');

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
const USAGE = `Export a committed .env file as Azure Pipelines variables.\n\nUsage: load-pipeline-env <path-to-.env-file>`;

function parseValue(raw) {
  if (raw.length >= 2 && raw[0] === raw.at(-1) && (raw[0] === "'" || raw[0] === '"')) {
    return raw.slice(1, -1);
  }
  return raw.replace(/\s+#.*$/, '');
}

function parse(text) {
  const values = new Map();

  text.split(/\r\n|\n|\r/).forEach((line, index) => {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#')) return;

    const match = LINE.exec(line);
    if (!match) {
      throw new Error(`line ${index + 1}: cannot parse ${JSON.stringify(line)}`);
    }

    values.set(match[1], parseValue(match[2]));
  });

  return Object.fromEntries(values);
}

function escapeLoggingValue(value) {
  return value.replace(/%/g, '%AZP25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function main(args = process.argv.slice(2)) {
  if (args.length !== 1) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  const filePath = args[0];
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const values = parse(text);
  const secrets = Object.keys(values).filter((key) => key.startsWith('SECRET_')).sort();

  if (secrets.length > 0) {
    process.stdout.write(
      `##vso[task.logissue type=error]${filePath} contains secret keys: ${secrets.join(', ')}\n`,
    );
    return 1;
  }

  process.stdout.write(`Loading ${Object.keys(values).length} variables from ${filePath}\n`);
  for (const [key, value] of Object.entries(values)) {
    if (value.includes('\n') || value.includes('\r')) {
      process.stdout.write(`##vso[task.logissue type=error]${key} contains a line break\n`);
      return 1;
    }
    process.stdout.write(
      `##vso[task.setvariable variable=${key}]${escapeLoggingValue(value)}\n`,
    );
  }

  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { escapeLoggingValue, main, parse, parseValue };
