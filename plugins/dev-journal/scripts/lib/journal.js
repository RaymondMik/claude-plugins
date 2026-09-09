'use strict';

const fs = require('fs');
const path = require('path');

const HEADER = '# Dev Journal\n\nSession log written by the dev-journal Claude Code plugin.\n';
const MAX_RECAP_LINES = 3;

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

function formatEntry({ sessionId, cwd, branch, source, recap, date }) {
  const project = cwd ? path.basename(cwd) : 'unknown-project';
  const title = branch ? `${project} (${branch})` : project;
  const lines = normaliseRecap(recap);
  const body = lines.length ? lines.join('\n') : '(no recap)';
  return [
    `## ${formatTimestamp(date)} · ${title}`,
    `- Session: \`${sessionId}\``,
    `- Project: ${cwd || 'unknown'}`,
    `- Source: ${source}`,
    '',
    body,
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

module.exports = { appendEntry, formatEntry, hasManualEntry, normaliseRecap, formatTimestamp, MAX_RECAP_LINES };
