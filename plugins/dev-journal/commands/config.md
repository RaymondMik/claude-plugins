---
description: "Show or change where the dev journal is stored"
argument-hint: "[path | --reset]"
allowed-tools: ["Bash(node \"${CLAUDE_PLUGIN_ROOT}/scripts/set-config.js\":*)"]
---

# Show or change the dev-journal location

The journal is a single Markdown file, by default `~/.claude/dev-journal.md`. This command
shows the current location or saves a new one in `~/.claude/dev-journal.json`, so that all
future entries, `/dev-journal:add` and `/dev-journal:show` use it.

## Steps

Run exactly one of the following commands, chosen from `$ARGUMENTS`, and do not add any other
flags. Do not read the script's source.

- If `$ARGUMENTS` is empty, show the current configuration:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/set-config.js" --show
  ```

- If `$ARGUMENTS` is `--reset`, go back to the default location:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/set-config.js" --reset
  ```

- Otherwise `$ARGUMENTS` is the new journal file path. Pass it as given (a leading `~` is
  fine, it is expanded by the plugin). Escape double quotes inside it:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/set-config.js" --path "$ARGUMENTS"
  ```

Then report the script's output verbatim. If it printed a note about an existing journal left
at the old location, ask the user whether they want it moved, and only move it if they say so.
