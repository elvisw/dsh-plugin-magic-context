# 独立包名与发布

> Status: current — updated for the 0.18.14 release.
> Scope: package rename, user migration, and release procedure.

本仓库 `0.12.0`–`0.12.3` 使用 npm 包名 **`@elvisw/dsh-plugin-magic-context`**；从 **`0.13.0`** 起改为
**`@elvisw/dsh-magic-context`**。`0.12.1` 是同一代码线的 docs-only patch，`0.12.2` 是 historian 重试、
reasoning effort 与两处观测口径的修复版，`0.12.3` 是 `/ctx-flush` 空队列反馈的 patch，`0.13.0` 是包名
迁移 + `ctx_expand` range/verbose，`0.14.0` 是顶层设置页、全量中文化与 catalog-backed effort 选择器，`0.15.0` 是遥测 v2 面板与中英截图，`0.16.0` 是远程向量检索与宿主原生设置页重做（移除旧 Plugins 卡片入口，属 breaking change），`0.17.0` 是手动 `/ctx-wrapup` live-history 压缩，`0.18.0` 新增 Android dsh-go 原生面板与桌面凭据库密钥录入，`0.18.1` 是 README 重写与 dsh-go 原生表单枚举字段的修复，`0.18.2` 补回 README 里遗漏的自动回收说明，`0.18.3` 把 README 改成以自动回收为主、不再教用户按标签号操作，`0.18.4` 补上免责与合法使用说明，`0.18.5` 给 README 加上宿主与 dsh-go 的链接，`0.18.6` 让设置页按向量提供方收起远程配置，`0.18.8` 给 dsh-go 会话面板加上下文组成环形图，`0.18.9` 声明支持 DSH `0.2.2-rc.5`，`0.18.10` 让服务预设接管向量接口地址，`0.18.11` 在提供方尚未保存时也提供「保存并加载模型」，`0.18.12` 把模型选择改到模型 ID 字段本身并显示连接测试结果。上游包 `dsh-plugin-magic-context` 属于另一位
维护者，本 fork 不修改、不覆盖它。

## 用户迁移

三个包（上游 `dsh-plugin-magic-context`、0.12.x 的 `@elvisw/dsh-plugin-magic-context`、0.13.0 的
`@elvisw/dsh-magic-context`）使用同一个 Cordis loader row id `magic-context-dsh`。共装不受支持：loader
不会拒绝重复 row id，而是保留一条并可能隐藏重复设置行，结果是静默错配。安装新包前先移除旧包：

```bash
dsh plugin --profile web remove dsh-plugin-magic-context
dsh plugin --profile web remove @elvisw/dsh-plugin-magic-context
dsh plugin --profile web add @elvisw/dsh-magic-context
```

从 0.12.x 升级还必须迁移 profile patch 的 `name` 行。loader 同时匹配 `id` 与 `name`，旧行不会自动改写；
不迁移时整行被跳过，`config`、自定义 `dataDir` 和设置看起来像丢了。新包自带
`tools/migrate-profile-package-name.mjs`，在 npm 安装目录或 hand-out 的 `tools/` 下：

```bash
node "<profile>/node_modules/@elvisw/dsh-magic-context/tools/migrate-profile-package-name.mjs" --patch "<profile>/cordis.patch.yml"
```

`--patch` 是必填；同一脚本也可用于 `%DSH_HOME%\cordis.patch.yml` 和 overlay 的 `cordis.patch.yml`。
脚本只改目标 id 行的 `name`，保留 `config`/`dataDir`/`disabled`/注释/CRLF，修改前写时间戳备份，第二次
运行报 already migrated。

插件数据目录仍是 `~/.local/share/cortexkit/magic-context-dsh-poc/`，settings namespace 仍是
`magic-context-dsh`，schema 仍是 v11；已有记忆、journal 与会话数据的路径不变，包名迁移不移动或重写它们。
0.13.0 宿主 gate 只验证配置生效，未打开旧库，因此不把这条当作数据内容保留的实测。

