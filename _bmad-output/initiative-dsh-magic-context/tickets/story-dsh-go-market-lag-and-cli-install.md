---
id: 36
type: story
title: "Tell users what to do when the dsh-go market entry lags behind npm"
parent: initiative-dsh-magic-context
covers: [README.md, README.zh-CN.md, docs/configuration.md]
after: [35]
refined: false
hitl: true
risk: low
---

# Tell users what to do when the dsh-go market entry lags behind npm

## Description

The dsh-go market catalog is maintained separately from npm. The market repository runs a watcher
workflow that opens an update PR when npm publishes a newer version; the entry only changes once that
PR is merged, and a new entry may also be missing entirely before the first one lands. In practice the
catalog can therefore trail npm by an unknown amount. On 2026-11-21 npm `latest` was 0.18.9 while the
market sidecar still listed 0.18.0 and the update PR (#96) sat open at 0.18.8. The READMEs say "once
the market entry is available" and then pin the fallback command to 0.18.6, which is both stale and
silent about why the entry may lag.

## Requirements

1. Both READMEs say the market catalog may lag behind npm releases and may not list a new release yet,
   without promising a latency and without blaming the maintainers.
2. The fallback path is the app's local terminal: `dsh plugin --profile web add <package>`, run on the
   phone, followed by an engine restart. Show the unpinned command and state how to pin an exact
   version without hard-coding one in the text.
3. `docs/configuration.md` carries the same instruction in its Android section.
4. Only the Android install example block changes; provenance and history mentions of older versions
   elsewhere stay as they are.
5. Existing README structure and the mechanical README checks keep passing.

## Non-goals

- No change to the market repository, the watch workflow, or PR #96.
- No product code, configuration schema, version bump, or CHANGELOG entry; release notes are written
  when a release is actually prepared.
