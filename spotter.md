# SharpClaw — a skill-decay guardian for any AI agent

*Claude Code · Gemini CLI · Codex · OpenClaw — one MCP server, one menu-bar app, one skill ledger*

*Hackathon build plan · July 2026*

**One-liner:** OpenClaw does your work. SharpClaw makes sure you still can.

**Tagline:** *Delegation without decay.*

---

## 0. The idea in one breath

OpenClaw made total delegation real: a self-hosted agent that lives in your chat apps, runs your errands, writes your code, drafts your emails, and never sleeps. Every task it takes is a task you no longer practice. SharpClaw is an agent-agnostic guardian — an MCP server + menu-bar app that plugs into Claude Code, Gemini CLI, Codex, OpenClaw, or anything else that speaks MCP — that (1) watches what you delegate across *all* your agents, (2) models which of *your* abilities are decaying and how fast, and (3) keeps the ones your work depends on alive through tiny, perfectly-timed practice woven into your real work — not flashcards. It is personalized (per-skill forgetting curves fit to you), self-improving (it literally rewrites its own heuristics nightly), and fully local.

### The theoretical hook — lead the pitch with this

In learning science, scaffolding only works because it **fades**. The defining property of a scaffold is that it is *temporary* — support is gradually withdrawn as the learner gains competence, which is what produces independent skill (Wood, Bruner & Ross, 1976; Puntambekar & Hubscher, 2005; HPL Unit 1.4.4 defines fading as "the process of gradually diminishing scaffolds... as the learner attains the skills and abilities to accomplish a task independently").

**An AI agent is a scaffold that never fades.** It is permanent, maximal support with zero handover plan. Learning theory therefore makes a precise prediction: skills under permanent full support don't just fail to grow — the ones you already had atrophy, because retrieval and practice stop. In 2025, the empirical evidence for exactly this arrived (see §1). SharpClaw's job in one sentence: **put the fading back into the agent.**

---

## 1. The problem: evidence stack

### 1.1 Peer-reviewed evidence that AI assistance erodes human skill

| Finding | Source |
|---|---|
| Endoscopists' adenoma detection rate in *unassisted* colonoscopies dropped (~28% → ~22%) after months of routine AI-assisted work — first real-world clinical deskilling result | Budzyń et al., *The Lancet Gastroenterology & Hepatology*, 2025 |
| 319 knowledge workers: higher confidence in GenAI → measurably less critical-thinking effort; work shifts from doing to "stewardship"/verification | Lee et al. (Microsoft Research/CMU), *CHI 2025* |
| EEG study: LLM-assisted essay writers showed weaker neural connectivity and worse recall/ownership of their own text — "cognitive debt" that persisted after the tool was removed | Kosmyna et al. (MIT Media Lab), 2025 preprint, N=54 |
| High-schoolers with GPT-4 access: practice performance ↑ ~48%, but exam performance (tool removed) ↓ ~17%. **Crucially: a guardrailed "GPT Tutor" variant eliminated the harm.** Design decides whether AI help hurts. | Bastani et al., *PNAS*, 2025 (Wharton field experiment) |
| Skilled consultants "fall asleep at the wheel" and underperform on tasks just outside the AI's frontier | Dell'Acqua et al., HBS working paper (BCG study), 2023 |
| Manual flying skills measurably degrade under cockpit automation; FAA formally urges airlines to schedule manual-flying practice | Casner, Geven, Recker & Schooler, *Human Factors*, 2014; FAA SAFO 13002 (2013) |
| Skill decay is steep with time-since-practice; cognitive and procedural tasks decay fastest — a pre-AI baseline for what non-use does | Arthur, Bennett, Stanush & McNelly, meta-analysis, *Human Performance*, 1998 |
| Habitual GPS use predicts worse hippocampus-dependent spatial memory, with decline over time | Dahmani & Bohbot, *Scientific Reports*, 2020 |
| "Google effect": we remember *where* to find information rather than the information itself | Sparrow, Liu & Wegner, *Science*, 2011 |
| Searching online inflates people's illusion of their *own internal* knowledge — offloading corrupts self-assessment | Fisher, Goddu & Keil, *JEP: General*, 2015 |
| GenAI raises individual output quality while shrinking the collective diversity of what's produced | Doshi & Hauser, *Science Advances*, 2024 |
| The whole pattern was predicted 40 years ago: automation leaves humans with the hardest interventions precisely while eroding the manual skill needed to perform them — "ironies of automation" | Bainbridge, *Automatica*, 1983 |

> ⚠️ Verify tonight: double-check the exact Lancet percentages and the Bastani venue/figures before putting them on a slide (all of the above is from my training data, cutoff Jan 2026).

### 1.2 The pain in the wild (forums — grab 2–3 fresh quotes tonight for slides)

- **Developers:** the "Copilot pause" (waiting for autocomplete instead of thinking); recurring HN and r/ExperiencedDevs threads along the lines of "I can't write code without AI anymore"; juniors bombing whiteboard interviews; seniors reporting rusty debugging instincts. GitClear's industry reports show rising code churn/duplication in the AI era.
- **Pilots:** r/flying and PPRuNe threads on manual-skill rust; the famous 1997 American Airlines training talk "Children of the Magenta Line" — aviation is the community that's 20 years ahead of us on this problem, and its answer (mandated manual practice) is our product thesis.
- **Medicine:** post-Lancet anxiety among endoscopists/radiologists; med students worrying ChatGPT is eating their diagnostic reasoning.
- **Writers & students:** "I can't face a blank page anymore"; teachers describing homework-great/exam-collapse patterns (exactly the Bastani result).
- **Everyone:** "Google Maps ruined my sense of direction" — the universally relatable opener.
- **OpenClaw users specifically:** the Jan 2026 wave was full of joking-not-joking "my agent runs my life" posts. Nobody wants to give the agent back — which is exactly why the answer can't be "use it less." It has to be "delegate *and* retain."

