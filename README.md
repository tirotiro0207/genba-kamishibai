# genba-kamishibai

[![test](https://github.com/tirotiro0207/genba-kamishibai/actions/workflows/test.yml/badge.svg)](https://github.com/tirotiro0207/genba-kamishibai/actions/workflows/test.yml)

English | [日本語](README.ja.md)

Work in progress. This is a skeleton; the final text comes later. How it is being built: [docs/progress.md](docs/progress.md) (progress) and [docs/plan.md](docs/plan.md) (task list). Anything marked **not built** does not exist yet.

## The Problem

- On a construction site, the safety rules live in written manuals and in the heads of veteran workers.
- New hires from abroad often cannot read those rules in Japanese text.
- The people who train them have no time to make teaching material that actually gets through.

## Why I built this

- The author works with an electrical contractor (founded in 1923) that hires new staff from Vietnam.
- A rule that is misread on site can hurt someone. A picture card that a supervisor has checked and signed is safer than a machine translation nobody checked.
- Direction of the project: [docs/compass.md](docs/compass.md).

## What it does

Turns a rule written in Japanese (or spoken by a veteran) into a picture card — pictograms that show *what to do* and *why* — that can be read without Japanese text. Only cards that a supervisor has corrected and signed reach new hires.

Built so far:

- Input: paste text, or upload a PDF; PDF pages become text with Claude
- Extraction: pick out the rules from the text (what to do, what not to do, why), each with its place in the source
- Card making: lay out the card's text and the keyframes of the pictogram figure; every part of the picture keeps a **route** back to the sentence it came from
- Checking: a second Claude call grades the frames of the card and sends it back for another try if it is red
- Roles: author, two supervisors, trainer, new hire. Only supervisors can stop a card. New hires only see signed cards
- Audit log: append-only, hash-chained record of each card (source → making → checking → human edits → signature), with a screen for supervisors and trainers
- Answer recording app: records new hires' answers, grades them, and exports anonymized answers as CSV
- Reader panel: 24 simulated readers (country of origin × Japanese reading level × background) read the cards and the misreadings are counted

Not built yet:

- Signature record and signature input — **not built**
- Route screen (tap a part of the picture to see the source sentence) — **not built**
- Kamishibai-style transition between cards — **not built**
- Overnight batch of draft cards — **not built**
- PNG / SVG export, public deployment — **not built**

### Hand-drawn sketches (`docs/sketches/`)

Reference drawings made by hand by the author. The pictogram parts (figure, helmet, speech bubble, tools) were adjusted to match them. Photos had metadata removed and were resized to 1,600 px on the long side.

## How Claude is used

| Where | Model | What it does |
|---|---|---|
| PDF → text | Claude Opus 5.5 | Reads each page image and writes the text with line positions |
| Extraction | Claude Opus 5.5 | Picks out rules (what to do / not to do / why) with their source positions |
| Card making | Claude Opus 5.5 | Writes the keyframes and a route for every part of the picture, as numbers (it does not draw the picture directly) |
| Checking | Claude Opus 5.5 | Grades the card's frames; red cards are remade, up to a limit per use |
| Joint angles | Claude Sonnet 5.5 | Turns a described pose into joint angles for the figure |
| Grading the extraction | Claude Sonnet 5.5 | Compares extracted rules with the evaluation answers |
| Reader panel | Claude Code subagents (Sonnet 5.5 by default) | Each simulated reader is one subagent; the model ID is kept with every answer |

- Every API call is logged with its cost, and each use has a spending cap.
- Building the app itself was done with Claude Code.

### Evaluation data (`eval/`)

Made before the event. The source sentences come from Japanese occupational-safety law and public materials of the Ministry of Health, Labour and Welfare; the source is on each line.

- `eval/items_tune_v1r8.json`: 20 items used for tuning. Waiting for review by two supervisors; will be replaced when finalized.
- `eval/holdout_hashes_v1r8.json`: hashes of 10 items used only for the final check. The items are added at the final check and their hashes shown to match.
- None of the 30 answers is in any prompt or example.

## Quick Start

Requires Node.js 24.

```bash
npm ci
```

```bash
npm test
```

To run the app locally, put `SESSION_SECRET` (any long random string) and `ANTHROPIC_API_KEY` in `.dev.vars`. Without the API key the app still starts, but calls to Claude return 503.

```bash
npx wrangler d1 migrations apply DB --local
```

```bash
npm run dev
```

Public demo — **not built**.

## License

Not decided yet. The candidates are listed in [docs/readme-draft.md](docs/readme-draft.md).
