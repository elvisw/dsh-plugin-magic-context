# 独立包名与发布

本仓库从 `0.12.0` 起使用 npm 包名 **`@elvisw/dsh-plugin-magic-context`**。上游包 `dsh-plugin-magic-context` 属于另一位维护者，本 fork 不修改、不覆盖它。

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
2. 在**不提交**的临时版本上执行：

   ```bash
   npm version 0.0.0-bootstrap.0 --no-git-tag-version
   npm publish --provenance=false --tag bootstrap
   ```

   `--provenance=false` 是必要的：本地 token 发布不满足 provenance 的 CI 条件；`--tag bootstrap` 确保它不会成为 `latest`。
3. 立即吊销临时 token。
4. 绑定 Trusted Publisher：

   ```bash
   npm trust github @elvisw/dsh-plugin-magic-context \
     --file release.yml \
     --repo elvisw/dsh-plugin-magic-context \
     --allow-publish
   ```

5. 用 `npm trust list @elvisw/dsh-plugin-magic-context` 确认 repo、workflow 与 publish 权限。
6. 恢复仓库内的 `0.12.0`，提交并推送 `main`；只有确认 `main` 全绿后才创建并推送 `v0.12.0`。

正式发布必须由 tag 触发 `.github/workflows/release.yml` 的 OIDC 流程；不要手工 `npm publish` `0.12.0`，否则会消耗版本号且没有 provenance，release workflow 的“already published”守卫会拒绝再次发布。

## 发布后核对

```bash
npm view @elvisw/dsh-plugin-magic-context@0.12.0 version dist.integrity
npm trust list @elvisw/dsh-plugin-magic-context
```

`dist.integrity` 只作记录；真正的内容一致性要解包 registry tarball，与本地 `npm pack` 产物逐文件比较 SHA-256。还要确认 `npm view ... dist.attestations` 存在，并且上游 `dsh-plugin-magic-context` 未被修改。

## 不改变的东西

- loader row id：`magic-context-dsh`
- settings namespace：`magic-context-dsh`
- 插件数据目录：`~/.local/share/cortexkit/magic-context-dsh-poc/`
- 插件导出名与 T2–T5 行为

包名之外的这些标识是数据连续性和宿主兼容性的一部分，不随 npm 包名迁移。
