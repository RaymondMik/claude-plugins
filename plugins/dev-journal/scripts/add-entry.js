#!/usr/bin/env node
'use strict';

/**
 * dev-journal manual entry.
 * Usage: node add-entry.js [--session <id>] [--cwd <dir>] [--branch <name>] -- "<recap text>"
 * Defaults: --session from CLAUDE_CODE_SESSION_ID (set inside Claude Code sessions), --cwd from process.cwd().
 * Appends an entry with "Source: manual". The SessionEnd hook then skips the automatic entry
 * for that session.
 */

const { loadConfig } = require('./lib/config');
const { gitInfo } = require('./lib/git');
const { appendEntry, normaliseRecap } = require('./lib/journal');

function parseArgs(argv) {
  const opts = { session: null, cwd: null, branch: null, recap: [] };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--') {
      opts.recap.push(...argv.slice(i + 1));
      break;
    }
    if (a === '--session' || a === '--cwd' || a === '--branch') {
      opts[a.slice(2)] = argv[i + 1] || null;
      i += 2;
      continue;
    }
    opts.recap.push(a);
    i += 1;
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const sessionId = opts.session || process.env.CLAUDE_CODE_SESSION_ID || null;
  const recapText = opts.recap.join(' ').trim();

  if (!sessionId) {
    process.stderr.write('dev-journal: missing --session <id> (or CLAUDE_CODE_SESSION_ID env var)\n');
    process.exit(1);
  }
  if (!recapText) {
    process.stderr.write('dev-journal: missing recap text. Usage: add-entry.js --session <id> -- "<recap>"\n');
    process.exit(1);
  }

  const config = loadConfig();
  const cwd = opts.cwd || process.cwd();
  const branch = opts.branch || gitInfo(cwd).branch;
  const recap = normaliseRecap(recapText.replace(/\\n/g, '\n'));

  const written = appendEntry(config.journalPath, { sessionId, cwd, branch, source: 'manual', recap });
  process.stdout.write(`dev-journal: manual entry for session ${sessionId} written to ${written}\n`);
}

main();
