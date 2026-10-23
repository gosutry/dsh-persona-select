# dsh-persona-select · 人设管理与人设注入

> DSH 插件：把人设正文注入**系统提示词**，把历史对话注入**上下文**。设置页的人设管理负责保存与编辑，对话模式选择行下方可以随时切换人设。

本仓库是 0.4.0-rc4 的插件仓库，由三个包组成：

| 包 | 作用 |
| --- | --- |
| [`packages/dsh-persona-select`](packages/dsh-persona-select) | 插件卡：bundle patch、图标/标题、共享内核 |
| [`packages/dsh-persona-select-picker`](packages/dsh-persona-select-picker) | 组件：会话输入区的人设选择 |
| [`packages/dsh-persona-select-settings`](packages/dsh-persona-select-settings) | 组件：设置页「人设管理」 |

安装、注入规则、数据文件等完整说明见
**[packages/dsh-persona-select/README.md](packages/dsh-persona-select/README.md)**。
