# Reproduce — real `/ctx-wrapup` smoke

This packet is a post-release user-path check. It does not rebuild or republish
the package.

## 1. Isolated host

The captured run used:

- root: `%TEMP%\opencode\dsh-mc-wrapup-20261117-1700`
- profile: `%TEMP%\opencode\dsh-mc-wrapup-20261117-1700\dsh-home\profiles\wrapup`
- plugin: `@elvisw/dsh-magic-context@0.17.0`
- model: `deepseek-official/deepseek-flash`
- `DEEPSEEK_API_KEY` present in the launch environment

Start the host from a clean root with the same profile layout:

```powershell
python start_wrapup_host.py
```

Expected: an isolated DSH Web URL on localhost and
`evidence/server.json` with a token. Do not commit that file; the committed
copy is `evidence/server-redacted.json`.

## 2. Browser path

```powershell
node run_wrapup_smoke.cjs
```

The script:

1. opens the isolated Web UI;
2. sends three short prompts and waits for replies;
3. sends `/ctx-wrapup 2`;
4. sends one trigger prompt;
5. writes `evidence/ui-smoke.json` and three screenshots.

Expected: the command receipt says `wrapup queued`, the trigger prompt
completes, and there are no browser console errors.

## 3. Database check

```powershell
python collect_wrapup_smoke.py
```

Expected `evidence/wrapup-journal.json`:

- one `historian` start/done pair with `trigger: "manual"`;
- one `compartment-published` row;
- one `pass` row with `reason: "wrapup-pending"`, `historianStarted: false`;
- `wrapup_request:<session>` value is `""` after completion;
- the compartment has `landed_event_seq` set and `landed_reason` null.

## 4. Scope

This is a short-history smoke, not a replacement for the T22 unit suite. It
does not cover pause/resume, abort, terminal rejection, baseline failure, or a
20+ entry default keep.