Suggested search strings for tonight: `site:news.ycombinator.com copilot "can't code"` · `reddit ExperiencedDevs AI skill atrophy` · `"copilot pause"` · `lancet colonoscopy deskilling reaction` · `openclaw dependency`.

### 1.3 Long-term implications (the "why it matters" slide)

- **Individual:** cognitive debt (MIT); the **verification paradox** — supervising AI requires exactly the expertise that AI use erodes, so oversight quality silently decays while output volume grows; career fragility (interviews, certifications, outages, model/pricing changes); self-assessment corrupted (Fisher 2015) so you don't *notice* the decay; narrowing creative range (Doshi & Hauser).
- **Organizational:** the **apprenticeship gap** — juniors who never do the reps never become seniors; in 10 years, who reviews the AI? Brittle operations when automation fails (aviation's lesson, at org scale).
- **Societal:** safety-critical fields first (medicine, aviation, infrastructure); regulators will eventually act — the FAA already mandates manual-flying practice. **Positioning: SharpClaw is the FAA manual-flying rule for knowledge work, built into the agent itself.**

---

## 2. Why now

1. **The delegation firehose exists.** OpenClaw (ex-Clawdbot/Moltbot) became one of the fastest-growing open-source projects ever in early 2026; 24/7 personal agents went from demo to daily driver. (Verify current stars/API against the repo tonight — my snapshot is Jan 2026.)
2. **The evidence wave just landed.** 2025 delivered the first hard deskilling data: Lancet, CHI, MIT, PNAS. The problem stopped being hypothetical ~12 months ago.
3. **The agent has the perfect vantage point.** It sees every single task you offload — the exact behavioral signal needed to model your decay, with zero self-report. Nobody else in the stack has this data. Flip the agent's surveillance into the human's advantage.
4. **Guardrails are proven to work.** Bastani et al.: unstructured AI help hurt learning; the same model with tutor-style guardrails didn't. The fix is a *design layer*, and that layer doesn't exist for agents yet. That layer is SharpClaw.
5. **MCP became the lingua franca.** In under two years, every major agent surface — Claude Code, Gemini CLI, Codex, Cursor, OpenClaw — became an MCP client. A cross-agent guardian is newly buildable as *one* server, and only a third party can build it (see §6).

---

## 3. Theory → feature map (the research moat)

Every mechanic below is a direct implementation of a named, citable concept. This table *is* your "research-backed" slide.

| # | Concept (source · HPL unit) | What it says | SharpClaw mechanic |
|---|---|---|---|
| 1 | Scaffolding must fade (Wood, Bruner & Ross 1976; Puntambekar & Hubscher 2005 · **HPL 1.4.4**) | Support is temporary; withdrawal as competence grows is what builds independence | **Graduated Handover**: per-skill autopilot → copilot → manual dial; the agent deliberately hands sub-tasks back at your edge |
| 2 | Zone of Proximal Development (Vygotsky 1978 · **HPL 1.4.2**) | Target the band just beyond what you can do alone, with support available | Elo-style difficulty staircase per skill; hints on request, never preemptively |
| 3 | Testing effect / retrieval practice (Roediger & Karpicke 2006 · **HPL 2.2.3**) | Retrieval beats re-reading; "retrieving a fact... alters what we remember" | **Predict-then-Reveal** and micro-probes replace passive "review the agent's answer" |
| 4 | Spacing effect (**HPL 2.2.3**; Cepeda et al. 2006) | Distributed practice → durable retention | FSRS/HLR scheduler drives *when* each skill gets a rep, off its personal half-life |
| 5 | Interleaving (**HPL 2.2.3**; Rohrer & Taylor 2007) | Mixed practice forces discrimination of deep structure | Probes rotate across skills; never blocked drilling |
| 6 | Generation effect & pretesting (Slamecka & Graf 1978; Richland, Kornell & Kao 2009) | Attempting an answer first strengthens learning — even when the attempt is wrong | You always guess before the reveal; wrong guesses are framed as wins ("the attempt is the rep") |
| 7 | Hypercorrection (Butterfield & Metcalfe 2001) | High-confidence errors, once corrected, are remembered best | Each prediction captures a confidence rating; feedback spotlights confident misses |
| 8 | Feedback must accompany testing (**HPL 2.2.3**) | Retrieval without feedback can entrench errors | Grader always shows the agent's actual solution + a one-line delta immediately |
| 9 | Worked examples → completion problems (Sweller 1988; Renkl; van Merriënboer 4C/ID · **HPL 2.2.2**) | Fade support *inside* a task: full example → partial → independent; manage extraneous load, maximize germane load | **Completion Mode**: agent does 80%, deliberately leaves the pedagogically-loaded 20% for you |
| 10 | Protégé effect / learning by teaching (**HPL 2.2.3**) | Explaining deepens the explainer's retention | **Teach-back probes**: "in one sentence, why X over Y?" — graded against the agent's own reasoning |
| 11 | Active processing (**HPL 2.2.4**) | Learning requires manipulating knowledge, not receiving it | No intervention is ever "read this"; every one demands you *produce* something |
| 12 | Metacognition: monitoring + control (Scholer & Miele 2016 · **HPL 2.3.4**) | Accurate self-assessment drives self-regulated learning | Per-skill **calibration score** (confidence vs. accuracy, Brier-style); directly counters the AI-inflated illusion of knowledge (Fisher 2015) |
| 13 | Self-Determination Theory (Ryan & Deci 2000 · **HPL 2.3.1**) | Competence + autonomy + relatedness drive intrinsic motivation; controlling micro-management demotivates | **The Charter**: inferred defaults + one-tap override + full ledger in settings (autonomy = control, not questionnaires); skip-without-guilt; fitness framing, never remediation. HPL 2.3.1 literally notes micro-managers demotivate — so SharpClaw never nags |
| 14 | Self-efficacy (Artino 2012 · **HPL 2.3.1**) | Belief in task-specific ability sustains persistence | Streaks + visible retention gains; probes pitched for ~80% success |
| 15 | Authentic / situated learning (**HPL 2.3.3, 1.4.3**; Lave & Wenger) | Learning sticks when embedded in the real context of use | Every item is generated from *your* actual tasks, codebase, and emails — zero generic flashcards, zero content authoring |
| 16 | Deliberate practice (**HPL 2.4.1**; Ericsson et al. 1993) | Targeted, effortful practice on unmastered sub-skills, with feedback, guided by a coach | Blind-spot detector aims probes at your weakest sub-skills; the agent *is* the coach with perfect knowledge of the task. (HPL 2.4.1's own example: pilots + flight simulators.) |
| 17 | Expertise & knowledge organization (**HPL 2.4.2**) | Experts differ in *organization* of knowledge, built gradually | Teach-back probes target structure ("why"), not trivia ("what") |
| 18 | Cognitive forcing functions & overreliance (Buçinca, Malaya & Gajos, CSCW 2021; Passi & Vorvoreanu 2022) | Forcing analytic engagement reduces overreliance on AI — but users dislike being forced | We invert it: opted-in, budgeted, gamified forcing. **Spot-the-Flaw** runs only in a consented review dojo, and the bandit prunes formats you dislike |
| 19 | Interruptibility & mixed-initiative (Iqbal & Bailey, CHI 2006/2008; Horvitz 1999) | Interrupt at task breakpoints; weigh utility of action against cost of interruption | Probes fire only at task-completion/idle boundaries, under a hard daily budget |
| 20 | Just-In-Time Adaptive Interventions (Nahum-Shani et al. 2018, mHealth) | Deliver the right support at moments of receptivity, adapting on tailoring variables | The entire decision layer is a textbook JITAI: decision points, tailoring variables, adaptive policy |
| 21 | Calm technology (Weiser & Brown 1996) | Live in the periphery; move to the center only when needed | Ambient Skill Health panel + weekly digest are the default; inline probes only where opted in |

---

## 4. Product & UX plan

### 4.1 Persona for the demo

An OpenClaw power user doing knowledge work. Demo on a developer (debugging, SQL, code review) plus one writing skill (e.g., investor updates) — relatable to judges, obviously generalizable to any delegated skill.

### 4.2 Product flow v2: value in minute one, zero questionnaires

Two flaws killed the v1 flow: an observe-only week is a value-prop death sentence, and interviewing people about every skill is both creepy and effortful. Both are fixed by one observation: **the observation period already happened.** It's sitting on disk right now — Claude Code, Gemini CLI, Codex, and OpenClaw all persist session transcripts locally.

**Minute 1 — the Delegation Mirror.** On install, SharpClaw backfills weeks of existing transcripts from every agent it finds and renders: *"In the last 60 days you delegated 214 tasks: 71% of your SQL, 84% of your email drafting, 100% of your calendar math. Estimated retention on SQL debugging: 58% and falling."* Nobody has ever seen their own offloading quantified. This is the Spotify-Wrapped moment — instant, zero-effort, screenshotable — and it happens before the user has answered a single question.

**Minute 2 — the auto-charter.** SharpClaw never asks "which skills matter to you?" It infers:

- **Who you are:** OpenClaw already maintains user context/memory; a resume in the workspace, email signature, calendar titles, or repo languages all add signal. All local.
- **What that role needs:** map the inferred role onto an occupational skill profile using O*NET (free, downloadable US Dept. of Labor database: occupation → skills with importance weights; ESCO for Europe). A "founder-engineer" comes back with debugging, system design, persuasive writing, financial modeling, negotiation.
- **What you're actually offloading:** delegation intensity per skill, straight from the logs.

Cross importance × delegation into the default policy:

| | High delegation | Low delegation |
|---|---|---|
| **High occupational importance** | 🔒 Auto-protect | 👁 Watch (still naturally practiced) |
| **Low occupational importance** | 📦 Let go, guilt-free | Ignore |

One confirmation card — *"You look like a founder-engineer. Protecting these 6: debugging, SQL, system design, persuasive writing, financial modeling, negotiation. Tap any to change."* — and onboarding is done. The **full skill ledger** (every tracked skill, its status, its curve, its history) lives in settings for viewing and overriding anytime. Smart defaults + total visibility + one-tap override preserves SDT autonomy without a questionnaire: autonomy means *control*, not *paperwork*.

This is also straight HPL Module 5: Unit 5.1.3 puts the burden of learner-and-context analysis on the **designer**, who gathers *available* data to build a learner profile that informs individualized design — it explicitly does not require interrogating the learner. SharpClaw is a learner-and-context analysis that runs itself.

**Hour 1 — the first rep.** FSRS ships with population priors, so scheduling works immediately; the very next task you delegate carries a wait-state bet (§4.3). The personalization ("incubation") didn't disappear — it moved **to the past** (log backfill) and **to the background** (curves and bandit fit online while value is already flowing). No dead week.

### 4.2.1 How "valuable" is computed: bottom-up list, top-down ranking

The trap to avoid: no generic taxonomy can define "valuable" for everyone. O*NET's profile for an engineer says "Programming"; for a pharmaceutical researcher it says "Science" — far too coarse to ever generate a rep from. So the skill list itself is never taken from a taxonomy. It is **derived bottom-up from your own transcripts, and only ranked top-down.**

**1. The list is emergent.** Embed and cluster the delegated tasks in your transcripts; an LLM names each cluster at practice-able granularity. The engineer's clusters come out as "debugging race conditions," "SQL analytics," "system-design tradeoffs." The pharma researcher's come out as "dose–response experiment design," "statistical power analysis," "regulatory summary writing," "literature synthesis." Different professions get different lists *by construction*, with zero profession-specific engineering — the taxonomy is your own work, mirrored back at you.

**2. The ranking blends three priors.**
- **Current role:** each emergent cluster maps to its nearest O*NET/ESCO skills and inherits an importance weight for your inferred occupation. O*NET is a *prior over the ranking*, never the list.
- **Regulatory & professional maintenance requirements**, where they exist: physicians have CME, lawyers have CLE, pilots have currency minima, GxP roles have mandated refresher training. Regulated professions literally publish their must-not-decay lists — a design shortcut now, the enterprise wedge later.
- **Trajectory:** where you're *going*, not just where you are — resume arc and goals you've stated to your agents ("prepping for staff interviews," "moving toward comp bio") up-weight target-role skills. Preserving for the next career is a first-class reason, not an afterthought.

**3. Every surfaced skill carries a why-chip** — the four legitimate reasons to protect anything:

| Chip | Meaning | Engineer / pharma researcher example |
|---|---|---|
| 🛡 Verification | You still audit what you delegate here and errors are costly — the verification paradox makes these near-mandatory defaults | reading diffs, debugging / statistical & methods review of AI-run analyses |
| 🏛 Career capital | What your title, license, or reputation rests on | system design / experimental-design judgment |
| 🧭 Trajectory | Needed for where you're going | staff-interview system design / comp-bio modeling |
| 💙 Chosen | You added it because you care | "I just like writing" |

Protection score ≈ current-role importance + trajectory importance + delegation intensity + consequence-of-error, with user overrides absolute in both directions.

**4. Non-exhaustive by design: a watchlist, not an inventory.** Everything is *tracked* (full ledger in settings), but only the **top 5±2** by protection score are ever surfaced or probed. The dashboard is itself a learning artifact, so extraneous-load discipline applies to it too (HPL 2.2.2) — and HPL 5.2.3's scoping move is exactly this: generate candidate outcomes, then "merge or eliminate the excess to fit within scope." Progress reporting is exception-based: biggest decliner, biggest gainer, one suggestion. Nobody ever sees forty progress bars.

This completes the HPL Module 5 design chain, running automatically: learner-and-context analysis (5.1.3) → higher-order goals (the charter, 5.2.1) → specific aligned outcomes (the probes, 5.2.3) — auditable, because every probe traces back to a chartered skill and its why-chip.

### 4.3 Interventions v2: four surfaces, and typing is the last resort

Design law: **never ask a question in a popup when you can (1) use a wait the user already has, (2) accept a click they were already making, (3) hide the rep inside the deliverable itself, or (4) need no response at all.** Input hierarchy: click > drag > voice > type.

**Surface 1 — The Wait.** *Agent latency is free practice time.* An agent user stares at dozens of progress spinners a day — tests running, research grinding, a long task executing. That dead air is the one moment when practice costs literally zero productivity, because the alternative was watching a spinner. So the intervention isn't a popup; **it's a better loading screen.**

- **Call your shot:** while the agent fixes the bug, the task screen shows the repo tree — you *click* the file you suspect, drag a confidence slider, done. When the agent finishes, your bet resolves against reality, scored inline. A prediction market on your own agent, played entirely inside time you'd otherwise lose. (Generation + pretesting + calibration in one gesture.)
- **Rubber duck, reversed:** hands stay on the keyboard; the agent asks *by voice* mid-task — "while these tests run: why a queue over a cron here?" Answer out loud, or don't. Local ASR, reference-based grading. Feels like a pair programmer thinking with you, not a quiz. (Protégé effect, zero typing.)
- **Pre-flight checklist:** before a diff/report lands, three checkboxes — which files changed? what approach? which edge case is risky? The output then renders with your predictions scored in the margin. This converts the verification you *should* do anyway into structured retrieval — deliberately training the one skill the verification paradox says you can't afford to lose: auditing the AI.

**Surface 2 — The Reveal.** *Output delivery is a natural retrieval moment.*

- **The Veil:** the answer arrives behind a light blur with a one-line instinct prompt and a prominent "show now" button; it auto-reveals in ~10 seconds regardless. Taking the beat is the rep; skipping costs one click and zero guilt. The pause *is* the intervention.
- **Ship A or B:** occasionally the agent lays its solution beside one plausible alternative — one click: which ships? Comparative judgment forces discrimination of deep structure (the interleaving mechanism) at near-zero effort — and the click doubles as preference data that improves the agent itself. One rep, both parties get better.
- **Marginalia (no response needed):** small hover-cards in the margin of the agent's output — "you hit this same rounding pattern in March; recall the fix?" Covert retrieval cue, zero interaction required.

**Surface 3 — The Artifact.** *The deliverable is the exercise.*

- **The 20% gap:** no popup anywhere — the agent leaves a structured, cursor-focused gap *inside* the deliverable: a `TODO(you):` on the one tricky conditional; a highlighted blank where the investor ask goes. Filling the gap is simultaneously the work and the rep — a faded worked example that never announces itself as an "intervention."
- **Endgame mode:** the agent plays the boring 80% — repro built, logs isolated, twenty suspect lines highlighted — then offers the kill: *"Your move, or mine?"* One click. A chess puzzle assembled from your real work: setup cost zero, satisfaction maximal. This quietly solves the oldest failure mode of deliberate practice (HPL 2.4.1: challenging, targeted, feedback-rich — and historically abandoned because setup is tedious). **Agents are the first technology that can make deliberate practice the *fun* part**, because they eat the drudgery and serve you the decisive move.
- **Own-history simulator:** weekly, the agent reconstructs one real past incident as a two-minute replay you drive — a flight simulator built from your own black box (HPL 2.4.1's own pilot example, personalized).

**Surface 4 — The Periphery.** *No response, ever.* Menu-bar sparkline of skill health; retention ticks appended to commit messages; the weekly digest. Calm-tech awareness that never asks for anything.

**Pull, not just push:** a global hotkey (⌘⇧S) summons a rep on demand when *you* want one. Streaks live only here — the habit loop belongs to the user, not the notifier.

### 4.4 Non-intrusive UX principles (the explicit list for your slide)

1. **Ride existing surfaces.** Probes arrive in the chat thread you already share with your agent. No new app, no new tab.
2. **Waits and breakpoints only.** Primary venue: the agent's own latency (zero productivity cost by construction); otherwise task completion or idle (Iqbal & Bailey). Never mid-flow.
3. **Hard budget.** Default ≤2 probes/day, 90-second ceiling, one question each. Budget is user-set and sacred.
4. **Skip is data, not failure.** One-tap skip; three skips on a skill triggers "want to move this to 📦?" — not a guilt trip.
5. **Autonomy first (SDT).** Only charter skills are ever probed. "Stop tracking X" is honored instantly and permanently.
6. **Ambient over alert (calm tech).** The default channel is a weekly Skill Health digest; inline probes are opt-in per skill.
7. **Fitness framing, never remediation.** Copy says "want a rep?" — never "you're getting worse." (Loss-framed nagging = micro-manager = demotivation, per HPL 2.3.1.)

### 4.5 Skill Health digest (weekly, ambient)

Exception-based, never exhaustive: the digest leads with the biggest decliner, the biggest gainer, and one suggested action. Full per-skill detail (retention % and half-life trend · calibration · delegation ratio · top blind spot) sits one click deeper, and the monthly "you vs. 3 months ago" view is the artifact people will screenshot.

### 4.6 The desktop agent: SharpClaw lives in the menu bar

The right home for all of this is a **desktop tray/menu-bar agent**, not a chat thread. Calm technology (Weiser & Brown) says good tech lives in the periphery and moves to the center only when needed — and the menu bar *is* the periphery of the screen: permanently visible, never in the way. It also solves a practical problem: OpenClaw tasks run headless, so the wait-state surfaces need a system-level place to render.

Anatomy:

- **The icon is the ambient display.** A small claw glyph with a subtle ring encoding charter-skill health. No red badges, no counters — guilt UI is nagging, and nagging is the micro-manager that demotivates (HPL 2.3.1). Detail appears on hover.
- **The popover (one click):** today's skill weather · one suggested rep · Mirror and ledger links · budget slider · a prominent **Pause** ("crunch week — silence everything"), honored instantly and without comment.
- **The wait-card:** when the plugin signals task-start, a small non-modal card slides in at a screen corner (like macOS's screenshot thumbnail) carrying the Call-your-shot bet or the Veil. It never steals focus, auto-dismisses, and skipping is one click. Focus-stealing is the line between delightful and hateful; never cross it.
- **Context awareness:** respects macOS Focus/DND; **suppresses entirely during screen-sharing or recording** — nobody wants "your SQL retention is 41%" surfacing on a client call. (Say that line in the pitch; it lands and it signals taste.) Optionally reads calendar busy state.
- **Pull, not just push:** ⌘⇧S summons a rep on demand; streaks live only on the pull side.
- **Configuration stays boring.** Settings = ledger + budget + surfaces, nothing more. The auto-charter (§4.2) already did the real configuration — don't rebuild a preferences maze; "launch and configure" should feel like flipping three switches, not filling a form.

Build note: Electron + the `menubar` package is the fastest one-day path (single process: tray UI + transcript watcher + model in a worker). Tauri v2 is the smaller, faster production answer if someone on the team writes Rust — worth one sentence to judges.

---

## 5. Personalized & self-improving: three nested loops

**Loop 1 — the learner model (updates every interaction).**
Per (user, skill): a memory half-life fit to *your* forgetting curve — delegation events count as decay signal (no retrieval happened), practice outcomes count as strengthening. Plus an Elo-style difficulty rating and a Brier calibration score. This is genuine personalization: two users with identical jobs get different schedules because their curves differ.

**Loop 2 — the coach policy (updates daily).**
A contextual bandit (Thompson sampling) chooses {timing, modality, tone, difficulty} to maximize a composite reward: probe completion + engagement + retention delta on the *next* probe − annoyance signals (skips, mutes, snoozes). The coach learns that *you* answer code probes at 9am and ignore everything after 6pm — without being told.

**Loop 3 — the skill rewrites itself (nightly, the demo-magic moment).**
The guardian's pedagogy — directive templates, per-host instructions, probe heuristics — lives as plain markdown/config. A nightly reflection job reads the week's logs and **edits its own heuristics files**, committing the diff:

> `- Evening probes: 12% completion → restrict to 08:00–12:00`
> `+ User answers Rust probes in code blocks, not prose → switch probe format`

Showing that git diff on stage is your "self-improving" proof, and it takes 15 seconds.

---

## 6. Architecture v4: one brain, many mouths (MCP-first)

The guardian is a **single persistent local service** — it *is* the tray app process — that every agent connects to. This follows from the product truth: decay is a property of **you**, not of any one tool, so the skill model must be unified across agents. Per-agent plugins would fragment your ledger into vendor silos; the whole point is the cross-agent view.

Two honest facts about MCP must shape the design:

1. **MCP is client-driven.** Servers cannot initiate. Tools run only when the model chooses to call them, and the server never sees the conversation — only tool-call arguments. MCP alone can neither passively *observe* your delegation nor *fire* an intervention on schedule.
2. **Tool-invocation compliance varies by model.** "Call `task_started` when you begin a task" works often, not always — and a guardian that misses half your tasks has a broken decay model.

So: three layers, each doing what it's structurally good at.

**Layer 1 — Observation: deterministic, never dependent on model goodwill.**
- **Claude Code:** hooks (PreToolUse / PostToolUse / Stop) — deterministic shell callbacks; SharpClaw ships a one-line settings snippet.
- **OpenClaw / Gemini CLI / Codex CLI:** transcript watchers. All of them persist sessions to disk as JSONL/logs; a host adapter is ~30 lines (a path + a parser).
- The watcher is the universal backstop: it works even where hooks don't exist and survives any API change, because agents must persist their own sessions.

**Layer 2 — In-loop action: the MCP server.** Runs inside the tray-app process, exposed as **streamable HTTP on localhost** so every agent connects to the *same* brain (plus a tiny stdio shim for clients that only spawn stdio servers — never let per-client spawning fork the skill model into N copies). Tool surface:

- `task_started(description)` / `task_completed(solution, reasoning)` — event feed for hosts without hooks
- `get_practice_directive(task_context)` → returns plain-language instructions the agent executes: *"leave the tricky conditional as `TODO(you):`"*, *"hold your answer behind this one-line instinct prompt"*, *"offer the endgame handoff."* **This is the move that makes in-artifact interventions framework-agnostic: the pedagogy lives server-side as data, and any agent can execute a directive because a directive is just instructions.**
- `grade_attempt(user_answer)` — reference-based grading, server-side
- `get_skill_ledger()` / `update_charter(...)`
- The server's MCP `instructions` field (delivered at initialize) tells each host when to call what — the standard lever for shaping invocation, reinforced by deterministic hooks wherever they exist.

**Layer 3 — Presence: the desktop app (§4.6).** Wait-cards, the Veil, Mirror, and ledger all render in *our* tray app. MCP's elicitation/sampling support is uneven across clients, so nothing time-sensitive or interactive ever depends on a client's UI.

```
Claude Code ───hooks────────┐
Gemini CLI ───transcripts───┤        SharpClaw local service (= tray app)
Codex CLI ────transcripts───┼─────►   ├─ tagger · O*NET charter · FSRS ·
OpenClaw ─────transcripts───┘         │  bandit · SQLite (all on-device)
     ▲                                ├─ MCP server: streamable HTTP @
     │      MCP tools & practice      │  localhost (+ stdio shim)
     └────── directives ──────────────┤  events · directives · grading · ledger
                                      ├─ tray icon · wait-cards · Mirror
                                      └─ nightly Reflector (self-edits heuristics)
```

**The moat sentence for judges:** every vendor sees only its own slice of your delegation, and their engagement incentive points toward *more* offloading, not less. The cross-agent skill ledger — the actual measurement of *your* decay — can only exist as a user-owned, local, third-party layer. Structurally, this product can't be a feature of Claude Code or Gemini; it has to be SharpClaw.

**Implementation notes:** grading is reference-based (the agent already holds the correct solution), so small/local models suffice; everything stays on-device. Open-source components: MCP Python/TS SDK (FastMCP) · `open-spaced-repetition/py-fsrs` · `duolingo/halflife-regression` · `CAHLR/pyBKT` · ~50 lines of Thompson sampling · any Claude/local model for tagging, generation, grading.

> ⚠️ Verify tonight (my snapshot is Jan 2026): Claude Code hooks config keys; transcript paths for Gemini CLI, Codex, and OpenClaw; which clients accept streamable-HTTP MCP servers vs. stdio-only (shim covers the rest).

## 7. One-day build plan

| Hours | Deliverable |
|---|---|
| 0–1 | Scaffold: Electron + `menubar` tray app with embedded MCP server skeleton (FastMCP, streamable HTTP on localhost). Replay corpus: real/synthesized transcripts, 2 weeks, 5 skills |
| 1–3 | Skill core: tagger + O*NET auto-charter + FSRS with population priors + SQLite. Pipe the corpus through → **Mirror window renders — demoable** |
| 3–5 | Two host adapters live: Claude Code hooks snippet + one transcript watcher (OpenClaw or Gemini CLI) → real events flowing into one ledger |
| 5–7 | Interventions: wait-card **Call your shot** end-to-end on a Claude Code task; `get_practice_directive` producing a real in-artifact `TODO(you):` gap |
| 7–8 | The money shot rehearsed: task in agent A, task in agent B, **same ledger ticks twice**. Tray icon health states |
| 8–9 | Reflector self-edit diff + slides + demo run-through |

**Cut list if behind:** second adapter (demo one, then *show* the 30-line adapter file — "here's what Gemini support costs us"), the Veil (describe it), bandit (3 if-rules).
**Team split (if 3):** ① MCP server + skill core · ② adapters/hooks + tray & wait-card UX · ③ pitch + evidence + replay corpus.

## 8. Demo script (5 minutes)

1. **Cold open (30s):** "Raise your hand if Google Maps ruined your sense of direction. Now imagine that — for everything you're actually paid to be good at."
2. **Evidence (45s):** one slide — Lancet ~28→22%, CHI critical-thinking result, MIT cognitive debt, Bastani −17% *and* the guardrail fix.
3. **The insight (20s):** "Scaffolds work because they fade. An agent is a scaffold that never fades. We put the fading back."
4. **Live demo (2 min):** one install → claw icon in the menu bar → Mirror renders from real transcripts ('across your agents, you delegated 71% of your SQL') → delegate a bug fix in **Claude Code** → wait-card slides in: click the suspect file, drag confidence → bet resolves, ledger ticks → now delegate a writing task in **OpenClaw/Gemini** → **the same ledger ticks again**. One guardian, every agent, no typing anywhere, no agent modified.
5. **Skill Health digest + Charter (45s):** "You choose what to keep. It handles the rest."
6. **Self-improvement (30s):** show last night's git diff on its own heuristics file.
7. **Vision (30s):** "The FAA already mandates manual-flying practice for pilots. We're building that rule for knowledge work — and it ships *inside* the agent. Local, open, yours."

---

## 9. Anticipated judge Q&A

- **"Why keep skills the market is automating?"** Three reasons: the verification paradox (supervising AI requires exactly the expertise AI use erodes — Lee et al. shows work shifting to oversight); resilience (outages, model changes, interviews, certifications exist today); and autonomy — *the user chooses which skills matter*. We protect what you tell us to, including nothing.
- **"An engineer and a pharma researcher protect different things — how do you know what's valuable for each?"** We never impose a taxonomy. The list is clustered out of *your own* transcripts, so it's domain-correct by construction; ranking comes from three priors — current-role importance (O*NET as prior, not list), published maintenance requirements where they exist (CME, CLE, pilot currency, GxP), and stated or inferred career trajectory. Only the top 5±2 ever surface (§4.2.1).
- **"Won't people just skip the probes?"** Some will, and that's fine — SDT says forced practice backfires anyway. We serve people who've opted in per-skill, like a gym app serves people who chose the gym. The bandit optimizes for acceptance, and skip patterns gracefully retire skills to 📦.
- **"Isn't this just Anki/Duolingo for work?"** Anki has a content-authoring problem and a context problem. SharpClaw has zero authoring (items generated from your real tasks — situated learning, HPL 1.4.3/2.3.3), and its decay model is driven by observed delegation behavior, not self-report. Nobody else sits at the delegation chokepoint.
- **"Cognitive forcing is disliked (Buçinca 2021) — won't this annoy people?"** That finding is exactly why the design is opt-in, budgeted, breakpoint-timed, and bandit-pruned. We took the effective-but-disliked intervention and wrapped it in autonomy.
- **"Privacy?"** Fully local, matching OpenClaw's ethos. Your skill decay data is arguably the most sensitive career data that exists; it never leaves your machine.
- **"What happens when a host agent ships a breaking version?"** We fork nothing and patch no core. Each host costs us a ~30-line adapter reading its own transcript format (stable by necessity — agents must persist their sessions); hooks are a bonus where offered. If any single agent breaks or dies, the guardian and your ledger don't.
- **"MCP servers can't initiate — how do your interventions ever fire?"** Correct, and the architecture assumes it. Observation is deterministic (hooks and transcript watchers, never model goodwill); in-loop behavior is shaped by MCP server `instructions` + tool descriptions and reinforced by hooks; everything time-sensitive renders in our own desktop app. We never bet the UX on a model remembering to call a tool.
- **"Why won't Anthropic, Google, or OpenAI just build this?"** Each sees only its slice of your delegation, and their engagement incentive is more offloading, not less. The cross-agent, user-owned decay ledger is structurally a third-party, local product.
- **"How do you know the practice works?"** Testing/spacing effects are among the most replicated results in cognitive psychology (HPL Module 2 is built on them); Bastani shows guardrail design flips AI harm into neutral/positive; aviation shows mandated micro-practice maintains skill at scale.

## 10. Success metrics (2-week pilot targets)

Probe accuracy delta on 🔒 skills vs. observe-only baseline · Brier calibration improvement · ≥60% probe acceptance rate · median time cost <3 min/day · self-reported intrusiveness ≤2/5. **North star: retention half-life of charter skills.**

## 11. Business wedge (30-second version, if asked)

MCP-native from day one. Distribution beachheads: the OpenClaw skill/plugin community + Claude Code power users (a one-line hooks snippet is frictionless). Then: teams, and enterprise workforce-resilience in regulated industries, where aviation and medicine show the compliance demand is real and possibly coming by mandate. The cross-agent ledger is the defensible asset.

## 12. Name & one-liners

**Recommended: Sticktime** — "Pilots log stick time to stay rated. Sticktime gives knowledge workers theirs."

"Stick time" is aviation's term of art for the manual flying hours that prevent automation deskilling — meaning the name *carries the pitch*: your best narrative beat (FAA precedent, Children of the Magenta, Casner 2014) is baked into the brand, and the vision slide becomes the name explained. It's warm and human rather than another sharp-object dev-tool name, it verbs nicely in product copy ("get your stick time in", "12 min of stick time this week" in the tray tooltip), and it reads right in an MCP config: `"sticktime": {"url": "http://localhost:7777/mcp"}`. Availability (checked tonight): **npm FREE · PyPI FREE**, no notable product collision.

Runners-up:

| Name | Why | Availability / risk |
|---|---|---|
| **Melete** | The literal Greek muse of *practice* (sisters: Mneme = memory, Aoide = song) — elegant, story-rich | npm FREE · PyPI FREE; slightly obscure, needs one line of explanation |
| **Myelin** | The learning-science thesis in one word: practice wraps myelin, disuse strips it; skill *is* myelinated circuitry | bare name taken both registries; `myelin-mcp` free on npm only |
| **Hone** | Cleanest pure semantics ("hone a skill"), one syllable, config-native | bare taken both; `hone-mcp` free; adjacent-space conflict: Hone is an existing corporate-training company |
| **Whetstone** | "Many blades, one stone" fits multi-agent perfectly | taken on both registries; Whetstone Education exists (edu-space conflict) |
| **SharpClaw** | Keeps the OpenClaw-community wink | free on both, but now misbrands an agent-agnostic product |

Trademark and domain checks still needed (no web access from here) — see checklist.

---

## 13. Tonight's verification checklist

- [ ] Open the Luma page: theme, judging criteria, demo length, team rules → tune §8 accordingly
- [ ] Claim the chosen name tonight: publish a placeholder to npm + PyPI (sticktime was FREE on both as of this check), grab the GitHub org, check domains/trademark
- [ ] Confirm exact Lancet figures (Budzyń et al. 2025) and Bastani et al. venue/numbers
- [ ] Confirm Claude Code hooks config (event names, settings snippet) against current docs
- [ ] Locate transcript/session paths for Gemini CLI, Codex CLI, and OpenClaw on your machine; write the three ~30-line parsers' field maps
- [ ] Check which of your target clients accept streamable-HTTP MCP servers vs. stdio-only (shim if needed)
- [ ] Pull 2–3 verbatim forum quotes (search strings in §1.2)
- [ ] `pip install py-fsrs` and run the 10-line quickstart so hour 1–3 has no surprises
- [ ] Download an O*NET excerpt (occupation → skills + importance ratings) and cache it locally for the auto-charter

## 14. References

**Deskilling & offloading evidence:** Bainbridge (1983) *Automatica* · Arthur et al. (1998) *Human Performance* · Sparrow, Liu & Wegner (2011) *Science* · Casner et al. (2014) *Human Factors* · FAA SAFO 13002 (2013) · Fisher, Goddu & Keil (2015) *JEP: General* · Risko & Gilbert (2016) *TiCS* · Dahmani & Bohbot (2020) *Sci Reports* · Dell'Acqua et al. (2023) HBS WP · Doshi & Hauser (2024) *Science Advances* · Lee et al. (2025) *CHI* · Kosmyna et al. (2025) preprint · Budzyń et al. (2025) *Lancet Gastro Hep* · Bastani et al. (2025) *PNAS*.

**Learning science (HPL-anchored):** Vygotsky (1978) · Wood, Bruner & Ross (1976) · Puntambekar & Hubscher (2005) · Roediger & Karpicke (2006) · Cepeda et al. (2006) · Rohrer & Taylor (2007) · Slamecka & Graf (1978) · Richland, Kornell & Kao (2009) · Butterfield & Metcalfe (2001) · Bjork & Bjork (2011) · Sweller (1988) · Renkl (worked examples) · van Merriënboer & Kirschner (4C/ID) · Ericsson, Krampe & Tesch-Römer (1993) · Ryan & Deci (2000) · Artino (2012) · Scholer & Miele (2016) · Lave & Wenger (1991). Course units: HPL 1.4.2, 1.4.3, 1.4.4, 2.2.2, 2.2.3, 2.2.4, 2.3.1, 2.3.3, 2.3.4, 2.4.1, 2.4.2.

**HCI:** Horvitz (1999) *CHI* · Iqbal & Bailey (2006/2008) *CHI* · Buçinca, Malaya & Gajos (2021) *CSCW* · Passi & Vorvoreanu (2022) · Nahum-Shani et al. (2018) *Ann Behav Med* · Weiser & Brown (1996).

**ML & repos:** Corbett & Anderson (1995) BKT · Piech et al. (2015) NeurIPS DKT · Settles & Meeder (2016) ACL + `duolingo/halflife-regression` · `open-spaced-repetition/py-fsrs` · `CAHLR/pyBKT` · `VowpalWabbit`.
