/**
 * `dsh-persona-select` — 包内分块：client.picker.js（0.3.23 · 审计 §三.1）。
 *
 * 为什么单独一个文件：主包 `client.js` 原来把设置页与选择框两大块都揣在身上
 * （合计约 100 KB）。它们各自只在一种界面上出现（设置页 / 对话输入区），
 * 拆开之后主包小了、两块也能各自读。
 *
 * ⚠ 分块的两条硬规则（与另外两个分块一样，见 `client.js` 的 `loadChunk()`）：
 *   · 文件名必须匹配 `client.<名字>.js`，且与 `client.js` **同目录**；
 *   · `id` 是**包名**、`chunk` 是**文件名**；模块表键是
 *     `dsh-persona-select/client.picker.js`。
 *
 * 分块里**不** require('react')、也不复制主包的常量 —— 一切由 `create(deps)`
 * 注入（`deps` 由主包的 `chunkDeps()` 给出）。这样主包仍是唯一的真相来源，
 * 分块里的组件与搬迁之前逐字相同。
 */
window.__ModuleLoader__.load({
  id: 'dsh-persona-select',
  chunk: 'client.picker.js',
  factory: function pickerChunk(require) {
    'use strict';
    /* @build-fingerprint:begin */
    /**
     * @param {object} deps - 主包注入的作用域（`chunkDeps()`）。
     * @returns {{ PersonaPickerImpl: Function }} 这一个分块提供的组件。
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
     * 模式选择那一行正下方的人设选择器（渲染在 `conversation.input.dock` 里）。
     *
     * 自己画的下拉而不是原生 `<select>`：
     *   - 原生 select 的弹层方向由系统决定，无法保证「向上展开」；
     *   - `<option>` 也没法做加粗 / 斜体这类强调，而「一键为纯聊天」需要有强调感。
     *
     * 0.1.4 的两处改动都在面板里：
     *   - 「一键为纯聊天」从**置底**移到**置顶**（最容易点到的位置）；
     *   - 右侧滚动条换成一条**又宽又可拖**的自绘滑条（原生滚动条在移动端太细，
     *     翻长人设列表很慢），整条轨道都是拖动区，点哪跳哪。
     *
     * 0.1.5：指示点跟着「本会话第一轮请求里有没有工具」变色，并且
     *   - 「不注入」也有指示点（以前 `activeId === null` 时那个点直接不渲染）；
     *   - 会话窗口切换（槽位把新的 `sessionId` 递上来）立即重查；
     *   - 一轮对话结束（`session.running` 由 true 变 false）后再查一次 ——
     *     第一轮的工具声明基线正是在那一轮装配时落进会话日志的。
     * @param {object} props - 槽位给的 props（含 `sessionId` / `session`）。
     * @returns {import('react').ReactElement} 选择器元素。
     */
    function PersonaPickerImpl(props) {
      const t = props !== null && props !== undefined && typeof props.t === 'function' ? props.t : fallbackT;
      /**
       * 本组件所在会话的 id。它来自槽位的 inject face ——
       * `conversation.input.dock` 是 `scope: "session"` 的列表槽位，
       * 注册时的 `inject(sessionId)` 拿到的就是当前会话。
       */
      const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
      /** 本会话是不是正在跑一轮（用来在轮次结束时补一次检查）。 */
      const running = props?.session?.running === true;
      const { data, reload } = usePersonaState(sessionId);
      const [open, setOpen] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [failure, setFailure] = React.useState(null);
      const wrapRef = React.useRef(null);
      const listRef = React.useRef(null);
      /** 上一次看到的「哪个会话 + 在不在跑」，用来发现会话切换与轮次结束。 */
      const lastSeenRef = React.useRef(null);
      /** 已经为哪个会话请求过「该有自己的一份记录」—— 一个会话只问一次。 */
      const residentAskedRef = React.useRef('');
      /**
       * 这个会话是不是新建的空对话。用来告诉 Host「该不该采样」：
       * 空对话对应全局设置，采样要等第一条消息（由 `agent/pre-step` 完成）。
       *
       * 直接取槽位递进来的会话快照上那一份 —— `props.session` 就是
       * `useSession(...)` 的那个对象，`running` / `blank` 本来就在它上面
       * （与上面那一行同源）。以前这里为此专门挂了一整套 `useSessions`
       * 订阅，等于同一条信息两处订阅、两处可能不同步。
       */
      const blank = typeof props?.session?.blank === 'boolean' ? props.session.blank : undefined;
      /**
       * 这个会话的**直系父会话 id**（0.3.25），只知道这一种就问得出：
       * 委派出来的子 agent 的会话快照上带着 `subagent.address`
       * （`{ parentSessionId, childSessionId, mode }`）。
       *
       * 选择框**拿不到会话列表那一行**（它只有会话视图，没有 `useSessions`），
       * 所以侧栏「分叉」出来的子对话在这里是**问不出来的**。那就**什么都不说**
       * （`undefined`，请求体里不写 `parent` 这个键）—— Host 会把这次采样交给
       * 读得到 header 的那几条路，而不是拿一份会永久冻住子会话的全局快照。
       * 见 Host 半边的 `bodyKnowsParent()` 与 `parentSessionIdOf()`。
       */
      const parent = typeof props?.session?.subagent?.address?.parentSessionId === 'string'
        && props.session.subagent.address.parentSessionId !== ''
        ? props.session.subagent.address.parentSessionId
        : undefined;

      // 会话窗口切换 / 一轮对话结束 → 立刻重查一次。
      //
      // `usePersonaState` 的 `reload` 身份跟着 sessionId 走，所以切窗口时
      // 上面那个「初次加载」effect 会自己重跑；这里补的是**轮次结束**那一刻
      // （running: true → false）—— 第一轮的装配刚过去，指示点该重新算一次。
      React.useEffect(() => {
        const key = `${sessionId}:${running ? '1' : '0'}`;
        const previous = lastSeenRef.current;
        lastSeenRef.current = key;
        if (previous === null || previous === key) return;
        reload();
      }, [sessionId, running, reload]);

      // 「这个会话该有自己的一份记录了」（0.2.8）。
      //
      // 触发点就是需求里那一句「对话页左侧选中了无插件文件记录的旧对话」：
      // 选择器一挂到这个会话上就问一次。新对话（blank）Host 不会采样，
      // 这时候它对应「全局」设置；发出第一条消息后由 Host 在 pre-step 采样。
      //
      // 会重试：打开一个旧对话时，Host 那边的会话可能还没恢复完（`sessions.get`
      // 还拿不到），所以只要「还没有记录 + 已知不是空对话」就再问一次 ——
      // 每 3 秒最多一次，问到了就停。
      const lastResidentRef = React.useRef(0);

      /**
       * K2（档位 2）：重试用的计数器，由一个**真正的定时器**推进。
       *
       * 以前这段「每 3 秒再试一次」**一次都不会重试** —— 下面那个 effect 监听的
       * 几个值（`sessionId` / `data.session.hasRecord` / `blank` / `reload` 的身份）
       * 全是最基础的、不变的值：后台数据虽然换了新的，可它关心的那个标志仍然是
       * 「没有记录」，于是 React 认为依赖没变、不重跑。
       *
       * 也不能靠轮询带来的新 `data` 对象来兜：`usePersonaState` 在响应原文
       * **一字未变**时故意不 `setState`（0.2.2 的省渲染优化），而「没采到」这个
       * 场景恰恰就是一字未变。所以只能用定时器。
       */
      const [residentRetryTick, setResidentRetryTick] = React.useState(0);
      React.useEffect(() => {
        // 只在「确实还该重试」时开着：还没有记录，而且已经知道**不是**空对话
        // （空对话对应全局设置，要等第一条消息由 Host 采样，不是靠重试）。
        if (sessionId === '') return undefined;
        if (data?.session?.hasRecord === true) return undefined;
        if (blank !== false) return undefined;
        const timer = setInterval(() => setResidentRetryTick((n) => n + 1), RESIDENT_RETRY_MS);
        // 浏览器里 `setInterval` 返回数字；Node 的假 DOM 里返回带 `unref` 的对象。
        if (typeof timer?.unref === 'function') timer.unref();
        return () => clearInterval(timer);
      }, [sessionId, data?.session?.hasRecord, blank]);

      React.useEffect(() => {
        if (sessionId === '') return undefined;
        const hasRecord = data?.session?.hasRecord === true;
        if (hasRecord) {
          residentAskedRef.current = sessionId;
          return undefined;
        }
        if (blank === true) return undefined;
        const now = Date.now();
        if (residentAskedRef.current !== sessionId) {
          residentAskedRef.current = sessionId;
          lastResidentRef.current = now;
        } else if (blank !== false || now - lastResidentRef.current < RESIDENT_RETRY_MS) {
          return undefined;
        } else {
          lastResidentRef.current = now;
        }
        let cancelled = false;
        (async () => {
          try {
            // `blank` 与 `parent` 都是**知道才发**（不知道就不写那个键）：
            // Host 用「键在不在」区分「没有父」与「不知道」，顺手写成 `null`
            // 会让它以为这一行没有父。
            const asked = { session: sessionId };
            if (blank !== undefined) asked.blank = blank;
            if (parent !== undefined) asked.parent = parent;
            await call('/resident', { method: 'PUT', body: JSON.stringify(asked) });
            if (!cancelled) reload();
          } catch {
            // 采样失败只是「这个会话继续跟随全局」，界面上照常显示。
          }
        })();
        return () => {
          cancelled = true;
        };
        // K2：`residentRetryTick` 是重试的触发点（真正的定时器推它）。
      }, [sessionId, data?.session?.hasRecord, blank, parent, reload, residentRetryTick]);

      // 面板一展开就重新拉一次 /state。
      //
      // 这个选择器是常驻在 composer 上的。0.1.4 起 usePersonaState 还会监听
      // 同页广播 + 低频轮询（修「设置页启用了另一个人设、选框不变」），
      // 展开时再拉一次是为了保证「看到的永远是点开那一刻的状态」。
      React.useEffect(() => {
        if (!open) return undefined;
        reload();
        return undefined;
      }, [open, reload]);

      // 点面板外面就收起。拿不到 document 时静默跳过（不因为这个让选择器崩掉）。
      React.useEffect(() => {
        if (!open) return undefined;
        try {
          if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined;
          const onDown = (event) => {
            const node = wrapRef.current;
            if (node !== null && node !== undefined && typeof node.contains === 'function' && node.contains(event.target)) return;
            setOpen(false);
          };
          document.addEventListener('mousedown', onDown);
          return () => document.removeEventListener('mousedown', onDown);
        } catch {
          return undefined;
        }
      }, [open]);

      // 展开时补一条 CSS，把原生滚动条藏掉（不然会和自绘滑条叠在一起）。
      React.useEffect(() => {
        if (!open) return undefined;
        ensureScrollCss();
        return undefined;
      }, [open]);

      const run = React.useCallback(
        async (work) => {
          setBusy(true);
          setFailure(null);
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

      const onPickPersona = (id) =>
        run(async () => {
          setOpen(false);
          // 带上 session：Host 按「这个会话有没有记录」决定写到哪一层
          // （有记录 → 只改它自己；没有 → 改全局，也就是新对话跟随的那一份）。
          await call('/active', { method: 'PUT', body: JSON.stringify({ id, session: sessionId }) });
          // 广播会顺带刷新自己；只有广播不可用时才自己再拉一次（省一次请求）。
          if (!notifyPersonaChanged()) await reload();
        });

      // 与设置页完全相同的两个动作 —— 同一个判据（四个开关全开）决定显示哪个。
      const onSpecialAction = () =>
        run(async () => {
          setOpen(false);
          if (allSwitchesOn(data?.switches)) {
            await call('/switches', {
              method: 'PUT',
              body: JSON.stringify({
                soloOnly: false,
                stripRuntime: false,
                stripTools: false,
                stripInjected: false,
                session: sessionId,
              }),
            });
          } else {
            await call('/switches', {
              method: 'PUT',
              body: JSON.stringify({ pureChat: true, session: sessionId }),
            });
          }
          // 广播会顺带刷新自己；只有广播不可用时才自己再拉一次（省一次请求）。
          if (!notifyPersonaChanged()) await reload();
        });

      if (data === null) {
        return h(
          'div',
          { style: { ...S.row, opacity: 0.6 }, 'data-plugin': 'dsh-persona-select', 'data-render-state': 'loading' },
          h('span', { style: S.sub }, t('pickerLabel')),
        );
      }

      const assembly = data.section;
      const dropped = assembly !== undefined && assembly !== null && typeof assembly.droppedAt === 'number';
      const activeId = data.activeId ?? null;
      /** 这个会话有没有自己的记录（= 选框写的是「当前」还是「全局」）。 */
      const hasRecord = data.session?.hasRecord === true;
      const selected = (data.personas ?? []).find((persona) => persona.id === activeId);
      // 「一键为纯聊天」被选中后的样子：人设显示为「不注入」，那一项变成「系统输入还原」。
      const everySwitchOn = allSwitchesOn(data.switches);
      const currentLabel = selected === undefined ? t('off') : selected.name;
      const options = (data.personas ?? []).filter((persona) => persona.id !== 'builtin:off');
      /**
       * 指示点（0.1.5 / 0.3.5）：本会话的全部触发项，小圆点取优先级最高的那个颜色
       * （红 > 黄 > 绿），完整解释进 `title`。
       *
       * 「极简模式」也就是从这里报黄：它由 Host 按**这个会话的 preset**判定，
       * 与新老对话无关，所以选框上的点在新对话里也照样变色。
       */
      const indicators = indicatorsOf(data, t);
      const indicator = summarizeIndicators(indicators, t);
      /** 触发器与「当前选中项」共用的那个点。 */
      const dotNode = h('span', {
        style: S.dot(indicator.color),
        'data-dot': indicator.color,
        'data-indicator': indicator.reason,
        title: indicator.text,
      });
      return h(
        'div',
        {
          style: { ...S.row, position: 'relative' },
          'data-plugin': 'dsh-persona-select',
          'data-render-state': 'ready',
          'data-picker-open': open ? '1' : '0',
          'data-session-id': sessionId,
          // 0.2.8：这个选框写的是哪一层。有会话记录 = 本会话（当前），
          // 没有 = 全局（新对话跟随的那一份）。
          'data-scope': hasRecord ? 'session' : 'global',
          // 0.3.5：本会话触发的全部判断项（红在前），便于核对状态机。
          'data-indicators': indicators.map((entry) => entry.reason).join(','),
          title: failure ?? (dropped ? t('droppedHint') : ''),
          ref: wrapRef,
        },
        h('span', { style: S.sub }, t('pickerLabel')),
        h(
          'button',
          {
            type: 'button',
            style: S.pickerTrigger,
            disabled: busy,
            onClick: () => setOpen((previous) => !previous),
            'data-persona-picker': '1',
          },
          h('span', null, currentLabel),
          // 未展开时箭头朝上（面板向上展开），展开后翻成朝下。
          h('span', { style: S.pickerArrow, 'data-picker-arrow': open ? 'down' : 'up' }, open ? '▼' : '▲'),
        ),
        // 0.1.5：指示点**总是**在，包括选了「不注入」的时候（以前那种状态下
        // 它直接不渲染）。颜色由本会话第一轮请求里有没有工具决定。
        dotNode,
        // 0.2.8：写的是哪一层，一眼能看见（悬停给完整解释）。
        h(
          'span',
          { style: S.badge, 'data-picker-scope-badge': hasRecord ? 'session' : 'global', title: t('pickerLayerHint') },
          hasRecord ? t('scopeLayerCurrent') : t('scopeLayerGlobal'),
        ),
        open
          ? h(
              'div',
              { style: S.pickerPanel, 'data-picker-panel': '1' },
              // ① 置顶的特殊项（0.1.4：从面板底部移到顶部）。
              h(
                'button',
                {
                  type: 'button',
                  style: { ...S.pickerOption, ...S.pickerEmphasis },
                  'data-pure-chat-option': everySwitchOn ? 'restore' : '1',
                  'data-pure-chat-position': 'top',
                  onClick: onSpecialAction,
                },
                h('span', { style: { flex: 1 } }, everySwitchOn ? t('restoreButton') : t('pureChatButton')),
              ),
              h('span', { style: S.pickerDivider }),
              // ② 人设列表 + 右侧那条可点、可拖的大滑条。
              h(
                'div',
                { style: S.scrollWrap, 'data-picker-scroll': '1' },
                h(
                  'div',
                  {
                    ref: listRef,
                    style: S.pickerList,
                    'data-persona-picker-list': '1',
                  },
                  h(
                    'button',
                    {
                      type: 'button',
                      style: { ...S.pickerOption },
                      'data-persona-option': 'off',
                      // 显式发 `builtin:off`（历史上这里发的是空串；两种服务端都认，
                      // 但显式写法不会被"没写 id"的校验误伤）。
                      onClick: () => onPickPersona('builtin:off'),
                    },
                    h('span', { style: { flex: 1 } }, t('off')),
                    // 「不注入」被选中时也有指示点（0.1.5）。
                    activeId === null ? dotNode : null,
                  ),
                  options.map((persona) =>
                    h(
                      'button',
                      {
                        type: 'button',
                        key: persona.id,
                        style: { ...S.pickerOption },
                        'data-persona-option': persona.id,
                        onClick: () => onPickPersona(persona.id),
                      },
                      h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, persona.name),
                      persona.builtin ? h('span', { style: S.badge }, t('builtin')) : null,
                      activeId === persona.id ? dotNode : null,
                    ),
                  ),
                ),
                // 右侧这条大滑条与人设历史对话输入框共用同一个组件。
                h(ScrollBar, {
                  targetRef: listRef,
                  deps: [open, data],
                  trackAttr: 'data-picker-track',
                  thumbAttr: 'data-picker-thumb',
                }),
              ),
            )
          : null,
        failure !== null ? h('span', { style: S.warn }, failure) : null,
      );
    }
      return { PersonaPickerImpl: PersonaPickerImpl };
    }
    return { create };
    /* @build-fingerprint:end */
  },
});
