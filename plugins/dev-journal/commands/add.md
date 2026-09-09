---
description: "Add a manual dev-journal entry (2-3 line recap) for the current session"
argument-hint: "[2-3 line recap of the changes made]"
allowed-tools: ["Bash(node \"${CLAUDE_PLUGIN_ROOT}/scripts/add-entry.js\":*)"]
---

# Add a manual dev-journal entry

Append a journal entry for the **current** session with a short recap of the changes made.
A manual entry replaces the automatic Claude-written entry that the plugin would otherwise
add when this session ends.

## Recap text

- If `$ARGUMENTS` is not empty, use it verbatim as the recap: `$ARGUMENTS`
- If `$ARGUMENTS` is empty, write the recap yourself: at most 3 short lines, past tense,
  plain text, describing the concrete code changes or decisions made in this session so far.
  Do not ask the user to provide it.

## Steps

1. Run exactly this command, substituting the recap. Do not add any other flags or shell
   variables: the script reads the session ID and the project directory from its environment.
   Escape double quotes inside the recap and use a literal `\n` to separate lines.

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/add-entry.js" -- "<recap>"
   ```

2. Report the one-line confirmation printed by the script (it contains the journal file path).
   Do not print the whole journal and do not read the script's source.
