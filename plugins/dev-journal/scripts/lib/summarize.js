'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { truncate } = require('./transcript');
const { normaliseRecap, normaliseDecisions, MAX_RECAP_LINES, MAX_DECISIONS } = require('./journal');

const RECAP_RULES = [
  'You are writing a dev-journal entry for a Claude Code session. The session extract is on stdin.',
  `"recap": at most ${MAX_RECAP_LINES} short lines (max ~120 characters each), plain text, past tense, describing what was changed or achieved.`,
  'Focus on concrete code changes, files, or outcomes. If nothing was changed, say what was investigated or answered.',
  'No preamble, no bullets, no markdown.',
].join(' ');

const DECISION_RULES = [
  `"decisions": the choices made during the session, most important first, at most ${MAX_DECISIONS}.`,
  'A decision is a choice between alternatives about design, implementation, scope, tooling, or process, made by the user or proposed by the assistant and accepted.',
  'For each decision give three one-sentence fields:',
  '"decided": what was chosen;',
  '"why": the reason given or evident in the session;',
  '"gaveUp": the alternative that was rejected, or the cost, limitation, or trade-off accepted by choosing this. If there was no real trade-off, say so briefly.',
  'Only report decisions that are actually visible in the extract; never invent one. Routine tool calls and mechanical steps are not decisions.',
  'If no decision was made, return an empty array.',
].join(' ');

const PROMPT = `${RECAP_RULES} ${DECISION_RULES}`;
const PROMPT_RECAP_ONLY = `${RECAP_RULES} "decisions": always return an empty array.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    recap: { type: 'array', items: { type: 'string' }, maxItems: MAX_RECAP_LINES },
    decisions: {
      type: 'array',
      maxItems: MAX_DECISIONS,
      items: {
        type: 'object',
        properties: {
          decided: { type: 'string' },
          why: { type: 'string' },
          gaveUp: { type: 'string' },
        },
        required: ['decided', 'why', 'gaveUp'],
        additionalProperties: false,
      },
    },
  },
  required: ['recap', 'decisions'],
  additionalProperties: false,
};

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
 * Turn the JSON document printed by `claude -p --output-format json` into { recap, decisions }.
 * Prefers the schema-validated `structured_output`; falls back to parsing `result` as JSON, and
 * finally to treating `result` as plain recap text (decisions unknown => null). Returns null when
 * there is nothing usable.
 */
function parseSummary(doc) {
  if (!doc || typeof doc !== 'object' || doc.is_error) return null;
  let data = doc.structured_output;
  if ((!data || typeof data !== 'object') && typeof doc.result === 'string') {
    const text = doc.result.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (data && typeof data === 'object') {
    const recap = normaliseRecap(Array.isArray(data.recap) ? data.recap : String(data.recap || ''));
    if (!recap.length) return null;
    return { recap: recap.join('\n'), decisions: normaliseDecisions(data.decisions) };
  }
  if (typeof doc.result === 'string' && doc.result.trim()) {
    const recap = normaliseRecap(doc.result);
    return recap.length ? { recap: recap.join('\n'), decisions: null } : null;
  }
  return null;
}

/**
 * Ask Claude (headless, no tools, no hooks/plugins) for a recap and the decisions taken.
 * Returns { recap: string, decisions: Array|null } or null on any failure.
 */
function summarizeWithClaude(extract, { model, timeoutSec, decisions = true }, env = process.env) {
  const bin = resolveClaudeBinary(env);
  const args = [
    '-p',
    '--model', model,
    '--tools', '',
    '--no-session-persistence',
    '--setting-sources', '',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(OUTPUT_SCHEMA),
    decisions ? PROMPT : PROMPT_RECAP_ONLY,
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
    const doc = JSON.parse(out.stdout);
    const summary = parseSummary(doc);
    if (!summary) {
      process.stderr.write(`[dev-journal] claude returned no usable result: ${String(doc && doc.result).slice(0, 200)}\n`);
      return null;
    }
    if (!decisions) summary.decisions = null;
    return summary;
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

module.exports = { summarizeWithClaude, mechanicalRecap, parseSummary, resolveClaudeBinary, PROMPT, OUTPUT_SCHEMA };
