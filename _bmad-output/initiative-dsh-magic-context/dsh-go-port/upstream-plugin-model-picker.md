### 现在卡在哪

在 Android dsh-go 的本机引擎中，打开「设置 → 插件 → 已安装 → 魔法上下文 → 配置」。「历史摘要」里的摘要服务和摘要模型、「维护」里的验证服务和验证模型都要手填 ID。模型已经配置在引擎里，用户还是得去别处找 ID 再粘贴；而同一引擎的 DSH 网页版可以直接从模型目录选。

插件 npm 包：`@elvisw/dsh-magic-context@0.18.8`；[插件 GitHub 仓库](https://github.com/elvisw/dsh-plugin-magic-context)。核对版本：Android 本机引擎；dsh-go v1.1.0 和 v1.2.0 的表单源码均为此行为，本次未在 v1.2.0 真机复测。

### 你想到的做法（可选）

希望插件能声明「这里需要从当前引擎选择一个模型」。点开后可复用聊天页已有的[模型选择器](https://github.com/ccch1mneyyy/dsh-Go/blob/v1.2.0/app/lib/ui/chat/model_sheet.dart#L394-L406)，选一次就填好服务 ID 和模型 ID，仍由用户在插件设置页保存。取消不改值；清空回到插件的原有默认行为。

我们的[配置声明](https://github.com/elvisw/dsh-plugin-magic-context/blob/a72f808e3dd7d7983ae139f2c4c9afd603824216/src/index.ts#L1271-L1308)已有两组字符串字段：`historian.provider` / `historian.model` 和 `maintenance.verifyProvider` / `maintenance.verifyModel`。建议由插件显式声明两字段的绑定，不按字段名猜测，也不要求插件改动已保存的配置格式。当前[原生表单](https://github.com/ccch1mneyyy/dsh-Go/blob/v1.2.0/app/lib/ui/engine_settings/schema_fields.dart#L90-L110)只对固定枚举提供选择，不能取当前引擎的模型目录；目录取不到时，保留手填也有用。

这里只请求选择引擎里的语言模型。独立远程向量服务的模型目录不在本需求内。
