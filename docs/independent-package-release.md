# 独立包名与发布

本仓库从 `0.12.0` 起使用 npm 包名 **`@elvisw/dsh-plugin-magic-context`**；`0.12.1` 是同一代码线的 docs-only patch，`0.12.2` 是 historian 重试、reasoning effort 与两处观测口径的修复版（仓库版本；尚未发布时 registry 的 `latest` 仍是 `0.12.1`）。上游包 `dsh-plugin-magic-context` 属于另一位维护者，本 fork 不修改、不覆盖它。

## 用户迁移

旧包与新包的 Cordis loader row id 都是 `magic-context-dsh`，同一个 profile 不能同时启用两者。安装新包前先移除旧包：

```bash
dsh plugin --profile desktop remove dsh-plugin-magic-context
dsh plugin --profile desktop add @elvisw/dsh-plugin-magic-context
```

插件数据目录仍是 `~/.local/share/cortexkit/magic-context-dsh-poc/`，settings namespace 仍是 `magic-context-dsh`，已有数据与会话不需要迁移。

## 包名与安装脚本

- npm 包名：`@elvisw/dsh-plugin-magic-context`
- tarball 文件名由 npm 自动清理为：`elvisw-dsh-plugin-magic-context-<version>.tgz`
- `tools/install-magic-context.bat` 用 `PKG` 做 `dsh plugin add/remove` 的 specifier，用 `TGZ_PREFIX` 查找 tarball；两者不能混用。

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
   npm trust github @elvisw/dsh-plugin-magic-context \
     --file release.yml \
     --repo elvisw/dsh-plugin-magic-context \
     --allow-publish
   ```

5. 用 `npm trust list @elvisw/dsh-plugin-magic-context` 确认 repo、workflow 与 publish 权限。
6. 恢复仓库内 `package.json` 与 `package-lock.json` 的正式版本（当前 `0.12.2`，以仓库为准），提交并推送 `main`；只有确认 `main` 全绿后才创建并推送对应的 `v<version>` tag。

正式发布必须由 tag 触发 `.github/workflows/release.yml` 的 OIDC 流程；不要手工 `npm publish <version>`，否则会消耗版本号且没有 provenance，release workflow 的“already published”守卫会拒绝再次发布。

## 发布后核对

```bash
npm view @elvisw/dsh-plugin-magic-context@0.12.2 version dist.integrity
npm view @elvisw/dsh-plugin-magic-context dist-tags
npm trust list @elvisw/dsh-plugin-magic-context
```

`dist.integrity` 只作记录；真正的内容一致性要解包 registry tarball，与本地 `npm pack` 产物逐文件比较 SHA-256。还要确认 `dist-tags.latest` 指向正式版本、`dist.attestations` 存在，并且上游 `dsh-plugin-magic-context` 未被修改。

## 不改变的东西

- loader row id：`magic-context-dsh`
- settings namespace：`magic-context-dsh`
- 插件数据目录：`~/.local/share/cortexkit/magic-context-dsh-poc/`
- 插件导出名与 T2–T5 行为

包名之外的这些标识是数据连续性和宿主兼容性的一部分，不随 npm 包名迁移。
