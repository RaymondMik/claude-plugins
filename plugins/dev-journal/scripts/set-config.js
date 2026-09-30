#!/usr/bin/env node
'use strict';

/**
 * dev-journal configuration: show or change where the journal file is stored.
 * Usage: node set-config.js [--show] [--path <file>] [--reset]
 *
 * Writes the `journalPath` key of ~/.claude/dev-journal.json. The path is stored as given
 * (a leading `~` is kept so the file stays portable) and expanded when the journal is used.
 * Note that the DEV_JOURNAL_PATH environment variable, when set, still wins over the file.
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, expandHome, DEFAULTS, CONFIG_PATH } = require('./lib/config');

function fail(msg) {
  process.stderr.write(`dev-journal: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { show: false, reset: false, path: null };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--show') {
      opts.show = true;
      i += 1;
    } else if (a === '--reset') {
      opts.reset = true;
      i += 1;
    } else if (a === '--path') {
      if (i + 1 >= argv.length) fail('missing value after --path');
      opts.path = argv[i + 1];
      i += 2;
    } else {
      fail(`unknown argument "${a}". Usage: set-config.js [--show] [--path <file>] [--reset]`);
    }
  }
  if (opts.path !== null && opts.reset) fail('--path and --reset cannot be combined');
  return opts;
}

function readConfigObject() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    process.stderr.write(`dev-journal: existing config at ${CONFIG_PATH} is not valid JSON; it will be rewritten\n`);
    return {};
  }
}

function writeConfigObject(obj) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function resolvePath(p) {
  return path.resolve(expandHome(p));
}

function envOverrideWarning() {
  if (process.env.DEV_JOURNAL_PATH) {
    return `Note: DEV_JOURNAL_PATH=${process.env.DEV_JOURNAL_PATH} is set and overrides the config file while it is set.\n`;
  }
  return '';
}

function show() {
  const config = loadConfig();
  const file = readConfigObject();
  const origin = process.env.DEV_JOURNAL_PATH ? 'DEV_JOURNAL_PATH env var' : file.journalPath ? CONFIG_PATH : 'default';
  const exists = fs.existsSync(config.journalPath);
  process.stdout.write(
    [
      `Journal file: ${config.journalPath}${exists ? '' : ' (not created yet)'}`,
      `Set by: ${origin}`,
      `Config file: ${CONFIG_PATH}${fs.existsSync(CONFIG_PATH) ? '' : ' (does not exist)'}`,
      `Default: ${resolvePath(DEFAULTS.journalPath)}`,
      '',
    ].join('\n'),
  );
}

function setPath(rawPath) {
  const wanted = String(rawPath).trim();
  if (!wanted) fail('the journal path must not be empty');
  if (wanted.endsWith('/') || wanted.endsWith('\\')) fail('the journal path must point to a file, not a directory');

  const before = loadConfig().journalPath;
  const file = readConfigObject();
  file.journalPath = wanted;
  writeConfigObject(file);

  const after = resolvePath(wanted);
  let out = `dev-journal: journal path set to ${after} (saved in ${CONFIG_PATH})\n`;
  if (before !== after && fs.existsSync(before) && !fs.existsSync(after)) {
    out += `Existing journal left in place at ${before}; move it manually if you want to keep the history together.\n`;
  }
  process.stdout.write(out + envOverrideWarning());
}

function reset() {
  const file = readConfigObject();
  const had = Object.prototype.hasOwnProperty.call(file, 'journalPath');
  delete file.journalPath;
  if (fs.existsSync(CONFIG_PATH) || Object.keys(file).length) writeConfigObject(file);
  const def = resolvePath(DEFAULTS.journalPath);
  process.stdout.write(
    `dev-journal: ${had ? 'journal path reset to the default' : 'no custom journal path was set; using the default'} ${def}\n` +
      envOverrideWarning(),
  );
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.path !== null) return setPath(opts.path);
  if (opts.reset) return reset();
  return show();
}

main();
