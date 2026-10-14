# dsh-persona-select 0.3.32 · 人设管理与人设注入

> DSH 插件：把人设正文注入**系统提示词**，把历史对话注入**上下文**。设置页的人设管理负责保存与编辑，对话模式选择行下方可以随时切换人设。
>
> Bilingual README. [中文](#中文) · [English](#english)

---

## 中文

### 这个插件做什么

它负责两件事：把一段文字送进**系统提示词**，把一段对话送进**上下文**。为了说清楚，本文与插件设置界面统一使用两个叫法：

| 叫法 | 指的是 |
| --- | --- |
| **人设正文** | 注入系统提示词的那段内容 |
| **历史对话** | 作为上下文注入的一段"已经发生过"的对话 |

两者按**人设**成对保存：在设置页把人设正文和历史对话写好、存成一条预设「人设」，之后在对话里选中这条人设，两者按各自的规则进入这一次请求。

### 注入的规则

**人设正文**进入系统提示词的**人设段**，**注入位置可自行编辑**：「段序权重」决定这一段排在系统提示词的哪个位置。

- **数值**：按权重大小排序，**数字越小越靠前**（默认 `-1`，排在预设里那句 "You are a coding agent…" 之前）。
- **追随**：点「追随」后，人设段被放到**所有系统提示词段之后**（与提示词管理的做法一致）。
- 权重只影响排序，**永远不会混进人设正文**；每条人设各自保存自己的权重，编辑框跟着当前选中的那条人设走。
- 必须填整数（`-1000000000` ~ `1000000000`）：小数、指数、带单位都会被拒绝保存。

**历史对话**在**新对话的第一步**作为 user 侧上下文注入一次，并按仿照 DSH 自身注入的格式包裹：

- 整段包进一对 `<system-reminder>`，开口之后是 `CONTEXT_ROAD:`，结尾是 `CONTINUE_CONTEXT.`；正文里出现的收尾标签会被转义，保证壳子不会被提前闭合。
- 往期对话的 user 侧内容包在 `<user_message>` 里；模型侧的思考包在 `<thinking>` 里、说的话包在 `<assistant_message>` 里；双方非对话内容（工具调用、多模态等）包在 `<file>` 之类的标记里；压缩摘要保持 `<compacted-summary>…</compacted-summary>` 原样。

**已经注入过的对话不会重复注入**（那会把整段对话的 KV 缓存推倒重来）。所以历史对话只在每个新对话的第一步生效；如果想让一个已经聊起来的对话也带上历史，只能把历史写进人设正文——但效果不好，不推荐。

### 人设管理

- 新建、编辑、保存、删除人设，**复制为新人设**（内置人设只读，要改就复制一份副本再改）。
- 每一条人设包含：名称、人设正文、段序权重、历史对话。
- **设置分开保存**：每个对话保存自己的选择与开关，**切换人设、改动勾选项都不会影响新对话和进行中的对话**。设置页有「当前 / 全局」两个页签，分别对应"这一个对话"和"新对话默认跟随的设置"。
- 保存前会先校验：正文为空、名称为空、权重不是整数都会拒绝保存并说明原因；正文超过建议上限会提示但完整保留。
- 未保存的改动在切换人设时会先询问，避免默默丢掉。

### 屏蔽与「纯聊天」

四个开关各自撤掉一类模型本来能看到的**系统侧输入**：

| 开关 | 撤掉什么 |
| --- | --- |
| **只留人设** | 系统提示词里除人设段以外的所有段：harness 身份、部署人设、工具指引、计划模式策略、harness 源码说明。人设为空时，系统提示词就是空的。 |
| **屏蔽 runtime 上下文** | 两类：① 沙箱策略、审批策略、委派规则等以 user 角色快照下发的动态上下文；② 包在 `<system-reminder>` 里的 runtime 快照与 skill 目录。 |
| **屏蔽 schema 工具** | 工具定义（它走独立的协议字段，不是系统提示词段，通常是最大的一笔 token）。打开后模型没有可调用的工具。 |
| **屏蔽其他注入内容** | AGENTS.md / CLAUDE.md 之类的指令基线与逐步时间读数——它们同样是以 user 角色消息追加进来的，只能按来源过滤。 |

四个开关全开、且没有选中人设，就是**纯聊天**：系统侧注入归零，模型只看到你发的内容。对话界面的选择框里有「一键纯聊天 / 恢复系统输入」按钮直接切换这两个状态。

**工具保活通道**（「可复用工具」）：屏蔽 schema 工具的保险丝。DSH 的工具账本要求每个对话有一份非空的工具声明基线，基线一旦被清空，回来的工具都会被打上 deferred 标记并被服务方以 `INVALID_REQUEST` 拒绝。勾上它，插件只在**两个时刻**保留完整工具列表各一轮——这个对话的**第一次请求**，以及**疑似声明序列重启**（例如压缩）时——先让基线建立起来，之后无论怎么开关屏蔽，工具都还能回来。

### 导入与导出

**导出**（设置页编辑器里那条人设的正文 + 段序权重 + 历史对话一起走）：

- **导出 JSON**：纯 JSON，不压缩、不丢信息。
- **导出图片**：由**你自己挑一张 PNG 当封面**，同样的数据打进图片里一起下载。图片本身一个字节都不改，任何看图软件照常显示它。
- 单次导出上限 32 MB；选了非 PNG、或 PNG 结构不完整（读不出 IHDR）会被直接拒绝并说明原因。
- 导出取的是编辑器里那条人设**已保存**的版本：有未保存改动会先询问，新建但还没保存的人设不能导出。

**导入**：

- 读本插件导出的 `.json`，或「导出图片」生成的那张 `.png`，作为**新人设追加**进列表——**绝不覆盖已有条目**。
- **直接导入 DSH 自己 `/export` 出来的 Session 日志**：接受 `/export` 产生的 `.zip`，也接受裸的 `session.vN.jsonl` / `session.jsonl`，以及 `.jsonl.zstd` / `.zst`。导入时两个独立开关：
  - **导入思考过程**：决定模型侧的 `<thinking>` 跟不跟着进来。
  - **展开压缩**：默认只取压缩摘要 `<compacted-summary>` 与**最后一次摘要之后**的对话；勾上后反过来——取**除摘要之外**的全部内容，把压缩展开回原文。历史从未压缩过时，这个勾选项不改变任何东西。

### 对话界面的选择框

对话模式选择行下方那个「人设」下拉：

- 切换当前对话的人设，或选「不注入」。
- **一键纯聊天 / 恢复系统输入**。
- 层徽标告诉你这条设置是**本对话**的还是**全局**的。
- 状态点：
  - 绿点：工具基线可用，一切正常。
  - 黄点：本对话选定人设的历史对话与当初注入的那份对不上了；本对话的人设正文没进系统提示词（例如对话用了声明 `complete: true` 的「极简模式」）；本对话已经聊过，所以这条人设的历史对话不再注入；或「可复用工具」没勾。
  - 红点：本对话选的人设已被删除（人设段现在是空的），或这个对话的首次请求没带任何工具（工具基线为空，本对话内工具回不来）。
- 设置页的「当前」页会按来源列出**这个对话里被过滤掉**的注入块：runtime 快照、skill 目录、工作区指令、时间读数。

### 数据文件

`<DSH_HOME>/persona-select/`（`DSH_HOME` 默认 `~/.dsh`）：

| 文件 | 内容 |
| --- | --- |
| `personas.json` | 全局设置、人设列表、每个对话的选择与开关 |
| `personas.json.v2-backup` | 旧版升级时的备份，可删 |
| `history/<编号>.txt` | 各条人设的历史对话正文 |

- 名称最长 40 字；人设正文建议不超过 20000 字（超过会提示，但完整保留、不截断）；最多 200 条人设；最多保留 500 条对话记录。
- 会话记录会被自动清理：已经不存在、也不在活动列表里的对话记录会被回收（设置页也可主动触发），避免文件无限膨胀。

### 已知限制

- **同一份数据只支持单实例在写**：整份写回，两个实例同时保存时后写的会盖掉先写的，且都不报错。**读**是安全的。规避办法是只开一个实例；手改 `personas.json` 后先在界面上确认数字。
- **导入 Session 日志时，不勾「导入思考过程」会让正文里手写的 `<thinking>` 字面量连它到区段末尾的内容一起被删掉**。判据是"宁可多删，不留半截思考"；`<compacted-summary>` 包住的那一段不受影响。要原样保留就写成 `&lt;thinking&gt;` 这样的转义写法。
- **分叉与委派**：分叉出来的子对话会继承父对话的设置与人设（在第一次装配之前完成）；委派的子 agent 继承设置与人设词，但不再注入历史对话（`subagent_fork` 从父对话日志前缀里继承进来的那一条除外）。

### 界面

设置页与对话界面均跟随宿主语言，内置中文 / English 两套文案。

---

## English

### What this plugin does

Two jobs: put a block of text into the **system prompt**, and put a stretch of conversation into the **context**. To keep the wording precise, this README uses the same two names as the plugin UI:

| Term | Meaning |
| --- | --- |
| **Persona text** | the content injected into the system prompt |
| **Conversation history** | a stretch of "already happened" dialogue injected as context |

The two are stored together as one **persona**: write the text and the history in the settings page, save them as a persona preset, then pick that persona in a conversation and both enter the request by their own rules.

### How injection works

**Persona text** becomes the **persona section** of the system prompt, and **its position is yours to edit**: the "Section order weight" decides where that section sits.

- **A number**: sections sort by weight, **lower comes first** (default `-1`, ahead of the preset line "You are a coding agent…").
- **Follow**: click it and the persona section is appended **after every system-prompt section** (the same approach as prompt management).
- The weight only affects ordering and **never enters the persona text**. Each persona keeps its own weight, and the field follows whichever persona you are editing.
- It must be an integer (`-1000000000` to `1000000000`): decimals, exponents and units are refused on save.

**Conversation history** is injected once, as user-side context, at the **first step of a new conversation**, wrapped in a shell that imitates how DSH itself injects context:

- the whole block sits inside one `<system-reminder>` pair, opened by `CONTEXT_ROAD:` and closed by `CONTINUE_CONTEXT.`; any closing tag occurring in the body is escaped so the shell can never be closed early.
- inside it, past user-side content goes inside `<user_message>`; the model side's thinking goes inside `<thinking>`, its spoken content inside `<assistant_message>`; non-conversational content from either side (tool calls, multimodal parts) goes inside markers such as `<file>`; compaction summaries stay wrapped in `<compacted-summary>…</compacted-summary>`, verbatim.

**A conversation that has already been injected is never injected again** — doing so would tear down the whole conversation's KV cache. History therefore only takes effect on the first step of each new conversation. If an already-running conversation must carry history across a persona switch, you can write that history into the persona text itself — the result is poor, so it is not recommended.

### Managing personas

- Create, edit, save and delete personas, and **fork as new** (built-in personas are read-only; fork a copy to edit one).
- Each persona carries: name, persona text, section order weight, conversation history.
- **Settings are saved per conversation**: each conversation keeps its own selection and switches, so **switching personas or toggling a switch never affects new conversations or conversations in progress**. The settings page has a Current / Global tab pair — "this conversation" versus "what new conversations follow".
- Saving validates first: empty text, empty name or a non-integer weight is refused with a reason; text over the recommended limit is reported but kept in full.
- Unsaved edits trigger a confirmation before switching personas, so nothing is silently dropped.

### Suppression and pure chat

Four switches, each removing one class of system-side input the model would otherwise see:

| Switch | What it removes |
| --- | --- |
| **Persona only** | Every system-prompt section except the persona: harness identity, deployment persona, tool guidance, plan-mode policy, harness-source notes. With no persona selected the system prompt is empty. |
| **Suppress runtime context** | Two families: (1) sandbox policy, approval policy and delegation rules delivered as user-role snapshots; (2) the runtime snapshot and skill catalog framed as `<system-reminder>` blocks. |
| **Suppress tool schemas** | Tool definitions (a separate wire field, not a prompt section, and usually the biggest token item). With this on the model has nothing to call. |
| **Suppress other injections** | The AGENTS.md / CLAUDE.md instruction baseline and per-step time readings — also user-role messages, so they can only be filtered by provenance. |

All four on with no persona selected is **pure chat**: zero system-side injection, the model sees only what you send. The picker in the conversation view has one-click **Make it pure chat / Restore system input** buttons.

**Tool-keeping channel** ("Reusable tools"): the safety valve for "Suppress tool schemas". DSH's tool ledger requires a non-empty tool-declaration baseline for the session; once that baseline is emptied, tools that come back are all marked deferred and the provider rejects the request with `INVALID_REQUEST`. When checked, the plugin keeps the full tool list for exactly one turn at two moments — the session's **first request**, and a suspected **declaration-series restart** (a compaction, for example) — so a non-empty baseline gets written. Afterwards tools can always come back no matter how you toggle suppression.

### Import and export

**Export** (the editor's persona text + section order + history together):

- **Export JSON**: plain, uncompressed, lossless.
- **Export image**: **pick a PNG yourself as the cover** and the same data is packed into the image and downloaded with it. The image is not modified by a single byte and every normal viewer still displays it.
- 32 MB per export. A non-PNG cover, or a structurally incomplete PNG (no readable IHDR), is refused outright with the reason.
- Export takes the persona's **saved** version: unsaved edits trigger a confirmation first, and a new persona that has never been saved cannot be exported.

**Import**:

- Read a `.json` this plugin exported, or the `.png` from "Export image", and append it as **new** personas — existing entries are never overwritten.
- **Import a DSH `/export` session log directly**: accepts the `.zip` produced by `/export`, or a bare `session.vN.jsonl` / `session.jsonl`, or a `.jsonl.zstd` / `.zst`. Two independent options:
  - **Include thinking**: whether the model side's `<thinking>` comes along.
  - **Expand compaction**: by default the box gets the `<compacted-summary>` blocks plus the dialogue after the **last** one; ticked it flips — everything **except** those summaries, with the compaction expanded back into the original text. With no summary in the imported text, ticking changes nothing.

### The picker in a conversation

The "Persona" dropdown under the mode selector:

- Switch this conversation's persona, or choose Off.
- One-click **pure chat / restore system input**.
- A scope badge tells you whether the setting is for **this chat** or **global**.
- Status dots:
  - Green: the tool baseline is usable, all good.
  - Yellow: this session's persona history no longer matches what was injected; the persona text never made it into the system prompt (e.g. the conversation uses a "minimal" preset declaring `complete: true`); the conversation has already been chatting, so its history will not be injected; or "Reusable tools" is unchecked.
  - Red: the persona selected for this session has been deleted (the persona section is empty), or this session's first request carried no tools at all (empty tool baseline — tools cannot return within this session).
- The settings page's Current tab lists the injection blocks **filtered out in this conversation**, by kind: runtime snapshot, skill catalog, workspace instructions, time readings.

### Data files

`<DSH_HOME>/persona-select/` (`DSH_HOME` defaults to `~/.dsh`):

| File | Contents |
| --- | --- |
| `personas.json` | global settings, the persona list, and each conversation's selection and switches |
| `personas.json.v2-backup` | migration backup, safe to delete |
| `history/<id>.txt` | the conversation history body of each persona |

- Names up to 40 characters; persona text recommended under 20000 characters (over that it is reported but kept in full, never truncated); at most 200 personas; at most 500 session records.
- Session records are garbage-collected: records for conversations that no longer exist and are not in the active list are reclaimed (also triggerable from the settings page), so the file cannot grow without bound.

### Known limitations

- **One writer per data file.** The whole file is written back, so two instances saving at once will silently overwrite each other — no error is reported. **Reads** are safe. Keep to a single instance, and after hand-editing `personas.json`, confirm the numbers in the UI.
- **Importing a session log with "Include thinking" off will also delete a literal `<thinking>` you typed in the body, together with everything up to the end of its section.** The rule is "rather delete too much than keep half a thought"; content inside `<compacted-summary>` is unaffected. To keep it literally, write it escaped, e.g. `&lt;thinking&gt;`.
- **Forks and delegations**: a forked child conversation inherits its parent's settings and persona (before first assembly); a delegated subagent inherits settings and persona text but does not get the conversation history injected (except the entry `subagent_fork` inherits from the parent log prefix).

### Interface

Settings page and conversation picker follow the host language, with Simplified Chinese and English built in.

---

## 许可 / License

MIT
