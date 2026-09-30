#  Personal Claude Code plugin marketplace.

| Plugin                                   | Description                                                                   |
|------------------------------------------|-------------------------------------------------------------------------------|
| [dev-journal](plugins/dev-journal)       | Records each Claude Code session ID with a 2-3 line recap of the changes made. |

## Use locally

```text
/plugin marketplace add /absolute/path/to/claude-plugins
/plugin install dev-journal@raymondMik-plugins
```

Or load a single plugin for one run without installing:

```bash
claude --plugin-dir /absolute/path/to/claude-plugins/plugins/dev-journal
```

## Use from GitHub (after publishing)

```text
/plugin marketplace add RaymondMik/claude-plugins
/plugin install dev-journal@raymondMik-plugins
```

## Layout

```
.claude-plugin/marketplace.json   marketplace manifest
plugins/<name>/                   one folder per plugin, each with its own .claude-plugin/plugin.json
```
