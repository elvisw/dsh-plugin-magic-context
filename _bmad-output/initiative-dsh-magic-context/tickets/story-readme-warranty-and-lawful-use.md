---
id: 29
type: story
hitl: true
risk: low
after: [28]
---

# Add a plain-language warranty and lawful-use statement to the READMEs

## Why

The READMEs link to `LICENSE` but never say, in plain language, that the software comes with no
warranty, that it deletes content by design, and that lawful use is the user's responsibility. A
reader on the npm page sees a tool that rewrites conversation history and drops tool output, with
no statement about what happens if that goes wrong.

## Requirements

1. **Point at the license, do not replace it.** The MIT text is the operative instrument; the
   README paragraph is a plain-language summary and says so.
2. **Do not invent absolute disclaimers.** No "the author is not responsible for anything":
   liability for gross negligence or mandatory consumer rights cannot be waived that way, and a
   second legal text invites the question of which one governs.
3. **Name the real risk.** This plugin rewrites the surface and drops tool output by design, and
   stores memories in local SQLite files; the paragraph says to back up.
4. **Lawful use is stated as the user's responsibility, not as a license condition.** MIT grants
   use "without restriction"; adding a restriction would contradict it. The wording is "nothing
   here grants permission to break the law; follow your local laws".
5. **Third-party services** (model providers, embedding endpoints, dsh-go) have their own terms
   and billing.
6. **Both languages**, three short paragraphs, inside `## Provenance and license` — no new heading
   (the lint asserts 12 h2 and no h3).
7. **Scope:** the two READMEs only; no product code, no version bump inside the ticket.

## Acceptance

- Both READMEs contain the three paragraphs before the closing NOTICE/LICENSE line.
- Neither paragraph conflicts with `LICENSE` (no additional restriction, no waiver of rights the
  law does not allow waiving, and it states that it is not legal advice).
- `readme-lint.mjs` (T27 copy) reports 82 checks, 0 failures; link check 0 failures.
- One read-only review checks the text against `LICENSE` and against what the plugin actually
  does to user data.

## Evidence

`_bmad-output/initiative-dsh-magic-context/acceptance-readme-automatic-reclaim-2026-11-19/`
(same scripts; T29 writes `lint-after-t29.json` / `link-check-t29.json`.)
