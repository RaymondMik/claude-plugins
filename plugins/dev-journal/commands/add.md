---
description: "Add a manual dev-journal entry (2-3 line recap plus the decisions taken) for the current session"
argument-hint: "[2-3 line recap of the changes made]"
allowed-tools: ["Bash(node \"${CLAUDE_PLUGIN_ROOT}/scripts/add-entry.js\":*)"]
---

# Add a manual dev-journal entry

Append a journal entry for the **current** session with a short recap of the changes made and
the decisions taken so far. A manual entry replaces the automatic Claude-written entry that the
plugin would otherwise add when this session ends.

## Recap text

- If `$ARGUMENTS` is not empty, use it verbatim as the recap: `$ARGUMENTS`
- If `$ARGUMENTS` is empty, write the recap yourself: at most 3 short lines, past tense,
  plain text, describing the concrete code changes or outcomes of this session so far.
  Do not ask the user to provide it.

## Decisions

Whether or not a recap was given, list the decisions taken in this session so far (at most 5,
most important first). A decision is a choice between alternatives about design,
implementation, scope, tooling or process, made by the user or proposed by you and accepted.
Routine tool calls are not decisions. For each one write three short one-sentence parts:

1. what was decided,
2. why it was decided (the reason given or evident in the conversation),
3. what was given up: the rejected alternative, or the cost or limitation accepted. If there
   was no real trade-off, say so briefly.

Only report decisions that actually happened in this conversation; never invent one. If none
were taken, pass no `--decision` flag.

## Steps

1. Run exactly this command, substituting the recap and one `--decision` flag per decision,
   with the three parts separated by ` | `. Do not add any other flags or shell variables: the
   script reads the session ID and the project directory from its environment. Escape double
   quotes inside the text and use a literal `\n` to separate recap lines.

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/add-entry.js" \
     --decision "<decided> | <why> | <gave up>" \
     --decision "<decided> | <why> | <gave up>" \
     -- "<recap>"
   ```

2. Report the one-line confirmation printed by the script (it contains the journal file path).
   Do not print the whole journal and do not read the script's source.