## 包名与安装脚本

- npm 包名：`@elvisw/dsh-magic-context`
- npm 上还存在无 scope 的 `dsh-magic-context`（维护者 `mon3stera`，仓库 `mon3stera/dsh-dotfile` 下的独立插件）。它是另一个实现，不是本 fork 的旧版本或上游；两者 row id 也不同（本插件 `magic-context-dsh`，对方 `dsh-magic-context-*`）。安装、文档与排障时必须写全 scope。
- tarball 文件名由 npm 自动清理为：`elvisw-dsh-magic-context-<version>.tgz`
- `tools/install-magic-context.bat` 用 `PKG` 做 `dsh plugin add/remove` 的 specifier，用 `TGZ_PREFIX`
  查找 tarball；两者不能混用。安装脚本会先尝试移除两个旧 specifier，再装新包，并打印迁移命令。
- Desktop 应用请用其自带命令运行时管理 `desktop` profile；npm CLI 的示例统一使用 `--profile web`。

## 首次发布：bootstrap

npm 的 Trusted Publishing 只能绑定到已经存在的包，因此首次发布需要一次性的 bootstrap：

1. 确认 npm 账号拥有 `@elvisw` scope，并已开启 2FA。
2. 在**不提交**的临时版本上，于交互式终端执行：

   ```bash
   npm version 0.0.0-bootstrap.0 --no-git-tag-version
   npm publish --provenance=false --tag bootstrap
   ```

   `--provenance=false` 是必要的：非 CI 的本地交互发布不满足 provenance 的 CI 条件。`--tag bootstrap` 给 bootstrap 版本一个独立 tag，但**不能单独保证 `latest` 不被改写**：本次首次发布时 `latest` 与 `bootstrap` 都指向了 `0.0.0-bootstrap.0`。正式发布前要用 `npm view ... dist-tags` 核对，正式版发布后 `latest` 应切到正式版。本次首次发布使用 npm 网页认证/2FA 完成，没有创建临时 token；npm 会提示作者在浏览器中确认。
3. 只有在无法交互、必须使用临时 granular token（需要 `@elvisw` 的 publish 权限）时，才在发布后立即吊销该 token。不要把“吊销 token”当成每次 bootstrap 的固定步骤。
4. 绑定 Trusted Publisher：

   ```bash
   npm trust github @elvisw/dsh-magic-context \
     --file release.yml \
     --repo elvisw/dsh-plugin-magic-context \
     --allow-publish
   ```

5. 用 `npm trust list @elvisw/dsh-magic-context` 确认 repo、workflow 与 publish 权限。
6. 恢复仓库内 `package.json` 与 `package-lock.json` 的正式版本，提交并推送 `main`；只有确认 `main` 全绿后才创建并推送对应的 `v<version>` tag。

正式发布必须由 tag 触发 `.github/workflows/release.yml` 的 OIDC 流程；不要手工 `npm publish <version>`，否则会消耗版本号且没有 provenance，release workflow 的“already published”守卫会拒绝再次发布。

## 发布后核对

```bash
npm view @elvisw/dsh-magic-context@0.18.2 version dist.integrity
npm view @elvisw/dsh-magic-context dist-tags
npm trust list @elvisw/dsh-magic-context
```

`dist.integrity` 只作记录；真正的内容一致性要解包 registry tarball，与本地 `npm pack` 产物逐文件比较 SHA-256。还要确认 `dist-tags.latest` 指向正式版本、`dist.attestations` 存在，并且上游 `dsh-plugin-magic-context` 未被修改。

## 不改变的东西

- loader row id：`magic-context-dsh`
- settings namespace：`magic-context-dsh`
- 插件数据目录：`~/.local/share/cortexkit/magic-context-dsh-poc/`
- schema：v11（`pending_drops.flush_requested`）
- 存储格式与 T2–T5 行为

包名之外的这些标识是数据连续性和宿主兼容性的一部分，不随 npm 包名迁移。
