import { useState, useEffect, useRef } from "react";

const ENV_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

const GFONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap');`;

const EXAMPLES = [
  "personal knowledge management",
  "indie SaaS tooling",
  "freelance design workflow",
  "home brewing",
  "remote team async",
  "solopreneur finance",
];

const STEPS = ["Mapping subreddits", "Ingesting signal", "Extracting briefs"];

function buildSubredditPrompt(topic) {
  return `You are a Reddit research expert. Return the 6-8 subreddits where people who directly experience problems in the following space are most vocal about frustrations, workarounds, and unmet needs. Prioritize practitioner communities over observer communities.

Return ONLY a JSON object. No markdown. No explanation. No backticks. Just raw JSON:
{"subreddits":["sub1","sub2","sub3"]}

Topic: ${topic}`;
}

function buildExtractionPrompt(topic, subs) {
  return `You are a product researcher extracting validated opportunity signals from community data.

Use web search to find recent Reddit posts and comments about "${topic}" in these communities: ${subs.join(", ")}.

Look specifically for:
- Frustrated users describing what doesn't work
- Manual workarounds people have invented
- "I wish someone would build..." statements
- Tools people have abandoned with reasons why
- Paying customers describing unmet needs

Extract exactly 4 distinct product opportunities grounded in what you actually find.

Return ONLY a raw JSON array. No markdown. No backticks. No explanation. Just the array:
[{"problem_statement":"one sentence in plain user language","target_user":"behavioral description of who and in what context","frequency_signal":"rare|moderate|high","workaround_evidence":"exactly what people do instead — required, write none documented if absent","incumbent_gap":"specific reason existing tools fail","product_hypothesis":"start with a verb — one sentence on what to build","validation_questions":["q1","q2","q3"],"signal_strength":"weak|moderate|strong","raw_signal_count":0,"source_subreddits":["sub"]}]

Signal rules:
- strong = high frequency + workaround documented + multiple subreddits
- moderate = moderate frequency OR workaround OR single community
- weak = rare OR no workaround

Sort strong → moderate → weak.`;
}

function extractJSON(text) {
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) return arr[0];
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  return text;
}

async function callClaude(apiKey, systemPrompt, userMsg, useSearch = false, model = "claude-sonnet-4-20250514", maxTokens = 1000) {
  const body = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMsg }],
  };
  if (useSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return text.replace(/```json|```/g, "").trim();
}

