# Azure Pipelines Env Loader

A dependency-free Node.js CLI that reads a committed `.env` file and publishes its values as Azure Pipelines job variables.

## Requirements

- Node.js 22 or later
- Azure Pipelines, when using the CLI to emit `##vso` logging commands

## Use in a pipeline

```yaml
- task: UseNode@1
  inputs:
    version: '22.x'

- bash: npx --yes @thomaspe/azure-pipelines-env-loader@latest apps/main/env/.env.prod
  displayName: Load pipeline variables
```

Each parsed key becomes available to subsequent steps as both an environment variable and a `$(KEY)` pipeline macro. The CLI only sets variables for later steps in the same job.

## Supported `.env` syntax

- Blank lines and lines beginning with `#` are ignored.
- `KEY=value` and an optional `export` prefix are supported.
- Matching single or double quotes around a value are removed.
- Unquoted values may end in a ` # comment`.
- Duplicate keys use the last value.
- Variable interpolation, escape decoding, and multiline values are not supported.
- UTF-8 BOM and CRLF line endings are supported.
- Keys beginning with `SECRET_` are rejected. Keep secrets in a protected variable group instead.

The CLI escapes Azure Pipelines logging-command characters before publishing values. Values containing line breaks are rejected.

## Local development

```sh
npm test
node loadEnvFile.js path/to/.env
```

The parser and escaping helpers are exported from the package entry point for reuse:

```js
const { parse, escapeLoggingValue } = require('@thomaspe/azure-pipelines-env-loader');
```
