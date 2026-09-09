'use strict';

const fs = require('fs');

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function blocksOf(entry) {
  const content = entry && entry.message && entry.message.content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content.filter((b) => b && typeof b === 'object') : [];
}

/**
 * Remove harness-injected payloads (system reminders, slash-command echoes) so only the
 * human-typed text remains. Returns '' when nothing human is left.
 */
function stripInjected(text) {
  const cleaned = text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<(command-name|command-message|command-args|local-command-stdout|local-command-stderr)>[\s\S]*?<\/\1>/g, '')
    .trim();
  // Anything still starting with a tag is a harness message, not a prompt.
  return cleaned.startsWith('<') ? '' : cleaned;
}

function isHumanPrompt(entry, blocks) {
  if (entry.isMeta || entry.isSidechain) return false;
  // Tool results are also "user" entries; only keep entries that carry human text.
  return blocks.some((b) => b.type === 'text' && typeof b.text === 'string' && b.text.trim());
}

/**
 * Best-effort parse of a Claude Code transcript (JSONL). The format is internal to Claude Code
 * and may change, so every line is parsed defensively and nothing here throws.
 */
function parseTranscript(transcriptPath) {
  const result = {
    prompts: [],
    assistantTexts: [],
    editedFiles: [],
    branch: null,
    cwd: null,
    assistantMessageCount: 0,
    hasContent: false,
  };
  if (!transcriptPath) return result;

  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return result;
  }

  const edited = new Set();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    if (entry.gitBranch && entry.gitBranch !== 'HEAD' && !result.branch) result.branch = entry.gitBranch;
    if (entry.cwd && !result.cwd) result.cwd = entry.cwd;

    const blocks = blocksOf(entry);
    if (entry.type === 'user') {
      if (!isHumanPrompt(entry, blocks)) continue;
      const text = blocks
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text.trim())
        .join('\n');
      const cleaned = stripInjected(text);
      if (cleaned) result.prompts.push(cleaned);
    } else if (entry.type === 'assistant') {
      if (entry.isSidechain) continue;
      result.assistantMessageCount += 1;
      for (const b of blocks) {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          result.assistantTexts.push(b.text.trim());
        } else if (b.type === 'tool_use' && EDIT_TOOLS.has(b.name)) {
          const fp = b.input && (b.input.file_path || b.input.notebook_path);
          if (typeof fp === 'string' && fp) edited.add(fp);
        }
      }
    }
  }

  result.editedFiles = [...edited].sort();
  result.hasContent = result.assistantMessageCount > 0;
  return result;
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function trimBudget(items, budget, fromEnd) {
  const picked = [];
  let used = 0;
  const ordered = fromEnd ? [...items].reverse() : items;
  for (const item of ordered) {
    const cost = item.length + 1;
    if (used + cost > budget) break;
    picked.push(item);
    used += cost;
  }
  return fromEnd ? picked.reverse() : picked;
}

/**
 * Build a compact plain-text extract of the session for the summariser.
 * Keeps the earliest prompts (intent) and the latest assistant messages (outcome).
 */
function buildExtract(parsed, git, maxChars) {
  const budget = Math.max(2000, maxChars);
  const header = [];
  if (parsed.branch || (git && git.branch)) header.push(`Git branch: ${parsed.branch || git.branch}`);
  if (parsed.editedFiles.length) {
    header.push(`Files edited by Claude (${parsed.editedFiles.length}):`);
    header.push(...parsed.editedFiles.slice(0, 40).map((f) => `  - ${f}`));
    if (parsed.editedFiles.length > 40) header.push(`  … and ${parsed.editedFiles.length - 40} more`);
  } else {
    header.push('Files edited by Claude: none');
  }
  if (git && git.diffStat) header.push('Uncommitted git diff --stat:', git.diffStat);
  const headerText = header.join('\n');

  const remaining = budget - headerText.length;
  const prompts = trimBudget(
    parsed.prompts.map((p, i) => `User ${i + 1}: ${truncate(p, 600)}`),
    Math.floor(remaining * 0.4),
    false,
  );
  const answers = trimBudget(
    parsed.assistantTexts.map((t) => `Assistant: ${truncate(t, 800)}`),
    Math.floor(remaining * 0.6),
    true,
  );

  return [headerText, '', '--- User prompts ---', ...prompts, '', '--- Assistant messages (latest) ---', ...answers].join('\n');
}

module.exports = { parseTranscript, buildExtract, truncate, EDIT_TOOLS };
