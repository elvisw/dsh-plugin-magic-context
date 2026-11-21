# T35：在兼容声明中加入 DSH 0.2.2-rc.5

**结论：通过。** 补丁版 `@elvisw/dsh-magic-context@0.18.9` 的 `engines.dsh` 在保留 `0.2.1-rc.1`、`0.2.2-rc.1` 的基础上追加了精确的 `0.2.2-rc.5`。在全新的隔离 Windows 根里，官方 `@deepseek-ai/dsh@0.2.2-rc.5` 通过 `dsh plugin add` 在未启用精确版本豁免的情况下接受了该包，插件行加载，Web 的 Magic Context 设置入口渲染成功。运行期行为不在本票重测；T34 验证的是只改兼容声明与版本号的重打包候选（`0.18.8-t34.rc5.1`），不是 registry 上的 `0.18.8` 发布包。

## 已验证

### 1. 包差异

- 对比对象：`npm pack @elvisw/dsh-magic-context@0.18.8` 从 npm registry 取回的包（SHA-256 `c2e0b06d…12a6b1`，与 T34 `artifacts.json.releaseSha256` 相同）与本地 `npm pack` 的 `0.18.9`（SHA-256 `1e6a0b9c…a3deb2f`）。
- 两份包各 71 个成员；新增、删除成员均为空；变化的成员只有 `package/package.json`、`package/README.md`、`package/README.zh-CN.md`。
- `package.json` 只有两个顶级字段变化：`version`（`0.18.8` → `0.18.9`）与 `engines.dsh`（追加 ` || 0.2.2-rc.5`）；`engines.node` 不变。
- `lib/`（60 个成员）与 `vendor/`（4 个成员）逐字节相同。见 [pack-compare.json](evidence/pack-compare.json)。

本地 `npm pack` 只是**候选**：`release.yml` 会在 tag 上重新 `npm run build` 并 `npm publish`，所以候选的 SHA-256 不是最终 registry 字节；发布后需要单独做一次 registry 复核（见「未覆盖」）。

### 2. 隔离安装与加载

| 步骤 | 结果 |
|---|---|
| 宿主 | `npm --prefix <root>/host install @deepseek-ai/dsh@0.2.2-rc.5`，随后 CLI 实测自报 `0.2.2-rc.5`（记录在 `host-install.json.cliVersion`） |
| 写目标 | npm 的 cache/userconfig/globalconfig、`DSH_HOME`、`HOME`、`USERPROFILE`、四个 `XDG_*`、`PNPM_HOME`、`pnpm store path` 与 pnpm 全局配置全部解析到本次根内（`host-install.json.isolation`） |
| 安装 | `dsh plugin add` 退出 0；过滤后的诊断只有 `+ @elvisw/dsh-magic-context 0.18.9`；`allowVersionUsed: false` |
| 已装包 | 版本 `0.18.9`，`engines.dsh` 含三项；profile 依赖与 bundle 均登记；无 `compatibility.json` |
| 启动 | Web 宿主正常启动，诊断行中没有跳过或不兼容记录 |
| 设置 | `Ctrl+Alt+Comma` → `Magic Context` → `[data-mc-section="embedding"]` 可见，控制台错误 0 |

证据：[host-install.json](evidence/host-install.json)、[plugin-add.json](evidence/plugin-add.json)、[installed.json](evidence/installed.json)、[startup.json](evidence/startup.json)、[web-settings.json](evidence/web-settings.json)。

宿主安装用 npm 的默认脚本策略，5 个依赖的 install script 被 npm 阻止（`host-install.json.diagnostics`）；本票只验证装载与设置渲染，不涉及 shell 或原生模块路径。

### 3. 主目录未再变化

本次运行前后，主目录的 `package.json`、`package-lock.json`、`node_modules/.package-lock.json` 的 SHA-256 一致。基线是 **T34 安装事故之后**的状态：那三个清单仍保留 T34 的改动，用户已明确不恢复；本节只证明本次运行没有再次写入主目录。见 [home-isolation.json](evidence/home-isolation.json)。

## 未覆盖

- 运行期行为（回收、取回原文、重启后检索）不在本票重测。T34 的这些结论来自 `0.18.8-t34.rc5.1` 重打包候选；`0.18.9` 与 `0.18.8` 的 `lib`/`vendor` 逐字节相同，结论按此迁移，不声称 T34 测过发布包。
- 只测 Windows `web` profile 的一次安装与设置渲染；Desktop、Android、其他 DSH 版本未测。
- 发布后 registry 字节复核未执行（尚未发布）。

## 复现入口

- `python verify.py <新隔离根> <0.18.9 tarball>`：安装宿主、执行 `dsh plugin add`、启动 Web、打开设置，断言全部写目标与主目录清单。
- `web.cjs`：仅驱动真实 localhost Web UI；不保存截图、URL 或浏览器日志。

真实模型调用 **0 次**；未使用 `allow-version`；未改日常安装或数据。
