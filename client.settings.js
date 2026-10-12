/**
 * `dsh-persona-select` — 包内分块：client.settings.js（0.3.23 · 审计 §三.1）。
 *
 * 为什么单独一个文件：主包 `client.js` 原来把设置页与选择框两大块都揣在身上
 * （合计约 100 KB）。它们各自只在一种界面上出现（设置页 / 对话输入区），
 * 拆开之后主包小了、两块也能各自读。
 *
 * ⚠ 分块的两条硬规则（与另外两个分块一样，见 `client.js` 的 `loadChunk()`）：
 *   · 文件名必须匹配 `client.<名字>.js`，且与 `client.js` **同目录**；
 *   · `id` 是**包名**、`chunk` 是**文件名**；模块表键是
 *     `dsh-persona-select/client.settings.js`。
 *
 * 分块里**不** require('react')、也不复制主包的常量 —— 一切由 `create(deps)`
 * 注入（`deps` 由主包的 `chunkDeps()` 给出）。这样主包仍是唯一的真相来源，
 * 分块里的组件与搬迁之前逐字相同。
 */
window.__ModuleLoader__.load({
  id: 'dsh-persona-select',
  chunk: 'client.settings.js',
  factory: function settingsChunk(require) {
    'use strict';
    /* @build-fingerprint:begin */
    /**
     * @param {object} deps - 主包注入的作用域（`chunkDeps()`）。
     * @returns {{ PersonaManagerImpl: Function }} 这一个分块提供的组件。
     */
    function create(deps) {
      const {
        React, h, S, fallbackT,
        AssemblyLine, Hint, ScrollBar, layerIndicators,
        EXPORT_FORMAT, EXPORT_VERSION, EXPORT_MAX_BYTES,
        STRIP_KIND_FIELDS, SWITCH_FIELDS, RESIDENT_RETRY_MS,
        allSwitchesOn, byColorRank, call, checkOrderInput, ensureScrollCss,
        historyBytesOf, indicatorFor, indicatorsOf,
        ioExport, logImport, logImportSync,
        notifyPersonaChanged, summarizeIndicators,
        useMainSessionRow, usePersonaState, useSettledTick,
      } = deps;
    /**
     * 设置页「人设管理」。
     *
     * 版面是四张卡，自上而下固定顺序：
     *   1. 装配状态（装配显示 + 「工具可复用」安全阀）   2. 人设列表
     *   3. 新建 / 编辑人设（名字 / 正文 / 段序权重 + 保存）   4. 输入抑制开关
     *
     * 0.2.8 起最上面多一排**两页**：「当前」= 本对话的设置（存进插件文件的
     * 会话记录），「全局」= 新对话跟随的那一份。卡①和卡④显示的都是**当前
     * 这一页那一层**的值，所以「在 A 对话里点一键纯聊天」不会动到 B。
     * 只有「这个对话已经有自己的记录」时才显示「当前」页。
     * @param {object} props - 槽位给的 props（standardProps 里的 `useSessions` 等）。
     * @returns {import('react').ReactElement} 设置页区块。
     */
    function PersonaManagerImpl(props) {
      const t = props !== null && props !== undefined && typeof props.t === 'function' ? props.t : fallbackT;
      /**
       * 正在看的那个对话（设置面板打开时主视图仍然 retain 着它，所以这个
       * 选择在面板里照样成立）。拿不到就是空串 —— 那就只有「全局」页。
       */
      // 档位 4（R6）：三样一次拿齐（以前各订一次 = 3 份兜底订阅 / 12 格）。
      // 0.3.14：「会话」后面显示**标题**（与界面标题栏同一个 `displayTitle`），
      // 拿不到标题时下面渲染里退回显示 id。
      const mainSession = useMainSessionRow(props?.useSessions);
      const currentSessionId = mainSession.sessionId;
      const currentSessionTitle = mainSession.title;
      const currentBlank = mainSession.blank;
      /**
       * 当前会话的**父会话 id**（0.3.25）：`string` / `null`（没有父）/
       * `undefined`（连那一行都没拿到）。三态原样转发给 `/resident`，Host 靠它
       * 让分叉出来的子对话从父会话那一层继承设置与人设 —— 见
       * `client.js` 的 `parentOf()`。
       */
      const currentParent = mainSession.parent;
      const { status, data, error, reload } = usePersonaState(currentSessionId);
      /** 设置页显示哪一页：'current'（本对话） | 'global'。 */
      const [tab, setTab] = React.useState('current');
      /** 只在**第一次**拿到数据时把默认页定下来（没有记录 → 只能看全局）。 */
      const tabPickedRef = React.useRef(false);
      /**
       * 已经替哪一次「(页, 这一页启用的人设)」自动预览过（0.3.5）。
       *
       * 内容是 `${activeTab}:${layer.activeId ?? ''}`：键一变（切页、或这一层
       * 启用了另一条人设）就重新按「正在启用的那条」预览一次，见下面的 effect。
       *
       * 显式点某一条人设时也把这个键记成「已处理」（见 {@link loadPersona}）——
       * 用户点的那一条永远优先于自动预览。
       */
      const autoPreviewRef = React.useRef(null);
      /** 当前那一把「(页, 这一层启用的人设)」的键（渲染时更新，见下面 activeTab/layer 之后）。 */
      const previewKeyRef = React.useRef('');
      const [selectedId, setSelectedId] = React.useState(null);
      const [draft, setDraft] = React.useState({ id: '', name: '', text: '' });
      /** 载入这条人设时的名字 / 正文：判断「人设改过没有」跟它比。 */
      const [draftBaseline, setDraftBaseline] = React.useState({ id: '', name: '', text: '' });
      /** 「新建」占位模式：编辑区里是一条**还没保存**的新人设。 */
      const [creating, setCreating] = React.useState(false);
      /**
       * 0.3.13：「编辑区刚刚被清空，列表一条勾边都不要画」。
       *
       * 现在只有**删除**会把它竖起来：删掉之后编辑区是空的，可列表里的勾边原本会
       * 落回「这一页正在启用的那一条」（见列表里的 `previewId`），于是列表说「正在
       * 预览 A」、编辑区里却根本没有 A —— 两边各说各话。
       *
       * 竖起来之后，列表与「新建」时同一副样子（一条选框都不画）。下一次真正载入
       * 某一条人设（{@link loadPersona}，含用户点列表、导入后自动载入），或点「新建」
       * （{@link onNewPersona}）就复位 —— 这两条路都会让编辑区重新有主。
       *
       * 它**只压住那个兜底**：`selectedId` 一旦有值（用户真的选了某一条），勾边照画。
       */
      const [noPreview, setNoPreview] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      /** 「输入抑制开关」那张卡的提示行（开关已保存 / 已切到纯聊天 / 已还原）。 */
      const [notice, setNotice] = React.useState(null);
      /**
       * 卡③（人设编辑）那一行的提示（0.3.5）：**启用 / 删除**的结果。
       *
       * 它必须渲染在编辑区那一排并列按钮**正上方**（和保存反馈、导出结果同一片
       * 区域）—— 0.3.4 之前它和开关共用一个 `notice`，于是点「启用」时那句
       * 「已切换人设…」跑到第④张「输入抑制开关」卡里去了（bug 1.2）。
       */
      const [editorNotice, setEditorNotice] = React.useState(null);
      const [failure, setFailure] = React.useState(null);
      /**
       * 最下方按钮**上方**的保存反馈（0.2.0）：三段改动各自一条消息，
       * 改了几项就并列显示几项；失败时是「保存失败：…」。
       */
      const [saveFeedback, setSaveFeedback] = React.useState(null);
      /**
       * 「保存中…」（0.2.6）：**只有**保存超过 120ms 才显示。
       * 常见的几十 KB 存档 1~3ms 就完事，出这行字只会闪一下，所以用计时器压住；
       * 它让等待**可读**，不缩短等待。
       */
      const [showSaving, setShowSaving] = React.useState(false);
      const savingTimerRef = React.useRef(0);
      React.useEffect(() => () => clearTimeout(savingTimerRef.current), []);
      /**
       * 段序权重的草稿：`{mode: 'number'|'follow', value: string}`。
       * `value` 永远保留一份数值文本，所以「追随 → 点回输入框」能回到刚才那个数。
       */
      const [orderDraft, setOrderDraft] = React.useState({ mode: 'number', value: '-1' });
      /** 载入这条人设时它自己的权重：判断「改过没有」跟它比，不跟全局比。 */
      const [orderBaseline, setOrderBaseline] = React.useState({ mode: 'number', value: '-1' });
      /** 渲染里始终读得到最新的 data；载入草稿的 effect 只跟 selectedId 走。 */
      const dataRef = React.useRef(data);
      dataRef.current = data;

      // 设置页也补一次那一小段 CSS（0.3.5）：人设列表的按钮要关掉浏览器自己的
      // 焦点环，否则「点过的人设都留着一圈框」。幂等，注入失败不影响功能。
      React.useEffect(() => {
        ensureScrollCss();
        return undefined;
      }, []);

      /* ── 「当前 / 全局」两页（0.2.8）────────────────────────── */

      /**
       * 打开设置页时替 Host 做两件事（各一次）：
       *   1. `PUT /resident` —— 这个对话还没有记录就请它采样（旧对话）；
       *   2. `PUT /gc` —— 清掉已经被删除的对话留下的记录。
       * 两件都只是「顺手做掉」，失败不影响设置页本身。
       */
      const syncAskedRef = React.useRef('');
      React.useEffect(() => {
        const key = currentSessionId;
        if (syncAskedRef.current === key) return undefined;
        syncAskedRef.current = key;
        let cancelled = false;
        (async () => {
          try {
            if (currentSessionId !== '') {
              // 0.3.25：`parent` 一并转发（三态，见 `client.js` 的 `parentOf()`）。
              // 设置页**总是**知道答案 —— 它读的就是会话列表那一行 —— 所以这个
              // 键总是发出去：`null` = 这一行没有父（Host 可以放心按全局层采样），
              // 字符串 = 父会话 id（Host 从父会话那一层继承）。少了这个键，Host
              // 在「还没看见这个会话」时就只能什么都不做。
              const asked = { session: currentSessionId };
              if (currentBlank !== undefined) asked.blank = currentBlank;
              if (currentParent !== undefined) asked.parent = currentParent;
              await call('/resident', { method: 'PUT', body: JSON.stringify(asked) });
            }
            await call('/gc', {
              method: 'PUT',
              body: JSON.stringify(currentSessionId === '' ? {} : { session: currentSessionId }),
            });
          } catch {
            // 采样 / 清理失败都不影响设置页：下次打开还会再来一遍。
          }
          if (!cancelled) reload();
        })();
        return () => {
          cancelled = true;
        };
      }, [currentSessionId, currentBlank, currentParent, reload]);

      /**
       * 默认显示哪一页：**有记录就默认「当前」，没有就只剩「全局」**。
       *
       * 只在第一次拿到数据时定；之后如果记录才出现（我们打开设置页时刚请
       * Host 采样成功），也补一次「默认切到当前」——但用户自己点过就不再拨。
       */
      const tabTouchedRef = React.useRef(false);
      React.useEffect(() => {
        if (data === null) return;
        const has = data.session?.hasRecord === true;
        if (!tabPickedRef.current) {
          tabPickedRef.current = true;
          setTab(has ? 'current' : 'global');
          return;
        }
        if (has && !tabTouchedRef.current) setTab('current');
      }, [data]);

      /* ── 「人设历史对话」（0.1.6 / 0.2.0）────────────────────── */
      /**
       * 两个选框**共用**的输入框内容。
       *
       * 「切换两选框时不清空或替换」在实现上就是这一条：`tab` 只决定
       * 上方多渲染一个「导入」按钮，textarea 一直是同一份 state。
       */
      const [historyText, setHistoryText] = React.useState('');
      /** 当前选框：'edit'（手动编辑） | 'import'（导入会话日志）。 */
      const [historyTab, setHistoryTab] = React.useState('edit');
      /** 载入这条人设时它**已经保存**的正文：判断输入框有没有未保存的改动。 */
      const [historyBaseline, setHistoryBaseline] = React.useState('');
      /**
       * 「这条人设的历史对话锁没锁、什么时候锁的」——**唯一**的本地来源。
       *
       * `{ id, at }`：`id` 是它属于哪条人设（切人设的那一瞬间不会读到上一条
       * 的值）；`at` 是锁定时间，`null` 表示「这条确定没存过」（刚清空过）。
       * 写它的只有两处：选中人设时的详情（`GET /persona`）与保存成功后的本地
       * 更新 —— 两处都是**权威**读数，所以清空之后标记立刻变灰。面板轮询里的
       * 那一位只在「本地还没有这条人设的记录」时兜底（刚选中、详情还没回来的
       * 那一帧），免得把「已存」显示成「未存」。
       */
      const [historyLocked, setHistoryLocked] = React.useState(null);
      /** 导入期间禁用按钮。 */
      const [historyBusy, setHistoryBusy] = React.useState(false);
      /** 这块界面自己的提示行（导入结果）。 */
      const [historyNotice, setHistoryNotice] = React.useState(null);
      /** 隐藏的文件选择器：点「导入」时由代码触发它。 */
      const historyFileRef = React.useRef(null);
      /* ── 人设导入 / 导出（0.3.0）──────────────────────────── */
      /** 人设导入期间（读文件 + 落盘）禁用按钮。 */
      const [importing, setImporting] = React.useState(false);

      /**
       * K3（档位 2）：**这三个忙标记的合并总数** —— 任何一个在写，其余的写操作
       * 都得禁用。
       *
       * 以前界面用三个互不相干的标记表示「正在忙」（`busy` 管保存/删除/启用、
       * `historyBusy` 管导入历史、`importing` 管导入人设），而「保存按钮能不能点」
       * **只看第一个**。于是正在导入一份人设清单的时候，保存 / 删除 / 启用**全都
       * 还能点** —— 两件写入同时进行，各自读一遍、各自写一遍，后写的把先写的
       * 盖掉。现在所有「会写数据」的按钮与处理函数统一看这**一个**数。
       */
      const writeBusy = busy || historyBusy || importing;

      /** K3：`run()` 的依赖表是空的，只能从 ref 里读同一份「有没有写操作在跑」。 */
      const writeBusyRef = React.useRef(false);
      writeBusyRef.current = writeBusy;
      /** 人设列表下方那一行导入结果。 */
      const [importNotice, setImportNotice] = React.useState(null);
      /** 人设导入用的隐藏文件选择器。 */
      const importFileRef = React.useRef(null);
      /** 「导出」的结果：渲染在编辑区按钮行**正上方**（按钮就在那儿）。 */
      const [exportNotice, setExportNotice] = React.useState(null);
      /** 「导出」的一键菜单是否展开（0.3.1）：一个按钮，两项选择。 */
      const [exportMenu, setExportMenu] = React.useState(false);
      /** 选「导出图片」时用来挑封面的隐藏文件选择器。 */
      const exportPngRef = React.useRef(null);
      /** 导入时是否带上模型思考过程（0.2.0，默认不带）。 */
      const [includeThinking, setIncludeThinking] = React.useState(false);
      /**
       * 「展开原文压缩」（0.3.14；0.3.8–0.3.13 叫「仅导最后压缩」）。
       *
       * 默认**不勾** = 压缩视图：导入结果里只留那些被 `<compacted-summary>` 包住的
       * 摘要（原文照搬），再接上最后一段之后的对话（见 `compactedViewOf()`）。
       * 勾上 = 展开原文：导入**除这些摘要以外**的全部原文（见 `uncompactedViewOf()`）。
       *
       * 和「导入思考过程」一样是渲染期的勾选，两个勾选框各管一件事、叠加生效。
       */
      const [expandOriginal, setExpandOriginal] = React.useState(false);
      /**
       * 上一次导入的两份渲染结果：`{withThinking, withoutThinking}`。
       * 「导入思考过程」勾选框靠它们在输入框里**实时**增删思考内容；
       * 「仅导最后压缩」也在这两份之上现算（不缓存第三份 —— 组合只有四种，
       * 而缓存会在两个勾选框之间引入「哪一份才是当前」的状态）。
       */
      const [historyVariants, setHistoryVariants] = React.useState(null);
      /** 「清空」按过之后按钮变成「撤回」，直到撤回或重新载入人设。 */
      const [historyCleared, setHistoryCleared] = React.useState(false);
      /**
       * F4（档位 2）：设置页顶部那条「需要注意的情况」提示条是否展开。
       *
       * 服务端其实一直在记「我丢掉了什么 / 我降级处理了什么」（非法人设编号、
       * 重复人设、段序写法不对、会话记录超量、文件为空、正文超长…），每 4 秒
       * 跟着 `/state` 发过来，而客户端**一次都没读**（`warnings` 在 0.3.18 的
       * `client.js` 里出现 0 次）—— 所有「静默降级」都因为没人看而变成了
       * 「静默丢数据」。默认收起，不占版面。
       */
      const [showWarnings, setShowWarnings] = React.useState(false);
      /** 人设正文 / 历史对话输入框（滚动条组件要拿它们量高度）。 */
      const personaBoxRef = React.useRef(null);
      const historyBoxRef = React.useRef(null);
      /**
       * 「程序性变更」计数器（0.2.6）：切人设 / 导入 / 清空 / 撤回 / 勾选思考过程
       * 都会 +1，让 `useSettledTick` **立即**结算，不走打字防抖。
       */
      const [draftEpoch, setDraftEpoch] = React.useState(0);
      const [historyEpoch, setHistoryEpoch] = React.useState(0);
      /**
       * 两个输入框各自的「文本停稳」节拍（0.2.6）：自绘滑条只认它，
       * 不再把文本本身当依赖 —— 否则每敲一个字都要强制布局量一次高度。
       */
      const draftTick = useSettledTick(draft.text, draftEpoch);
      const historyTick = useSettledTick(historyText, historyEpoch);
      /**
       * 「增耗 N tok」里的 N。`TextEncoder` 要扫完整段文本（3.45M 字符实测约 20ms，
       * 而且每次都分配一整个字节数组），所以改成**停稳之后**才结算一次（0.2.6）：
       * 打字过程中数字短暂停在旧值，松手约 150ms 后跳一次；切人设 / 导入 / 清空 /
       * 撤回这些程序性变更仍然立即精确。
       */
      const [historyBytes, setHistoryBytes] = React.useState(0);
      React.useEffect(() => {
        setHistoryBytes(historyBytesOf(historyText));
      }, [historyTick]);

      /**
       * 人设没填过权重时界面该显示哪个数 —— 也就是它**真正会用的**那个兜底值：
       * profile 补丁里的 `sectionOrder`（Host 报在 `orderConfigured`）优先，
       * 其次是内置默认 `-1`。
       */
      const configuredOrder = data?.section?.orderConfigured;
      const orderDefaultValue = String(Number.isFinite(configuredOrder) ? configuredOrder : (data?.section?.orderDefault ?? -1));
      /** 「追随」实际用的那个数（点一下追随框改回数值时的起点）。 */
      const orderFollowValue = String(data?.section?.orderFollow ?? 1000000);
      /** 把「存过的权重」翻成草稿：`null` = 没设置过 → 显示默认 -1。 */
      const orderDraftOf = (stored) =>
        stored === 'follow'
          ? { mode: 'follow', value: orderFollowValue }
          : { mode: 'number', value: String(stored ?? orderDefaultValue) };

      /** Host 那一份归一化的本地镜像：判断「改过没有」要跟它比，不能跟输入原文比。 */
      const normalizeNameLocal = (value) =>
        String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, data?.limits?.maxName ?? 40);
      /**
       * 正文的本地镜像。**不再按 `limits.maxText` 截断**（档位 2 的 Q2(b)）：
       *
       * 这个函数的结果会直接当作要提交的正文（见 `settledDraft`），所以以前那一刀
       * 意味着「在面板里粘 25000 字 → 只有前 20000 字被保存」—— 正是 Q2(b) 要修掉
       * 的静默截断，只是发生在客户端这一侧。`limits.maxText` 现在只当**提醒阈值**
       * （超长的提醒由服务端推导，见 `/state.warnings`）。
       */
      const normalizeTextLocal = (value) =>
        String(value ?? '').replace(/\r\n?/g, '\n').trim();

      /**
       * 把某条人设标记成「已载入」：清掉草稿态与上一轮反馈。
       * 真正的正文由下面那个只跟 `selectedId` 走的 effect 拉回来。
       */
      /**
       * 收掉「导出」那一行的提示行与一键菜单（0.3.8）。
       *
       * 它们都属于**某一条**人设：换人设 / 新建 / 放弃草稿时都要一起清掉，
       * 否则上一条的「无法导出：新建人设尚未保存」会留在屏幕上误导人。
       * 里面只调 setState（引用稳定），所以空依赖的 `loadPersona` 里也可以调。
       */
      const clearExportUi = React.useCallback(() => {
        setExportNotice(null);
        setExportMenu(false);
      }, []);

      const loadPersona = React.useCallback((id) => {
        // 显式载入（用户点了某一条）＝ 这一次「默认预览」就算处理过了：
        // 否则等草稿变干净时自动预览会反过来把用户刚点的那一条顶掉。
        autoPreviewRef.current = previewKeyRef.current;
        setSelectedId(id);
        setCreating(false);
        // 0.3.13：编辑区又有主了 —— 「删掉之后一条勾边都不画」那道闸门复位。
        setNoPreview(false);
        setSaveFeedback(null);
        setHistoryNotice(null);
        setHistoryVariants(null);
        setHistoryCleared(false);
        // 0.3.8：导出那一行的提示 / 菜单属于**上一条**，换人设就一起收掉 ——
        // 否则「无法导出：新建人设尚未保存」会跟着新载入的人设留在屏幕上。
        clearExportUi();
      }, []);

      // 选中项变化时把正文、**它自己的**段序权重、以及已保存的历史对话取回来。
      //
      // 依赖里刻意不放 `data`：轮询（另一个挂载点改了人设）不能把正在编辑的
      // 内容冲掉；只有「用户真的点了另一条人设」才重新载入。
      React.useEffect(() => {
        if (selectedId === null) return undefined;
        let cancelled = false;
        (async () => {
          try {
            // 一次往返拿齐「名字 + 正文 + 权重 + 历史对话」。
            // 正文可能很大，所以不能塞进每次轮询的 `/state`，只能按需取。
            const hit = await call(`/persona?id=${encodeURIComponent(selectedId)}`);
            if (cancelled) return;
            if (hit.found !== true) return;
            const persona = (dataRef.current?.personas ?? []).find((entry) => entry.id === selectedId);
            // 内置人设只读：直接进「新建」模式（等于复制一份），正文与权重都填好。
            const nextDraft = persona !== undefined && persona.builtin
              ? { id: '', name: `${hit.name} 副本`, text: hit.text }
              : { id: selectedId, name: hit.name, text: hit.text };
            setDraft(nextDraft);
            setDraftBaseline(nextDraft);
            setDraftEpoch((n) => n + 1);
            const nextOrder = orderDraftOf(hit.order ?? persona?.order ?? null);
            setOrderDraft(nextOrder);
            setOrderBaseline(nextOrder);
            // 存过就把正文填进输入框、并把它记成「基线」（= 已经存下来的那一份）；
            // 没存过就是空。基线决定「输入框里有没有未保存的改动」。
            const stored = typeof hit.historyText === 'string' ? hit.historyText : '';
            setHistoryText(stored);
            setHistoryBaseline(stored);
            setHistoryEpoch((n) => n + 1);
            setHistoryLocked({
              id: selectedId,
              at: typeof hit.historyLockedAt === 'number' ? hit.historyLockedAt : null,
              // 0.3.21：宿主一直在 `/persona` 回执里发 `historyMissing`（G5，档位 2），
              // 客户端此前一个字都没读它 —— 于是「存过、但文件已经不在了」被判成
              // 「从没存过」。`/state` 的字段形状没有动，这个布尔只有详情接口有。
              missing: hit.historyMissing === true,
            });
            setHistoryNotice(null);
            setHistoryVariants(null);
            setHistoryCleared(false);
          } catch (problem) {
            if (!cancelled) setFailure(problem?.message ?? String(problem));
          }
        })();
        return () => {
          cancelled = true;
        };
      }, [selectedId]);

      const run = React.useCallback(
        async (work) => {
          // K3（档位 2）：已经有一件写操作在跑时，**不再开始第二件**。
          // 界面上那些按钮已被 `writeBusy` 一起禁用，这里是第二道闸门 ——
          // 键盘回车、程序化点击、广播绕过来的路径同样拦得住。
          if (writeBusyRef.current) return;
          setBusy(true);
          setFailure(null);
          // 两条提示行分属两张卡，一起清掉：新动作的开始等于上一轮结果的结束。
          setNotice(null);
          setEditorNotice(null);
          try {
            await work();
          } catch (problem) {
            setFailure(problem?.message ?? String(problem));
          } finally {
            setBusy(false);
          }
        },
        [],
      );

      const personas = data?.personas ?? [];
      /**
       * 「这个对话有没有自己的记录」。没有记录时**只有全局页** ——
       * 需求原话：「当前对话若有插件文件记录，则打开设置界面时默认先选择
       * 当前设置页显示，无插件文件记录时，仅显示全局设置页」。
       */
      const hasRecord = data?.session?.hasRecord === true;
      /** 实际显示的那一页：当前页不可用时强制回落到全局。 */
      const activeTab = hasRecord ? tab : 'global';
      /**
       * 这一页对应的那一层设置。全局页读 Host 单列出来的 `global`，
       * 当前页读顶层的有效值 —— 于是「按钮点下去写哪一层」和「界面上显示
       * 哪一层的值」永远是同一个来源。
       */
      const layer = activeTab === 'current'
        ? {
            activeId: data?.activeId ?? null,
            found: data?.activeFound !== false,
            switches: data?.switches ?? {},
            toolReusable: data?.toolReusable !== false,
          }
        : {
            activeId: data?.global?.activeId ?? null,
            found: data?.global?.found !== false,
            switches: data?.global?.switches ?? {},
            toolReusable: data?.global?.toolReusable !== false,
          };
      const switches = layer.switches;
      const everySwitchOn = allSwitchesOn(switches);
      // 「工具可复用」是安全阀：不在 switches 里，方向也相反 —— 缺省即开启。
      const toolReusable = layer.toolReusable;
      // 「纯聊天」= 四个开关全开 **且** 没有激活人设 —— 此时系统侧真的零注入。
      const pureChat = everySwitchOn && layer.activeId === null;
      /**
       * 这一页的写操作要带上的会话 id：当前页带（Host 会写这个对话那一份），
       * 全局页不带（Host 写全局那一份）。空串 = 不带。
       */
      const writeSession = activeTab === 'current' && currentSessionId !== '' ? currentSessionId : '';
      /**
       * 给请求体补上「写哪一层」。全局页**不加** `session` 这个键 ——
       * 让「不带 = 全局」这条契约在报文上也看得见。
       * @param {object} payload - 请求体。
       * @returns {object} 补好层的请求体。
       */
      const withSession = (payload) => (writeSession === '' ? payload : { ...payload, session: writeSession });

      // ── 三份草稿各自「改过没有」（0.2.0）──
      /** 人设正文这一半：名字 / 正文跟载入时不一样才算改过。 */
      const personaDirty = draft.name !== draftBaseline.name || draft.text !== draftBaseline.text;
      /** 段序权重草稿跟载入时不一样才算改过（「追随」只在模式上比）。 */
      const orderDirty =
        orderDraft.mode !== orderBaseline.mode ||
        (orderDraft.mode === 'number' && orderDraft.value.trim() !== orderBaseline.value.trim());
      /** 历史对话输入框跟已保存的那一份不一样就算改过。 */
      const historyDirty = historyText !== historyBaseline;
      /** 还没保存的改动清单（弹窗与提示行都用它，出现几种就列几种）。 */
      const dirtyParts = [
        personaDirty ? t('unsavedPersona') : null,
        orderDirty ? t('unsavedOrder') : null,
        historyDirty ? t('unsavedHistory') : null,
      ].filter((part) => part !== null);
      /**
       * 底部「保存」：三段里任意一段改过就能存，**还没有 id 的草稿**也永远能点。
       *
       * 0.3.8：先只把「点新建」那一条路放开了（判据是 `creating`）。一条刚点出来的
       * 新人设三份草稿都跟基线一样（正文是空的 —— 基线也是空的），旧写法在这里把
       * 按钮 disable 掉，用户点下去什么都不会发生，于是永远看不到「空人设不能保存、
       * 空人设请用不注入」这句本来就该给的答复。
       *
       * 0.3.9：判据从 `creating` 换成 **`draft.id === ''`** —— 「还没有 id 的草稿」
       * 不止「点新建」那一条路，**内置人设「复制为新人设」**（以及任何还没落盘的
       * 草稿）同样是 `draft.id === ''` 却不带 `creating`。旧判据把那些人挡在门外：
       * 保存按钮灰着、点了没反应，而旁边那个「导出」已经会说「无法导出：新建人设
       * 尚未保存」—— 用户被夹在「导出叫你先保存」和「保存按不动」中间。
       * 现在保存与导出的闸门用**同一个判据**（见 `canClickExport`）。
       */
      // K3（档位 2）：保存按钮看**合并后的**忙标记 —— 导入人设 / 导入历史
      // 期间它必须也是灰的，否则两件写入会同时进行、后写的把先写的盖掉。
      const canSave = !writeBusy && (dirtyParts.length > 0 || draft.id === '');
      /**
       * 「导出」（0.3.0）能不能真导出。
       *
       * 三个条件缺一不可：不在新建（新人设还没有 id）、编辑区里是一条**真的**
       * 已经保存的人设、而且草稿已经跟它对上 —— `draft.id === selectedId`
       * 这一条挡的是「刚点了另一条人设、正文还在路上」那一小段窗口，
       * 否则会把上一条的正文当成这一条导出去。
       */
      const canExport = !busy && !creating && draft.id !== '' && draft.id === selectedId;
      /**
       * 「导出」按钮能不能**点**（0.3.8）。
       *
       * 比 `canExport` 宽一档：新建（以及内置人设「复制出来还没保存」）时也
       * 可点 —— 点下去回答「无法导出：新建人设尚未保存」，而不是给一个按不动
       * 的按钮。「草稿还没跟上」那一小段窗口仍然不给点（它没有可解释的话可说）。
       */
      const canClickExport = busy ? false : (canExport || draft.id === '');
      /**
       * 这次保存要不要连人设正文一起写。
       *
       * 0.3.8：**新建（还没有 id）时一定要写** —— 权重与历史对话都没有地方可落，
       * 而且空正文的新人设本来就不该被存下来（见 `onSave` 里的第一道校验）。
       */
      const mustSavePersona = personaDirty || draft.id === '';

      /** 把校验结果翻成人话。 */
      const orderProblemText = (code, raw) => {
        if (code === 'empty') return t('orderProblemEmpty');
        if (code === 'range') return t('orderProblemRange');
        return `${t('orderProblemInteger')}「${String(raw ?? '').trim().slice(0, 32)}」。`;
      };
      const onOrderFollow = () => {
        setSaveFeedback(null);
        setOrderDraft((previous) => ({
          mode: 'follow',
          value: previous.value.trim() === '' ? orderBaseline.value : previous.value,
        }));
      };
      const onOrderDefault = () => {
        setSaveFeedback(null);
        setOrderDraft({ mode: 'number', value: orderDefaultValue });
      };
      const onOrderFollowBoxClick = () => {
        setSaveFeedback(null);
        setOrderDraft({ mode: 'number', value: orderBaseline.value });
      };

      /**
       * 点列表里的某条人设。
       *
       * 只要三份草稿里有**任何一份没保存**，就先弹确认，弹窗里逐条列出到底
       * 哪几项要丢 —— 人设、段序权重、历史对话各自算一项，出现几种显示几种。
       */
      const onPreview = (id) => {
        if (id === selectedId && !creating) return;
        if (dirtyParts.length > 0) {
          const message =
            `${t('switchConfirm')}\n${dirtyParts.map((part) => `· ${part}`).join('\n')}\n\n${t('switchConfirmTail')}`;
          if (
            typeof window === 'undefined' ||
            typeof window.confirm !== 'function' ||
            !window.confirm(message)
          ) {
            return;
          }
        }
        // 0.3.13：用户真的选了一条 —— 「新动作的开始等于上一轮结果的结束」，
        // 编辑区那一行的提示（尤其是刚删完那句「人设已删除」）跟着收掉。
        // 这一支不走 `run()`，所以得自己清（`run()` 里清的是同一对提示行）。
        setEditorNotice(null);
        loadPersona(id);
      };

      /** 「新建」：用「未命名」占位，权重填默认值，历史对话框清空。 */
      const onNewPersona = () => {
        setCreating(true);
        // 0.3.13：与 {@link onPreview} 同理 —— 开始就别留着上一条的「人设已删除」。
        setEditorNotice(null);
        // 0.3.13：新建态本来就不画勾边（`creating`），闸门顺手复位。
        setNoPreview(false);
        setSelectedId(null);
        setSaveFeedback(null);
        setHistoryNotice(null);
        setHistoryVariants(null);
        setHistoryCleared(false);
        clearExportUi();
        setDraft({ id: '', name: t('unnamed'), text: '' });
        setDraftBaseline({ id: '', name: t('unnamed'), text: '' });
        setDraftEpoch((n) => n + 1);
        const next = { mode: 'number', value: orderDefaultValue };
        setOrderDraft(next);
        setOrderBaseline(next);
        // 新人设还没有 id，历史对话也就无处可存：清空输入框。
        setHistoryText('');
        setHistoryEpoch((n) => n + 1);
        setHistoryBaseline('');
        setHistoryLocked(null);
      };

      /** 「清除」：放弃这条没保存的新人设（0.2.0 起不再有「待切换」概念）。 */
      //
      // 0.3.23（审计 §三.4）：**必须 memo**。它出现在下面那个「默认预览」effect
      // 的依赖表里，而这个函数改前每次渲染都是新的 → effect 每渲染都跑一遍
      // （虽然里面那道 `autoPreviewRef` 早退让它是空转，但那是白跑，而且真正的
      // 依赖变化会被淹没在每个渲染都变的假变化里）。它内部只调 setState 与一个
      // 空依赖的 `clearExportUi`，所以依赖表就是 `[clearExportUi]`。
      const onDiscardNew = React.useCallback(() => {
        setCreating(false);
        setSaveFeedback(null);
        setHistoryNotice(null);
        setHistoryVariants(null);
        setHistoryCleared(false);
        clearExportUi();
        setSelectedId(null);
        setDraft({ id: '', name: '', text: '' });
        setDraftBaseline({ id: '', name: '', text: '' });
        setDraftEpoch((n) => n + 1);
        setHistoryText('');
        setHistoryBaseline('');
        setHistoryEpoch((n) => n + 1);
        setHistoryLocked(null);
      }, [clearExportUi]);

      /**
       * 默认预览「这一页正在启用」的那一条（需求 2.4）。
       *
       * 键 = `页:这一层启用的人设`。它一变（刚打开设置页、在「当前 / 全局」
       * 之间切换、或这一层启用了另一条 / 被关掉）就按那一层重新预览一次：
       *   - 这一层确实有一条被启用 → 把它载进编辑区；
       *   - 没有（activeId 为 null = 「不注入」）→ 清空编辑区，因为没有谁可预览。
       *
       * 两道闸门保护用户输入：正在新建（草稿还没有 id）、或三份草稿里有任何
       * 一份没保存时都不动编辑区 —— 静默丢掉别人敲进去的内容，比「没自动预览」
       * 糟得多。这种时候**不记这个键**，等草稿干净了再补一次；而「用户自己点过
       * 哪一条」由 {@link loadPersona} 记的账挡住，不会被补的那一次顶掉。
       */
      React.useEffect(() => {
        if (data === null) return;
        const key = previewKeyRef.current;
        if (autoPreviewRef.current === key) return;
        if (creating || dirtyParts.length > 0) return;
        autoPreviewRef.current = key;
        if (layer.activeId === null) {
          onDiscardNew();
          return;
        }
        loadPersona(layer.activeId);
      }, [data, activeTab, layer.activeId, creating, dirtyParts.length, loadPersona, onDiscardNew]);

      /**
       * 「导入」：确认 → 打开文件选择器。
       * 选择器是隐藏的 `<input type="file">`，点击由代码触发。
       */
      const onImportClick = () => {
        if (writeBusyRef.current) return;
        if (
          historyText.trim() !== '' &&
          typeof window !== 'undefined' &&
          typeof window.confirm === 'function' &&
          !window.confirm(t('historyImportConfirm'))
        ) {
          return;
        }
        const node = historyFileRef.current;
        if (node === null || node === undefined) return;
        // 每次点都先把 value 清掉：否则连续挑**同一个文件**不会触发 change。
        try {
          node.value = '';
        } catch {
          // 清不掉就算了，最多是第二次挑同一个文件没反应。
        }
        if (typeof node.click === 'function') node.click();
      };

      /**
       * 读文件 → 渲染成「思考 + 正文」→ 填进**两个选框共用**的那个输入框。
       *
       * 两种渲染结果都先算出来（带思考 / 不带思考），勾选框就能在输入框里
       * **实时**增删思考内容。全程只读：原会话日志文件一个字节都不会被改。
       *
       * 0.3.8 起这一步还要照顾「仅导最后压缩」：勾着它时，导入**当场**就只把
       * 最后一段压缩摘要填进去（而不是先填全文再等用户再点一次）。
       */
      const onImportFile = async (file) => {
        if (file === null || file === undefined) return;
        setHistoryBusy(true);
        setHistoryNotice(null);
        try {
          const log = await logImport();
          const source = await log.readSessionFile(file);
          // 只解析一次；两种渲染结果都先算出来，勾选框才能随时在输入框里
          // 增删思考内容（大日志下解析才是大头）。
          const events = log.readSessionEvents(source);
          const withThinking = log.renderSessionEvents(events, true);
          const withoutThinking = log.renderSessionEvents(events, false);
          if (withThinking.trim() === '' && withoutThinking.trim() === '') {
            setHistoryNotice({ kind: 'error', text: t('historyImportEmpty') });
            return;
          }
          // 0.3.14：导入的**默认**内容就是压缩视图（只留压缩摘要原文 + 最后一段之后
          // 的对话），两个勾选框各自叠加：`expandOriginal` 决定「留摘要」还是「留除
          // 摘要以外的原文」，`includeThinking` 决定用哪一份渲染结果（带 / 不带思考）。
          //
          // 这里刻意直接用**刚算出来的**那一份，不经过 `importView()`：那个读的是
          // `historyVariants`，而它这一刻还是上一次导入（第一次导入更是 null）。
          const chosen = log.importViewOf(includeThinking ? withThinking : withoutThinking, expandOriginal);
          setHistoryVariants({ withThinking, withoutThinking });
          setHistoryText(chosen.text);
          setHistoryEpoch((n) => n + 1);
          setHistoryTab('import');
          setHistoryCleared(false);
          // 0.3.15：那条「文件名 · 字数」也去掉了 —— 导入这一路和两个勾选框**完全同源**：
          // 这份日志里没有被 <compacted-summary> 包住的压缩摘要时报一句
          // 「该历史对话尚未压缩过」，有摘要时**一行都不报**（见 `importViewNotice()`，
          // 它在有摘要时返回 null，`setHistoryNotice(null)` 就是不渲染那一行）。
          setHistoryNotice(importViewNotice(chosen));
        } catch (problem) {
          setHistoryNotice({
            kind: 'error',
            text: `${t('historyImportFailed')}：${problem?.message ?? String(problem)}`,
          });
        } finally {
          setHistoryBusy(false);
        }
      };

      /**
       * 「现在这两个勾选框组合起来，输入框里应该是什么」——两个勾选框四个组合
       * 全走这一个地方，规则只有两条（详见 {@link importViewOf}）：
       *
       * - `expandOriginal` 不勾 = **压缩视图**（全部压缩摘要原文 + 最后一段之后的对话）；
       * - 勾上 = **展开原文**（整份文本去掉那些压缩摘要）；
       * - `includeThinking` 决定拿哪一份渲染结果来算（带 / 不带 `<thinking>`）。
       *
       * 每次都从 `historyVariants` 现算，而不是对输入框做字符串增删 —— 于是
       * 「勾上 / 取消 / 再勾上」永远回到同一份文本，两个勾选框怎么组合都不会漂。
       * @param {boolean} expand - 「展开原文压缩」勾没勾。
       * @param {boolean} thinking - 「导入思考过程」勾没勾。
       * @returns {{text: string, count: number}|null} 还没导入过时是 null。
       */
      const importView = (expand, thinking) => {
        if (historyVariants === null) return null;
        return logImportSync().importViewOf(thinking ? historyVariants.withThinking : historyVariants.withoutThinking, expand);
      };

      /**
       * 导入那一行提示的**唯一**构造（0.3.11 起收成一处，0.3.14 起两个模式各一句）。
       *
       * 0.3.15 定稿：只有**一种**情况要说话 —— 这份导入文本里没有被
       * `<compacted-summary>` 包住的压缩摘要时，报一句「该历史对话尚未压缩过」
       * （否则那个勾选框看上去像坏了：点了什么都不变、也没有任何解释）。
       * 「留下了 N 段」「去掉了 N 段」「文件名 · 字数」三句按需求全部删掉：
       * 有摘要时**一行都不报**，所以这里返回 null。
       *
       * 导入那一路和两个勾选框共用这一个构造，于是三条路的说法天然一致
       * （`setHistoryNotice(null)` 就是不渲染那一行）。
       * @param {{count: number}|null} view - `importView()` 的结果；
       *   `null`（还没导入过）也当「没摘要」报那一句。
       * @returns {{kind: string, text: string}|null} 有摘要时是 null（不报）。
       */
      const importViewNotice = (view) => {
        if (view !== null && view.count > 0) return null;
        return { kind: 'warn', text: t('historyCompactNone') };
      };

      /**
       * 「导入思考过程」勾选框：勾上就把思考内容加回输入框，取消就一键删掉。
       *
       * 0.3.14 起它和「展开原文压缩」**各管一件事**、叠加生效：这一项只换「用哪一份
       * 渲染结果」，压缩视图 / 展开原文由那一个勾选框定。所以切它总是要重算一遍
       * 输入框的内容（0.3.10–0.3.13 那种「切了什么都不动、只解释一句」的写法没有了），
       * 提示行照旧报同一句。
       */
      const onToggleThinking = (on) => {
        setIncludeThinking(on);
        setHistoryNotice(null);
        const view = importView(expandOriginal, on);
        if (view === null) return;
        setHistoryText(view.text);
        setHistoryNotice(importViewNotice(view));
        setHistoryEpoch((n) => n + 1);
      };

      /**
       * 「展开原文压缩」勾选框（0.3.8 起叫「仅导最后压缩」，0.3.14 换成本语义）。
       *
       * 勾上 → 输入框里是**除压缩摘要以外**的全部原文；取消 → 回到压缩视图
       * （摘要原文 + 最后一段之后的对话）。两者都从 `historyVariants` 现算，
       * 而不是对输入框做字符串增删 —— 于是「勾上 / 取消 / 再勾上」永远回到同一份
       * 文本（手打的字本来就会被这两个勾选框整体替换，这是 0.2.0 起就有的既定
       * 行为，提示行里写着）。
       */
      const onToggleExpandOriginal = (on) => {
        setExpandOriginal(on);
        setHistoryNotice(null);
        const view = importView(on, includeThinking);
        if (view === null) {
          // 还没有导入过：勾选本身留着（下次导入就按它渲染），只是现在没东西可处理。
          if (on) setHistoryNotice({ kind: 'warn', text: t('historyCompactNoImport') });
          return;
        }
        setHistoryText(view.text);
        setHistoryNotice(importViewNotice(view));
        setHistoryEpoch((n) => n + 1);
      };

      /**
       * 「清空」：**只**清输入框（原文暂存起来），不动磁盘上那条人设 ——
       * 真正写盘仍然要按最下方那个「保存」。点完按钮变成「撤回」。
       */
      const onClearHistory = () => {
        if (historyBusy) return;
        setHistoryText('');
        setHistoryEpoch((n) => n + 1);
        setHistoryCleared(true);
        setHistoryNotice(null);
      };

      /**
       * 「撤回」：把这条人设**已经保存的**历史对话放回输入框 —— 「清空」只动
       * 输入框，所以撤回拿回来的就是磁盘上那一份（没存过就是空）。
       */
      const onUndoClearHistory = () => {
        if (historyBusy) return;
        setHistoryText(historyBaseline);
        setHistoryEpoch((n) => n + 1);
        setHistoryCleared(false);
        setHistoryNotice(null);
      };

      /**
       * 「保存」：一次提交三段改动。
       *
       * 校验不通过时**一个请求都不发**，反馈就写在最下方按钮上方：
       *   - 段序权重不合法（小数 / 空 / 超范围…）；
       *   - 人设名字留空；
       *   - 人设正文留空（0.3.8 起给的是 `blankSaveRefused` 那句整话）。
       * 成功之后同样在那个位置按「改了几项」并列报几条。
       *
       * 0.3.8：**按钮对没有 id 的草稿也可点**，所以「点了却什么都不发生」这种情况
       * 不存在了 —— 点下去不是存下空人设，就是拿到上面那几句拒绝理由之一。
       * 0.3.9：这份「可以点」的资格对所有无 id 草稿生效（含内置人设「复制为新人设」），
       * 并且无 id 草稿的保存语义是**创建**：原样提交也算数（见下面那道 `draft.id !== ''`）。
       */
      const onSave = async () => {
        if (writeBusyRef.current) return;
        setSaveFeedback(null);

        let orderValue = null;
        if (orderDirty) {
          const verdict = orderDraft.mode === 'follow' ? { ok: true, value: 'follow' } : checkOrderInput(orderDraft.value);
          if (!verdict.ok) {
            setSaveFeedback({ kind: 'error', text: `${t('saveFailed')}${orderProblemText(verdict.code, orderDraft.value)}` });
            return;
          }
          orderValue = verdict.value;
        }
        if (draft.id === '' && normalizeNameLocal(draft.name) === '' && normalizeTextLocal(draft.text) === '') {
          // 编辑区**整个是空的**：没选中谁、也没在新建（「删除」/「清除」之后就是
          // 这个状态）。这里没有谁可以保存，所以不能用「名字不能为空」去回答一个
          // 用户根本没打算创建的东西 —— 「没有要保存的改动。」才是这句的原意。
          // 0.3.9 唯一让这句话真正可达的一支（保存按钮对无 id 草稿可点之后）。
          setSaveFeedback({ kind: 'ok', text: t('nothingToSave') });
          return;
        }
        if (mustSavePersona && normalizeNameLocal(draft.name) === '') {
          setSaveFeedback({ kind: 'error', text: `${t('saveFailed')}${t('emptyPersonaName')}` });
          return;
        }
        if (mustSavePersona && normalizeTextLocal(draft.text) === '') {
          // 0.3.8：正文留空给的是**整条**拒绝理由（`blankSaveRefused`），不再是
          // 「保存失败：」+ 半句短语。新建时它还是唯一可能给出的答复 —— 新人设
          // 没有 id，权重与历史对话都无处可存，凭空存一条空人设没有意义。
          setSaveFeedback({ kind: 'error', text: t('blankSaveRefused') });
          return;
        }
        if (dirtyParts.length === 0 && draft.id !== '') {
          // 「没有要保存的改动。」只对**磁盘上真有的人设**说（`draft.id !== ''`）。
          //
          // 0.3.9：这条判据收窄过一次。还没有 id 的草稿不能走这一支 —— 它的保存
          // 语义是「创建」，哪怕一个字符都没改：内置人设「复制为新人设」原样保存
          // 就是这条路上的典型（它没改过任何东西，但磁盘上确实还没有它）。
          // 旧判据只看 `dirtyParts.length === 0`，一旦保存按钮对无 id 草稿放开，
          // 这句话就会把「原样存下这份副本」误判成「无事可做」。
          //
          // 界面走不到这里：走到这一步说明三段都没改，而此时按钮只对无 id 草稿可点，
          // 无 id 草稿要么被上面那两道校验拦下（全新草稿正文是空的）、要么被
          // 「整个编辑区是空的」那一道拦下。留着它是**防御** —— 万一以后可点性再变，
          // 这句话才是正确答案。
          setSaveFeedback({ kind: 'ok', text: t('nothingToSave') });
          return;
        }

        const body = {};
        const settledDraft = { id: draft.id, name: normalizeNameLocal(draft.name), text: normalizeTextLocal(draft.text) };
        if (mustSavePersona) {
          body.id = draft.id;
          body.name = settledDraft.name;
          body.text = settledDraft.text;
        } else if (draft.id !== '') {
          body.id = draft.id;
        }
        if (orderDirty) body.sectionOrder = orderValue;
        if (historyDirty) {
          if (historyText.trim() === '') body.historyClear = true;
          else body.history = historyText;
        }

        setBusy(true);
        setFailure(null);
        setNotice(null);
        // 「保存中…」：120ms 内跑完的短保存不出这行字，免得闪一下；
        // 只有大历史那种几百毫秒的保存才会先给个交代。
        savingTimerRef.current = setTimeout(() => setShowSaving(true), 120);
        try {
          const result = await call('/save', { method: 'PUT', body: JSON.stringify(body) });
          const saved = Array.isArray(result.saved) ? result.saved : [];
          const nextId = typeof result.id === 'string' && result.id !== '' ? result.id : settledDraft.id;
          const nextDraft = { id: nextId, name: settledDraft.name, text: settledDraft.text };
          setDraft(nextDraft);
          setDraftBaseline(nextDraft);
          setDraftEpoch((n) => n + 1);
          setOrderBaseline({ ...orderDraft });
          if (saved.includes('history')) {
            const settled = historyText.trim() === '' ? '' : historyText.replace(/\r\n?/g, '\n').trim();
            setHistoryText(settled);
            setHistoryBaseline(settled);
            setHistoryEpoch((n) => n + 1);
            // 保存成功后本地立刻记下这次结果（存了就记「刚刚」、清空就记 null）：
            // 面板下一次轮询落地之前，状态标记与时间戳说的就是同一件事。
            setHistoryLocked({ id: nextId, at: settled === '' ? null : Date.now(), missing: false });
            setHistoryCleared(false);
          }
          setCreating(false);
          setSelectedId(nextId === '' ? null : nextId);
          const parts = [];
          if (saved.includes('persona')) parts.push(t('personaSaved'));
          if (saved.includes('order')) {
            parts.push(`${t('orderSaved')}：${orderValue === 'follow' ? t('orderFollowText') : orderValue}`);
          }
          if (saved.includes('history')) {
            parts.push(historyText.trim() === '' ? t('historyCleared') : t('historySaved'));
          }
          setSaveFeedback({ kind: 'ok', text: parts.length > 0 ? parts.join(' · ') : t('nothingToSave') });
          // 广播会顺带刷新自己；只有广播不可用时才自己再拉一次（省一次请求）。
          if (!notifyPersonaChanged()) await reload();
        } catch (problem) {
          setSaveFeedback({ kind: 'error', text: `${t('saveFailed')}${problem?.message ?? String(problem)}` });
        } finally {
          clearTimeout(savingTimerRef.current);
          setShowSaving(false);
          setBusy(false);
        }
      };

      const onDelete = () =>
        run(async () => {
          // 「删除」按钮只在编辑区里有一条已存人设（`draft.id !== ''`）时才渲染，
          // 所以这里不再判一次空 id。
          if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('confirmDelete'))) {
            return;
          }
          await call(`/delete?id=${encodeURIComponent(draft.id)}`, { method: 'DELETE' });
          setSelectedId(null);
          // 0.3.13：编辑区空了 —— 列表也一条勾边都不画（与「新建」同一副样子），
          // 不再把勾边兜底落到「这一页正在启用的那一条」上（那会让列表说「正在
          // 预览 A」、编辑区里却没有 A）。下一次载入 / 新建时复位。
          setNoPreview(true);
          setDraft({ id: '', name: '', text: '' });
          setDraftBaseline({ id: '', name: '', text: '' });
          setDraftEpoch((n) => n + 1);
          setCreating(false);
          setSaveFeedback(null);
          setHistoryText('');
          setHistoryBaseline('');
          setHistoryEpoch((n) => n + 1);
          setHistoryLocked(null);
          // 0.3.8：编辑区里已经没有这一条了，导出那一行的提示 / 菜单跟着收掉。
          clearExportUi();
          // 删除也报在编辑区那一排按钮上方（它同样是编辑区的动作）。
          setEditorNotice(t('deleted'));
          // 广播会顺带刷新自己；只有广播不可用时才自己再拉一次（省一次请求）。
          if (!notifyPersonaChanged()) await reload();
        });

      const onActivate = (id) =>
        run(async () => {
          // `session` 决定写哪一层：当前页写本对话，全局页写全局。
          await call('/active', { method: 'PUT', body: JSON.stringify(withSession({ id })) });
          // 0.3.4：提示里点名启用的是**哪一条**。按钮在编辑区最下方，
          // 不说名字用户还得滚回列表看哪一条亮着。
          const activatedName = (dataRef.current?.personas ?? []).find((entry) => entry.id === id)?.name;
          const named = typeof activatedName === 'string' && activatedName !== '';
          // 文案模板里用 `%s` 占位；模板缺失（或没有占位符）时退化成
          // 「已切换人设：名字」—— 名字无论如何都要出现。
          const template = String(t('activatedNamed'));
          // 0.3.5：报在**编辑区那一排并列按钮上方**（与保存反馈、导出结果同一片
          // 区域），不再塞进第④张「输入抑制开关」卡（bug 1.2）。
          setEditorNotice(
            id === '' || id === 'builtin:off'
              ? t('deactivated')
              : named
                ? template.includes('%s')
                  ? template.replace('%s', activatedName)
                  : `${t('activated')}：${activatedName}`
                : t('activated'),
          );
          // 广播会顺带刷新自己；只有广播不可用时才自己再拉一次（省一次请求）。
          if (!notifyPersonaChanged()) await reload();
        });

      const onToggleSwitch = (key, on) =>
        run(async () => {
          await call('/switches', {
            method: 'PUT',
            body: JSON.stringify(withSession({ [key]: on })),
          });
          setNotice(t('switchesSaved'));
          // 广播会顺带刷新自己；只有广播不可用时才自己再拉一次（省一次请求）。
          if (!notifyPersonaChanged()) await reload();
        });

      // 安全阀单独一条路由请求：它不是抑制开关，只是「剥工具时要不要保基线」。
      const onToggleToolReusable = (on) =>
        run(async () => {
          await call('/switches', {
            method: 'PUT',
            body: JSON.stringify(withSession({ toolReusable: on })),
          });
          setNotice(t('switchesSaved'));
          // 广播会顺带刷新自己；只有广播不可用时才自己再拉一次（省一次请求）。
          if (!notifyPersonaChanged()) await reload();
        });

      // 同一个按钮两种身份：未全开 = 一键为纯聊天；已全开 = 系统输入还原。
      const onPrimaryAction = () =>
        run(async () => {
          if (everySwitchOn) {
            await call('/switches', {
              method: 'PUT',
              body: JSON.stringify(
                withSession({
                  soloOnly: false,
                  stripRuntime: false,
                  stripTools: false,
                  stripInjected: false,
                }),
              ),
            });
            setNotice(t('restoreDone'));
          } else {
            // 0.3.0 修的 bug：这一支原来漏了 `withSession(...)`，于是「当前」页
            // 点「一键为纯聊天」写的是**全局**那一层 —— 本会话的开关一个没动，
            // 界面看上去就是「按键失效」。它和上面「系统输入还原」必须同层。
            await call('/switches', { method: 'PUT', body: JSON.stringify(withSession({ pureChat: true })) });
            setNotice(t('pureChatOn'));
          }
          // 广播会顺带刷新自己；只有广播不可用时才自己再拉一次（省一次请求）。
          if (!notifyPersonaChanged()) await reload();
        });

      /* ── 人设导入 / 导出（0.3.0）────────────────────────────── */

      /**
       * 「导入」（人设列表下方）：点开隐藏的文件选择器。
       * 与「人设历史对话」的导入共用同一个套路。
       */
      const onImportPersonaClick = () => {
        if (writeBusyRef.current) return;
        const node = importFileRef.current;
        if (node === null || node === undefined) return;
        // 每次点都先把 value 清掉：否则连续挑**同一个文件**不会触发 change。
        try {
          node.value = '';
        } catch {
          // 清不掉就算了，最多是第二次挑同一个文件没反应。
        }
        if (typeof node.click === 'function') node.click();
      };

      /**
       * 读文件 → 认格式 → 交给 Host 落盘。
       *
       * 这里只做「够 Host 用」的那一层：认得出 personas 数组就行。真正的
       * 归一化（名字长度、正文上限、段序合法性、历史不裁切）全在 Host 那份
       * 代码里，免得两处规则各写一遍、日后漂移。
       */
      const onImportPersonaFile = async (file) => {
        if (file === null || file === undefined) return;
        setImporting(true);
        setImportNotice(null);
        try {
          // 按**内容**认，不看扩展名：`.json` 后缀的图、`.png` 后缀的 JSON 都能吃。
          const bytes = new Uint8Array(await file.arrayBuffer());
          const { decodePersonaPack } = await ioExport();
          const decoded = decodePersonaPack(bytes);
          if (decoded.ok !== true) {
            if (decoded.code === 'png-no-data') throw new Error(t('importPngNoData'));
            if (decoded.code === 'png-bad-crc') throw new Error(t('importPngBadCrc'));
            throw new Error(`不是合法的 JSON（${decoded.detail ?? ''}）`);
          }
          const parsed = decoded.value;
          const list = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.personas)
              ? parsed.personas
              : (parsed !== null && typeof parsed === 'object' ? [parsed] : []);
          if (list.length === 0) throw new Error(t('importEmpty'));
          const result = await call('/import', {
            method: 'PUT',
            body: JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, personas: list }),
          });
          const imported = Array.isArray(result.ids) ? result.ids : [];
          const skipped = Array.isArray(result.skipped) ? result.skipped : [];
          const parts = [`${t('importDone')} ${imported.length}`];
          if (skipped.length > 0) parts.push(`${t('importSkipped')} ${skipped.length}`);
          parts.push(file.name);
          setImportNotice({ kind: skipped.length > 0 ? 'warn' : 'ok', text: parts.join(' · ') });
          // 导入完直接把它选进编辑区：看得见结果，也方便接着改。
          if (imported.length > 0) loadPersona(imported[0]);
          if (!notifyPersonaChanged()) await reload();
        } catch (problem) {
          setImportNotice({ kind: 'error', text: `${t('importFailed')}：${problem?.message ?? String(problem)}` });
        } finally {
          setImporting(false);
        }
      };

      /**
       * 「导出」（编辑区最下方、最右侧）：把**编辑区里这一条**人设写成
       * 纯 JSON 下载下来 —— 正文、段序权重、历史对话一个都不少。
       *
       * 0.3.8 改了取哪一份：以前取草稿（「屏幕上看到什么就导什么」），现在取
       * **保存前那一份原案**，并且在有未保存改动时先弹一次确认（0.3.8 之前
       * 是闷头导出）。理由：导出是给备份 / 搬家用的，弹窗里既然写了「导出的
       * 人设为保存前的原案」，文件里就必须真的是那一份。见 `exportSource()`。
       */
      /**
       * 组出「一条人设」的导出容器（0.3.0）。
       *
       * JSON 与图片两条导出共用它 —— 装进 PNG 的就是这份 JSON 原文，
       * 所以两种文件的信封不同、载荷完全一样，导入侧也就不用分两套规则。
       *
       * ⚠ 0.3.8 起取的是**保存前那一份**（未保存的改动一个字都不进文件）。
       * 旧版这里取草稿，理由是「屏幕上看到什么就导什么」；但「导出」是给
       * 备份/搬家用的，让人在确认弹窗里读到「导出的人设为保存前的原案」之后
       * 拿到一份没落过盘的内容，反而更难解释。基线三件套
       * （`draftBaseline` / `orderBaseline` / `historyBaseline`）就是载入这条
       * 人设时磁盘上的那一份，也正是「保存前」的准确含义。
       * @returns {string} 缩进过的 JSON 原文。
       */
      const exportPayload = () => {
        const source = exportSource();
        const verdict = source.order.mode === 'follow'
          ? { ok: true, value: 'follow' }
          : checkOrderInput(source.order.value);
        const container = {
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          exportedAt: new Date().toISOString(),
          plugin: 'dsh-persona-select',
          count: 1,
          personas: [
            {
              name: source.name,
              text: source.text,
              sectionOrder: verdict.ok ? verdict.value : null,
              history: source.history.trim() === '' ? null : { text: source.history, lockedAt: historyLockedAt },
            },
          ],
        };
        return JSON.stringify(container, null, 2);
      };

      /**
       * 导出取哪一份内容（0.3.8）：改了的那几段取**基线**（保存前的原案），
       * 没改的段取草稿（与基线相同，取哪个都一样）。文件名也跟着它走，
       * 免得「丙」的编辑导出成「丁.persona.json」。
       * @returns {{name: string, text: string, order: {mode: string, value: string}, history: string}} 导出来源。
       */
      const exportSource = () => ({
        name: personaDirty ? draftBaseline.name : draft.name,
        text: personaDirty ? draftBaseline.text : draft.text,
        order: orderDirty ? orderBaseline : orderDraft,
        history: historyDirty ? historyBaseline : historyText,
      });

      /**
       * 报一次导出结果（0.3.2）。
       *
       * 三档，按"我们真的知道多少"分：
       *   · 没发起 → 环境不支持下载；
       *   · 发起了但**没确认到文件被取走** → 明说没确认，让人去看下载目录；
       *   · 确认取走了 → 才算成功（文件名是否保证另说）。
       */
      const reportExport = (filename, outcome) => {
        if (!outcome.ok) {
          setExportNotice({ kind: 'warn', text: t('exportNoBrowser') });
          return;
        }
        if (outcome.served === false) {
          setExportNotice({ kind: 'warn', text: `${t('exportNotTaken')} · ${filename}` });
          return;
        }
        setExportNotice({
          kind: outcome.exact ? 'ok' : 'warn',
          text: `${t('exportDone')} · ${filename}${outcome.exact ? '' : ` ${t('exportNameMayDiffer')}`}`,
        });
      };

      /**
       * 点「导出」按钮（0.3.8 起先过一遍闸门，但按钮**不再 disable**）。
       *
       * 三条路：
       *   · 新建 / 还没保存（`draft.id === ''`）→ 一句话解释为什么导不了；
       *   · 有未保存的改动 → 先确认，确认后导出的是**保存前的原案**（`exportSource`）；
       *   · 干净 → 直接开菜单。
       * 「同并列的其他按键弹窗逻辑相同」指的就是中间那个 `window.confirm`：与
       * 「切人设」「删除」一样，环境里没有 confirm 时按「用户没有确认」处理
       * （什么都不做，而不是静默放行）。
       * @returns {void}
       */
      const onExportClick = () => {
        if (busy) return;
        // 菜单开着时再点一次 = 收起（旧版的按钮语义就是开关）。
        if (exportMenu) {
          setExportMenu(false);
          return;
        }
        if (creating || draft.id === '') {
          setExportNotice({ kind: 'warn', text: t('exportRefusedNew') });
          return;
        }
        if (!canExport) return;
        if (dirtyParts.length > 0) {
          const message = t('exportConfirmDirty');
          if (
            typeof window === 'undefined' ||
            typeof window.confirm !== 'function' ||
            !window.confirm(message)
          ) {
            return;
          }
        }
        setExportNotice(null);
        setExportMenu(true);
      };

      /** 菜单项①：导出纯 JSON。 */
      const onExportJson = async () => {
        setExportNotice(null);
        try {
          const { exportFileName, downloadFile } = await ioExport();
          const filename = exportFileName(exportSource().name, 'json');
          const outcome = await downloadFile(filename, new TextEncoder().encode(exportPayload()), 'application/json');
          reportExport(filename, outcome);
        } catch (problem) {
          setExportNotice({ kind: 'error', text: `${t('exportFailed')}：${problem?.message ?? String(problem)}` });
        }
      };

      /** 菜单项②：点开「选一张 PNG 当封面」的文件选择器。 */
      const onExportPngClick = () => {
        setExportNotice(null);
        const node = exportPngRef.current;
        if (node === null || node === undefined) return;
        try {
          node.value = '';
        } catch {
          // 清不掉就算了，最多是第二次挑同一个文件没反应。
        }
        if (typeof node.click === 'function') node.click();
      };

      /**
       * 把选中的 PNG 当封面：**原图字节原样保留**，只在 IHDR 后面插一条 iTXt
       * 装人设 JSON，然后按 `<人设名>.persona.png` 下载。
       *
       * 只吃 PNG：JPEG/WebP 没有 PNG 那种「解码器必须跳过的附属块」，
       * 硬要过 canvas 转一道会把原图重编码、顺带冲掉它自己的元数据 ——
       * 与其静默降质，不如直接说清楚。
       */
      const onExportPngFile = async (file) => {
        if (file === null || file === undefined) return;
        setExportNotice(null);
        try {
          // 0.3.23 修（TDZ，功能级）：原来 `isPng(bytes)` 这句写在下面那行解构**之前**，
          // 于是每次「导出图片」都抛 `Cannot access 'isPng' before initialization`，
          // 被外层 catch 吞成「导出失败：…」—— 图片导出从来没能成功过一次。
          // 解构必须挪到使用之前。
          const { isPng, packPersonaPng, exportFileName, downloadFile } = await ioExport();
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!isPng(bytes)) {
            setExportNotice({ kind: 'error', text: `${t('exportFailed')}：${t('exportPngBad')}` });
            return;
          }
          const packed = packPersonaPng(bytes, exportPayload());
          if (packed === null) {
            setExportNotice({ kind: 'error', text: `${t('exportFailed')}：${t('exportPngBroken')}` });
            return;
          }
          if (packed.length > EXPORT_MAX_BYTES) {
            setExportNotice({ kind: 'error', text: `${t('exportFailed')}：${t('exportTooBig')}` });
            return;
          }
          const filename = exportFileName(exportSource().name, 'png');
          const outcome = await downloadFile(filename, packed, 'image/png');
          reportExport(filename, outcome);
        } catch (problem) {
          setExportNotice({ kind: 'error', text: `${t('exportFailed')}：${problem?.message ?? String(problem)}` });
        }
      };

      if (status === 'loading' && data === null) {
        return h('div', { style: S.root, 'data-plugin': 'dsh-persona-select' }, h('h2', { style: S.h2 }, t('title')), h('p', { style: S.sub }, t('loading')));
      }

      if (data === null) {
        return h(
          'div',
          { style: S.root, 'data-plugin': 'dsh-persona-select', 'data-render-state': 'error' },
          h('h2', { style: S.h2 }, t('title')),
          h('p', { style: S.warn }, `${t('storeError')}: ${error ?? ''}`),
          h('button', { type: 'button', style: S.button, onClick: reload }, t('retry')),
        );
      }

      // 设置页里所有「这个人设选中了没有」的判断都用**当前这一页那一层**的
      // activeId（当前页 = 本对话选定的人设，全局页 = 新对话跟随的那一份）。
      const activeId = layer.activeId;
      // 「(页, 这一层启用的人设)」的当前键：自动预览与显式载入都按它记账。
      previewKeyRef.current = `${activeTab}:${layer.activeId ?? ''}`;

      /**
       * 这一页的**全部**触发项（0.3.5），红在前、黄在后。
       *
       * 当前页用 Host 给本会话算出来的那一份（工具基线 / 安全阀 / 历史对话
       * 对不上 / 选定人设被删 / 极简模式）。全局页只保留「全局选定的人设被删了」
       * 与「全局『工具可复用』没勾」这两条 —— 别的几条说的都是某一个具体会话，
       * 安在全局页上会是假的。
       *
       * 唯一的例外是 `minimal-mode`（0.3.5）：它说的是**这个对话的模式**，
       * 而这个对话正是用户此刻在看的那一个；「全局」页同样把它报出来，
       * 否则新模式下的新对话（还没有记录、只能看全局页）永远报绿。
       */
      const sessionIndicators = indicatorsOf(data, t);
      const modeIndicators = data?.section?.minimalMode === true ? [indicatorFor('minimal-mode', t)] : [];
      const pageIndicators = activeTab === 'current'
        ? sessionIndicators
        : [...layerIndicators(layer, t), ...modeIndicators].sort(byColorRank);
      /**
       * F4（档位 2）：服务端记的「我降级处理了」提醒（`/state.warnings`）。
       *
       * 只认字符串里确实有内容的那些：服务端可能在别处塞进空串或非字符串，
       * 那种不该占版面。渲染时逐条当纯文本（见下面那条提示条）。
       */
      const warnings = (Array.isArray(data?.warnings) ? data.warnings : []).filter(
        (message) => typeof message === 'string' && message.trim() !== '',
      );
      /** 小圆点只能有一个颜色：取优先级最高的那一项（红 > 黄 > 绿）。 */
      const indicator = summarizeIndicators(pageIndicators, t);

      /**
       * 「哪些系统注入块被过滤了」（0.3.4）。
       *
       * 按 `source.kind` 报**本会话**的条数，只列非零项 —— 零项列出来只是噪声。
       * 这四类都不是系统提示词里的段，而是别的插件按 user 角色追加的消息，
       * 所以这份状态挂在「输入抑制开关」那张卡上，不塞进装配状态卡。
       */
      const stripPairs = STRIP_KIND_FIELDS
        .map((row) => ({ ...row, count: Number(data.stripStats?.[row.kind] ?? 0) }))
        .filter((row) => Number.isFinite(row.count) && row.count > 0);
      /**
       * 「启用」按钮的目标与可见性：编辑区里是已有用户人设 → 启用它自己；
       * 选中的是内置人设（编辑区里是「副本」草稿）→ 启用那个内置人设；
       * 选中「不注入」（`builtin:off`）→ 目标就是它，服务端会把 activeId 清空。
       */
      const activateTarget = draft.id !== '' ? draft.id : (selectedId ?? '');
      const showActivate = !creating && (activateTarget !== '' || selectedId !== null);

      /**
       * 「人设历史对话」在渲染里需要的几个推导值。
       * `historyPersona` 是**这条人设**在 `/state` 里的那一条（拿它已保存的
       * 字节数、保存时间）。
       */
      const historyPersonaId = draft.id !== '' ? draft.id : (selectedId ?? '');
      const historyPersona = (data.personas ?? []).find((entry) => entry.id === historyPersonaId);
      const historyStoredBytes = typeof historyPersona?.historyBytes === 'number' ? historyPersona.historyBytes : 0;
      // 「锁没锁、什么时候锁的」只有一个事实：本地那一条记录（选中时的详情 +
      // 保存成功后的本地更新）优先；面板轮询里那一位只在本地还没有这条人设的
      // 记录时兜底（刚选中、详情还没回来的那一帧）。两者都是**同一个时间戳**，
      // 所以状态标记与时间不会互相打架 —— 也不再出现「保存成功了，标记却还是
      // 灰的，过几秒才变」。
      const panelLockedAt = typeof historyPersona?.historyLockedAt === 'number' ? historyPersona.historyLockedAt : null;
      const historyLockedAt = historyLocked !== null && historyLocked.id === historyPersonaId
        ? historyLocked.at
        : panelLockedAt;
      /**
       * 0.3.21：`historyLockedAt === null` 有**两种**截然不同的来历，必须分开渲染：
       *   · 从没存过历史（`missing === false`）→ 「还没有历史对话」；
       *   · 存过，但磁盘上那份历史正文已经不在了（`missing === true`）→ 单独一句文案。
       * 宿主在 `/persona` 回执里一直是发 `historyMissing` 的（合并验收 §2-G5 抓到
       * 客户端从没读它），`/state` 的形状不变，所以这个判据只认详情接口那一份
       * —— `panelLockedAt` 那条兜底路径没有这个布尔，按 false 处理。
       */
      const historyMissingNow = historyLocked !== null && historyLocked.id === historyPersonaId
        && historyLocked.missing === true;
      const historyStored = historyLockedAt !== null;
      // 正文丢了时 `lockedAt` 已经是 null（档位 2 · G5），所以「丢」优先于「存」。
      const historyLost = historyMissingNow;

      return h(
        'div',
        {
          style: S.root,
          'data-plugin': 'dsh-persona-select',
          'data-render-state': 'ready',
          'data-active-id': activeId ?? '',
          'data-creating': creating ? '1' : '0',
          // 状态机对测试可见：这一页写的是哪一层、这个对话有没有记录。
          'data-scope': activeTab,
          'data-has-record': hasRecord ? '1' : '0',
          'data-session-id': currentSessionId,
          // 0.3.5：这一页触发的全部判断项（红在前），便于核对状态机。
          'data-indicators': pageIndicators.map((entry) => entry.reason).join(','),
          // 0.3.5：本对话的 preset 是不是「把系统提示词压成单段」（极简模式）。
          'data-minimal-mode': data?.section?.minimalMode === true ? '1' : '0',
        },
        h('h2', { style: S.h2 }, t('title')),

        // ⓪-1 F4（档位 2）：那些「我丢掉了什么 / 我降级处理了什么」的提醒。
        //
        // 以前它们每 4 秒跟着面板数据发过来、然后被**直接丢掉**，于是
        // 「正文被截了」「磁盘上多了几条被忽略了」「某条人设编号非法」这类事
        // 全都成了静默丢数据。现在有才出现、点开才占版面。
        //
        // 逐条按**纯文本**渲染（`h('li', …, 字符串)` 会被 React 转义），
        // 绝不把服务端给的字符串当 HTML 解析 —— 它们描述的是用户自己的文件名 /
        // 人设名，仍然不该被当成标记。
        warnings.length > 0
          ? h(
              'div',
              {
                style: S.warnBox,
                'data-warnings': String(warnings.length),
                'data-warnings-open': showWarnings ? '1' : '0',
              },
              h(
                'button',
                {
                  type: 'button',
                  style: S.warnToggle,
                  onClick: () => setShowWarnings((open) => !open),
                  'aria-expanded': showWarnings ? 'true' : 'false',
                  'data-warnings-toggle': '1',
                },
                `${t('warningsSummary')}（${warnings.length}）`,
                h('span', { style: S.warnToggleHint }, showWarnings ? t('warningsHide') : t('warningsShow')),
              ),
              showWarnings
                ? h(
                    'ul',
                    { style: S.warnList, 'data-warnings-list': '1' },
                    warnings.map((message, index) => h('li', { key: `${index}`, style: S.warnItem }, String(message))),
                  )
                : null,
            )
          : null,

        // ⓪ 两页：当前（本对话） / 全局（新对话跟随的那一份）。
        //
        // 0.3.0：两个键各只留两个字（「当前」「全局」），紧贴标题下方；
        // 键里原来的副标题、以及选中键下方那段长注释，按需求全部删掉。
        // 键下面**只剩**「正在设置哪个会话」这一行，且只在「当前」页出现。
        //
        // 没有会话记录时**不显示**「当前」页（需求：仅显示全局设置页）——
        // 此时两个键只剩「全局」，键下不显示任何东西。
        h(
          'div',
          { style: S.tabRow, 'data-scope-tabs': '1' },
          hasRecord
            ? h(
                'button',
                {
                  type: 'button',
                  style: { ...S.scopeTab, ...(activeTab === 'current' ? S.scopeTabActive : {}) },
                  onClick: () => {
                    tabTouchedRef.current = true;
                    setTab('current');
                  },
                  'data-scope-tab': 'current',
                  'aria-pressed': activeTab === 'current' ? 'true' : 'false',
                },
                t('scopeTabCurrent'),
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              style: { ...S.scopeTab, ...(activeTab === 'global' ? S.scopeTabActive : {}) },
              onClick: () => {
                tabTouchedRef.current = true;
                setTab('global');
              },
              'data-scope-tab': 'global',
              'aria-pressed': activeTab === 'global' ? 'true' : 'false',
            },
            t('scopeTabGlobal'),
          ),
        ),
        // 「当前」页才需要知道自己在设置哪个对话。会话 id 单独一行，
        // 不放回键里 —— 键要保持两个字。
        activeTab === 'current' && currentSessionId !== ''
          ? h(
              'p',
              {
                style: S.mono,
                'data-scope-session': '1',
                // 0.3.14：这一行显示**标题**（与标题栏同一个 `displayTitle`）；拿不到
                // 标题时退回会话 id。id 本身放进 `title`，悬停仍能核对是哪个会话。
                'data-scope-session-title': currentSessionTitle === '' ? 'id' : 'title',
                title: currentSessionId,
              },
              `${t('scopeSession')} ${currentSessionTitle === '' ? currentSessionId : currentSessionTitle}`,
            )
          : null,

        // ① 装配状态（装配显示 + 「工具可复用」安全阀）
        //
        // 安全阀刻意放在装配显示正下方、同一张卡里：它管的是装配结果里 tools
        // 那一半，和上面那行人设段的注入状态是同一件事的两面。
        // 它**不是**输入抑制（不决定这一轮发什么），所以不放进第④张卡。
        h(
          'div',
          { style: S.card, 'data-card': 'status' },
          h(AssemblyLine, { data, t, indicators: pageIndicators, scope: activeTab }),
          h('span', { style: S.divider }),
          h(
            'label',
            {
              style: { ...S.row, gap: 8, cursor: 'pointer', alignItems: 'flex-start' },
              'data-tool-reusable': '1',
            },
            h('input', {
              type: 'checkbox',
              checked: toolReusable,
              disabled: writeBusy,
              onChange: (event) => onToggleToolReusable(event.target.checked),
              style: { marginTop: 3, flex: 'none' },
            }),
            h(
              'span',
              { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
              h(
                'span',
                { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                h('span', { style: { fontSize: 13, lineHeight: '20px' } }, t('toolReusableLabel')),
                h(Hint, { text: t('toolReusableHint'), label: t('hintLabel') }),
              ),
            ),
          ),
          // 只在「真的开着屏蔽工具 + 安全阀开着」时报告，避免平时刷屏。
          // 这两个读数都是**某一个会话**的（工具基线在会话里），所以全局页不显示。
          activeTab === 'current' && switches.stripTools === true && toolReusable && data.section?.toolStripHeld === true
            ? h(
                'p',
                {
                  style: S.sub,
                  'data-tool-strip-held': '1',
                  'data-tool-strip-held-reason': data.section?.toolStripHeldReason ?? 'unknown',
                },
                t(
                  data.section?.toolStripHeldReason === 'series-restart'
                    ? 'toolStripHeldRestart'
                    : 'toolStripHeldFirst',
                ),
              )
            : null,
          // 第一轮请求里没有工具本身就是红色状态，与用户开不开屏蔽无关。
          activeTab === 'current' && (data.section?.sessionBaseline === 'empty' || data.section?.toolBaseline === 'empty')
            ? h('p', { style: S.warn, 'data-tool-baseline': 'empty' }, t('toolBaselineEmpty'))
            : null,
          data.error !== null && data.error !== undefined
            ? h('p', { style: S.warn }, `${t('storeError')}: ${data.error}`)
            : null,
          h('p', { style: S.mono }, `${t('path')}: ${data.path}`),
        ),

        // ② 人设列表
        h(
          'div',
          { style: S.card, 'data-card': 'list' },
          h('p', { style: { ...S.sub, fontWeight: 600 } }, t('listTitle')),
          h(
            'ul',
            { style: S.list, 'data-persona-list': '1' },
            personas.map((persona) => {
              // `builtin:off` 就是「不注入」本身，激活态由 activeId 为 null 表示。
              const isActive = persona.id === 'builtin:off' ? activeId === null : activeId === persona.id;
              // 勾边**只画一条**（0.3.5）：正在预览的那一条；没有预览目标时落在
              // 这一页**正在启用**的那一条上（activeId 为 null 就是「不注入」）。
              // 以前这里只认 selectedId，于是「全局」页刚打开时一条都不画，
              // 而浏览器自己的焦点环又会在点过的每一条上各留一圈。
              //
              // 0.3.13：刚删掉某一条时编辑区是空的（`noPreview`）—— 这时**一条都不画**，
              // 与「新建」时同一副样子；那个兜底只该在「编辑区里确实装着这一页启用的
              // 那一条」时生效，删除之后它就成了假话。
              const previewId =
                selectedId !== null
                  ? selectedId
                  : noPreview
                    ? null
                    : activeId === null
                      ? 'builtin:off'
                      : activeId;
              const isPreview = !creating && previewId !== null && persona.id === previewId;
              return h(
                'li',
                { key: persona.id },
                h(
                  'button',
                  {
                    type: 'button',
                    'data-persona-id': persona.id,
                    'data-preview': isPreview ? '1' : '0',
                    style: {
                      ...S.item,
                      ...(isPreview ? S.itemPreview : {}),
                    },
                    // 有未保存改动时会先弹确认（见 onPreview）。
                    onClick: () => onPreview(persona.id),
                  },
                  h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, persona.name),
                  persona.builtin && persona.id !== 'builtin:off' ? h('span', { style: S.badge }, t('builtin')) : null,
                  isActive
                    ? h('span', {
                        style: S.dot(indicator.color),
                        'data-dot': indicator.color,
                        'data-indicator': indicator.reason,
                        title: indicator.text,
                      })
                    : null,
                ),
              );
            }),
          ),
          // 0.2.5：「新建」从卡③底部挪到这一格（原来的「刷新」）。
          // 轮询与错误态那个「重试」已经覆盖了手动刷新，这一格留给更常用的动作；
          // 正在新建时禁用，免得手滑把刚敲的内容重置掉。
          //
          // 0.3.0：下面再并列一格「导入」—— 读回本插件「导出」出来的 JSON。
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }, 'data-list-actions': '1' },
            h(
              'button',
              {
                type: 'button',
                style: S.button,
                onClick: onNewPersona,
                disabled: writeBusy || creating,
                'data-new-button': '1',
              },
              t('newPersona'),
            ),
            h(
              'button',
              {
                type: 'button',
                style: S.button,
                onClick: onImportPersonaClick,
                disabled: writeBusy,
                'data-import-button': '1',
                title: t('importHint'),
              },
              t('importButton'),
            ),
            // 隐藏的文件选择器：由上面的「导入」用代码点开，样式上不占位。
            h('input', {
              ref: importFileRef,
              type: 'file',
              accept: '.json,.png,application/json,image/png',
              style: { display: 'none' },
              'data-import-file': '1',
              onChange: (event) => {
                const file = event?.target?.files?.[0];
                // 交回同一个处理函数；读完了不重置 value —— 上面点开前已经清过。
                onImportPersonaFile(file);
              },
            }),
          ),
          importNotice !== null
            ? h(
                'p',
                {
                  style: importNotice.kind === 'error' ? S.warn : S.notice,
                  'data-import-notice': importNotice.kind,
                },
                importNotice.text,
              )
            : null,
        ),

        // ③ 新建 / 编辑人设（名字 / 正文 / 段序权重 / 历史对话 + 保存）
        h(
          'div',
          { style: S.card, 'data-card': 'editor' },
          h(
            'p',
            { style: S.sub },
            draft.id === '' ? t('createHint') : t('editHint'),
            draft.id !== '' && (personas.find((p) => p.id === draft.id)?.builtin ?? false)
              ? ` · ${t('builtinReadonly')}`
              : '',
          ),
          h('label', { style: S.sub, htmlFor: 'persona-select-name' }, t('name')),
          h('input', {
            id: 'persona-select-name',
            style: S.input,
            value: draft.name,
            maxLength: data.limits?.maxName ?? 40,
            onChange: (event) => {
              setSaveFeedback(null);
              setDraft((previous) => ({ ...previous, name: event.target.value }));
            },
            disabled: writeBusy,
          }),
          h(
            'p',
            { style: S.sub },
            `${t('text')} · ${draft.text.length} ${t('chars')}`,
            draft.text.trim() === '' ? ` · ${t('blankText')}` : '',
          ),
          h(
            'div',
            { style: S.scrollWrap, 'data-persona-wrap': '1' },
            h('textarea', {
              ref: personaBoxRef,
              style: S.textarea,
              value: draft.text,
              onChange: (event) => {
                setSaveFeedback(null);
                setDraft((previous) => ({ ...previous, text: event.target.value }));
              },
              disabled: writeBusy,
              spellCheck: false,
              'data-persona-text': '1',
            }),
            // 与「人设历史对话」输入框共用同一个组件（0.2.3）。
            h(ScrollBar, {
              targetRef: personaBoxRef,
              deps: [draftTick, draft.id],
              trackAttr: 'data-persona-track',
              thumbAttr: 'data-persona-thumb',
            }),
          ),
          // 段序权重：输入框 + 右侧「追随」「默认」。
          // 它是**这条人设自己的**属性，和「保存」是同一件事；长注释收进问号里。
          h(
            'label',
            { style: S.sub, htmlFor: 'persona-select-order' },
            h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
              h('span', null, t('orderLabel')),
              h(Hint, { text: t('orderHint'), label: t('hintLabel') }),
            ),
          ),
          h(
            'div',
            { style: { ...S.row, gap: 6, flexWrap: 'wrap' }, 'data-order-row': '1' },
            orderDraft.mode === 'follow'
              ? h('input', {
                  id: 'persona-select-order',
                  readOnly: true,
                  value: t('orderFollowText'),
                  title: t('orderFollowHint'),
                  'data-order-follow': '1',
                  onClick: onOrderFollowBoxClick,
                  onFocus: onOrderFollowBoxClick,
                  style: {
                    ...S.input,
                    flex: '1 1 180px',
                    width: 'auto',
                    fontSize: 12,
                    opacity: 0.85,
                    cursor: 'pointer',
                  },
                })
              : h('input', {
                  id: 'persona-select-order',
                  inputMode: 'numeric',
                  value: orderDraft.value,
                  'data-order-input': '1',
                  disabled: writeBusy,
                  onChange: (event) => {
                    setSaveFeedback(null);
                    const next = event.target.value;
                    setOrderDraft((previous) => ({ ...previous, mode: 'number', value: next }));
                  },
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') onSave();
                  },
                  style: { ...S.input, flex: '1 1 180px', width: 'auto', fontSize: 13 },
                }),
            h(
              'button',
              {
                type: 'button',
                style: S.button,
                disabled: writeBusy,
                onClick: onOrderFollow,
                'data-order-follow-button': '1',
                title: t('orderFollowHint'),
              },
              t('orderFollowButton'),
            ),
            h(
              'button',
              {
                type: 'button',
                style: S.button,
                disabled: writeBusy,
                onClick: onOrderDefault,
                'data-order-default-button': '1',
              },
              t('orderDefaultButton'),
            ),
          ),

          // ── 人设历史对话（0.1.6 / 0.2.0）────────────────────────
          //
          // 位置：卡③内部、段序权重之后、编辑动作行之前。它属于**这条人设**
          // （`personas[i].history`），所以放在这张卡里而不是「输入抑制开关」。
          h('span', { style: S.divider }),
          h(
            'p',
            { style: { ...S.sub, fontWeight: 600 }, 'data-history-title': '1' },
            h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
              h('span', null, t('historyTitle')),
              // 0.2.0：这块的两条注释都收进问号气泡 —— 先「这是什么」，
              // 再「怎么写」（3.3 换成的短文案）。
              h(Hint, { text: t('historySubtitle'), label: t('hintLabel') }),
              h(Hint, { text: t('historyFormatHint'), label: t('hintLabel') }),
            ),
          ),
          // 两个**并列选框**。它们只决定下面那个输入框之上多渲染什么，
          // 共用同一份 `historyText`，所以来回切既不清空也不替换。
          h(
            'div',
            { style: S.tabRow, 'data-history-tabs': '1' },
            h(
              'button',
              {
                type: 'button',
                style: { ...S.tab, ...(historyTab === 'edit' ? S.tabActive : {}) },
                onClick: () => setHistoryTab('edit'),
                'data-history-tab': 'edit',
                'aria-pressed': historyTab === 'edit' ? 'true' : 'false',
              },
              t('historyTabEdit'),
              h('span', { style: S.tabNote }, `${historyText.length} ${t('historyChars')}`),
            ),
            h(
              'button',
              {
                type: 'button',
                style: { ...S.tab, ...(historyTab === 'import' ? S.tabActive : {}) },
                onClick: () => setHistoryTab('import'),
                'data-history-tab': 'import',
                'aria-pressed': historyTab === 'import' ? 'true' : 'false',
              },
              t('historyTabImport'),
              h('span', { style: S.tabNote }, t('historyImportHint')),
            ),
          ),
          // 导入那一侧多出来的按钮 + 「导入思考过程」勾选框（0.2.0）。
          historyTab === 'import'
            ? h(
                'div',
                { style: S.row, 'data-history-import-row': '1' },
                h(
                  'button',
                  {
                    type: 'button',
                    style: S.button,
                    disabled: writeBusy,
                    onClick: onImportClick,
                    'data-history-import-button': '1',
                  },
                  t('historyImportButton'),
                ),
                h(
                  'label',
                  {
                    style: { ...S.row, gap: 6, cursor: 'pointer' },
                    'data-history-thinking': '1',
                    title: t('historyThinkingLabel'),
                  },
                  h('input', {
                    type: 'checkbox',
                    checked: includeThinking,
                    disabled: writeBusy,
                    onChange: (event) => onToggleThinking(event.target.checked),
                    'data-history-thinking-checkbox': '1',
                  }),
                  h('span', { style: { fontSize: 13, lineHeight: '20px' } }, t('historyThinkingLabel')),
                ),
                // 「仅导最后压缩」（0.3.8）：紧挨着「导入思考过程」—— 两个都是
                // 「导入文本怎么渲染」的勾选框，摆在同一行、同一顺序。
                h(
                  'label',
                  {
                    style: { ...S.row, gap: 6, cursor: 'pointer' },
                    'data-history-compact': '1',
                    title: t('historyCompactHint'),
                  },
                  h('input', {
                    type: 'checkbox',
                    checked: expandOriginal,
                    disabled: writeBusy,
                    onChange: (event) => onToggleExpandOriginal(event.target.checked),
                    'data-history-compact-checkbox': '1',
                  }),
                  h('span', { style: { fontSize: 13, lineHeight: '20px' } }, t('historyCompactLabel')),
                ),
                // 隐藏的文件选择器：由上面的按钮用代码点开，样式上不占位。
                h('input', {
                  ref: historyFileRef,
                  type: 'file',
                  accept: '.jsonl,.jsonl.zstd,.zst,.zip,.txt,application/json,application/zip',
                  style: { display: 'none' },
                  'data-history-file': '1',
                  onChange: (event) => {
                    const picked = event.target.files !== null && event.target.files !== undefined
                      ? event.target.files[0]
                      : undefined;
                    onImportFile(picked ?? null);
                  },
                }),
              )
            : null,
          // **两个选框共用的那个输入框** —— 只在最下方渲染一份。
          // 0.2.0：不再显示上限、不再裁切；只报「增耗多少 token」
          // （0.2.4 起 N = 字节数 ÷ 4 + 32，取整显示）。
          h(
            'p',
            { style: S.sub, 'data-history-meta': '1' },
            `${t('historyChars')} · ${historyText.length}`,
            ` · ${t('historyTokenCost')} ${Math.round(historyBytes / 4 + 32)} tok`,
            historyDirty ? ` · ${t('historyDirtyHint')}` : '',
          ),
          h(
            'div',
            { style: S.scrollWrap, 'data-history-wrap': '1' },
            h('textarea', {
              ref: historyBoxRef,
              // 0.2.3 起比人设正文更高：历史对话动辄上千行，看的地方给大一点。
              style: { ...S.textarea, minHeight: 320 },
              value: historyText,
              onChange: (event) => {
                setHistoryNotice(null);
                // 「清空」之后只要开始输入，按钮就翻回「清空」——
                // 否则「撤回」会把刚敲进去的内容一起丢掉。
                setHistoryCleared(false);
                setHistoryText(event.target.value);
              },
              disabled: writeBusy,
              spellCheck: false,
              placeholder: t('historyPlaceholder'),
              // 0.3.27：名字必须与 `client.js` 的 `ensureScrollCss()` 里那条全页规则
              // 一致 —— 那里锚的是带前缀的 `[data-persona-history-text]`（理由见那处注释：
              // 全页样式表不锚通用属性名，免得误伤别的插件）。
              'data-persona-history-text': '1',
            }),
            // 右侧这条大滑条与「人设选框」共用同一个组件（0.2.0）。
            h(ScrollBar, {
              targetRef: historyBoxRef,
              deps: [historyTick, historyTab],
              trackAttr: 'data-history-track',
              thumbAttr: 'data-history-thumb',
            }),
          ),
          // 输入框下方**只留一个**按钮：清空 / 撤回（0.2.0）。
          h(
            'div',
            { style: S.row, 'data-history-actions': '1' },
            historyCleared
              ? h(
                  'button',
                  {
                    type: 'button',
                    style: S.button,
                    disabled: writeBusy,
                    onClick: onUndoClearHistory,
                    'data-history-undo': '1',
                  },
                  t('historyUndoButton'),
                )
              : h(
                  'button',
                  {
                    type: 'button',
                    style: S.button,
                    disabled: writeBusy,
                    onClick: onClearHistory,
                    'data-history-clear': '1',
                  },
                  t('historyClearButton'),
                ),
            h(
              'span',
              {
                style: S.mono,
                // 0.3.21：第三个取值 `missing` —— 存过、但内容已经不在了。
                'data-history-state': historyLost ? 'missing' : historyStored ? 'saved' : 'empty',
              },
              historyLost
                ? t('historyMissing')
                : historyStored
                ? `${t('historyStored')} · ${historyStoredBytes} ${t('historyBytes')}` +
                  (historyLockedAt === null ? '' : ` · ${new Date(historyLockedAt).toLocaleString()}`)
                : t('historyNotStored'),
            ),
          ),
          historyNotice !== null
            ? h(
                'p',
                {
                  style: historyNotice.kind === 'error' ? S.warn : S.notice,
                  'data-history-notice': historyNotice.kind,
                },
                historyNotice.text,
              )
            : null,
          // 0.3.12 在这里多渲染过一行红字（「段后有未被压缩的新对话，将裁切掉新增
          // 历史」）；0.3.14 起压缩视图本来就把最后一段之后的对话一起留下，那句话
          // 已经不成立，节点与文案一起删掉（`historyCompactTail` 也不在字典里了）。
          h(
            'p',
            { style: S.mono, 'data-history-stats': '1' },
            `${t('historyInjectedCount')}: ${data.section?.historyInjections ?? 0}`,
          ),
          h('span', { style: S.divider }),

          // 保存反馈 / 未保存提示：都渲染在最下方按钮**正上方**（0.2.0）。
          // 「保存中…」（0.2.6）优先占这一行：只有超过 120ms 的保存才会出现。
          showSaving
            ? h('p', { style: S.notice, 'data-save-feedback': 'saving' }, t('saving'))
            : saveFeedback !== null
            ? h(
                'p',
                {
                  style: saveFeedback.kind === 'error' ? S.warn : S.notice,
                  'data-save-feedback': saveFeedback.kind,
                },
                saveFeedback.text,
              )
            : null,
          dirtyParts.length > 0
            ? h(
                'p',
                { style: S.warn, 'data-unsaved': '1' },
                `${t('unsavedTitle')}${dirtyParts.join(' · ')}`,
              )
            : null,

          // 导出的结果就报在按钮**正上方**（和保存反馈同一片区域）。
          exportNotice !== null
            ? h(
                'p',
                {
                  style: exportNotice.kind === 'error' ? S.warn : S.notice,
                  'data-export-notice': exportNotice.kind,
                },
                exportNotice.text,
              )
            : null,

          // 「启用 / 删除」的结果也在这片区域（0.3.5）：并列按钮的提示一律报在
          // 它们**正上方**，不再跑进第④张「输入抑制开关」卡（bug 1.2）。
          editorNotice !== null
            ? h('p', { style: S.notice, 'data-editor-notice': '1' }, editorNotice)
            : null,

          h(
            'div',
            { style: S.row, 'data-editor-actions': '1' },
            h(
              'button',
              {
                type: 'button',
                style: S.buttonPrimary,
                onClick: onSave,
                disabled: !canSave,
                'data-save-button': '1',
              },
              t('save'),
            ),
            // 新建占位模式：多一个「清除」放弃这条没保存的新人设。
            creating
              ? h(
                  'button',
                  {
                    type: 'button',
                    style: S.button,
                    onClick: onDiscardNew,
                    disabled: writeBusy,
                    'data-discard-button': '1',
                  },
                  t('clearDraft'),
                )
              : null,
            // 「启用」按**选中的那条人设**出现：内置人设也要能一键启用。
            showActivate
              ? h(
                  'button',
                  {
                    type: 'button',
                    style: S.button,
                    onClick: () => onActivate(activateTarget),
                    disabled: writeBusy,
                    'data-activate-button': '1',
                  },
                  t('activate'),
                )
              : null,
            !creating && draft.id !== ''
              ? h(
                  'button',
                  { type: 'button', style: S.button, onClick: onDelete, disabled: writeBusy, 'data-delete-button': '1' },
                  t('del'),
                )
              : null,
            // 0.3.0：导出放在这一行的**最右侧**（正文 + 段序权重 + 历史对话）。
            // 0.3.1：它变成**一键菜单**的开关 —— 一次点击弹出「导出 JSON /
            // 导出图片」两项，不再把两个按钮并排塞进这一行。
            //
            // 0.3.8：按钮**不再轻易 disable**。新建（或内置复制出来还没保存）
            // 时它照样可点，点下去在按钮上方回答「无法导出：新建人设尚未保存」；
            // 有未保存改动时先弹确认（同「切人设」「删除」那一套 `window.confirm`）。
            // 只有「正等着载入、草稿还没跟上」那一小段窗口仍然不给点 ——
            // 那会儿没有一句能说清的话，而且旧版就是不给点的。
            h(
              'button',
              {
                type: 'button',
                style: S.button,
                onClick: onExportClick,
                disabled: !canClickExport,
                'data-export-button': '1',
                'aria-expanded': exportMenu ? 'true' : 'false',
                title: t('exportHint'),
              },
              t('exportButton'),
            ),
          ),
          // 一键菜单：点了「导出」才出现，选完自动收起。
          exportMenu
            ? h(
                'div',
                { style: S.exportMenu, 'data-export-menu': '1' },
                h(
                  'button',
                  {
                    type: 'button',
                    style: { ...S.button, textAlign: 'left' },
                    onClick: () => {
                      setExportMenu(false);
                      onExportJson();
                    },
                    'data-export-json': '1',
                    title: t('exportJsonHint'),
                  },
                  t('exportJson'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    style: { ...S.button, textAlign: 'left' },
                    onClick: () => {
                      setExportMenu(false);
                      onExportPngClick();
                    },
                    'data-export-png': '1',
                    title: t('exportPngHint'),
                  },
                  t('exportPng'),
                ),
              )
            : null,
          // 隐藏的选图器：**常驻**在卡里，不跟着菜单一起收起 ——
          // `input.click()` 是同步打开系统选图器，但用户挑完文件才发 change；
          // 要是这个节点在菜单收起时被 React 摘掉，那次 change 就再也到不了
          // 处理函数（选了半天没反应）。
          h('input', {
            ref: exportPngRef,
            type: 'file',
            accept: 'image/png,.png',
            style: { display: 'none' },
            'data-export-png-file': '1',
            onChange: (event) => onExportPngFile(event?.target?.files?.[0]),
          }),
        ),

        // ④ 输入抑制开关
        //
        // 版面顺序按需求固定：标题（带问号气泡）→ 按钮 →（原先排在按钮后面的那些行）→ 勾选框。
        h(
          'div',
          { style: S.card, 'data-switches-card': '1' },
          h(
            'p',
            { style: { ...S.sub, fontWeight: 600 } },
            h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
              h('span', null, t('switchesTitle')),
              // 0.2.0：这一组的长注释也收进标题后的问号气泡里。
              h(Hint, { text: t('switchesHint'), label: t('hintLabel') }),
            ),
          ),
          h(
            'div',
            { style: S.row },
            h(
              'button',
              {
                type: 'button',
                style: everySwitchOn ? S.button : S.buttonPrimary,
                disabled: writeBusy,
                onClick: onPrimaryAction,
                // 状态机对测试可见：全开时 data-pure-chat 从 '1' 变成 'restore'。
                'data-pure-chat': everySwitchOn ? 'restore' : '1',
              },
              everySwitchOn ? t('restoreButton') : t('pureChatButton'),
            ),
          ),
          h('p', { style: S.sub, 'data-pure-chat-hint': '1' }, t('pureChatHint')),
          pureChat
            ? h('p', { style: S.sub, 'data-pure-chat-state': '1' }, t('pureChatState'))
            : null,
          switches.soloOnly === true && activeId === null
            ? h('p', { style: S.warn }, t('soloNoPersona'))
            : null,
          // 「只保留人设后的规模」是**最近一次装配**的读数 —— 也就是某一个
          // 会话的，安在全局页上会是假的，所以只在当前页显示。
          activeTab === 'current' && switches.soloOnly === true && data.section?.before !== null && data.section?.before !== undefined
            ? h(
                'p',
                { style: S.mono, 'data-solo-savings': '1' },
                `${t('soloSavings')}: ${data.section.before.sections} ${t('sectionsUnit')} / ${data.section.before.chars} ${t('chars')}` +
                  ` → ${data.section.after.sections} ${t('sectionsUnit')} / ${data.section.after.chars} ${t('chars')}`,
              )
            : null,
          // 「系统注入块过滤状态」（0.3.4）。
          //
          // 只报**本会话**的读数（这些计数跟着会话走），所以全局页不显示。
          //
          // 0.3.11：删掉了原先那两句注释 —— 「本会话还没有过滤掉任何系统注入块…」
          // （一条都没有时的那句话）与「这四类都不是系统提示词里的段…」（末尾那句
          // 说明）。现在有过滤记录就按来源列出条数，没有就**不渲染那一行**，
          // 只剩下面那句总条数。
          activeTab === 'current'
            ? h(
                'div',
                {
                  style: { display: 'flex', flexDirection: 'column', gap: 2 },
                  'data-strip-status': stripPairs.length > 0 ? 'some' : 'none',
                  'data-strip-total': String(stripPairs.reduce((sum, row) => sum + row.count, 0)),
                },
                stripPairs.length === 0
                  ? null
                  : h(
                      'span',
                      { style: S.sub, 'data-strip-breakdown': '1' },
                      `${t('stripStatusTitle')}: ${stripPairs
                        .map((row) => `${t(row.label)} ×${row.count}`)
                        .join(' · ')}`,
                    ),
                h('span', { style: S.sub }, `${t('strippedMessages')}: ${data.strippedMessages ?? 0}`),
              )
            : null,
          SWITCH_FIELDS.map((field) =>
            h(
              'label',
              {
                key: field.key,
                style: { ...S.row, gap: 8, cursor: 'pointer', alignItems: 'flex-start' },
                'data-switch': field.key,
              },
              h('input', {
                type: 'checkbox',
                checked: switches[field.key] === true,
                disabled: writeBusy,
                onChange: (event) => onToggleSwitch(field.key, event.target.checked),
                style: { marginTop: 3, flex: 'none' },
              }),
              h(
                'span',
                { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
                // 每个开关的解释都收进问号气泡：点问号才浮出，标题行保持干净。
                h(
                  'span',
                  { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                  h('span', { style: { fontSize: 13, lineHeight: '20px' } }, t(field.label)),
                  h(Hint, { text: t(field.hint), label: t('hintLabel') }),
                ),
              ),
            ),
          ),
          notice !== null ? h('p', { style: S.notice, 'data-notice': '1' }, notice) : null,
          failure !== null ? h('p', { style: S.warn }, failure) : null,
          error !== null && error !== undefined ? h('p', { style: S.warn }, error) : null,
        ),
      );
    }
      return { PersonaManagerImpl: PersonaManagerImpl };
    }
    return { create };
    /* @build-fingerprint:end */
  },
});
