---
title: README host and dsh-go links
ticket: 30
status: done
---

# Plan — host and dsh-go links

## Where

| File / section | Change |
|---|---|
| `README.md` `## Install`, first sentence | After "DSH host with a web client", add "DSH is [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)." |
| `README.md` `## Android`, first sentence | Add `([source](…/dsh-Go), [releases](…/dsh-Go/releases))` after the bolded version, plus one sentence: later app releases exist, panels verified on 1.1.0 |
| `README.zh-CN.md` same two places | Mirrors |

## Copy — English

Install:

```
You need Node ≥ 22.19 and a DSH host with a web client (desktop app or `web` profile). DSH is
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The supported host versions are
declared in `engines.dsh` as `0.2.1-rc.1` or `0.2.2-rc.1`.
```

Android:

```
The same package provides native panels for **Android dsh-go 1.1.0**
([source](https://github.com/ccch1mneyyy/dsh-Go),
[releases](https://github.com/ccch1mneyyy/dsh-Go/releases)). Choose the **on-device engine**. No
Flutter build, and not a second package. Later dsh-go releases exist; the panels here were verified
on 1.1.0.
```

## Copy — Chinese

```
需要 Node ≥ 22.19，以及带 Web 客户端的 DSH 宿主（桌面应用或 `web` profile）。DSH 即
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。支持的宿主版本写在
`engines.dsh` 里：`0.2.1-rc.1` 或 `0.2.2-rc.1`。
```

```
同一个包为 **Android dsh-go 1.1.0**（[源码](https://github.com/ccch1mneyyy/dsh-Go)、
[发布版](https://github.com/ccch1mneyyy/dsh-Go/releases)）提供原生面板，选**手机本机引擎**。
不需要 Flutter 构建，也没有第二个包。dsh-go 之后又发过新版本；这里的原生面板是在 1.1.0 上验证的。
```

## Why the repo and not deepseek.com/harness

`curl -L https://deepseek.com/harness` returns `429` to scripted requests. A link that a checker
cannot verify (and that a reader behind a strict network may not reach either) is worse than the
repository, which returns 200 and is where the host's own README lives.

## Checks

- Two new GitHub URLs return 200.
- Heading counts unchanged; lint 82/0.
- The Android text still does not claim 1.2.0 works.
