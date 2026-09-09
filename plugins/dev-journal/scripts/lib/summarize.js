'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { truncate } = require('./transcript');

const PROMPT = [
  'You are writing a dev-journal entry for a Claude Code session. The session extract is on stdin.',
  'Write at most 3 short lines (max ~120 characters each) in plain text, past tense, describing what was changed or achieved.',
  'Focus on concrete code changes, files, or decisions. If nothing was changed, say what was investigated or answered.',
  'No preamble, no bullets, no markdown, no closing remarks. Output only the lines.',
].join(' ');

function resolveClaudeBinary(env = process.env) {
  const isWin = process.platform === 'win32';
  const candidates = [];
  if (env.CLAUDE_CODE_EXECPATH) {
    const p = env.CLAUDE_CODE_EXECPATH;
    // May be a directory (native install) or the binary itself.
    candidates.push(p, path.join(p, isWin ? 'claude.exe' : 'claude'), path.join(p, 'claude.cmd'));
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return 'claude';
}

/**
 * Ask Claude (headless, no tools, no hooks/plugins) for a 2-3 line recap. Returns null on any failure.
 */
function summarizeWithClaude(extract, { model, timeoutSec }, env = process.env) {
  const bin = resolveClaudeBinary(env);
  const args = [
    '-p',
    '--model', model,
    '--tools', '',
    '--no-session-persistence',
    '--setting-sources', '',
    '--output-format', 'json',
    PROMPT,
  ];
  const isWin = process.platform === 'win32';
  try {
    const out = spawnSync(bin, args, {
      input: extract,
      encoding: 'utf8',
      timeout: timeoutSec * 1000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      shell: isWin, // lets `claude.cmd` resolve on Windows
      env: { ...env, DEV_JOURNAL_NESTED: '1' },
    });
    if (out.error) {
      process.stderr.write(`[dev-journal] claude spawn failed: ${out.error.message}\n`);
      return null;
    }
    if (out.status !== 0) {
      process.stderr.write(`[dev-journal] claude exited ${out.status}: ${(out.stderr || '').trim().slice(0, 300)}\n`);
      return null;
    }
    const parsed = JSON.parse(out.stdout);
    if (!parsed || parsed.is_error || typeof parsed.result !== 'string' || !parsed.result.trim()) {
      process.stderr.write(`[dev-journal] claude returned no usable result: ${String(parsed && parsed.result).slice(0, 200)}\n`);
      return null;
    }
    return parsed.result.trim();
  } catch (err) {
    process.stderr.write(`[dev-journal] summarise failed: ${err.message}\n`);
    return null;
  }
}

/** Deterministic recap used when Claude is unavailable or mode is "manual". */
function mechanicalRecap(parsed, git) {
  const lines = [];
  const firstPrompt = parsed.prompts.find((p) => p.trim());
  lines.push(firstPrompt ? `Prompt: ${truncate(firstPrompt.replace(/\s+/g, ' ').trim(), 140)}` : 'Prompt: (none recorded)');
  const files = parsed.editedFiles;
  if (files.length) {
    const names = files.slice(0, 3).map((f) => path.basename(f)).join(', ');
    const more = files.length > 3 ? ` (+${files.length - 3} more)` : '';
    lines.push(`Edited ${files.length} file${files.length === 1 ? '' : 's'}: ${names}${more}`);
  } else {
    lines.push('No files edited by Claude in this session.');
  }
  if (git && git.diffStat) {
    const summary = git.diffStat.trim().split('\n').pop();
    if (summary) lines.push(`Uncommitted: ${summary.trim()}`);
  }
  return lines.join('\n');
}

module.exports = { summarizeWithClaude, mechanicalRecap, resolveClaudeBinary, PROMPT };
