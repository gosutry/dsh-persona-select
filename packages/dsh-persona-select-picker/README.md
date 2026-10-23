# dsh-persona-select-picker

主包 `dsh-persona-select` 的**组件包**（不是独立插件，不出卡片）：
对话输入框旁的人设列表（`conversation.input.dock`）。

- 包根行 → 有自己的浏览器半 `client.js`（分块 `client.picker.js`）；停用这一行 = 浏览器半整体卸载；
- 宿主半只做一件事：通过 `../dsh-persona-select/lib/core/owner.js` 认领内核；
- 共享的样式/文案/数据钩子已经内联在本包的 `client.js` 里（源在主包的 `lib/client/shared.js`）。
