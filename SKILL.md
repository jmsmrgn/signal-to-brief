---
name: signal-to-brief
description: Transforms real-time social signal from Reddit and other communities into structured product opportunity briefs. Use this skill whenever the user wants to find product ideas from Reddit, analyze pain points in a market, scan subreddits for opportunities, turn community complaints into product concepts, or do any form of social-signal-driven product research. Also triggers on phrases like "what are people complaining about in X", "find product ideas in X space", "scan Reddit for opportunities", or "what problems exist in X market". Always use this skill for these tasks — do not attempt them without it.
---

# Signal-to-Brief

Converts raw community signal from Reddit (and optionally Hacker News, Product Hunt, Dev.to) into structured product opportunity briefs using a 3-stage extraction chain.

## Prerequisites

Install both free MCP servers before running:

**RivalSearchMCP** (Reddit + HN + Product Hunt + Dev.to + Medium):
```bash
claude mcp add --transport http RivalSearchMCP https://RivalSearchMCP.fastmcp.app/mcp
```

**Reddit MCP Buddy** (deep Reddit — subreddit browsing, hot posts, search, comments):
```bash
claude mcp add --transport stdio reddit-mcp-buddy -s user -- npx -y reddit-mcp-buddy
```

---

## The 3-Stage Chain

### Stage 1: Subreddit Mapping

Given a topic/vertical, derive the 6-10 most signal-rich subreddits. Prioritize communities where users self-report problems, not communities where users discuss the topic academically.

**Prompt template:**
```
Topic: [USER_TOPIC]

Identify 6-10 subreddits where people who experience this problem domain are most likely to:
- Complain about specific failures
- Ask for help with workarounds
- Share frustrating experiences
- Request tools or solutions that don't exist

Return: subreddit names only, one per line, no r/ prefix.
Exclude: news/discussion subreddits where users analyze the topic rather than live it.
```

---

### Stage 2: Signal Ingestion

For each subreddit in the map, pull signal using both MCP servers. Target posts and comments containing high-frustration language.

**RivalSearchMCP queries to run (run all, one per subreddit):**
```
"[topic] frustrating site:reddit.com/r/[subreddit]"
"[topic] wish there was site:reddit.com/r/[subreddit]"
"[topic] anyone else hate site:reddit.com/r/[subreddit]"
"[topic] workaround site:reddit.com/r/[subreddit]"
```

**Reddit MCP queries to run:**
```
Get hot posts from r/[subreddit] — scan titles for pain language
Get top comments on high-engagement posts — workaround descriptions live here
```

**Signal language to flag and collect:**
- "I have to manually..."
- "I've been using [X] as a workaround but..."
- "Why doesn't [product] just..."
- "Anyone else dealing with..."
- "I wish someone would build..."
- "I've given up trying to..."
- "I pay for [X] but it still doesn't..."
- "Every time I have to [task] I want to..."

Collect raw signal as a list: [source, quote/paraphrase, upvotes/engagement indicator]

---

### Stage 3: Brief Extraction

Feed all collected signal into this extraction prompt. Run once after all signal is collected.

**Extraction system prompt:**
```
You are a product researcher extracting validated opportunity signals from community data.

INPUT: Raw signal from Reddit and social communities about [TOPIC].

TASK: Identify distinct product opportunities. Each opportunity must be grounded in multiple signal instances — do not invent opportunities not present in the data.

For each opportunity, extract:

{
  "problem_statement": "One sentence in the user's register, not product language",
  "target_user": "Behavioral description — what they're doing, not who they are demographically",
  "frequency_signal": "rare | moderate | high — based on distinct post/comment count",
  "workaround_evidence": "Exactly what people are doing instead. This is required. If no workaround is described, mark as 'none documented — validate before proceeding'",
  "incumbent_gap": "Why current tools fail this user — be specific, not generic",
  "product_hypothesis": "One sentence. What would you build. Start with a verb.",
  "validation_questions": ["2-3 questions to run in follow-up research before building"],
  "signal_strength": "weak | moderate | strong — based on: frequency + workaround evidence + engagement on related posts",
  "raw_signal_count": number,
  "source_subreddits": ["list"]
}

SCORING RULES:
- signal_strength = strong only if: frequency is high AND workaround evidence exists AND multiple subreddits surface the same signal
- signal_strength = moderate if: frequency is moderate OR workaround exists but signal is isolated to one community
- signal_strength = weak if: frequency is rare OR no workaround documented

Sort output: strong → moderate → weak.
Return as JSON array.
```

---

## Output Format

Render briefs to the user as a structured list, sorted by signal_strength. For each brief:

```
## [problem_statement]

**Who:** [target_user]
**Signal:** [frequency_signal] · [raw_signal_count] instances · [source_subreddits]
**Workaround:** [workaround_evidence]
**Gap:** [incumbent_gap]

**Build:** [product_hypothesis]

**Validate first:**
- [validation_questions[0]]
- [validation_questions[1]]
- [validation_questions[2]]

Signal strength: [signal_strength]
---
```

Deliver all strong briefs first, then moderate, then weak. Do not editorialize or add commentary between briefs — let the signal speak.

---

## Usage Examples

```bash
# Scan a vertical
"Run signal-to-brief on the indie SaaS / bootstrapped founder tooling space"

# Specific problem area
"signal-to-brief: what are the biggest pain points in Shopify app development"

# Competitive research angle
"Use signal-to-brief to find gaps in the project management tool space"
```

---

## Notes

- Stage 2 is the most time-intensive. For broad topics, cap at 5 subreddits per run to keep output quality high.
- Workaround evidence is the strongest validation signal in the dataset. A community describing a workaround is a community that has already validated demand and found no satisfying solution.
- Re-run against the same vertical every 4-6 weeks. Signal shifts. What's "no solution" today may have an incumbent next month.
- For B2B verticals, supplement Reddit with Hacker News via RivalSearchMCP — HN comments on relevant Show HN posts are dense with product feedback.
