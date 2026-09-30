'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const { pathToFileURL } = require('url');

/**
 * Claude Code runs hooks without a controlling terminal, and it only shows hook output when the
 * hook fails. To leave a note next to the "Resume this session with: claude --resume <id>" hint we
 * write straight to the terminal device of the Claude Code process (found by walking up the
 * process ancestry with `ps`). Unix only; every failure is silent and returns false.
 */
function findParentTty(startPid = process.ppid, maxDepth = 6) {
  if (process.platform === 'win32') return null;
  let pid = startPid;
  for (let depth = 0; depth < maxDepth && pid && pid > 1; depth += 1) {
    let out;
    try {
      out = spawnSync('ps', ['-o', 'ppid=,tty=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 });
    } catch {
      return null;
    }
    if (out.status !== 0 || !out.stdout) return null;
    const [ppid, tty] = out.stdout.trim().split(/\s+/);
    if (tty && tty !== '?' && tty !== '??' && tty !== '-') return tty.startsWith('/dev/') ? tty : `/dev/${tty}`;
    pid = Number(ppid);
  }
  return null;
}

function writeToTerminal(line, tty = findParentTty()) {
  if (!tty) return false;
  try {
    fs.appendFileSync(tty, `${line}\n`);
    return true;
  } catch {
    return false;
  }
}

function fileLink(p) {
  try {
    return pathToFileURL(p).href;
  } catch {
    return p;
  }
}

module.exports = { findParentTty, writeToTerminal, fileLink };
