# dev-journal

A Claude Code plugin that keeps a running **dev journal**. When a Claude Code session ends it
appends the **session ID** and a **2-3 line recap** of what changed to a single Markdown file,
so you always have a searchable log of what each session did and which session to `--resume`.

## Requirements

- Claude Code 2.x
- **Node.js 18 or newer** on your `PATH` (the hook and the manual command run small Node scripts;
  Claude Code itself does not bundle Node). Works on macOS, Linux and Windows.

## Install

Local development (no install, loads for that run only):

```bash
claude --plugin-dir /path/to/claude-plugin/plugins/dev-journal
```

After editing the plugin, run `/reload-plugins` inside Claude Code.

From the marketplace folder (persistent, user scope):

```text
/plugin marketplace add /path/to/claude-plugin      # or a GitHub repo once published
/plugin install dev-journal@raymond-plugins
```

## What it writes

Default journal: `~/.claude/dev-journal.md`. Each entry looks like:

```markdown
## 2026-09-09 15:42 · webapp (DCS-1990)
- Session: `188401af-010f-4c2c-ab1b-166e6d7792cc`
- Project: /Users/raymond/Documents/Projects/nagarro/dectris/webapp
- Source: claude

Enforced the job-template quota in the create-template route via LicenseService.
Added a unit test for the quota check and updated the invite-dialog counter copy.
```

`Source` is one of:

| Source     | Meaning                                                                                    |
|------------|--------------------------------------------------------------------------------------------|
| `claude`   | Recap written automatically by a short headless Claude call at session end (default mode). |
| `manual`   | Recap you added with `/dev-journal:add`.                                                   |
| `fallback` | Mechanical recap (first prompt, files edited, uncommitted diff) when Claude was not used or the call failed. |

Sessions with no assistant messages are not journaled. A session that was resumed and ended
again gets a second, later entry.

## Commands

| Command                       | What it does                                                                                          |
|-------------------------------|-------------------------------------------------------------------------------------------------------|
| `/dev-journal:add [recap]`    | Appends a manual entry for the current session now. With no argument, Claude writes the recap itself. A manual entry suppresses the automatic entry for that session. |
| `/dev-journal:show [n]`       | Prints the last `n` entries (default 5).                                                              |

## Configuration

Optional file `~/.claude/dev-journal.json`:

```json
{
  "mode": "auto",
  "model": "haiku",
  "journalPath": "~/.claude/dev-journal.md",
  "timeoutSec": 60,
  "maxExtractChars": 12000
}
```

| Key               | Default                    | Notes                                                                                     |
|-------------------|----------------------------|-------------------------------------------------------------------------------------------|
| `mode`            | `auto`                     | `auto`: Claude-written recap at session end. `manual`: no Claude call; mechanical recap unless you used `/dev-journal:add`. |
| `model`           | `haiku`                    | Model for the recap call. Haiku keeps it fast (a few seconds) and cheap (about 1-2 cents). |
| `journalPath`     | `~/.claude/dev-journal.md` | `~` is expanded on every platform.                                                        |
| `timeoutSec`      | `60`                       | Max time for the recap call before falling back to the mechanical recap.                  |
| `maxExtractChars` | `12000`                    | Size cap of the transcript extract sent to Claude.                                        |

Environment variable overrides, handy for testing: `DEV_JOURNAL_MODE`, `DEV_JOURNAL_MODEL`,
`DEV_JOURNAL_PATH`, `DEV_JOURNAL_TIMEOUT_SEC`.

Troubleshooting: set `DEV_JOURNAL_DEBUG=/path/to/dev-journal-debug.log` before starting Claude
Code and the hook and its background worker append their log lines (including any error from
the recap call) to that file.

## How the automatic recap works

The `SessionEnd` hook (`hooks/hooks.json`) runs `scripts/session-end.js`, which:

1. Parses the session transcript (best effort: the format is internal to Claude Code, so
   unknown lines are skipped) to collect your prompts, Claude's replies, and files edited.
2. Adds the git branch and an uncommitted `git diff --stat` for the project.
3. Pipes that extract to `claude -p` with tools, hooks and plugins disabled
   (`--tools "" --setting-sources "" --no-session-persistence`), asking for at most 3 lines.
4. Appends the entry. On any failure it appends the mechanical recap instead. The hook never
   blocks or fails the session.

Claude Code only waits a moment for `SessionEnd` hooks before it exits, and the recap call takes
a few seconds. In `auto` mode the hook therefore returns immediately and hands the work to a
**detached background worker** (the same script with `--worker`), which appends the entry
roughly 3-15 seconds after the session ends. Exiting Claude Code is never delayed. In `manual`
mode the mechanical entry is written inline, before the session closes.

The nested call is guarded by `DEV_JOURNAL_NESTED=1`, so the summariser session can never
trigger the hook again. It uses your normal Claude Code login.

## Testing without ending a session

```bash
printf '{"session_id":"test-1","transcript_path":"/path/to/some.jsonl","cwd":"%s"}' "$PWD" \
  | DEV_JOURNAL_PATH=/tmp/journal.md DEV_JOURNAL_MODE=manual node scripts/session-end.js
```

Drop `DEV_JOURNAL_MODE=manual` to exercise the Claude-written recap.

## Windows notes

- Paths are built with Node's `path`/`os` modules; `${CLAUDE_PLUGIN_ROOT}` with forward slashes
  is fine for Node on Windows.
- The recap call locates the `claude` binary through `CLAUDE_CODE_EXECPATH` when Claude Code
  sets it, otherwise through `PATH` (`claude.cmd` resolves because the call uses a shell on
  Windows).
- Hook execution on Windows has not yet been verified on a real machine.
