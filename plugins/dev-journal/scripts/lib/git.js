'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');

function run(cwd, args) {
  try {
    const out = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (out.status !== 0) return null;
    return (out.stdout || '').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Branch name and uncommitted diff stat for cwd. Returns nulls outside a git repo or if git is missing.
 */
function gitInfo(cwd) {
  const info = { branch: null, diffStat: null };
  if (!cwd || !fs.existsSync(cwd)) return info;
  if (run(cwd, ['rev-parse', '--is-inside-work-tree']) !== 'true') return info;
  const branch = run(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  info.branch = branch && branch !== 'HEAD' ? branch : null; // detached HEAD is not a branch
  const stat = run(cwd, ['diff', '--stat', 'HEAD']);
  if (stat) {
    const lines = stat.split('\n');
    info.diffStat = lines.length > 25 ? [...lines.slice(0, 24), `… (${lines.length - 24} more lines)`].join('\n') : stat;
  }
  return info;
}

module.exports = { gitInfo };
