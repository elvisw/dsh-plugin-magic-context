# T32 真机检查：会话面板的组成环形图

## 这一步要看什么

手机 → 打开任意会话 → 点输入框上方的状态条 → 面板顶部「本会话」下应出现一张环形图：

- 三个扇区：系统 / 工具定义 / 消息，按 token 占比；
- 图例三行，每行是「色块 + 名称 + 数值 + 百分比」（单位 tok）；
- 原来那三行纯数字不再单独出现。

这不是自动化门禁，只需要人眼判断：**64 px 的环在这个位置是否看得清**。看不清就记「不可读」，不要当成通过。

## 安装候选包

1. 把整个目录推到手机（PC 侧）：
   `adb -s <序列号> push <此目录> /sdcard/Download/dsh-mc-t32`
2. 在 dsh-go 的本机终端里：
   `cd /sdcard/Download/dsh-mc-t32 && node phone-t32-install.cjs`
   看到 `{"status":"ok","mode":"install",...}` 后**重启本机引擎**（不是重置）。
3. 打开面板看效果。这张卡片背后的数据是真实的 token 统计，没有做任何改写。

候选包是 `candidate/elvisw-dsh-magic-context-0.18.8.tgz`，
SHA-256 `c2e0b06d685db8e9e5523246d03c07b1a6af10ecff4793c9fb3878f2d712a6b1`，
脚本会自己校验这个值。

## 恢复日常版本

`node phone-t32-install.cjs --restore` 会把 web profile 装回 npm 上已发布的
`@elvisw/dsh-magic-context@0.18.6`，然后同样需要重启引擎。

## 已知边界

- 全局（非会话）面板不变，没有这张图。
- 数据缺失时环为空、图例显示「—」，不会补 0。
- 环形组件在 dsh-go v1.1.0 就存在（`docs/plugins/components.md`）；手机上如果整张图显示成
  「在网页版查看」的占位，说明当前 App 版本低于该能力，请把 App 版本号一并记下来。
