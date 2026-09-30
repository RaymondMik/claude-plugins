'use strict';

const fs = require('fs');
const path = require('path');

const HEADER = '# Dev Journal\n\nSession log written by the dev-journal Claude Code plugin.\n';
const MAX_RECAP_LINES = 3;
const MAX_DECISIONS = 5;
const MAX_DECISION_FIELD_CHARS = 240;
const NOT_STATED = '(not stated)';

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatTimestamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Normalise a recap to at most MAX_RECAP_LINES non-empty plain-text lines. */
function normaliseRecap(text) {
  const raw = Array.isArray(text) ? text.join('\n') : String(text || '');
  return raw
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_RECAP_LINES);
}

/** One plain line: no markdown labels the writer may have repeated, no line breaks, capped length. */
function cleanField(value, label) {
  let s = String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
    .trim();
  // Strips "Decided: ", "**Decided:** " and "**Decided**: " prefixes the writer may have repeated.
  if (label) s = s.replace(new RegExp(`^\\*{0,2}${label}\\*{0,2}\\s*:\\s*\\*{0,2}\\s*`, 'i'), '').trim();
  if (s.length > MAX_DECISION_FIELD_CHARS) s = `${s.slice(0, MAX_DECISION_FIELD_CHARS - 1).trimEnd()}…`;
  return s;
}

/**
 * Normalise a list of decisions to at most `max` items of the shape
 * { decided, why, gaveUp }, each a single non-empty line. Items without a "decided" are dropped;
 * a missing "why" or "gaveUp" becomes "(not stated)". Accepts snake_case keys too.
 */
function normaliseDecisions(list, max = MAX_DECISIONS) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const decided = cleanField(item.decided ?? item.decision ?? item.what, 'Decided');
    if (!decided) continue;
    out.push({
      decided,
      why: cleanField(item.why ?? item.reason ?? item.because, 'Why') || NOT_STATED,
      gaveUp: cleanField(item.gaveUp ?? item.gave_up ?? item.tradeoff ?? item.tradeOff, 'Gave up') || NOT_STATED,
    });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Markdown for the decisions block. `decisions === null` means "not collected" (fallback recap,
 * feature off): no block at all. An empty list means the writer looked and found none.
 */
function formatDecisions(decisions) {
  if (decisions === null || decisions === undefined) return [];
  const items = normaliseDecisions(decisions);
  if (!items.length) return ['Decisions: none recorded.'];
  const lines = ['Decisions:'];
  for (const d of items) {
    lines.push(`- Decided: ${d.decided}`, `  Why: ${d.why}`, `  Gave up: ${d.gaveUp}`);
  }
  return lines;
}

function formatEntry({ sessionId, cwd, branch, source, recap, decisions = null, date }) {
  const project = cwd ? path.basename(cwd) : 'unknown-project';
  const title = branch ? `${project} (${branch})` : project;
  const lines = normaliseRecap(recap);
  const body = lines.length ? lines.join('\n') : '(no recap)';
  const decisionLines = formatDecisions(decisions);
  return [
    `## ${formatTimestamp(date)} · ${title}`,
    `- Session: \`${sessionId}\``,
    `- Project: ${cwd || 'unknown'}`,
    `- Source: ${source}`,
    '',
    body,
    ...(decisionLines.length ? ['', ...decisionLines] : []),
    '',
    '',
  ].join('\n');
}

function appendEntry(journalPath, entry) {
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  const exists = fs.existsSync(journalPath) && fs.statSync(journalPath).size > 0;
  let prefix = '';
  if (!exists) {
    prefix = `${HEADER}\n`;
  } else {
    const tail = fs.readFileSync(journalPath, 'utf8').slice(-2);
    if (!tail.endsWith('\n')) prefix = '\n';
  }
  fs.appendFileSync(journalPath, `${prefix}${formatEntry(entry)}`, 'utf8');
  return journalPath;
}

/** True when the journal already has a manual entry for this session. */
function hasManualEntry(journalPath, sessionId) {
  if (!sessionId || !fs.existsSync(journalPath)) return false;
  const content = fs.readFileSync(journalPath, 'utf8');
  const sections = content.split(/^## /m);
  return sections.some((s) => s.includes(`- Session: \`${sessionId}\``) && /^- Source: manual\s*$/m.test(s));
}

module.exports = {
  appendEntry,
  formatEntry,
  formatDecisions,
  hasManualEntry,
  normaliseRecap,
  normaliseDecisions,
  formatTimestamp,
  MAX_RECAP_LINES,
  MAX_DECISIONS,
};
