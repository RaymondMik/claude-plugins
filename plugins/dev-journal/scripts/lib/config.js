'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = Object.freeze({
  mode: 'auto', // 'auto' = Claude-written recap at SessionEnd, 'manual' = mechanical recap only
  model: 'haiku',
  journalPath: path.join('~', '.claude', 'dev-journal.md'),
  timeoutSec: 60,
  maxExtractChars: 16000,
  decisions: true, // also record, per decision, what was decided, why, and what was given up
});

const CONFIG_PATH = path.join(os.homedir(), '.claude', 'dev-journal.json');

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function readConfigFile() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    process.stderr.write(`[dev-journal] ignoring invalid config at ${CONFIG_PATH}: ${err.message}\n`);
    return {};
  }
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Resolve the effective configuration: defaults < ~/.claude/dev-journal.json < DEV_JOURNAL_* env vars.
 */
function loadConfig(env = process.env) {
  const file = readConfigFile();
  const mode = String(env.DEV_JOURNAL_MODE || file.mode || DEFAULTS.mode).toLowerCase();
  return {
    mode: mode === 'manual' ? 'manual' : 'auto',
    model: env.DEV_JOURNAL_MODEL || file.model || DEFAULTS.model,
    journalPath: path.resolve(expandHome(env.DEV_JOURNAL_PATH || file.journalPath || DEFAULTS.journalPath)),
    timeoutSec: toPositiveInt(env.DEV_JOURNAL_TIMEOUT_SEC || file.timeoutSec, DEFAULTS.timeoutSec),
    maxExtractChars: toPositiveInt(file.maxExtractChars, DEFAULTS.maxExtractChars),
    decisions: toBool(env.DEV_JOURNAL_DECISIONS, toBool(file.decisions, DEFAULTS.decisions)),
    configPath: CONFIG_PATH,
  };
}

module.exports = { loadConfig, expandHome, DEFAULTS, CONFIG_PATH };
