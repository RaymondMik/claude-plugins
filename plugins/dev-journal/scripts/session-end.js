#!/usr/bin/env node
'use strict';

/**
 * dev-journal SessionEnd hook.
 *
 * Reads the hook payload from stdin and appends a journal entry: session ID + a 2-3 line recap +
 * the decisions taken (what was decided, why, and what was given up).
 *
 * Claude Code gives SessionEnd hooks only a short grace period before the process exits, while a
 * Claude-written recap takes several seconds. So in "auto" mode this script re-launches itself as a
 * detached background worker (`--worker`, payload passed via env) and returns at once; the worker
 * appends the entry a few seconds later. "manual" mode is instant and runs inline.
 *
 * After queuing (auto) or writing (manual) the entry it prints one line straight to the terminal of
 * the Claude Code process, under the "Resume this session with" hint, saying where the journal is.
 *
 * Never blocks or fails the session: every error is logged to stderr and the exit code is 0.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const { loadConfig } = require('./lib/config');
const { parseTranscript, buildExtract } = require('./lib/transcript');
const { gitInfo } = require('./lib/git');
const { summarizeWithClaude, mechanicalRecap } = require('./lib/summarize');
const { appendEntry, hasManualEntry } = require('./lib/journal');
const { writeToTerminal, fileLink } = require('./lib/terminal');

const PAYLOAD_ENV = 'DEV_JOURNAL_PAYLOAD';

const DEBUG_FILE = process.env.DEV_JOURNAL_DEBUG || null;
const IS_WORKER = process.argv.includes('--worker');

function log(msg) {
  const line = `[dev-journal] ${new Date().toISOString()} pid=${process.pid} ${msg}\n`;
  process.stderr.write(line);
  // The worker's stderr is already redirected to the debug file; only the hook process appends directly.
  if (DEBUG_FILE && !IS_WORKER) {
    try {
      fs.appendFileSync(DEBUG_FILE, line);
    } catch {
      /* ignore */
    }
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    // Guard against a hook runner that never closes stdin.
    setTimeout(() => resolve(data), 3000).unref();
  });
}

function parsePayload(raw) {
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || !payload.session_id) return null;
    return {
      sessionId: String(payload.session_id),
      transcriptPath: payload.transcript_path ? String(payload.transcript_path) : null,
      cwd: payload.cwd ? String(payload.cwd) : process.cwd(),
    };
  } catch {
    return null;
  }
}

/** Full journaling flow. Returns a short status string for logging. */
function writeEntry({ sessionId, transcriptPath, cwd }, config) {
  const parsed = parseTranscript(transcriptPath);
  if (!parsed.hasContent) return `session ${sessionId} has no assistant messages; nothing written`;
  if (hasManualEntry(config.journalPath, sessionId)) {
    return `manual entry already exists for session ${sessionId}; skipping automatic entry`;
  }

  const git = gitInfo(cwd);
  const branch = parsed.branch || git.branch;

  let recap = null;
  let decisions = null; // null = not collected (mechanical recap or feature off)
  let source = 'fallback';
  if (config.mode === 'auto') {
    const summary = summarizeWithClaude(buildExtract(parsed, git, config.maxExtractChars), config);
    if (summary) {
      recap = summary.recap;
      decisions = config.decisions ? summary.decisions : null;
      source = 'claude';
    }
  }
  if (!recap) recap = mechanicalRecap(parsed, git);

  const written = appendEntry(config.journalPath, { sessionId, cwd, branch, source, recap, decisions });
  return `entry (${source}) written to ${written}`;
}

/** One line under Claude Code's resume hint. Best effort: silently skipped when no terminal is reachable. */
function notify(line) {
  if (!writeToTerminal(line)) log(`terminal not reachable; skipped notice: ${line}`);
}

function launchWorker(payload) {
  // With DEV_JOURNAL_DEBUG set, the worker's output is appended to that file (lib modules log to stderr).
  let stdio = 'ignore';
  if (DEBUG_FILE) {
    try {
      const fd = fs.openSync(DEBUG_FILE, 'a');
      stdio = ['ignore', fd, fd];
    } catch {
      stdio = 'ignore';
    }
  }
  const child = spawn(process.execPath, [__filename, '--worker'], {
    detached: true,
    stdio,
    windowsHide: true,
    env: {
      ...process.env,
      [PAYLOAD_ENV]: JSON.stringify({
        session_id: payload.sessionId,
        transcript_path: payload.transcriptPath,
        cwd: payload.cwd,
      }),
    },
  });
  child.unref();
  return child.pid;
}

async function main() {
  if (process.env.DEV_JOURNAL_NESTED) return; // inside our own summariser call

  const isWorker = IS_WORKER;
  const payload = parsePayload(isWorker ? process.env[PAYLOAD_ENV] || '' : await readStdin());
  if (!payload) {
    log(isWorker ? 'worker started without a valid payload' : 'no valid JSON payload with session_id on stdin; nothing written');
    return;
  }

  const config = loadConfig();
  if (isWorker) {
    log(writeEntry(payload, config));
    return;
  }
  if (config.mode !== 'auto') {
    const status = writeEntry(payload, config);
    log(status);
    if (status.startsWith('entry (')) notify(`Dev journal updated: ${fileLink(config.journalPath)}`);
    return;
  }

  // Cheap pre-checks inline so we do not spawn a worker for nothing.
  if (!parseTranscript(payload.transcriptPath).hasContent) {
    log(`session ${payload.sessionId} has no assistant messages; nothing written`);
    return;
  }
  if (hasManualEntry(config.journalPath, payload.sessionId)) {
    log(`manual entry already exists for session ${payload.sessionId}; skipping automatic entry`);
    return;
  }
  const pid = launchWorker(payload);
  log(`background worker ${pid} will append the recap for session ${payload.sessionId} shortly`);
  notify(`Dev journal: recap for this session is being added to ${fileLink(config.journalPath)}`);
}

main().catch((err) => {
  log(`unexpected error: ${err && err.stack ? err.stack : err}`);
});
