# SIGNAL-TO-BRIEF

**Community pain → structured product briefs**

Scans Reddit for real frustrations, pulls workarounds and unmet demand, and turns them into structured product briefs — no API keys, paid services, or manual research required.

<table>
  <tr>
    <td width="33%"><a href="assets/screenshot-home.png"><img src="assets/screenshot-home.png" alt="Home" /></a></td>
    <td width="33%"><a href="assets/screenshot-scanning.png"><img src="assets/screenshot-scanning.png" alt="Scanning" /></a></td>
    <td width="33%"><a href="assets/screenshot-briefs.png"><img src="assets/screenshot-briefs.png" alt="Briefs" /></a></td>
  </tr>
</table>

---

## Why this exists

Most Reddit research tools stop at sentiment scores and ranked results. That's raw input, not a decision. The real signal is workarounds — when a community invents one, demand is proven and no solution owns the space. That's the premise this tool is built on.

---

## What it produces

Each brief contains:

| Field                  | What it tells you                                                                |
| ---------------------- | -------------------------------------------------------------------------------- |
| `problem_statement`    | The problem in plain user language, not product language                         |
| `target_user`          | Behavioral description — what they're doing, not who they are                    |
| `workaround_evidence`  | Exactly what people do instead. This is the validation signal.                   |
| `incumbent_gap`        | Why existing solutions fail this user specifically                               |
| `product_hypothesis`   | One-sentence build direction                                                     |
| `validation_questions` | What to verify before committing to build                                        |
| `signal_strength`      | `strong / moderate / weak` — scored by frequency + workaround + subreddit spread |

Briefs are sorted strong → moderate → weak.

---

## Two ways to run it

### Option A — Claude Code skill (recommended)

Install the two free MCP servers that power the data layer:

```bash
# RivalSearchMCP — Reddit, HN, Product Hunt, Dev.to, Medium
claude mcp add RivalSearchMCP --url https://RivalSearchMCP.fastmcp.app/mcp

# Reddit MCP Buddy — deep subreddit access, hot posts, search, comments
claude mcp add --transport stdio reddit-mcp-buddy -s user -- npx -y reddit-mcp-buddy
```

Add the skill:

```bash
npx skills add https://github.com/jmsmrgn/signal-to-brief --skill signal-to-brief
```

Then run it:

```
Run signal-to-brief on the indie SaaS / bootstrapped founder tooling space
```

```
signal-to-brief: what are the biggest pain points in indie SaaS tooling
```

```
Use signal-to-brief to find product gaps in the freelance design workflow space
```

---

### Option B — Standalone web UI

Drop `signal-to-brief.jsx` into any React environment. The UI calls the Anthropic API directly using web search — no MCP setup required. Bring your own Anthropic API key.

Works as a Claude artifact, in CodeSandbox, or in any React project.

---

## Signal scoring rules

```
strong   = high frequency + workaround documented + signal across multiple subreddits
moderate = moderate frequency OR workaround documented OR single community signal
weak     = rare signal OR no workaround documented
```

Only act on strong or moderate. Weak briefs are hypotheses worth filing, not building.

---

## Example output

See [`/examples`](/examples) for real runs against:

- `indie-saas-tooling.md` — indie SaaS / bootstrapped founder tooling
- `pkm-tooling.md` — personal knowledge management

Generated unedited from a single run. Quality varies by how active the vertical's practitioner communities are.

---

## Repo structure

```
signal-to-brief/
├── SKILL.md                  # Claude Code skill — drop into your skills directory
├── signal-to-brief.jsx       # Standalone React UI
├── README.md
└── examples/
    ├── indie-saas-tooling.md
    └── pkm-tooling.md
```

---

## Stack

- Data: [RivalSearchMCP](https://github.com/damionrashford/RivalSearchMCP) + [Reddit MCP Buddy](https://github.com/karanb192/reddit-mcp-buddy) — both free, zero auth
- Model: Claude Sonnet (via Anthropic API or Claude Code)
- UI: React, no dependencies beyond Anthropic API access

No paid data services required. No API keys beyond your existing Anthropic access.

---

## Limitations

- Works best in verticals where practitioners complain publicly — active subreddits where people describe real workflows, not communities that just discuss the topic from the outside.
- Web search variant (UI) pulls from indexed Reddit content — not real-time. MCP variant (Claude Code) has deeper access.
- The workaround evidence field will sometimes return "none documented" — this means validate before proceeding, not that no demand exists.
- Re-run against the same vertical every 4–6 weeks. Signal shifts.

---

## Running locally

**Prerequisites:** Node 18+, Anthropic API key with web search enabled

```bash
npm install
cp .env.example .env
# Add your key to .env: VITE_ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). If `VITE_ANTHROPIC_API_KEY` is not set, the UI prompts for the key at runtime — it persists in component state for the session but is never stored.

---

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jmsmrgn/signal-to-brief)

**Manual deploy:**

```bash
vercel --prod
```

Then set your API key in the Vercel dashboard under **Settings → Environment Variables**:

```
VITE_ANTHROPIC_API_KEY = sk-ant-...
```

> Note: web search capability (`web_search_20250305` tool) must be enabled on your API key for the extraction stage to work. Check your Anthropic console under API settings.

---

## Contributing

Open issues for verticals that produce weak output, extraction prompt improvements, or UI changes. PRs welcome.

---

## License

MIT