function BriefCard({ brief, globalIdx, copiedIdx, onCopy }) {
  const s = brief.signal_strength || "weak";
  return (
    <div className={`card card-${s}`}>
      <button
        className={`copy-btn ${copiedIdx === globalIdx ? "copied" : ""}`}
        onClick={() => onCopy(brief, globalIdx)}
      >
        {copiedIdx === globalIdx ? "✓ copied" : "copy md"}
      </button>
      <div className={`sig-badge sig-${s}`}>
        <span className="sig-dot" />
        {s.toUpperCase()}
      </div>
      <p className="problem">{brief.problem_statement}</p>

      <div className="field">
        <span className="fkey">Who</span>
        <span className="fval">{brief.target_user}</span>
      </div>
      <div className="field">
        <span className="fkey">Workaround</span>
        <span className="fval">{brief.workaround_evidence}</span>
      </div>
      <div className="field">
        <span className="fkey">Gap</span>
        <span className="fval">{brief.incumbent_gap}</span>
      </div>

      <div className="hr" />

      <div className="field">
        <span className="fkey">Build</span>
        <span className="fval fval-build">{brief.product_hypothesis}</span>
      </div>

      <div className="hr" />

      <div className="field">
        <span className="fkey">Validate first</span>
        <div className="vqs">
          {brief.validation_questions?.map((q, i) => (
            <div key={i} className="vq">
              {q}
            </div>
          ))}
        </div>
      </div>

      {brief.source_subreddits?.length > 0 && (
        <div className="subs">
          {brief.source_subreddits.map((s) => (
            <span key={s} className="sub-tag">
              r/{s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState(ENV_API_KEY);
  const [liveSearch, setLiveSearch] = useState(false);
  const [view, setView] = useState("input");
  const [topic, setTopic] = useState("");
  const [step, setStep] = useState(0);
  const [subreddits, setSubs] = useState([]);
  const [visibleSubs, setVisibleSubs] = useState([]);
  const [briefs, setBriefs] = useState([]);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(null);
  const [phIdx, setPhIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % EXAMPLES.length), 2800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (view === "processing" && subreddits.length > 0) {
      setVisibleSubs([]);
      subreddits.forEach((s, i) =>
        setTimeout(() => setVisibleSubs((p) => [...p, s]), i * 280)
      );
    }
  }, [subreddits, view]);

  const scan = async () => {
    if (!topic.trim() || !apiKey.trim()) return;
    setView("processing");
    setStep(0);
    setSubs([]);
    setVisibleSubs([]);
    setBriefs([]);
    setErr("");

    try {
      const rawSubs = await callClaude(
        apiKey,
        buildSubredditPrompt(topic),
        `Topic: ${topic}`
      );
      const parsed = JSON.parse(extractJSON(rawSubs));
      const subs = parsed.subreddits || [];
      setSubs(subs);
      setStep(1);
      await new Promise((r) => setTimeout(r, 900));
      setStep(2);
      const searchSubs = subs.slice(0, 2);
      const rawBriefs = await callClaude(
        apiKey,
        buildExtractionPrompt(topic, searchSubs),
        `Research ${topic} in: ${searchSubs.join(", ")}`,
        liveSearch,
        "claude-sonnet-4-20250514",
        4096
      );
      const briefArr = JSON.parse(extractJSON(rawBriefs));
      setBriefs(Array.isArray(briefArr) ? briefArr : []);
      setView("results");
    } catch (e) {
      const msg = e.message || "";
      setErr(
        msg.includes("rate limit")
          ? "Rate limited. Wait 60 seconds and try again."
          : msg || "Signal extraction failed. Check API connection."
      );
      setView("error");
    }
  };

  const copyBrief = (b, i) => {
    const md = [
      `## ${b.problem_statement}`,
      ``,
      `**Who:** ${b.target_user}`,
      `**Frequency:** ${b.frequency_signal} · ${b.raw_signal_count} signals`,
      `**Workaround:** ${b.workaround_evidence}`,
      `**Gap:** ${b.incumbent_gap}`,
      `**Build:** ${b.product_hypothesis}`,
      `**Signal strength:** ${b.signal_strength}`,
      `**Sources:** ${b.source_subreddits?.map((s) => `r/${s}`).join(", ")}`,
      ``,
      `**Validate:**`,
      ...(b.validation_questions?.map((q) => `- ${q}`) || []),
    ].join("\n");
    navigator.clipboard.writeText(md);
    setCopied(i);
    setTimeout(() => setCopied(null), 2200);
  };

  const reset = () => {
    setView("input");
    setTopic("");
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const SIGNAL_EMOJI = { strong: "🟢", moderate: "🟡", weak: "⚫" };

  const downloadAll = () => {
    const renderBrief = (b) => [
      `## ${b.problem_statement} ${SIGNAL_EMOJI[b.signal_strength] || "⚫"}`,
      ``,
      `**Who:** ${b.target_user}`,
      `**Frequency:** ${b.frequency_signal} · ${b.raw_signal_count} signals`,
      `**Workaround:** ${b.workaround_evidence}`,
      `**Gap:** ${b.incumbent_gap}`,
      `**Build:** ${b.product_hypothesis}`,
      `**Signal strength:** ${b.signal_strength}`,
      `**Sources:** ${b.source_subreddits?.map((s) => `r/${s}`).join(", ")}`,
      ``,
      `**Validate:**`,
      ...(b.validation_questions?.map((q) => `- ${q}`) || []),
    ].join("\n");

    const date = new Date().toISOString().slice(0, 10);
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const header = [
      `# signal-to-brief: ${topic}`,
      `_Generated: ${date}_`,
      `_Subreddits: ${subreddits.map((s) => `r/${s}`).join(", ")}_`,
      `_Mode: ${liveSearch ? "live signal" : "standard"}_`,
      ``,
      `---`,
    ].join("\n");

    const body = [...strong, ...moderate, ...weak].map(renderBrief).join("\n\n---\n\n");

    const blob = new Blob([`${header}\n\n${body}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signal-to-brief-${slug}-${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const strong = briefs.filter((b) => b.signal_strength === "strong");
  const moderate = briefs.filter((b) => b.signal_strength === "moderate");
  const weak = briefs.filter((b) => b.signal_strength === "weak");

  const showKeyBar = !ENV_API_KEY;

  return (
    <>
      <style>{`
        ${GFONTS}
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #07090e; height: 100%; }

        .root {
          min-height: 100vh;
          background: #07090e;
          color: #cdd1de;
          font-family: 'DM Sans', sans-serif;
          padding-top: ${showKeyBar ? "48px" : "0"};
        }

        /* ── API KEY BAR ── */
        .api-key-bar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          background: #07090e;
          border-bottom: 1px solid #131724;
          padding: 10px 20px;
          display: flex; align-items: center; gap: 10px;
        }
        .api-key-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; color: #2a3050;
          letter-spacing: 0.08em; white-space: nowrap; flex-shrink: 0;
        }
        .api-key-input {
          flex: 1; max-width: 400px;
          background: #0c0e16;
          border: 1px solid #1c2035;
          border-radius: 6px;
          padding: 6px 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px; color: #edf0f7;
          outline: none;
          transition: border-color 0.2s;
        }
        .api-key-input:focus { border-color: #e8a435; }
        .api-key-input::placeholder { color: #1c2035; }

        /* ── GRID BG ── */
        .hero-bg {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image:
            linear-gradient(rgba(232,164,53,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(232,164,53,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
        }

        /* ── INPUT ── */
        .input-view {
          position: relative; z-index: 1;
          min-height: 100vh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 40px 20px;
        }
        .wordmark {
          font-family: 'Syne', sans-serif;
          font-weight: 800; font-size: 11px;
          letter-spacing: 0.3em; text-transform: uppercase;
          color: #e8a435; margin-bottom: 56px;
          display: flex; align-items: center; gap: 8px;
        }
        .wordmark-line {
          width: 24px; height: 1px; background: #e8a43560;
        }
        .headline {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: clamp(28px, 4.5vw, 52px);
          line-height: 1.12; text-align: center;
          color: #edf0f7; max-width: 580px;
          margin-bottom: 16px;
        }
        .headline em {
          font-style: normal; color: #e8a435;
        }
        .subhead {
          font-size: 15px; line-height: 1.65;
          color: #424860; text-align: center;
          max-width: 420px; margin-bottom: 44px;
        }
        .input-wrap {
          width: 100%; max-width: 540px; position: relative;
        }
        .text-input {
          width: 100%;
          background: #0c0e16;
          border: 1px solid #1c2035;
          border-radius: 14px;
          padding: 17px 118px 17px 20px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px; color: #edf0f7;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .text-input:focus {
          border-color: #e8a435;
          box-shadow: 0 0 0 3px rgba(232,164,53,0.08);
        }
        .text-input::placeholder { color: #252a3c; }
        .scan-btn {
          position: absolute; right: 6px; top: 50%;
          transform: translateY(-50%);
          background: #e8a435; color: #07090e;
          border: none; border-radius: 10px;
          padding: 9px 18px;
          font-family: 'Syne', sans-serif;
          font-weight: 700; font-size: 12px;
          letter-spacing: 0.08em; cursor: pointer;
          transition: background 0.15s, transform 0.1s;
        }
        .scan-btn:hover { background: #f5be5a; }
        .scan-btn:active { transform: translateY(-50%) scale(0.97); }
        .scan-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .examples {
          display: flex; flex-wrap: wrap;
          gap: 7px; justify-content: center;
          margin-top: 18px; max-width: 540px;
        }
        .ex-chip {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px; color: #272d42;
          background: #0c0e16;
          border: 1px solid #181d2c;
          border-radius: 5px; padding: 4px 10px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .ex-chip:hover { color: #e8a435; border-color: #3a2c08; }

        /* ── MODE TOGGLE ── */
        .mode-row {
          width: 100%; max-width: 540px;
          margin-top: 14px;
          display: flex; flex-direction: column; align-items: flex-start; gap: 7px;
        }
        .mode-chips { display: flex; gap: 6px; }
        .mode-chip {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
          color: #252d44; background: #0c0e16;
          border: 1px solid #151928; border-radius: 5px;
          padding: 5px 12px; cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          touch-action: manipulation;
        }
        .mode-chip:hover { color: #4a5270; border-color: #252d44; }
        .mode-chip:focus-visible { outline: 1px solid rgba(232,164,53,0.4); outline-offset: 2px; }
        .mode-chip.mode-on { color: #5a6480; border-color: #2a3050; background: #0a0c14; }
        .mode-chip.mode-on-live { color: #e8a435; border-color: #6b4a10; background: #0b0800; }
        .mode-chip.mode-on-live:hover { color: #f5be5a; }
        .mode-cost {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px; color: #4a2c08; letter-spacing: 0.07em;
          animation: floatIn 0.2s ease both;
        }

        /* ── PROCESSING ── */
        .proc-view {
          position: relative; z-index: 1;
          min-height: 100vh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 40px 20px;
        }
        .proc-label {
          font-family: 'Syne', sans-serif;
          font-weight: 700; font-size: 20px;
          color: #edf0f7; margin-bottom: 44px;
          text-align: center;
        }
        .proc-label span { color: #e8a435; }
        .steps {
          width: 100%; max-width: 380px;
          display: flex; flex-direction: column; gap: 10px;
          margin-bottom: 40px;
        }
        .step {
          display: flex; align-items: center; gap: 12px;
          padding: 11px 16px; border-radius: 9px;
          border: 1px solid #161b28;
          background: #090b11;
          transition: all 0.3s ease;
        }
        .step.active { border-color: #c87d20; background: #100c02; }
        .step.done { border-color: #14532d; background: #080d0b; }
        .step-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #1c2035; flex-shrink: 0;
          transition: background 0.3s;
        }
        .step.active .step-dot {
          background: #e8a435;
          animation: blink 1.1s ease-in-out infinite;
        }
        .step.done .step-dot { background: #22c55e; }
        .step-txt {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px; color: #2a3050; letter-spacing: 0.04em;
          transition: color 0.3s;
        }
        .step.active .step-txt { color: #e8a435; }
        .step.done .step-txt { color: #22c55e; }
        @keyframes blink {
          0%,100% { opacity:1; } 50% { opacity:0.25; }
        }
        .sub-stream {
          width: 100%; max-width: 380px; min-height: 96px;
        }
        .sub-line {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px; color: #1e4d7a;
          padding: 3px 0;
          animation: floatIn 0.35s ease both;
        }
        .sub-line::before { content: 'r/'; color: #152033; }
        @keyframes floatIn {
          from { opacity:0; transform:translateY(5px); }
          to { opacity:1; transform:translateY(0); }
        }

        /* ── RESULTS ── */
        .results-view { min-height: 100vh; }
        .results-header {
          padding: 28px 36px;
          border-bottom: 1px solid #101420;
          display: flex; align-items: center;
          justify-content: space-between;
          gap: 16px; flex-wrap: wrap;
        }
        .rh-title {
          font-family: 'Syne', sans-serif;
          font-weight: 800; font-size: 20px; color: #edf0f7;
        }
        .rh-meta {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; color: #2a3050; margin-top: 5px;
        }
        .rh-meta b { color: #e8a435; font-weight: 500; }
        .rh-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
        .new-scan {
          background: transparent;
          border: 1px solid #1c2035;
          border-radius: 8px; padding: 8px 15px;
          font-family: 'Syne', sans-serif;
          font-weight: 700; font-size: 11px;
          letter-spacing: 0.08em; color: #3a4260;
          cursor: pointer; transition: all 0.15s;
          white-space: nowrap;
        }
        .new-scan:hover { border-color: #e8a435; color: #e8a435; }
        .download-btn {
          background: transparent;
          border: 1px solid #3a2c08;
          border-radius: 8px; padding: 8px 15px;
          font-family: 'Syne', sans-serif;
          font-weight: 700; font-size: 11px;
          letter-spacing: 0.08em; color: #6b4a10;
          cursor: pointer; transition: all 0.15s;
          white-space: nowrap;
        }
        .download-btn:hover { border-color: #e8a435; color: #e8a435; }
        .section {
          padding: 28px 36px;
          border-bottom: 1px solid #0a0c12;
        }
        .sec-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; letter-spacing: 0.2em;
          text-transform: uppercase; margin-bottom: 18px;
        }
        .sec-label.sl-strong { color: #22c55e; }
        .sec-label.sl-moderate { color: #f59e0b; }
        .sec-label.sl-weak { color: #2a3050; }
        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 14px;
        }

        /* ── CARD ── */
        .card {
          background: #090b12;
          border: 1px solid #151928;
          border-radius: 12px;
          padding: 22px;
          position: relative;
          transition: border-color 0.2s;
        }
        .card:hover { border-color: #1e2438; }
        .card-strong { border-left: 2px solid #16a34a; }
        .card-moderate { border-left: 2px solid #d97706; }
        .card-weak { border-left: 2px solid #1c2035; }
        .copy-btn {
          position: absolute; top: 14px; right: 14px;
          background: transparent;
          border: 1px solid #151928;
          border-radius: 5px; padding: 3px 9px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; color: #252d44;
          cursor: pointer; transition: all 0.15s;
        }
        .copy-btn:hover { border-color: #e8a435; color: #e8a435; }
        .copy-btn.copied { border-color: #22c55e; color: #22c55e; }
        .sig-badge {
          display: inline-flex; align-items: center;
          gap: 5px; margin-bottom: 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px; letter-spacing: 0.12em;
          border-radius: 3px; padding: 2px 7px;
        }
        .sig-strong { background:#091209; color:#22c55e; border:1px solid #14532d; }
        .sig-moderate { background:#100c00; color:#f59e0b; border:1px solid #78350f; }
        .sig-weak { background:#090b12; color:#2a3050; border:1px solid #151928; }
        .sig-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: currentColor; flex-shrink: 0;
        }
        .problem {
          font-family: 'Syne', sans-serif;
          font-weight: 700; font-size: 14px;
          color: #edf0f7; line-height: 1.45;
          margin-bottom: 18px; padding-right: 40px;
        }
        .field { margin-bottom: 10px; }
        .fkey {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px; letter-spacing: 0.12em;
          text-transform: uppercase; color: #1e2640;
          display: block; margin-bottom: 3px;
        }
        .fval {
          font-size: 12px; color: #5a6480; line-height: 1.55;
        }
        .fval-build {
          font-size: 13px; color: #b8bdce;
          font-weight: 500; line-height: 1.5;
        }
        .hr {
          height: 1px; background: #0f1220; margin: 14px 0;
        }
        .vqs { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
        .vq {
          font-size: 11px; color: #363d56;
          padding-left: 14px; position: relative; line-height: 1.5;
        }
        .vq::before {
          content: '→';
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          position: absolute; left: 0; top: 1px; color: #1e2640;
        }
        .subs {
          display: flex; flex-wrap: wrap;
          gap: 5px; margin-top: 14px;
        }
        .sub-tag {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px; color: #1e4d7a;
          background: #060912;
          border: 1px solid #0e1928;
          border-radius: 3px; padding: 2px 6px;
        }

        /* ── ERROR ── */
        .error-view {
          min-height: 100vh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 40px; text-align: center;
        }
        .err-msg {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px; color: #ef4444;
          margin-bottom: 24px; max-width: 400px;
          line-height: 1.6;
        }

        @media (max-width: 600px) {
          .results-header, .section { padding: 20px; }
          .cards { grid-template-columns: 1fr; }
          .headline { font-size: 28px; }
        }
      `}</style>

      {showKeyBar && (
        <div className="api-key-bar">
          <span className="api-key-label">ANTHROPIC KEY</span>
          <input
            className="api-key-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            spellCheck={false}
          />
        </div>
      )}

      <div className="root">
        <div className="hero-bg" />

        {/* ── INPUT VIEW ── */}
        {view === "input" && (
          <div className="input-view">
            <div className="wordmark">
              <div className="wordmark-line" />
              Signal-to-Brief
              <div className="wordmark-line" />
            </div>
            <h1 className="headline">
              Community pain.<br />
              <em>Product briefs.</em>
            </h1>
            <p className="subhead">
              Enter a problem space. We'll scan Reddit for real frustrations,
              workarounds, and unmet demand — then synthesize structured product opportunities.
            </p>
            <div className="input-wrap">
              <input
                ref={inputRef}
                className="text-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && topic.trim() && apiKey.trim() && scan()}
                placeholder={`e.g. ${EXAMPLES[phIdx]}`}
                autoFocus
              />
              <button
                className="scan-btn"
                onClick={scan}
                disabled={!topic.trim() || !apiKey.trim()}
              >
                SCAN →
              </button>
            </div>
            <div className="mode-row">
              <div className="mode-chips">
                <button
                  className={`mode-chip ${!liveSearch ? "mode-on" : ""}`}
                  onClick={() => setLiveSearch(false)}
                  aria-pressed={!liveSearch}
                >
                  Standard
                </button>
                <button
                  className={`mode-chip ${liveSearch ? "mode-on-live" : ""}`}
                  onClick={() => setLiveSearch(true)}
                  aria-pressed={liveSearch}
                >
                  Live Signal
                </button>
              </div>
              {liveSearch && (
                <span className="mode-cost">↑ uses additional API credits per scan</span>
              )}
            </div>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <div key={ex} className="ex-chip" onClick={() => setTopic(ex)}>
                  {ex}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PROCESSING VIEW ── */}
        {view === "processing" && (
          <div className="proc-view">
            <div className="proc-label">
              Scanning <span>"{topic}"</span>
            </div>
            <div className="steps">
              {STEPS.map((label, i) => (
                <div
                  key={label}
                  className={`step${i === step ? " active" : i < step ? " done" : ""}`}
                >
                  <div className="step-dot" />
                  <span className="step-txt">{label}</span>
                </div>
              ))}
            </div>
            {visibleSubs.length > 0 && (
              <div className="sub-stream">
                {visibleSubs.map((s) => (
                  <div key={s} className="sub-line">{s}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── RESULTS VIEW ── */}
        {view === "results" && (
          <div className="results-view">
            <div className="results-header">
              <div>
                <div className="rh-title">{topic}</div>
                <div className="rh-meta">
                  <b>{briefs.length}</b> briefs ·{" "}
                  <b>{subreddits.length}</b> subreddits ·{" "}
                  <b>{strong.length}</b> strong signal ·{" "}
                  <b style={{ color: liveSearch ? "#e8a435" : "#2a3050" }}>
                    {liveSearch ? "live signal" : "standard"}
                  </b>
                </div>
              </div>
              <div className="rh-actions">
                <button className="download-btn" onClick={downloadAll}>
                  ↓ DOWNLOAD MD
                </button>
                <button className="new-scan" onClick={reset}>
                  + NEW SCAN
                </button>
              </div>
            </div>

            {strong.length > 0 && (
              <div className="section">
                <div className="sec-label sl-strong">● Strong signal</div>
                <div className="cards">
                  {strong.map((b, i) => (
                    <BriefCard
                      key={i}
                      brief={b}
                      globalIdx={i}
                      copiedIdx={copied}
                      onCopy={copyBrief}
                    />
                  ))}
                </div>
              </div>
            )}

            {moderate.length > 0 && (
              <div className="section">
                <div className="sec-label sl-moderate">◐ Moderate signal</div>
                <div className="cards">
                  {moderate.map((b, i) => (
                    <BriefCard
                      key={i}
                      brief={b}
                      globalIdx={strong.length + i}
                      copiedIdx={copied}
                      onCopy={copyBrief}
                    />
                  ))}
                </div>
              </div>
            )}

            {weak.length > 0 && (
              <div className="section">
                <div className="sec-label sl-weak">○ Weak signal</div>
                <div className="cards">
                  {weak.map((b, i) => (
                    <BriefCard
                      key={i}
                      brief={b}
                      globalIdx={strong.length + moderate.length + i}
                      copiedIdx={copied}
                      onCopy={copyBrief}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ERROR VIEW ── */}
        {view === "error" && (
          <div className="error-view">
            <div className="err-msg">{err}</div>
            <button className="new-scan" onClick={reset}>
              ← TRY AGAIN
            </button>
          </div>
        )}
      </div>
    </>
  );
}
