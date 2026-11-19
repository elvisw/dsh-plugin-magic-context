---
id: 30
type: story
hitl: true
risk: low
after: [29]
---

# Link the host and dsh-go from the READMEs

## Why

The READMEs assume the reader already has DeepSeek Harness and, on the Android path, already has
dsh-go. Neither is linked anywhere, so a reader who lands on the npm page has to search for the
host and for the app before the install command means anything.

## Requirements

1. **Host link in `## Install`.** Name DeepSeek Harness and link the repository
   (`https://github.com/deepseek-ai/deepseek-harness`). The marketing site
   (`https://deepseek.com/harness`) answers `429` to scripted requests, so the repository is the
   link that can be checked mechanically.
2. **dsh-go links in `## Android`.** Link the repository
   (`https://github.com/ccch1mneyyy/dsh-Go`) and its releases page, next to the version the panels
   were verified against.
3. **Do not overclaim version support.** dsh-go has released past 1.1.0 (latest at the time of
   writing: v1.2.0); the README says the panels were verified on 1.1.0 and does not claim later
   releases work.
4. **Chinese mirrors**, same links, same claim.
5. **No new heading**; the lint asserts 12 h2 and no h3.
6. **Scope:** the two READMEs only.

## Acceptance

- Both READMEs link the DSH repository from the install section and both dsh-go URLs from the
  Android section.
- The Android paragraph still says the verified version is 1.1.0 and adds one sentence that later
  releases exist.
- `readme-lint.mjs` 82 checks / 0 failures; link check resolves the two new GitHub URLs (HTTP 200).
