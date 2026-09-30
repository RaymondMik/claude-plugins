#!/usr/bin/env node
'use strict';

/**
 * dev-journal manual entry.
 * Usage: node add-entry.js [--session <id>] [--cwd <dir>] [--branch <name>]
 *                          [--decision "<decided> | <why> | <gave up>"]... -- "<recap text>"
 * Defaults: --session from CLAUDE_CODE_SESSION_ID (set inside Claude Code sessions), --cwd from process.cwd().
 * Each --decision records one decision taken in the session: what was decided, why, and what was
 * given up (the rejected alternative or the accepted trade-off), separated by "|". The flag can be
 * repeated. Optional "Decided:", "Why:" and "Gave up:" labels inside the parts are stripped.
 * Appends an entry with "Source: manual". The SessionEnd hook then skips the automatic entry
 * for that session.
 */

const { loadConfig } = require('./lib/config');
const { gitInfo } = require('./lib/git');
const { appendEntry, normaliseRecap, normaliseDecisions } = require('./lib/journal');

function parseArgs(argv) {
  const opts = { session: null, cwd: null, branch: null, decisions: [], recap: [] };
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
    if (a === '--decision') {
      opts.decisions.push(parseDecision(argv[i + 1] || ''));
      i += 2;
      continue;
    }
    opts.recap.push(a);
    i += 1;
  }
  return opts;
}

/** "decided | why | gave up" -> { decided, why, gaveUp }. Extra "|" belong to the last part. */
function parseDecision(text) {
  const parts = String(text).split('|');
  return {
    decided: (parts[0] || '').trim(),
    why: (parts[1] || '').trim(),
    gaveUp: parts.slice(2).join('|').trim(),
  };
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
  const decisions = normaliseDecisions(opts.decisions);
  if (opts.decisions.length && !decisions.length) {
    process.stderr.write('dev-journal: every --decision needs at least the "decided" part before the first "|"\n');
    process.exit(1);
  }

  const written = appendEntry(config.journalPath, {
    sessionId,
    cwd,
    branch,
    source: 'manual',
    recap,
    decisions: config.decisions ? decisions : null,
  });
  const count = config.decisions ? `, ${decisions.length} decision${decisions.length === 1 ? '' : 's'}` : '';
  process.stdout.write(`dev-journal: manual entry for session ${sessionId}${count} written to ${written}\n`);
}

main();
