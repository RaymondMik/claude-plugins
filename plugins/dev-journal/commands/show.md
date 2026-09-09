---
description: "Show the most recent dev-journal entries"
argument-hint: "[number of entries, default 5]"
allowed-tools: ["Read", "Bash(node -e:*)"]
---

# Show recent dev-journal entries

Print the last N entries from the dev journal, newest last. N is `$ARGUMENTS` if it is a
positive integer, otherwise 5.

## Steps

1. Resolve the journal path. It is `~/.claude/dev-journal.md` unless overridden by the
   `journalPath` key in `~/.claude/dev-journal.json` or the `DEV_JOURNAL_PATH` environment
   variable. You can print the effective path with:

   ```bash
   node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/config.js').loadConfig().journalPath)"
   ```

2. Read that file. Entries start with a line beginning with `## `. If the file does not
   exist, say that no journal has been written yet and stop.

3. Output the last N entries verbatim, in a single fenced Markdown block, with no commentary
   other than a one-line header stating the file path and how many entries the file contains.
