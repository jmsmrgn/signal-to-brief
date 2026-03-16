# Gemini CLI — Platform Adapter for signal-to-brief

This file is loaded automatically by Gemini CLI when this skill is active. It maps Claude Code tool names used in SKILL.md to their Gemini CLI equivalents and provides Gemini-specific MCP configuration.

## Tool name mapping

| SKILL.md references (Claude Code) | Gemini CLI equivalent |
|-----------------------------------|-----------------------|
| `Write` | `write_file` |
| `Read` | `read_file` |
| `Edit` | `replace` |
| `Bash` | `run_shell_command` |
| `Glob` | `glob` |
| `Grep` | `grep_search` |
| `mcp__obsidian__write_note` | `mcp__obsidian__write_note` (same — MCP tool names are platform-agnostic) |
| `mcp__reddit-mcp-buddy__*` | `mcp__reddit-mcp-buddy__*` (same) |
| `mcp__RivalSearchMCP__*` | `mcp__RivalSearchMCP__*` (same) |

## MCP server setup for Gemini CLI

Add to `~/.gemini/settings.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "reddit-mcp-buddy": {
      "command": "npx",
      "args": ["-y", "reddit-mcp-buddy"]
    },
    "RivalSearchMCP": {
      "url": "https://RivalSearchMCP.fastmcp.app/mcp"
    },
    "obsidian": {
      "command": "npx",
      "args": ["-y", "mcp-obsidian", "/path/to/your/vault"]
    }
  }
}
```

Obsidian MCP is optional. If not configured, skill output falls back to `write_file` in the current working directory.

## Output routing (Gemini-specific)

When writing briefs, check tool availability in this order:

1. `mcp__obsidian__write_note` available → write to vault at `signal-to-brief/briefs/[topic-slug]-[YYYY-MM-DD].md`
2. `write_file` available, no Obsidian → write to current working directory as `signal-brief-[topic-slug]-[YYYY-MM-DD].md`
3. Neither → render briefs in chat

## Skill activation

This skill is invoked via:

```
gemini skills install https://github.com/jmsmrgn/signal-to-brief
```

Then trigger with natural language matching the skill description — e.g., "Run signal-to-brief on the home improvement space" or "find product gaps in X market".
