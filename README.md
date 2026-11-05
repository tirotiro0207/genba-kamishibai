# genba-kamishibai

[![test](https://github.com/tirotiro0207/genba-kamishibai/actions/workflows/test.yml/badge.svg)](https://github.com/tirotiro0207/genba-kamishibai/actions/workflows/test.yml)

English | [日本語](README.ja.md)

> **Draft.** This README is being written. Numbers marked **TBD** are filled in at the end from the counting script. Anything marked **not built** does not exist yet. Progress: [docs/progress.md](docs/progress.md) · task list: [docs/plan.md](docs/plan.md).

## Try it

- Public demo: **https://genba-kamishibai.ikjshare.workers.dev** — opens on the fictional demo company. No sign-in, no PIN.
  - Look at the signed cards one by one, open the route from a picture back to its source sentence, and make a card from a short rule of your own (the demo has a daily cap).
  - Try it yourself the way the new hires did: "answer against the clock" and "answer from the picture only" (**not deployed yet** — on the next deploy).
- Company tenants are private. They open with two PINs: the tenant PIN, then the PIN of your role (author, supervisor, trainer or new hire).

![Compass: from rules in text and in people's heads (start) to signed cards (end). Quality goes up, quantity (information) goes right](docs/img/shinro.en.svg)

From rules that lived in text and in people's heads (start), fold the information into pictures without losing any of it (quality, quantity), and deliver it to new hires as signed cards (end). From there, spread to other industries and languages, and learn each company's wording (beyond the end).

Quality goes up, quantity (information) goes right. Progress per task: [docs/dashboard.html](docs/dashboard.html) · [docs/plan.md](docs/plan.md); the hand-drawn sketch: [docs/sketches/shinro.jpg](docs/sketches/shinro.jpg)

## The Problem

- On a construction site, the safety rules live in written manuals and in the heads of veteran workers.
- New hires from abroad often cannot read those rules in Japanese text.
- The people who train them have no time to make teaching material that actually gets through.

## Why I built this

- The author works with an electrical contractor (founded in 1923) that hires new staff from Vietnam.
- A rule that is misread on site can hurt someone. A picture card that a supervisor has checked and signed is safer than a machine translation nobody checked.
- The card's words are in plain Japanese only. A supervisor signs only what they have read and agreed with, so a translation the supervisor cannot read is not put on the card.
- Direction of the project: [docs/compass.md](docs/compass.md).

## What it does

Turns a rule written in Japanese (or spoken by a veteran) into a picture card — pictograms that show *what to do* and *why* — that can be read without Japanese text. Only cards that a supervisor has corrected and signed reach new hires.

The flow (details in [docs/flow.md](docs/flow.md)):

1. **Input** — paste or speak a rule, or attach a PDF of a manual (pages become images and numbered lines).
2. **Extraction** — Claude picks out the rules (what to do, what not to do, why), each tied to its line in the source. A person approves which ones become cards.
3. **Card making** — Claude writes the card's text and the keyframes of the pictogram figures as numbers; the app draws the picture. Every part of the picture keeps a **route** back to the sentence it came from.
4. **Checking** — a second Claude call looks only at the frames, guesses the meaning, and grades the card red / yellow / green. Red cards go to the top of the review queue.
5. **Human fixes** — a supervisor draws a box on the part that is wrong and says what to change; only that card is remade. Joints and props can also be moved by hand.
6. **Signature** — a supervisor signs with a finger or a stamp. There is a daily cap per supervisor, and the server refuses to hand out unsigned cards.
7. **Issue** — signed cards reach new hires one at a time, kamishibai-style. A card can be stopped (with a reason); new hires who saw it get a recall notice.

Screens (the fictional demo company; provisional — retaken once the pictures are final):

| | |
|---|---|
| ![Public demo entrance](docs/img/1-entrance.png) Public demo entrance | ![Card with its bands](docs/img/2-card.png) Card: the picture, the "unapproved draft" band and the checking band |
| ![Route](docs/img/3-route.png) Route: a part of the picture → its source line | ![Review queue](docs/img/4-queue.png) Review queue: red cards first |
| ![Signature](docs/img/5-sign.png) Signature with a stamp | ![Reading](docs/img/6-read.png) What a new hire sees: signed cards, one at a time |

Also built:

- Roles: author, two supervisors, trainer, new hire. Company tenants need a tenant PIN and a role PIN.
- Audit log: append-only, hash-chained record of each card (source → making → checking → human edits → signature), with a screen for supervisors and trainers.
- Folding screen: shows the source pages stacking up and folding into one card with no text.
- Answer recording app for the on-site check: timing (card vs. text), free answers, two graders, anonymized CSV export, erasing a participant who withdraws, and the trainer's forecast per card written before any answer comes in.
- Overnight sorting of a whole manual (which pages hold rules a worker must follow), with a supervisor screen to swap the answers.
- Reader panel: 24 simulated readers (country of origin × Japanese reading level × background), each a Claude Code subagent, used to find pictures that do not get through before the real check. Results: [docs/readers.md](docs/readers.md).
- MCP server: other tools can ask for cards; it can only make **unapproved drafts**.
- PNG / SVG export with version, signature date and frame number on each picture.

## How Claude is used

| Where | Model | What it does |
|---|---|---|
| PDF → text | Claude Opus 5.5 | Reads the page image only for pages with no text layer, and writes the text with line positions |
| Extraction | Claude Opus 5.5 | Picks out rules (what to do / not to do / why) with their source positions |
| Card making | Claude Opus 5.5 | Writes the keyframes and a route for every part of the picture, as numbers (it does not draw the picture directly) |
| Checking | Claude Opus 5.5 | Looks only at the frames and grades the card; it never sees the card's text |
| Word field | Claude Opus 5.5 | Writes short plain-Japanese lines from the card's text only (a Vietnamese line is also written and kept in the data, but not shown) |
| Overnight sorting | Claude Managed Agents | Reads a whole manual page by page and says which pages hold rules a worker must follow; resumable |
| Grading the extraction | Claude Sonnet 5.5 | Compares extracted rules with the evaluation answers |
| Reader panel | Claude Code subagents (Sonnet 5.5 by default) | Each simulated reader is one subagent; the model ID is kept with every answer |

- Every API call is logged with its cost, and each use has a spending cap (per call, per day, in total).
- The app itself was built with Claude Code.

### Running the whole program before spending on the API

Before the overnight run on the API, the same program was run end to end with only the calls to Claude swapped for `claude -p` (the Claude Code CLI on a subscription). Everything else stayed the same: the database writes, the resume logic, the checks. This finds bugs in the program itself (answers it cannot parse, resumes that drift, pages left out), not only in the prompts. Having Claude do the work by hand inside a chat would skip the program, so those bugs would stay hidden.

- Run: 109 pages sorted, 123 draft cards from 62 pages, 4 runs at once, stopped on purpose and resumed. Drift after the resume: 0.
- Problems found: 8. Fixed before the API run: 3 (parallel writes to the local database, a Vietnamese decimal comma read as a new number, no tool to count resume drift). The other 5 are written down with the reason they remain.
- Details: [docs/dry-run-063.md](docs/dry-run-063.md).

### What the supervisors' review showed about the AI

The extraction was tested on 30 items cut from Japanese laws and public materials (the evaluation data under Before / During), and two supervisors marked every answer. What the AI gets wrong, as found:

- Exceptions and supplements are often far from the sentence: later in the same paragraph, in another article, in an enforcement regulation or a ministry notice. The AI summarizes only the text in front of it, so it misses them. Cue words ("however", "except") catch some cases, not all.
- The "why" is usually not written in the source. The AI left it out; the supervisors added who and what the rule protects.
- Plain rewording can change the meaning (for example, "six months of continuous work" read as "never taking a day off").
- Tuning on 20 items raised their score from 0.81 to 0.96, but the 10 held-out items only moved from 0.79 to 0.80. The gain did not carry over.
- Examples taken from the test material make scores look better without showing real ability, so prompt examples come from outside it, and every prompt is checked for overlap with it.

Because of this, a supervisor's check is a step the system depends on, not an extra. Details: [docs/lessons-extraction.md](docs/lessons-extraction.md).

## Quick Start

Requires Node.js 24.

```bash
npm ci
```

```bash
npm test
```

To run the app locally, put `SESSION_SECRET` (any long random string) and `ANTHROPIC_API_KEY` in `.dev.vars`. `SESSION_SECRET` is required: without it, signing in with a role fails. Without the API key the app still starts and every screen opens, but calls to Claude (extraction, card making, checking) return 503. To start with only `SESSION_SECRET`:

```bash
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" > .dev.vars
```

 The names shown for each role (`SUPERVISOR_1_NAME`, `SUPERVISOR_2_NAME`, `TRAINER_NAME`, `AUTHOR_NAME`) also go in `.dev.vars`; if they are missing, the name is left blank. The local Node scripts in `scripts/` read `.env` instead (see `.env.example`).

```bash
npx wrangler d1 migrations apply DB --local
```

The fictional demo company's ten signed cards come as seed data (`demo/seed.sql`, fictional company only). Load them once, after the migrations, so its screens (`/` and "try it yourself") and their recorded tests (`demo`, `try`) work without an API key:

```bash
npx wrangler d1 execute DB --local --file demo/seed.sql
```

To make the demo cards again from scratch instead, the full pipeline calls Claude, so it needs `ANTHROPIC_API_KEY` (with `npm run dev` running): `BASE_URL=http://localhost:8787 npx tsx scripts/demo-cards.ts`, then `npx tsx scripts/demo-seed.ts` writes the seed file again.

```bash
npm run dev
```

Then open http://localhost:8787/#/t/practice/make (the practice tenant: no PIN). If port 8787 is taken, use `npm run dev -- --port 8799`.

Recorded browser tests (run one at a time; the local database does not take parallel writers). The first time, install the browser:

```bash
npx playwright install chromium
```


```bash
npx playwright test --workers=1
```

### Use it from other tools (MCP)

The Worker is also an MCP server (Streamable HTTP) at `/mcp/<tenant>`. Ask "turn this document into cards" and the same pipeline runs: extraction → approval of the chosen rules → card making. There is no tool for signing, approving or stopping, and calls that try are refused. A supervisor signs on the screen.

- Each company tenant needs its own key, sent as `Authorization: Bearer <key>`. Only the fictional demo company works without a key.
- Make a key for a local tenant (the key is written only to `private/tenants/<tenant>-mcp.json`; the database keeps its hash):

```bash
npx tsx scripts/add-mcp-key.ts practice
```

```bash
claude mcp add --transport http genba http://localhost:8787/mcp/demo
```

- Tools: `list_documents`, `doc_to_cards`, `extract_rules`, `make_drafts`, `get_card`.

## Before / During

What existed before the build period (2026-11-02) and what was made during it.

**Before**

- Evaluation data (`eval/`): 30 source sentences chosen by the author from Japanese occupational-safety law and public materials of the Ministry of Health, Labour and Welfare; the source is on each line. The answers were drafted by the author with AI assistance and are being reviewed by two site supervisors. 20 items are used for tuning; 10 are kept apart for the final check (only their hashes are in the repository). None of the 30 answers is in any prompt or example.
- Hand-drawn sketches (`docs/sketches/`), drawn by the author. The pictogram parts were adjusted to match them.
- The pilot company's safety manual. It is the company's document, so it is not in this repository; cards made from it live only in that company's private tenant.

**During**

- All code was written from scratch. No code or HTML made before the build period was brought in.
- All production prompts were written from scratch.
- The Vietnamese in each card's word field was translated by Claude and collected in a small glossary (Japanese · Vietnamese · which card uses it). It is kept in the data but not shown on the cards until a Vietnamese speaker has checked it.

## Disclosure

The author provides a separate paid translation service to the company where this was piloted (an electrical contractor founded in 1923). So that the results cannot be tilted in the author's favor, every new hire's answer is recorded by the app itself (append-only — no edits, no deletions), and the answers of those who agree to publication are published anonymously in `docs/answers.csv`.

This product deliberately has no translation feature, so that nothing a supervisor cannot read and check reaches the new hires.

The author intends to offer this as a hosted service in the future (MCP access uses a separate key for each company).

## Who it is for

TBD — one paragraph: who pays (companies that hire workers from abroad, starting with electrical work), what they pay for (turning their own manuals into signed picture cards, with an audit trail), and what stays free.

## Numbers

| | |
|---|---|
| First commit | 2026-11-02 13:21 (JST) |
| Commits | TBD |
| Tests | TBD |
| Pictures understood by new hires (picture only) | TBD |
| Dangerous misreadings | TBD |
| Time to understand: card vs. text | TBD |

Measured numbers and their sources: [docs/numbers.md](docs/numbers.md).

## Not built

- Results of the on-site check with new hires — **not built** (after the check day)
- The 2-minute and 3-minute videos — **not built**
- Navigation between the maker screens (today they are opened by address) — **not built** (see [docs/audit.md](docs/audit.md))

## Appendix

- How it works, step by step: [docs/flow.md](docs/flow.md)
- Decisions and why: [docs/decisions.md](docs/decisions.md)
- Reader panel: [docs/readers.md](docs/readers.md)
- Measured numbers: [docs/numbers.md](docs/numbers.md)
- Build log: [docs/build-log.md](docs/build-log.md)
- Screen check list: [docs/audit.md](docs/audit.md)

## License

- Code: **GNU Affero General Public License v3.0 (AGPL-3.0)**. Full text: [LICENSE](LICENSE).
- Documents in `docs/`, and pictures exported from the pictogram parts list (PNG / SVG): **Creative Commons Attribution 4.0 (CC BY 4.0)** — https://creativecommons.org/licenses/by/4.0/
- The name "genba-kamishibai" and its logo are not covered by either license.
- The Claude character in the demo video is drawn as an unofficial fan work. / Claude のキャラクターは、非公式のファン作品として描いています。

Why: this is a tool that touches safety on site. If someone improves it and runs it as a service, AGPL makes those improvements public too, so they come back to everyone. The parts and the documents are CC BY so that people in other industries can reuse them freely.
