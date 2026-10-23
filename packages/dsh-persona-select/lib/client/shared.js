    let React = null;
    try {
      React = require('react');
    } catch {
      React = null;
    }
    const h = React !== null && typeof React.createElement === 'function' ? React.createElement : null;
    const ROUTE_PREFIX = '/persona-select';
    const NS = '__NS__';
    const EXPORT_FORMAT = 'dsh-persona-select/personas';
    const EXPORT_VERSION = 1;
    const EXPORT_MAX_BYTES = 32 * 1024 * 1024;
    function decodeUtf8(bytes) {
      try {
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        let out = '';
        for (const byte of bytes) out += String.fromCharCode(byte);
        try {
          return decodeURIComponent(escape(out));
        } catch {
          return out;
        }
      }
    }
    function historyBytesOf(text) {
      const value = typeof text === 'string' ? text : '';
      try {
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(value).length;
      } catch {
      }
      return value.length;
    }
    const USER_OPEN = '<user_message>';
    const USER_CLOSE = '</user_message>';
    const ASSISTANT_OPEN = '<assistant_message>';
    const ASSISTANT_CLOSE = '</assistant_message>';
    const FILE_OPEN = '<file>';
    const FILE_CLOSE = '</file>';
    const HISTORY_WRAPPER_LINES = ['CONTEXT_ROAD:', 'CONTINUE_CONTEXT.'];
    const HISTORY_FRAME_LINES = ['<system-reminder>', '</system-reminder>'];
    const HISTORY_FRAME_ESCAPE = '<\\/system-reminder>';
    const HISTORY_LEGACY_TAGS = ['<persona-history>', '</persona-history>'];
    const HISTORY_LEGACY_PREAMBLE = [
      '以下是本会话开始之前，你与用户之间已经发生过的对话记录。',
      '把它当作已经发生的事实延续下去；不要复述本段说明，也不要向用户确认收到。',
    ];
    const LEGACY_USER_MARKER = '【用户】';
    const IMAGE_EXTENSIONS = Object.freeze({
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    });
    const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
    const CHUNK_NAME_RE = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/;
    /**
     * 一个包自己的分块加载器（每个 bundle 各自一份 require，避免跨包加载分块）。
     */
    function createChunkHost(requireFn) {
      const chunkCache = new Map();
      function loadChunk(fileName) {
        if (typeof requireFn.async !== 'function') throw new Error('no-require-async：这个宿主还不支持包内分块');
        if (!CHUNK_NAME_RE.test(fileName)) throw new Error(`bad-chunk-name：${fileName}`);
        const cached = chunkCache.get(fileName);
        if (cached !== undefined) return cached;
        const promise = Promise.resolve().then(() => requireFn.async(`./${fileName}`));
        chunkCache.set(fileName, promise);
        promise.catch(() => {
          if (chunkCache.get(fileName) === promise) chunkCache.delete(fileName);
        });
        return promise;
      }
      const chunks = { ioExport: null, logImport: null };
      async function ioExport() {
        if (chunks.ioExport === null) {
          try {
            chunks.ioExport = (await loadChunk('client.io-export.js')).create({ call, decodeUtf8, EXPORT_FORMAT, EXPORT_VERSION });
          } catch (problem) {
            chunks.ioExport = null;
            throw problem;
          }
        }
        return chunks.ioExport;
      }
      async function logImport() {
        if (chunks.logImport === null) {
          try {
            chunks.logImport = (await loadChunk('client.log-import.js')).create({ USER_OPEN, USER_CLOSE, ASSISTANT_OPEN, ASSISTANT_CLOSE, FILE_OPEN, FILE_CLOSE, HISTORY_WRAPPER_LINES, HISTORY_FRAME_LINES, HISTORY_FRAME_ESCAPE, HISTORY_LEGACY_TAGS, HISTORY_LEGACY_PREAMBLE, LEGACY_USER_MARKER, IMAGE_EXTENSIONS, ZSTD_MAGIC, decodeUtf8, historyBytesOf });
          } catch (problem) {
            chunks.logImport = null;
            throw problem;
          }
        }
        return chunks.logImport;
      }
      function logImportSync() {
        if (chunks.logImport === null) throw new Error('log-import-chunk-not-loaded');
        return chunks.logImport;
      }
      const componentChunks = new Map();
      function loadComponentChunk(fileName, id, build) {
        const existing = componentChunks.get(fileName);
        const record = existing !== undefined
          ? existing
          : { fileName, id, build, status: 'loading', component: null, error: null, listeners: new Set() };
        if (record.status === 'ready') return record;
        record.build = build;
        record.status = 'loading';
        record.component = null;
        record.error = null;
        componentChunks.set(fileName, record);
        const notify = () => {
          for (const listener of [...record.listeners]) {
            try {
              listener();
            } catch {
            }
          }
        };
        Promise.resolve()
          .then(() => loadChunk(fileName))
          .then((module) => {
            const component = build(module);
            if (typeof component !== 'function') throw new Error(`${fileName} 没有交出组件`);
            record.component = component;
            record.status = 'ready';
          })
          .catch((problem) => {
            record.error = problem?.message ?? String(problem);
            record.status = 'error';
          })
          .then(notify);
        return record;
      }
      function lazyChunkComponent(record) {
        return function LazyChunkComponent(props) {
          const [, force] = React.useState(0);
          React.useEffect(() => {
            if (record.status !== 'loading') return undefined;
            const listener = () => force((n) => n + 1);
            record.listeners.add(listener);
            return () => {
              record.listeners.delete(listener);
            };
          }, []);
          if (record.status === 'ready') return h(record.component, props);
          const t = props !== null && props !== undefined && typeof props.t === 'function' ? props.t : fallbackT;
          if (record.status === 'error') {
            return h(
              'div',
              { style: S.root, 'data-chunk-error': record.fileName },
              h('p', { style: S.warn }, `${t('chunkFailed')}：${record.error}`),
              h(
                'button',
                {
                  type: 'button',
                  style: S.button,
                  'data-chunk-retry': record.fileName,
                  onClick: () => {
                    force((n) => n + 1);
                    loadComponentChunk(record.fileName, record.id, record.build);
                  },
                },
                t('retry'),
              ),
            );
          }
          return h('p', { style: S.sub, 'data-chunk-loading': record.fileName }, t('loading'));
        };
      }
      function registerComponentChunk(fileName, slotId, build) {
        return lazyChunkComponent(loadComponentChunk(fileName, slotId, (module) => build(module)));
      }
      return { loadChunk, ioExport, logImport, logImportSync, loadComponentChunk, lazyChunkComponent, registerComponentChunk };
    }

    const chunkHost = createChunkHost(require);

    function chunkDeps() {
      return {
        React, h, S, fallbackT,
        AssemblyLine, Hint, ScrollBar, layerIndicators,
        EXPORT_FORMAT, EXPORT_VERSION, EXPORT_MAX_BYTES,
        STRIP_KIND_FIELDS, SWITCH_FIELDS, RESIDENT_RETRY_MS,
        allSwitchesOn, byColorRank, call, checkOrderInput, ensureScrollCss,
        historyBytesOf, indicatorFor, indicatorsOf,
        ioExport: chunkHost.ioExport, logImport: chunkHost.logImport, logImportSync: chunkHost.logImportSync,
        notifyPersonaChanged, summarizeIndicators,
        useMainSessionRow, usePersonaState, useSettledTick,
        popupPanelLayout, popupPanelLayoutStyle, supportsPopover,
      };
    }
    const PERSONA_CHANGED_EVENT = 'dsh-persona-select:changed';
    const PERSONA_POLL_MS = 4000;
    const RESIDENT_RETRY_MS = 3000;
    const REQUEST_TIMEOUT_MS = 30000;
    const LARGE_UPLOAD_BYTES = 1024 * 1024;
    const LARGE_UPLOAD_TIMEOUT_MS = 180000;
    function timeoutForBody(init) {
      let size = 0;
      try {
        const body = init === undefined || init === null ? undefined : init.body;
        if (typeof body === 'string') size = body.length;
        else if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) size = body.byteLength;
        else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body)) size = body.byteLength;
        else if (typeof Blob !== 'undefined' && body instanceof Blob) size = body.size;
      } catch {
        size = 0;
      }
      return size >= LARGE_UPLOAD_BYTES ? LARGE_UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    }
    const zh = {
      nav: '人设管理',
      pickerLabel: '人设',
      off: '不注入',
      title: '人设管理',
      listTitle: '人设列表',
      newPersona: '新建',
      importButton: '导入',
      importHint: '读入本插件「导出」出来的文件（.json，或「导出图片」生成的 .png）：人设正文、段序权重、历史对话一起收进来，作为**新人设**追加到列表（不会覆盖已有条目）。',
      importFailed: '导入失败',
      importEmpty: '这个文件里没有可导入的人设（没有 personas 数组，也没有单条人设对象）。',
      importDone: '已导入',
      importSkipped: '跳过',
      exportButton: '导出',
      exportHint: '把编辑区里的人设（正文 + 段序权重 + 历史对话）导出成文件：可以导成纯 JSON，也可以装进一张你自己选的 PNG 里。',
      exportJson: '导出 JSON',
      exportJsonHint: '导出成 .json：纯 JSON、不压缩、无损（换行与引号会被转义，所以只会比原文更大）。',
      exportPng: '选择PNG图片注入并另存',
      exportPngHint: '选一张 PNG 当封面，把同一份数据装进图里一起下载。图片本身一个字节都不改，普通看图工具照常显示。',
      exportPngBad: '这个文件不是 PNG。图片导出需要一张 PNG 当封面 —— JPEG / WebP 没有 PNG 那种「解码器会跳过的附属块」，硬转一道会把原图重编码，所以这里直接不做。',
      exportPngBroken: '这张 PNG 的结构不完整（读不到 IHDR），换一张试试。',
      exportTooBig: '文件太大了，超过了 32 MB 的单次导出上限。',
      exportNameMayDiffer: '（下载通道不可用，文件名可能被系统改写）',
      exportNotTaken:
        '没确认到文件被下载下来（浏览器可能拦了，或者下载器没来取）—— 去下载目录看一眼；没有就再点一次。',
      importPngNoData: '这张图里没有人设数据（没有找到本插件的 iTXt 块）。',
      importPngBadCrc: '这张图里的人设数据校验不过（CRC 对不上），文件被改过。',
      exportDone: '已导出',
      exportFailed: '导出失败',
      exportNoBrowser: '这个环境不支持下载文件，导出取消。',
      exportRefusedNew: '无法导出：新建人设尚未保存',
      exportConfirmDirty: '当前选中人设的编辑尚未保存，导出的人设为保存前的原案，确认继续导出？',
      activate: '启用',
      builtin: '内置',
      builtinReadonly: '内置人设只读。要改就「复制为新人设」，改副本。',
      name: '名字',
      text: '正文',
      save: '保存',
      del: '删除',
      confirmDelete: '确定删除这个人设？此操作不可撤销。',
      confirmOk: '确定',
      confirmCancel: '取消',
      activated: '已切换人设；新一轮对话生效',
      activatedNamed: '已切换人设：%s；新一轮对话生效',
      deactivated: '已关闭人设注入',
      deleted: '人设已删除',
      chars: '字符',
      path: '数据文件',
      applied: '最近一次装配：已注入',
      dropped: '最近一次装配：未注入',
      droppedHint:
        '本会话的 agent preset 声明了 complete: true（DSH 内置的「极简模式」就是这样），平台会把装配压成单段，插件的段进不去。换回标准模式即可。',
      neverApplied: '还没有观察到装配。发一条消息后再看。',
      assemblyGlobalScope: '这一页是全局设置：装配结果只有具体对话才有',
      noPersona: '最近一次装配：本轮没有可注入的人设',
      noPersonaHint:
        '本会话没有选定人设（选了「不注入」，或选定人设的正文是空的），所以这一轮没有内容可以放进系统提示词。这是当前选择的结果，不是被谁顶掉了。',
      orderTrace: '最近一次装配的真实段序',
      switchesTitle: '输入抑制开关',
      switchesHint:
        '四个开关分别压掉模型能看到的四类系统侧输入。全部打开且没有激活人设 = 纯聊天（系统侧零注入），相当于网页版免费端的起点。',
      swSoloLabel: '仅加载人设（屏蔽其余全部系统提示词段）',
      swSoloHint:
        'harness 身份、部署人设、工具指引、plan 模式策略、harness 源码说明等全部不再下发。没选人设时系统提示词为空。',
      swRuntimeLabel: '屏蔽 runtime 上下文',
      swRuntimeHint:
        '两类东西：① 沙箱策略、审批策略、委派规则等以 user 角色快照出现的动态上下文；② 框在 `<system-reminder>` 里的运行时快照与技能目录（创造模式会真的出现，因为它的 preset 挂了自带技能目录）。它们都不在系统提示词里（所以「仅加载人设」也管不到），只能在装配前按来源过滤 —— 这个开关两类都压。',
      swToolsLabel: '屏蔽工具 schema',
      swToolsHint:
        '工具定义走 wire 上的独立字段，不在系统提示词里，通常是 token 的最大头。压掉之后模型没有任何可调用的工具。',
      swInjectedLabel: '屏蔽历史注入（工作区指令链 / 时间读数）',
      swInjectedHint:
        'AGENTS.md / CLAUDE.md 指令链基线，以及 dsh-time-context 每步追加的时间读数。它们同样是插件往历史里追加的 user 消息、不是提示词段，只能按来源精确过滤。',
      pureChatButton: '一键为纯聊天',
      restoreButton: '系统输入还原',
      pureChatHint: '取消人设选择并打开全部四个开关',
      pureChatState: '当前处于纯聊天状态：系统侧零注入，模型只看到你发的消息。',
      pureChatOn: '已切到纯聊天',
      restoreDone: '已还原系统输入：四个开关全部取消',
      switchesSaved: '开关已保存；下一轮生效',
      strippedMessages: '本对话已过滤的注入消息条数',
      stripStatusTitle: '系统注入块（本会话已过滤）',
      stripKindRuntime: '运行时快照',
      stripKindSkill: '技能目录',
      stripKindInstructions: '工作区指令链',
      stripKindTime: '时间读数',
      soloNoPersona: '「仅加载人设」开着，但没有选人设 —— 系统提示词会是空的。',
      soloSavings: '只保留人设后的规模',
      sectionsUnit: '段',
      toolReusableLabel: '工具可复用',
      toolReusableHint:
        '「屏蔽工具 schema」的安全阀。DSH 的工具账本要求本会话的工具声明基线非空；基线一旦被清空，之后回来的工具会被全部标成延迟加载（defer_loading），provider 直接拒（INVALID_REQUEST）。勾选后，插件只在两个时点临时保留一轮完整工具：本会话第一次请求，以及疑似声明系列重启（例如刚压缩过）。这两轮把非空基线写进会话，之后随你怎么开关「屏蔽工具 schema」，工具都拿得回来。取消勾选则不设防。',
      toolStripHeldFirst:
        '本轮保留了工具：本会话还没有工具声明基线，先让它带着完整工具建立起来，下一轮起才真正屏蔽（否则工具再也拿不回来）。',
      toolStripHeldRestart:
        '本轮保留了工具：检测到本轮会重启工具声明系列（例如刚压缩过），先让新基线带着完整工具建立起来，下一轮起继续屏蔽。',
      toolBaselineEmpty:
        '本会话的工具声明基线是空的 —— 这个会话的第一轮请求里一个工具都没有。之后回来的工具会被全部标成延迟加载，provider 会直接拒绝（INVALID_REQUEST）。要恢复工具请新开一个对话。',
      indicatorSession: '对应会话',
      indicatorGreen:
        '绿色：正常。工具声明基线可用。',
      indicatorYellow:
        '黄色：「工具可复用」没勾选。剥工具时不再保护工具声明基线，某些会话的基线可能被清空、工具就再也拿不回来。',
      indicatorRed:
        '红色：这个会话的第一轮请求里没有任何工具（工具声明基线为空）。之后回来的工具会被标成延迟加载，provider 会拒绝；工具在本会话内拿不回来，请新开一个对话。',
      storeError: '数据文件读取失败',
      warningsSummary: '需要注意的情况',
      warningsShow: '展开',
      warningsHide: '收起',
      loading: '加载中…',
      retry: '重试',
      chunkFailed: '这一块界面没能加载',
      createHint: '正在新建（尚未保存）',
      editHint: '正在编辑',
      blankText: '正文为空，保存会被拒绝。',
      blankSaveRefused: '拒绝保存：人设正文为空，空人设请启用“不注入”',
      orderLabel: '段序权重',
      orderHint:
        '人设段在系统提示词里的排序权重：越小越靠前（默认 -1，排在 preset 那句「You are a coding agent…」之前）。它只决定段落顺序，不会进入人设正文。每个人设各自记住自己的权重，切换人设时这个框也跟着换；改完点「保存」才生效，保存时会校验：必须是整数。',
      orderDefaultButton: '默认',
      orderFollowButton: '追随',
      orderFollowText: '追加在系统提示词后',
      orderFollowHint:
        '权重放到所有系统提示词段之后（与 prompt 管理同一个做法），点一下这个框可以改回数值。改完点「保存」生效。',
      orderProblemEmpty: '段序权重不能为空：填一个整数，或者点「默认」/「追随」。',
      orderProblemInteger:
        '段序权重必须是整数（例如 -1、0、10200）：小数（如 0.1）、指数、单位都不是合法段序 —— 它会让系统提示词的段序不合法。刚才输入的是',
      orderProblemRange: '段序权重必须是 -1000000000 ~ 1000000000 之间的整数。',
      orderSaved: '段序已保存',
      hintLabel: '说明',
      unnamed: '未命名',
      clearDraft: '清除',
      historyTitle: '人设历史对话',
      historySubtitle:
        '一段「已经发生过的对话」，一起保存进这条人设。选定人设在新对话第一步会把历史对话作为 user 侧上下文注入；' +
        '已经注入过的对话不会再次注入，否则会重置整份对话的缓存。' +
        '如果你需要在已经对话过的会话切换人设时继承历史，你可以把历史对话写进人设正文里。但这样做的效果并不好，不建议这样操作。',
      historyTabEdit: '手动编辑',
      historyTabImport: '导入会话日志',
      historyFormatHint:
        '默认写法：\n' +
        '用户方内容用<user_message>包裹；模型方思考内容用<thinking>包裹，对话内容<assistant_message>；' +
        '双方非对话内容或多模态内容用<file>包裹。结尾标签添“/”（例如<user_message>你好</user_message>表示用户发送了一句“你好”。）\n' +
        '本格式仅适用于deepseek等支持思考的模型',
      historyThinkingLabel: '导入思考过程',
      historyCompactLabel: '展开原文压缩',
      historyCompactHint:
        '默认只把被 <compacted-summary>…</compacted-summary> 包住的压缩摘要导入输入框（连标签、原文照搬），' +
        '再接上**最后一段之后**的对话；摘要之前、以及两段摘要之间的普通内容不会被导入。' +
        '勾上这一项就反过来：导入**除这些压缩摘要以外**的全部原文 —— 也就是把压缩展开回原文。' +
        '它和「导入思考过程」各管一件事：那一项决定模型方的 <thinking> 要不要一起进来，' +
        '这一项决定留摘要还是留除摘要以外的原文，两者叠加生效。' +
        '这份导入文本里没有压缩摘要时，勾不勾都是完整原文，只会提一句「该历史对话尚未压缩过」。',
      historyCompactNone: '该历史对话尚未压缩过',
      historyCompactNoImport: '还没有导入会话日志：这个勾选框只处理导入进来的文本。',
      historyTokenCost: '增耗',
      historyImportButton: '导入 session.vN.jsonl / .zip',
      historyImportHint: '支持 /export 导出的 zip，或单独的 session.vN.jsonl / session.jsonl',
      historyImportConfirm: '输入框里已经有内容。导入会替换掉它，确定继续？',
      historyImportEmpty: '这个文件里没有可用的对话内容（一条 user/message 或 assistant/message 都没认出来）。',
      historyImportFailed: '导入失败',
      historyChars: '字符',
      historyBytes: '字节',
      historyClearButton: '清除历史',
      historyUndoButton: '撤回',
      historySaved: '历史对话已保存',
      historyCleared: '历史对话已清空',
      historyDirtyHint: '有未保存的改动',
      historyStored: '这条人设存有历史对话',
      historyNotStored: '这条人设还没有历史对话',
      historyMissing: '这条人设的历史内容已经不在了，只剩一条记录',
      historyInjectedCount: '已注入的历史对话条数',
      historyPlaceholder: '在这里写历史对话，或切到「导入会话日志」从文件读进来…',
      personaSaved: '人设已保存',
      saveFailed: '保存失败：',
      nothingToSave: '没有要保存的改动。',
      saving: '保存中…',
      emptyPersonaName: '人设名字不能为空。',
      unsavedTitle: '尚未保存：',
      unsavedPersona: '人设（名字 / 正文）',
      unsavedOrder: '段序权重',
      unsavedHistory: '历史对话',
      switchConfirm: '切换人设会丢弃以下尚未保存的改动：',
      switchConfirmTail: '确定继续？',
      scopeTabCurrent: '当前',
      scopeTabGlobal: '全局',
      scopeSession: '会话',
      scopeLayerCurrent: '本会话',
      scopeLayerGlobal: '全局',
      pickerLayerHint: '当前：本对话的设置 · 全局：新对话跟随的设置',
      indicatorYellowHistory:
        '黄色：这个会话选定人设的「人设历史对话」已经和当初注入进去的那一份对不上了（人设的历史对话在会话开始后被改过或清空）。这个会话不会重新注入，所以它带着的是旧内容；想换就用「人设历史对话」重新导入并新开一个对话。',
      indicatorRedPersonaMissing:
        '红色：这个会话选定的人设已经被删除了，人设段现在是空的。请在「人设列表」里重新选一条。',
      indicatorYellowPersonaDropped:
        '黄色：这个会话的人设正文没能进系统提示词 —— 它的 preset 里有一段声明了 complete: true（内置「极简模式」就是这样），平台会把系统提示词整个换成那一段。这是该模式的设计行为，不是故障；只有「人设历史对话」还照常注入。想让人设正文生效，换一个模式（标准 / PTC / 创造），或把这段人设写进该 preset。',
      indicatorYellowMinimal:
        '黄色：本对话的对话模式是「极简模式」—— 它的 preset 声明了 complete 段，平台会把系统提示词压成单段，本插件的人设段进不去（人设正文不会生效，人设历史对话仍照常注入）。要让人设正文生效，换回标准 / PTC / 创造模式。',
      indicatorYellowNotCarried:
        '黄色：这个会话已经聊过，所以这条人设的历史对话不会注入进去（历史只在每个新会话的第一步注入一次）。想让这段历史生效，请新开一个对话。',
    };
    const EN_JSON = "{\"nav\":\"Personas\",\"pickerLabel\":\"Persona\",\"off\":\"Off\",\"title\":\"Persona manager\",\"listTitle\":\"Personas\",\"newPersona\":\"New\",\"importButton\":\"Import\",\"importHint\":\"Read a file produced by this plugin\u2019s Export (.json, or the .png from \u201cExport image\u201d): text, section order and persona history come in together and are appended as **new** personas (existing entries are never overwritten).\",\"importFailed\":\"Import failed\",\"importEmpty\":\"No importable persona in this file (no personas array, and no single persona object).\",\"importDone\":\"Imported\",\"importSkipped\":\"Skipped\",\"exportButton\":\"Export\",\"exportHint\":\"Export the persona in the editor (text + section order + history) as a file: plain JSON, or packed into a PNG you pick yourself.\",\"exportJson\":\"Export JSON\",\"exportJsonHint\":\"Export as .json: plain JSON, no compression, lossless (newlines and quotes are escaped, so the file is only ever larger than the source).\",\"exportPng\":\"Pick a PNG, inject into it, and save as a copy\",\"exportPngHint\":\"Pick a PNG as the cover; the same data is packed into the image and downloaded together. The image itself is not modified by a single byte and every normal viewer still displays it.\",\"exportPngBad\":\"That file is not a PNG. Image export needs a PNG as the cover \u2014 JPEG/WebP have no ancillary chunks for a decoder to skip, and converting would re-encode the picture, so this is refused outright.\",\"exportPngBroken\":\"This PNG is structurally incomplete (no IHDR readable); try another one.\",\"exportTooBig\":\"The file is too large \u2014 over the 32 MB per-export limit.\",\"exportNameMayDiffer\":\"(download channel unavailable; the system may rename the file)\",\"exportNotTaken\":\"Could not confirm the file was downloaded (the browser may have blocked it, or the downloader never fetched it) \u2014 check the download folder, and try again if it is not there.\",\"importPngNoData\":\"No persona data in this image (no iTXt chunk from this plugin).\",\"importPngBadCrc\":\"The persona data in this image fails its checksum (CRC mismatch): the file was modified.\",\"exportDone\":\"Exported\",\"exportFailed\":\"Export failed\",\"exportNoBrowser\":\"This environment cannot download files; export cancelled.\",\"exportRefusedNew\":\"Cannot export: the new persona has not been saved yet\",\"exportConfirmDirty\":\"The edits to the selected persona are unsaved; the export will be the pre-save original. Export anyway?\",\"activate\":\"Use\",\"builtin\":\"Built-in\",\"builtinReadonly\":\"Built-in personas are read-only. Use \u201cFork as new\u201d to edit a copy.\",\"name\":\"Name\",\"text\":\"Text\",\"save\":\"Save\",\"del\":\"Delete\",\"confirmDelete\":\"Delete this persona? This cannot be undone.\",\"confirmOk\":\"OK\",\"confirmCancel\":\"Cancel\",\"activated\":\"Persona switched; effective on the next turn\",\"activatedNamed\":\"Persona switched: %s; effective on the next turn\",\"deactivated\":\"Persona injection turned off\",\"deleted\":\"Persona deleted\",\"chars\":\"chars\",\"path\":\"Data file\",\"applied\":\"Last assembly: injected\",\"dropped\":\"Last assembly: not injected\",\"droppedHint\":\"This session\u2019s agent preset declares complete: true (DSH\u2019s built-in \u201cminimal\u201d mode does), so the platform collapses the assembly into one section and plugin sections cannot enter. Switch back to standard mode.\",\"neverApplied\":\"No assembly observed yet. Send a message and look again.\",\"assemblyGlobalScope\":\"This page is global settings: assembly results only exist for a specific conversation.\",\"noPersona\":\"Last assembly: nothing to inject\",\"noPersonaHint\":\"This session has no persona selected (it is set to Off, or the selected persona's text is empty), so there was nothing to put into the system prompt this turn. That is the result of the current setting, not something being overridden.\",\"orderTrace\":\"Real section order from the last assembly\",\"switchesTitle\":\"Input suppression switches\",\"switchesHint\":\"Each switch removes one class of system-side input the model would otherwise see. All four on with no active persona = pure chat (zero system-side injection) \u2014 the starting point of a free web chat.\",\"swSoloLabel\":\"Persona only (suppress every other system-prompt section)\",\"swSoloHint\":\"Harness identity, deployment persona, tool guidance, plan-mode policy and harness-source notes are all withheld. With no persona selected the system prompt is empty.\",\"swRuntimeLabel\":\"Suppress runtime context\",\"swRuntimeHint\":\"Two families: (1) sandbox policy, approval policy and delegation rules \u2014 dynamic context delivered as user-role snapshots; (2) the runtime snapshot and skill catalog framed as `<system-reminder>` blocks (these really appear in creation mode, whose preset mounts its own skill directory). Neither lives in the system prompt, so \\\"persona only\\\" cannot reach them either \u2014 they can only be filtered by provenance before assembly. This switch now drops both.\",\"swToolsLabel\":\"Suppress tool schemas\",\"swToolsHint\":\"Tool definitions travel as a separate wire field, not as a system-prompt section, and are usually the biggest token item. With this on the model has nothing to call.\",\"swInjectedLabel\":\"Suppress history injections (workspace instructions / time readings)\",\"swInjectedHint\":\"The AGENTS.md / CLAUDE.md instruction baseline and the per-step time readings from dsh-time-context. These are likewise user-role messages appended by plugins rather than prompt sections, so they can only be filtered by provenance.\",\"pureChatButton\":\"Make it pure chat\",\"restoreButton\":\"Restore system input\",\"pureChatHint\":\"clears the persona selection and turns all four switches on\",\"pureChatState\":\"Pure chat is active: zero system-side injection \u2014 the model sees only your messages.\",\"pureChatOn\":\"Switched to pure chat\",\"restoreDone\":\"System input restored: all four switches cleared\",\"switchesSaved\":\"Switches saved; effective on the next turn\",\"strippedMessages\":\"Injected messages filtered in this conversation\",\"stripStatusTitle\":\"System injection blocks (filtered in this session)\",\"stripKindRuntime\":\"runtime snapshot\",\"stripKindSkill\":\"skill catalog\",\"stripKindInstructions\":\"workspace instructions\",\"stripKindTime\":\"time readings\",\"soloNoPersona\":\"\u201cPersona only\u201d is on but no persona is selected \u2014 the system prompt will be empty.\",\"soloSavings\":\"Size with only the persona kept\",\"sectionsUnit\":\"sections\",\"toolReusableLabel\":\"Reusable tools\",\"toolReusableHint\":\"Safety valve for \u201cSuppress tool schemas\u201d. DSH\u2019s tool ledger requires a non-empty tool-declaration baseline for the session: once that baseline is emptied, tools that come back are all marked deferred (defer_loading) and the provider rejects the request (INVALID_REQUEST). When checked, the plugin keeps the full tool list for one turn at exactly two moments \u2014 the session\u2019s first request, and a suspected declaration-series restart (a compaction, for example) \u2014 so a non-empty baseline is written. Afterwards tools can always be brought back no matter how you toggle \u201cSuppress tool schemas\u201d. Unchecked means no protection at all.\",\"toolStripHeldFirst\":\"Tools were kept this turn: this session has no tool-declaration baseline yet. Letting it be established with the full tool list first \u2014 stripping starts from the next turn (otherwise the tools can never come back).\",\"toolStripHeldRestart\":\"Tools were kept this turn: this request appears to restart the tool-declaration series (a compaction, for example). Letting the new baseline be established with the full tool list first \u2014 stripping continues from the next turn.\",\"toolBaselineEmpty\":\"This session\u2019s tool-declaration baseline is empty \u2014 the session\u2019s first request carried no tools at all. Tools that come back are all marked deferred and the provider rejects the request (INVALID_REQUEST). Start a new conversation to get tools back.\",\"indicatorSession\":\"Session\",\"indicatorGreen\":\"Green: all good \u2014 the tool baseline is usable.\",\"indicatorYellow\":\"Yellow: \u201cReusable tools\u201d is unchecked. Stripping no longer protects the tool-declaration baseline, so a session\u2019s baseline can be emptied and its tools can never come back.\",\"indicatorRed\":\"Red: this session\u2019s first request carried no tools at all (empty tool-declaration baseline). Tools that come back would be deferred and rejected by the provider; they cannot return within this session \u2014 start a new conversation.\",\"storeError\":\"Could not read the data file\",\"warningsSummary\":\"Things to check\",\"warningsShow\":\"Show\",\"warningsHide\":\"Hide\",\"loading\":\"Loading\u2026\",\"retry\":\"Retry\",\"chunkFailed\":\"This part of the interface failed to load\",\"createHint\":\"Creating (not saved yet)\",\"editHint\":\"Editing\",\"blankText\":\"The text is empty; saving will be rejected.\",\"blankSaveRefused\":\"Save refused: the persona text is empty \u2014 for an empty persona, turn on \u201cOff\u201d\",\"orderLabel\":\"Section order weight\",\"orderHint\":\"Sort weight of the persona section in the system prompt: lower comes first (default -1, before the preset line \u201cYou are a coding agent\u2026\u201d). It only changes section order and never enters the persona text. Each persona keeps its own weight, so this box follows whichever persona you are editing. Click Save to apply \u2014 validated on save: it must be an integer.\",\"orderDefaultButton\":\"Default\",\"orderFollowButton\":\"Follow\",\"orderFollowText\":\"Appended after the system prompt\",\"orderFollowHint\":\"Puts the weight after every system-prompt section (the same approach as prompt management). Click this box to go back to a number. Click Save to apply.\",\"orderProblemEmpty\":\"The section order weight cannot be empty: type an integer, or use \u201cDefault\u201d / \u201cFollow\u201d.\",\"orderProblemInteger\":\"The section order weight must be an integer (for example -1, 0, 10200): decimals such as 0.1, exponents and units are not legal section orders \u2014 they would make the system prompt assembly invalid. You typed\",\"orderProblemRange\":\"The section order weight must be an integer between -1000000000 and 1000000000.\",\"orderSaved\":\"Section order saved\",\"hintLabel\":\"Help\",\"unnamed\":\"Untitled\",\"clearDraft\":\"Clear\",\"historyTitle\":\"Persona conversation history\",\"historySubtitle\":\"A stretch of \\\"already happened\\\" conversation, saved together with this persona. When this persona is selected, the first step of a new conversation injects that history as user-side context; a conversation that has already been injected is never injected again, because doing so would reset the KV cache of the whole conversation. If you need a conversation that has already started to carry history across a persona switch, you can write that history into the persona body itself. But the result is poor, so this is not recommended.\",\"historyTabEdit\":\"Edit by hand\",\"historyTabImport\":\"Import a session log\",\"historyFormatHint\":\"Default format:\\nWrap user-side content in <user_message>; wrap the model side\u2019s thinking in <thinking> and its spoken content in <assistant_message>; wrap non-conversational or multimodal content from either side in <file>. Close every tag with \u201c/\u201d (for example <user_message>hi</user_message> means the user said \u201chi\u201d).\\nThis format only applies to models that support thinking, such as DeepSeek\",\"historyThinkingLabel\":\"Include thinking\",\"historyCompactLabel\":\"Expand compaction\",\"historyCompactHint\":\"By default the box gets only the compaction summaries wrapped in <compacted-summary>\u2026</compacted-summary> (copied verbatim, tags included) plus the dialogue that follows the **last** one; ordinary content before the first summary and between summaries is not imported. Ticking this box flips it: the box gets **everything except** those summaries \u2014 the compaction is expanded back into the original text. This box and \u201cInclude thinking\u201d are independent: the latter decides whether the model side\u2019s <thinking> comes along, this one decides whether the summaries stay or the rest of the text does; both apply together. When the imported text has no summary at all, ticking changes nothing and the only hint is \u201cthis history has not been compacted yet\u201d.\",\"historyCompactNone\":\"This history has not been compacted yet\",\"historyCompactNoImport\":\"Nothing imported yet: this checkbox only processes imported text.\",\"historyTokenCost\":\"cost\",\"historyImportButton\":\"Import session.vN.jsonl / .zip\",\"historyImportHint\":\"Accepts the zip produced by /export, or a bare session.vN.jsonl / session.jsonl\",\"historyImportConfirm\":\"The box already has content. Importing replaces it \u2014 continue?\",\"historyImportEmpty\":\"No usable conversation text in that file (not a single user/message or assistant/message was recognised).\",\"historyImportFailed\":\"Import failed\",\"historyChars\":\"characters\",\"historyBytes\":\"bytes\",\"historyClearButton\":\"Clear history\",\"historyUndoButton\":\"Undo\",\"historySaved\":\"Conversation history saved\",\"historyCleared\":\"Conversation history cleared\",\"historyDirtyHint\":\"unsaved changes\",\"historyStored\":\"This persona has conversation history\",\"historyNotStored\":\"This persona has no conversation history yet\",\"historyMissing\":\"This persona\u2019s history content is gone \u2014 only the record is left\",\"historyInjectedCount\":\"History messages injected\",\"historyPlaceholder\":\"Write the history here, or switch to \u201cImport a session log\u201d \u2026\",\"personaSaved\":\"Persona saved\",\"saveFailed\":\"Save failed: \",\"nothingToSave\":\"Nothing to save.\",\"saving\":\"Saving\u2026\",\"emptyPersonaName\":\"The persona name cannot be empty.\",\"unsavedTitle\":\"Not saved yet:\",\"unsavedPersona\":\"persona (name / text)\",\"unsavedOrder\":\"section order weight\",\"unsavedHistory\":\"conversation history\",\"switchConfirm\":\"Switching personas discards these unsaved changes:\",\"switchConfirmTail\":\"Continue?\",\"scopeTabCurrent\":\"Current\",\"scopeTabGlobal\":\"Global\",\"scopeSession\":\"Session\",\"scopeLayerCurrent\":\"this chat\",\"scopeLayerGlobal\":\"global\",\"pickerLayerHint\":\"This chat: settings for this conversation \u00b7 Global: what new conversations follow\",\"indicatorYellowHistory\":\"Yellow: the selected persona\u2019s conversation history no longer matches what was injected into this session (the persona history was edited or cleared after this session started). This session will not be injected again, so it keeps the old content \u2014 re-import the history and start a new conversation to change it.\",\"indicatorRedPersonaMissing\":\"Red: the persona selected for this session has been deleted, so the persona section is empty. Pick another one in the persona list.\",\"indicatorYellowPersonaDropped\":\"Yellow: this session\u2019s persona text never made it into the system prompt \u2014 its preset declares a section with complete: true (the built-in minimal mode does), so the platform replaces the whole system prompt with that one section. That is the mode working as designed, not a failure; only the persona conversation history is still injected. To make the persona text take effect, switch mode (standard / PTC / cordis) or write it into that preset.\",\"indicatorYellowMinimal\":\"Yellow: this conversation uses the minimal mode \u2014 its preset declares a complete section, so the platform collapses the system prompt into that single section and this plugin\u2019s persona section cannot enter (the persona text never takes effect; the persona conversation history is still injected). Switch back to standard / PTC / cordis mode to make the persona text effective.\",\"indicatorYellowNotCarried\":\"Yellow: this conversation has already been chatting, so this persona\u2019s conversation history will not be injected (history is injected only at the first step of a new session). To make this history take effect, start a new conversation.\"}";
    let enTable = null;
    const enOf = () => {
      if (enTable === null) enTable = JSON.parse(EN_JSON);
      return enTable;
    };
    const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);
    const en = new Proxy(Object.create(null), {
      get(target, key) {
        const table = enOf();
        return hasOwn(table, key) ? table[key] : Reflect.get(target, key);
      },
      has(target, key) {
        return hasOwn(enOf(), key) ? true : Reflect.has(target, key);
      },
      ownKeys() {
        return Reflect.ownKeys(enOf());
      },
      getOwnPropertyDescriptor(target, key) {
        const table = enOf();
        if (!hasOwn(table, key)) return undefined;
        return { value: table[key], writable: true, enumerable: true, configurable: true };
      },
    });
    const SWITCH_FIELDS = [
      { key: 'soloOnly', label: 'swSoloLabel', hint: 'swSoloHint' },
      { key: 'stripRuntime', label: 'swRuntimeLabel', hint: 'swRuntimeHint' },
      { key: 'stripTools', label: 'swToolsLabel', hint: 'swToolsHint' },
      { key: 'stripInjected', label: 'swInjectedLabel', hint: 'swInjectedHint' },
    ];
    const STRIP_KIND_FIELDS = [
      { kind: 'runtime-context', label: 'stripKindRuntime' },
      { kind: 'skill-catalog', label: 'stripKindSkill' },
      { kind: 'agent-instructions', label: 'stripKindInstructions' },
      { kind: 'time-context', label: 'stripKindTime' },
    ];
    let fallbackT = (key) => key;
    const ORDER_MIN = -1000000000;
    const ORDER_MAX = 1000000000;
    function checkOrderInput(raw) {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text === '') return { ok: false, code: 'empty' };
      if (!/^[+-]?\d+$/.test(text)) return { ok: false, code: 'integer' };
      const value = Number(text);
      if (!Number.isSafeInteger(value) || value < ORDER_MIN || value > ORDER_MAX) return { ok: false, code: 'range' };
      return { ok: true, value };
    }
    async function fetchText(path, init) {
      const headers = { accept: 'application/json' };
      if (init !== undefined && init !== null && typeof init.body === 'string') {
        headers['content-type'] = 'application/json';
      }
      if (init !== undefined && init !== null && init.headers !== null && typeof init.headers === 'object') {
        for (const [name, value] of Object.entries(init.headers)) headers[name] = value;
      }
      const timeoutMs = timeoutForBody(init);
      let controller = null;
      let timer = null;
      try {
        if (typeof AbortController === 'function') {
          controller = new AbortController();
          timer = setTimeout(() => {
            try {
              controller.abort();
            } catch {
            }
          }, timeoutMs);
        }
      } catch {
        controller = null;
      }
      try {
        const response = await fetch(ROUTE_PREFIX + path, {
          ...(init ?? {}),
          headers,
          ...(controller === null ? {} : { signal: controller.signal }),
        });
        const raw = await response.text();
        return { response, raw };
      } catch (error) {
        if (controller !== null && controller.signal.aborted === true) {
          const seconds = Math.round(timeoutMs / 1000);
          const timeout = new Error(
            timeoutMs > REQUEST_TIMEOUT_MS
              ? `请求超时（${seconds} 秒没有响应）：这次上传的内容较大，如果网络很慢可以稍后再试一次。`
              : `请求超时（${seconds} 秒没有响应）`,
          );
          timeout.code = 'timeout';
          throw timeout;
        }
        throw error;
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
    }
    function httpError(raw, status) {
      let payload = null;
      try {
        payload = raw === '' ? null : JSON.parse(raw);
      } catch {
        payload = null;
      }
      const error = new Error(
        payload !== null && typeof payload.message === 'string' ? payload.message : `HTTP ${status}`,
      );
      error.code = payload !== null && typeof payload.code === 'string' ? payload.code : 'http-error';
      error.status = status;
      return error;
    }
    async function call(path, init) {
      const { response, raw } = await fetchText(path, init);
      if (!response.ok) throw httpError(raw, response.status);
      let payload = null;
      try {
        payload = raw === '' ? null : JSON.parse(raw);
      } catch {
        payload = null;
      }
      if (payload === null || typeof payload !== 'object') {
        throw new Error('响应不是合法的 JSON 对象');
      }
      return payload;
    }
    const personaStores = new Map();
    function personaStoreFor(key) {
      const existing = personaStores.get(key);
      if (existing !== undefined) return existing;
      const store = {
        key,
        state: { status: 'loading', data: null, error: null },
        listeners: new Set(),
        lastRaw: null,
        lastEtag: null,
        seq: 0,
        refs: 0,
        timer: null,
        inflight: null,
        onChanged: null,
        onVisible: null,
      };
      personaStores.set(key, store);
      return store;
    }
    function personaStoreEmit(store) {
      for (const listener of [...store.listeners]) {
        try {
          listener();
        } catch {
        }
      }
    }
    function personaStoreApply(store, next) {
      const previous = store.state;
      if (previous.status === next.status && previous.data === next.data && previous.error === next.error) return;
      store.state = next;
      personaStoreEmit(store);
    }
    function personaStoreFetch(store) {
      const seq = store.seq + 1;
      store.seq = seq;
      return (async () => {
        try {
          const { response, raw } = await fetchText(
            store.key === '' ? '/state' : `/state?session=${encodeURIComponent(store.key)}`,
            store.lastEtag === null ? undefined : { headers: { 'if-none-match': store.lastEtag } },
          );
          if (store.seq !== seq) return;
          if (response.status === 304) return;
          const etag = response.headers?.get?.('etag');
          if (typeof etag === 'string' && etag !== '') store.lastEtag = etag;
          if (raw === store.lastRaw) return;
          store.lastRaw = raw;
          if (!response.ok) throw httpError(raw, response.status);
          let data = null;
          try {
            data = raw === '' ? null : JSON.parse(raw);
          } catch {
            data = null;
          }
          if (data === null || typeof data !== 'object') throw new Error('响应不是合法的 JSON 对象');
          personaStoreApply(store, { status: 'ready', data, error: null });
        } catch (error) {
          if (store.seq !== seq) return;
          personaStoreApply(store, {
            status: 'error',
            data: store.state.data,
            error: error?.message ?? String(error),
          });
        }
      })();
    }
    function personaStoreReload(store, coalesce) {
      if (coalesce === true && store.inflight !== null) return store.inflight;
      const run = personaStoreFetch(store);
      const tracked = run.then(() => {
        if (store.inflight === tracked) store.inflight = null;
      });
      store.inflight = tracked;
      return tracked;
    }
    function startPersonaStore(store) {
      try {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        const onChanged = () => {
          personaStoreReload(store, false);
        };
        store.onChanged = onChanged;
        window.addEventListener(PERSONA_CHANGED_EVENT, onChanged);
        window.addEventListener('focus', onChanged);
        store.timer = setInterval(() => {
          try {
            if (typeof document !== 'undefined' && document.hidden === true) return;
          } catch {
          }
          personaStoreReload(store, true);
        }, PERSONA_POLL_MS);
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          store.onVisible = onChanged;
          document.addEventListener('visibilitychange', onChanged);
        }
      } catch {
      }
    }
    function stopPersonaStore(store) {
      try {
        if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
          if (store.onChanged !== null) {
            window.removeEventListener(PERSONA_CHANGED_EVENT, store.onChanged);
            window.removeEventListener('focus', store.onChanged);
          }
        }
        if (store.onVisible !== null && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
          document.removeEventListener('visibilitychange', store.onVisible);
        }
        if (store.timer !== null) clearInterval(store.timer);
      } catch {
      } finally {
        store.timer = null;
        store.onChanged = null;
        store.onVisible = null;
      }
    }
    function usePersonaState(sessionId) {
      const wanted = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '';
      const store = personaStoreFor(wanted);
      const [snapshot, setSnapshot] = React.useState(store.state);
      React.useEffect(() => {
        const listener = () => setSnapshot(store.state);
        store.listeners.add(listener);
        return () => {
          store.listeners.delete(listener);
        };
      }, [store]);
      React.useEffect(() => {
        store.refs += 1;
        if (store.refs === 1) {
          startPersonaStore(store);
          personaStoreReload(store, true);
        }
        return () => {
          store.refs -= 1;
          if (store.refs > 0) return;
          store.refs = 0;
          stopPersonaStore(store);
          if (personaStores.get(store.key) === store) personaStores.delete(store.key);
        };
      }, [store]);
      const reload = React.useCallback((options) => personaStoreReload(store, options?.coalesce === true), [store]);
      return { status: snapshot.status, data: snapshot.data, error: snapshot.error, reload };
    }
    function notifyPersonaChanged() {
      try {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return false;
        if (typeof Event !== 'function') return false;
        window.dispatchEvent(new Event(PERSONA_CHANGED_EVENT));
        return true;
      } catch {
        return false;
      }
    }
    const sessionsHolder = { service: null };
    /**
     * 绑定 sessions 服务（幂等）：两个组件 bundle 各自 apply 时都会调一次。
     */
    function bindSessionsService(ctx) {
      try {
        const got = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
        sessionsHolder.service = got ?? ctx.sessions ?? sessionsHolder.service;
      } catch {
      }
      try {
        if (typeof ctx.inject === 'function') {
          ctx.inject(['sessions'], (scoped) => {
            sessionsHolder.service = scoped.sessions ?? sessionsHolder.service;
          });
        }
      } catch {
      }
    }
    function useSessionsFallback(selector) {
      const service = sessionsHolder.service;
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const store = service === null || service === undefined ? undefined : service.list;
        if (store === undefined || typeof store.subscribe !== 'function') return undefined;
        return store.subscribe(() => force((n) => n + 1));
      }, [service]);
      let snapshot = null;
      try {
        snapshot = service === null || service === undefined ? null : service.list.getSnapshot();
      } catch {
        snapshot = null;
      }
      return selector(snapshot ?? { byId: {} });
    }
    function useAbsentSessions(_selector) {
      React.useRef(null);
      return undefined;
    }
    function useSessionSource(useSessionsProp, selector) {
      const hostRef = React.useRef(null);
      const provided = typeof useSessionsProp === 'function';
      if (provided) hostRef.current = useSessionsProp;
      const host = hostRef.current;
      const fromHost = (host === null ? useAbsentSessions : host)(selector);
      const fromFallback = useSessionsFallback(selector);
      return provided ? fromHost : fromFallback;
    }
    function keyedByHostPresence(Impl, props) {
      const hasHost = props !== null && props !== undefined && typeof props.useSessions === 'function';
      return h(Impl, { ...props, key: hasHost ? 'session-host' : 'session-fallback' });
    }
    function pickMainSessionId(state) {
      if (state === null || state === undefined || typeof state !== 'object') return '';
      if (typeof state.current === 'string' && state.current !== '') return state.current;
      const byId = state.byId;
      if (byId === null || byId === undefined || typeof byId !== 'object') return '';
      for (const row of Object.values(byId)) {
        if (row === null || row === undefined) continue;
        const mainView = row.retainedBy?.mainView;
        if (typeof mainView !== 'number' || mainView <= 0) continue;
        if (typeof row.id === 'string' && row.id !== '') return row.id;
        if (typeof row.sessionId === 'string' && row.sessionId !== '') return row.sessionId;
      }
      return '';
    }
    function useMainSessionRow(useSessionsProp) {
      const state = useSessionSource(useSessionsProp, (snapshot) => snapshot);
      const id = pickMainSessionId(state);
      const sessionId = typeof id === 'string' ? id : '';
      const title = sessionTitleOf(state, sessionId);
      const blank = blankOf(state, sessionId);
      const parent = parentOf(state, sessionId);
      return {
        sessionId,
        title: typeof title === 'string' ? title : '',
        blank: typeof blank === 'boolean' ? blank : undefined,
        parent: typeof parent === 'string' ? parent : (parent === null ? null : undefined),
      };
    }
    function sessionTitleOf(state, sessionId) {
      if (sessionId === '') return '';
      const row = state?.byId?.[sessionId];
      if (row === null || row === undefined) return '';
      if (typeof row.displayTitle === 'string' && row.displayTitle !== '') return row.displayTitle;
      if (typeof row.title === 'string' && row.title !== '') return row.title;
      return '';
    }
    function blankOf(state, sessionId) {
      if (sessionId === '') return undefined;
      const row = state?.byId?.[sessionId];
      if (row === null || row === undefined) return undefined;
      return row.blank === true;
    }
    function parentOf(state, sessionId) {
      if (sessionId === '') return undefined;
      const row = state?.byId?.[sessionId];
      if (row === null || row === undefined) return undefined;
      if (typeof row.parentId === 'string' && row.parentId !== '') return row.parentId;
      if (typeof row.parentSessionId === 'string' && row.parentSessionId !== '') return row.parentSessionId;
      return null;
    }
    const DIM_TEXT = 'var(--dsw-alias-label-secondary, #61666b)';
    const S = {
      root: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 980 },
      h2: { margin: 0, fontSize: 18, fontWeight: 600, lineHeight: '26px' },
      sub: { margin: 0, fontSize: 13, lineHeight: '20px', color: DIM_TEXT },
      card: {
        border: '1px solid rgba(127,127,127,0.28)',
        borderRadius: 10,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      list: { display: 'flex', flexDirection: 'column', gap: 4, margin: 0, padding: 0, listStyle: 'none' },
      item: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        background: 'transparent',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'transparent',
        color: 'inherit',
        font: 'inherit',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      },
      itemPreview: {
        background: 'rgba(127,127,127,0.14)',
        borderColor: 'rgba(127,127,127,0.75)',
      },
      badge: {
        fontSize: 11,
        lineHeight: '16px',
        padding: '1px 6px',
        borderRadius: 999,
        border: '1px solid rgba(127,127,127,0.4)',
        opacity: 0.8,
      },
      button: {
        font: 'inherit',
        fontSize: 13,
        padding: '5px 10px',
        borderRadius: 8,
        border: '1px solid rgba(127,127,127,0.4)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      },
      buttonPrimary: {
        font: 'inherit',
        fontSize: 13,
        padding: '5px 10px',
        borderRadius: 8,
        border: '1px solid rgba(127,127,127,0.6)',
        background: 'rgba(127,127,127,0.18)',
        color: 'inherit',
        cursor: 'pointer',
      },
      input: {
        font: 'inherit',
        fontSize: 13,
        padding: '6px 8px',
        borderRadius: 8,
        border: '1px solid rgba(127,127,127,0.4)',
        background: 'transparent',
        color: 'inherit',
        width: '100%',
        boxSizing: 'border-box',
      },
      textarea: {
        font: 'inherit',
        fontSize: 13,
        lineHeight: '20px',
        padding: '8px',
        borderRadius: 8,
        border: '1px solid rgba(127,127,127,0.4)',
        background: 'transparent',
        color: 'inherit',
        boxSizing: 'border-box',
        resize: 'vertical',
        minHeight: 200,
        flex: '1 1 auto',
        minWidth: 0,
        scrollbarWidth: 'none',
      },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: DIM_TEXT },
      divider: { height: 1, margin: '2px 0', background: 'rgba(127,127,127,0.28)' },
      tabRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
      tab: {
        flex: '1 1 140px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        alignItems: 'flex-start',
        font: 'inherit',
        fontSize: 13,
        lineHeight: '18px',
        padding: '6px 10px',
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'rgba(127,127,127,0.35)',
        background: 'transparent',
        fontWeight: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
      },
      tabActive: {
        borderColor: 'rgba(127,127,127,0.75)',
        background: 'rgba(127,127,127,0.16)',
        fontWeight: 600,
      },
      exportMenu: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'stretch',
        alignSelf: 'flex-start',
        marginTop: 6,
        padding: 6,
        borderRadius: 8,
        border: '1px solid rgba(127,127,127,0.35)',
        background: 'rgba(127,127,127,0.06)',
      },
      scopeTab: {
        font: 'inherit',
        fontSize: 13,
        lineHeight: '18px',
        padding: '3px 12px',
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'rgba(127,127,127,0.35)',
        background: 'transparent',
        fontWeight: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
      },
      scopeTabActive: {
        borderColor: 'rgba(127,127,127,0.75)',
        background: 'rgba(127,127,127,0.16)',
        fontWeight: 600,
      },
      tabNote: { fontSize: 11, lineHeight: '16px', fontWeight: 400, color: DIM_TEXT },
      pickerTrigger: {
        font: 'inherit',
        fontSize: 13,
        padding: '5px 10px',
        borderRadius: 8,
        border: '1px solid rgba(127,127,127,0.4)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      },
      pickerArrow: { fontSize: 9, opacity: 0.75, lineHeight: 1 },
      pickerPanel: {
        position: 'absolute',
        left: 0,
        minWidth: 220,
        maxHeight: 320,
        overflow: 'hidden',
        zIndex: 40,
        background: 'var(--dsw-alias-bg-base, Canvas)',
        border: '1px solid rgba(127,127,127,0.45)',
        borderRadius: 10,
        padding: 4,
        boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      },
      pickerOption: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '6px 8px',
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
        background: 'transparent',
        border: '1px solid transparent',
        color: 'inherit',
        font: 'inherit',
        fontSize: 13,
      },
      pickerDivider: { height: 1, margin: '4px 6px', background: 'rgba(127,127,127,0.35)' },
      pickerEmphasis: { fontWeight: 700, fontStyle: 'italic' },
      scrollWrap: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 4,
        minHeight: 0,
      },
      pickerList: {
        flex: '1 1 auto',
        minWidth: 0,
        maxHeight: 240,
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      },
      scrollTrack: {
        flex: 'none',
        width: 18,
        margin: '2px 0',
        borderRadius: 999,
        background: 'rgba(127,127,127,0.16)',
        position: 'relative',
        cursor: 'pointer',
        touchAction: 'none',
        userSelect: 'none',
      },
      scrollThumb: {
        position: 'absolute',
        left: 1,
        right: 1,
        borderRadius: 999,
        background: 'rgba(127,127,127,0.55)',
        border: '1px solid rgba(127,127,127,0.7)',
        boxSizing: 'border-box',
        cursor: 'grab',
        touchAction: 'none',
      },
      confirmOverlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.42)',
      },
      confirmBox: {
        maxWidth: 440,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: 16,
        borderRadius: 10,
        border: '1px solid rgba(127,127,127,0.35)',
        background: 'var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, Canvas))',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
      },
      confirmBody: { margin: 0, fontSize: 13, lineHeight: '20px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
      warn: { fontSize: 13, lineHeight: '20px', color: '#c2410c' },
      warnBox: {
        border: '1px solid #fdba74',
        background: '#fff7ed',
        borderRadius: 8,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      },
      warnToggle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        border: 'none',
        background: 'transparent',
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 13,
        lineHeight: '20px',
        color: '#9a3412',
        textAlign: 'left',
      },
      warnToggleHint: { color: '#c2410c', fontSize: 12, flexShrink: 0 },
      warnList: { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 },
      warnItem: { fontSize: 13, lineHeight: '20px', color: '#9a3412', wordBreak: 'break-word' },
      warnRed: { fontSize: 13, lineHeight: '20px', color: '#dc2626' },
      warnYellow: { fontSize: 13, lineHeight: '20px', color: '#a16207' },
      notice: { fontSize: 13, lineHeight: '20px', color: '#15803d' },
      hintWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center', flex: 'none' },
      hintToggle: {
        font: 'inherit',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: '16px',
        width: 18,
        height: 18,
        padding: 0,
        borderRadius: 999,
        border: '1px solid currentColor',
        background: 'transparent',
        color: '#2563eb',
        cursor: 'pointer',
        textDecoration: 'underline',
        textUnderlineOffset: 2,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      },
      hintBubble: {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: 6,
        zIndex: 60,
        width: 300,
        maxWidth: '78vw',
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid rgba(127,127,127,0.45)',
        background: 'var(--dsw-alias-bg-base, Canvas)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
        fontSize: 12,
        lineHeight: '18px',
        fontWeight: 400,
        fontStyle: 'normal',
        textAlign: 'left',
        whiteSpace: 'normal',
        color: 'var(--dsw-alias-label-primary, inherit)',
        cursor: 'auto',
      },
      dot: (color) => ({
        width: 8,
        height: 8,
        borderRadius: 999,
        flex: 'none',
        background: DOT_COLORS[color] ?? DOT_COLORS.green,
      }),
    };
    const DOT_COLORS = Object.freeze({
      green: '#16a34a',
      yellow: '#eab308',
      red: '#dc2626',
    });
    const INDICATOR_TEXT_KEYS = Object.freeze({
      'no-tools-first-turn': 'indicatorRed',
      'persona-missing': 'indicatorRedPersonaMissing',
      'minimal-mode': 'indicatorYellowMinimal',
      'persona-not-injected': 'indicatorYellowPersonaDropped',
      'tool-reusable-off': 'indicatorYellow',
      'history-mismatch': 'indicatorYellowHistory',
      'history-not-carried': 'indicatorYellowNotCarried',
    });
    const REASON_COLORS = Object.freeze({
      'no-tools-first-turn': 'red',
      'persona-missing': 'red',
      'minimal-mode': 'yellow',
      'persona-not-injected': 'yellow',
      'tool-reusable-off': 'yellow',
      'history-mismatch': 'yellow',
      'history-not-carried': 'yellow',
    });
    const COLOR_RANK = Object.freeze({ red: 0, yellow: 1, green: 2 });
    const byColorRank = (left, right) => (COLOR_RANK[left.color] ?? 9) - (COLOR_RANK[right.color] ?? 9);
    function indicatorFor(reason, t) {
      const tr = typeof t === 'function' ? t : fallbackT;
      const color = REASON_COLORS[reason] ?? 'green';
      const key = INDICATOR_TEXT_KEYS[reason] ?? 'indicatorGreen';
      return { color, reason, text: tr(key) };
    }
    function indicatorOf(data, t) {
      const raw = data?.section?.indicator;
      const reason = typeof raw?.reason === 'string' ? raw.reason : 'ok';
      const base = indicatorFor(reason, t);
      const color = typeof raw?.color === 'string' && hasOwn(DOT_COLORS, raw.color) ? raw.color : base.color;
      return { color, reason, text: base.text };
    }
    function indicatorsOf(data, t) {
      const raw = data?.section?.indicators;
      if (!Array.isArray(raw)) {
        const single = indicatorOf(data, t);
        return single.color === 'green' ? [] : [single];
      }
      return raw
        .map((entry) => {
          const reason = typeof entry?.code === 'string' ? entry.code : 'ok';
          const base = indicatorFor(reason, t);
          const color = typeof entry?.color === 'string' && hasOwn(DOT_COLORS, entry.color) ? entry.color : base.color;
          return { color, reason, text: base.text };
        })
        .filter((entry) => entry.color !== 'green')
        .sort(byColorRank);
    }
    function summarizeIndicators(list, t) {
      const first = Array.isArray(list) ? list[0] : undefined;
      if (first === undefined) return indicatorFor('ok', t);
      return {
        color: first.color,
        reason: first.reason,
        text: list.map((entry) => entry.text).join(' '),
      };
    }
    function layerIndicators(layer, t) {
      const out = [];
      if (layer !== null && layer !== undefined) {
        if (layer.activeId !== null && layer.activeId !== undefined && layer.found === false) {
          out.push(indicatorFor('persona-missing', t));
        }
        if (layer.toolReusable === false) out.push(indicatorFor('tool-reusable-off', t));
      }
      return out.sort(byColorRank);
    }
    function Hint(props) {
      const text = typeof props?.text === 'string' ? props.text : '';
      const label = typeof props?.label === 'string' ? props.label : '';
      const [open, setOpen] = React.useState(false);
      const [shift, setShift] = React.useState(0);
      const wrapRef = React.useRef(null);
      React.useEffect(() => {
        if (!open) {
          setShift(0);
          return undefined;
        }
        try {
          const node = wrapRef.current;
          if (node === null || node === undefined || typeof node.getBoundingClientRect !== 'function') return undefined;
          const rect = node.getBoundingClientRect();
          const viewport = typeof window !== 'undefined' && typeof window.innerWidth === 'number' ? window.innerWidth : 0;
          if (viewport <= 0) return undefined;
          const width = Math.min(300, viewport * 0.78);
          let next = 0;
          if (rect.left + width > viewport - 8) next = viewport - 8 - width - rect.left;
          if (rect.left + next < 8) next = 8 - rect.left;
          setShift(Math.round(next));
        } catch {
        }
        return undefined;
      }, [open]);
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
      if (text === '') return null;
      return h(
        'span',
        { style: S.hintWrap, ref: wrapRef, 'data-hint': '1' },
        h(
          'button',
          {
            type: 'button',
            style: S.hintToggle,
            title: text,
            'aria-label': label,
            'aria-expanded': open ? 'true' : 'false',
            'data-hint-toggle': '1',
            onClick: (event) => {
              if (event !== null && event !== undefined) {
                if (typeof event.preventDefault === 'function') event.preventDefault();
                if (typeof event.stopPropagation === 'function') event.stopPropagation();
              }
              setOpen((previous) => !previous);
            },
          },
          '?',
        ),
        open
          ? h(
              'span',
              {
                style: { ...S.hintBubble, ...(shift === 0 ? {} : { transform: `translateX(${shift}px)` }) },
                role: 'note',
                'data-hint-bubble': '1',
              },
              text,
            )
          : null,
      );
    }
    function useSettledTick(text, epoch) {
      const [tick, setTick] = React.useState(0);
      const epochRef = React.useRef(-1);
      React.useEffect(() => {
        if (epochRef.current !== epoch) {
          epochRef.current = epoch;
          setTick((n) => n + 1);
          return undefined;
        }
        const timer = setTimeout(() => setTick((n) => n + 1), 150);
        return () => clearTimeout(timer);
      }, [text, epoch]);
      return tick;
    }
    function ScrollBar(props) {
      const targetRef = props.targetRef;
      const deps = props.deps;
      const [geom, setGeom] = React.useState({ thumb: 1, ratio: 0, scrollable: false });
      const trackRef = React.useRef(null);
      const geomRef = React.useRef(geom);
      geomRef.current = geom;
      const dragCleanupRef = React.useRef(null);
      const measure = React.useCallback(() => {
        const node = targetRef.current;
        if (node === null || node === undefined) return;
        const view = node.clientHeight ?? 0;
        const total = node.scrollHeight ?? 0;
        const scrollable = total > view + 1;
        const track = trackRef.current;
        const trackHeight = track === null || track === undefined ? 0 : (track.clientHeight ?? 0);
        const minRatio = trackHeight > 0 ? Math.min(44 / trackHeight, 1) : 0.12;
        const thumbSize = scrollable && total > 0 ? Math.max(view / total, minRatio) : 1;
        const maxScroll = Math.max(total - view, 0);
        const ratio = maxScroll === 0 ? 0 : Math.min(Math.max((node.scrollTop ?? 0) / maxScroll, 0), 1);
        const next = { thumb: thumbSize, ratio, scrollable };
        const previous = geomRef.current;
        if (previous.thumb === next.thumb && previous.ratio === next.ratio && previous.scrollable === next.scrollable) {
          return;
        }
        geomRef.current = next;
        setGeom(next);
      }, [targetRef]);
      React.useEffect(() => {
        measure();
        try {
          if (typeof requestAnimationFrame !== 'function') return undefined;
          const handle = requestAnimationFrame(measure);
          return () => {
            if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
          };
        } catch {
          return undefined;
        }
      }, [measure, ...deps]);
      const rafRef = React.useRef(0);
      const scheduleMeasure = React.useCallback(() => {
        try {
          if (typeof requestAnimationFrame !== 'function') {
            measure();
            return;
          }
          if (rafRef.current !== 0) return;
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            measure();
          });
        } catch {
          measure();
        }
      }, [measure]);
      React.useEffect(() => () => {
        try {
          if (rafRef.current !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current);
        } catch {
        }
        rafRef.current = 0;
      }, []);
      React.useEffect(() => {
        const node = targetRef.current;
        if (node === null || node === undefined) return undefined;
        try {
          if (typeof ResizeObserver !== 'function') return undefined;
          const observer = new ResizeObserver(scheduleMeasure);
          observer.observe(node);
          return () => observer.disconnect();
        } catch {
          return undefined;
        }
      }, [targetRef, scheduleMeasure, ...deps]);
      React.useEffect(() => {
        const node = targetRef.current;
        if (node === null || node === undefined || typeof node.addEventListener !== 'function') return undefined;
        node.addEventListener('scroll', scheduleMeasure, { passive: true });
        return () => node.removeEventListener('scroll', scheduleMeasure);
      }, [scheduleMeasure, targetRef]);
      const onPointerDown = (event) => {
        const node = targetRef.current;
        const track = trackRef.current;
        if (node === null || node === undefined || track === null || track === undefined) return;
        if (event !== null && event !== undefined && typeof event.preventDefault === 'function') event.preventDefault();
        let rect;
        try {
          rect = track.getBoundingClientRect();
        } catch {
          return;
        }
        if (!(rect.height > 0)) return;
        const total = node.scrollHeight ?? 0;
        const view = node.clientHeight ?? 0;
        const maxScroll = Math.max(total - view, 0);
        if (maxScroll <= 0) return;
        const thumbRatio = geomRef.current.thumb > 0 ? geomRef.current.thumb : 1;
        const thumbHeight = rect.height * thumbRatio;
        const span = Math.max(rect.height - thumbHeight, 1);
        const apply = (clientY) => {
          const offset = Math.min(Math.max(clientY - rect.top - thumbHeight / 2, 0), span);
          node.scrollTop = (offset / span) * maxScroll;
          measure();
        };
        apply(event.clientY);
        try {
          if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
          if (typeof dragCleanupRef.current === 'function') dragCleanupRef.current();
          const onMove = (moveEvent) => {
            if (typeof moveEvent.preventDefault === 'function') moveEvent.preventDefault();
            apply(moveEvent.clientY);
          };
          const onUp = () => {
            if (typeof dragCleanupRef.current === 'function') dragCleanupRef.current();
            measure();
          };
          dragCleanupRef.current = () => {
            dragCleanupRef.current = null;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
          };
          window.addEventListener('pointermove', onMove, { passive: false });
          window.addEventListener('pointerup', onUp);
          window.addEventListener('pointercancel', onUp);
        } catch {
        }
      };
      React.useEffect(() => () => {
        if (typeof dragCleanupRef.current === 'function') dragCleanupRef.current();
      }, []);
      return h(
        'div',
        {
          ref: trackRef,
          style: S.scrollTrack,
          [props.trackAttr]: '1',
          role: 'scrollbar',
          'aria-orientation': 'vertical',
          'aria-valuenow': Math.round(geom.ratio * 100),
          onPointerDown,
        },
        h('div', {
          style: {
            ...S.scrollThumb,
            top: `${geom.ratio * (1 - geom.thumb) * 100}%`,
            height: `${geom.thumb * 100}%`,
            opacity: geom.scrollable ? 1 : 0.35,
          },
          [props.thumbAttr]: '1',
        }),
      );
    }
    const POPUP_EDGE_INSET = 8;
    const POPUP_MIN_HEIGHT = 96;
    const POPUP_PLACE = Object.freeze({ below: 'below', above: 'above' });
    const POPUP_GAP = 6;
    function viewportSize() {
      try {
        if (typeof window === 'undefined') return { width: 0, height: 0 };
        const width = typeof window.innerWidth === 'number' ? window.innerWidth : 0;
        const height = typeof window.innerHeight === 'number' ? window.innerHeight : 0;
        return {
          width: Number.isFinite(width) && width > 0 ? width : 0,
          height: Number.isFinite(height) && height > 0 ? height : 0,
        };
      } catch {
        return { width: 0, height: 0 };
      }
    }
    function isUsableRect(rect) {
      return rect !== null && rect !== undefined
        && Number.isFinite(rect.top) && Number.isFinite(rect.bottom)
        && Number.isFinite(rect.left) && Number.isFinite(rect.right);
    }
    function unmeasuredPanelAnchor(viewportHeight) {
      const left = POPUP_EDGE_INSET;
      const top = Math.max(Math.min(viewportHeight * (2 / 3), viewportHeight - POPUP_MIN_HEIGHT - POPUP_EDGE_INSET), POPUP_EDGE_INSET);
      return { left, top };
    }
    function popupPanelLayout(input) {
      const viewport = viewportSize();
      const measured = Number.isFinite(input?.measured) && input.measured > 0 ? input.measured : 0;
      const rect = isUsableRect(input?.rect) ? input.rect : null;
      if (viewport.height === 0 || rect === null) {
        const standIn = unmeasuredPanelAnchor(viewport.height);
        const budget = Math.max(viewport.height - standIn.top - POPUP_EDGE_INSET, POPUP_MIN_HEIGHT);
        return {
          place: POPUP_PLACE.below,
          maxHeight: Math.max(Math.min(measured > 0 ? measured : 320, 320, budget), POPUP_MIN_HEIGHT),
          available: budget,
          positioned: false,
          left: standIn.left,
          top: standIn.top,
        };
      }
      const above = Math.max(rect.top - POPUP_EDGE_INSET, 0);
      const below = Math.max(viewport.height - rect.bottom - POPUP_EDGE_INSET, 0);
      const place = POPUP_PLACE.above;
      const available = Math.max(place === POPUP_PLACE.above ? above : below, POPUP_MIN_HEIGHT);
      const maxHeight = Math.max(Math.min(measured > 0 ? measured : 320, 320, available), POPUP_MIN_HEIGHT);
      const width = Number.isFinite(input?.width) && input.width > 0 ? input.width : 0;
      let left = rect.left;
      if (width > 0) {
        const maxLeft = Math.max(viewport.width - width - POPUP_EDGE_INSET, POPUP_EDGE_INSET);
        if (left > maxLeft) left = viewport.width - width - POPUP_EDGE_INSET;
        left = Math.max(left, POPUP_EDGE_INSET);
      }
      const wanted = place === POPUP_PLACE.above
        ? rect.top - POPUP_GAP - maxHeight
        : rect.bottom + POPUP_GAP;
      const top = Math.min(Math.max(wanted, POPUP_EDGE_INSET), Math.max(viewport.height - maxHeight - POPUP_EDGE_INSET, POPUP_EDGE_INSET));
      return { place, maxHeight, available, positioned: true, left, top };
    }
    function popupPanelLayoutStyle(layout) {
      const maxHeight = Number.isFinite(layout?.maxHeight) ? layout.maxHeight : 320;
      return {
        position: 'fixed',
        left: Math.round(Number.isFinite(layout?.left) ? layout.left : POPUP_EDGE_INSET),
        top: Math.round(Number.isFinite(layout?.top) ? layout.top : POPUP_EDGE_INSET),
        right: 'auto',
        bottom: 'auto',
        margin: 0,
        maxHeight,
        maxWidth: '92vw',
      };
    }
    function supportsPopover() {
      try {
        return typeof HTMLElement === 'function'
          && HTMLElement.prototype !== undefined
          && typeof HTMLElement.prototype.showPopover === 'function';
      } catch {
        return false;
      }
    }
    function ensureScrollCss() {
      try {
        if (typeof document === 'undefined' || document.head === null || document.head === undefined) return;
        if (typeof document.getElementById === 'function' && document.getElementById('dsh-persona-select-scroll') !== null) return;
        if (typeof document.createElement !== 'function') return;
        const style = document.createElement('style');
        style.id = 'dsh-persona-select-scroll';
        style.textContent =
          '[data-persona-picker-list]::-webkit-scrollbar{width:0;height:0}' +
          '[data-persona-text]::-webkit-scrollbar{width:0;height:0}' +
          '[data-persona-history-text]::-webkit-scrollbar{width:0;height:0}' +
          '[data-persona-list] [data-persona-id],' +
          '[data-persona-picker-list] [data-persona-option]{outline:none !important;box-shadow:none !important}' +
          '[data-persona-list] [data-persona-id]::-moz-focus-inner' +
          '{border:0;padding:0}' +
          '[data-persona-list] [data-persona-id]:not([data-preview="1"]){border-color:transparent !important}';
        document.head.appendChild(style);
      } catch {
      }
    }
    function indicatorLines(indicators, assembly, t) {
      const shown = Array.isArray(indicators) ? indicators.filter((entry) => entry.color !== 'green') : [];
      if (shown.length === 0) return null;
      const session = typeof assembly?.sessionId === 'string' && assembly.sessionId !== '' ? assembly.sessionId : '';
      const nodes = [];
      shown.forEach((entry, index) => {
        if (index > 0) nodes.push(h('span', { key: `sep-${index}`, style: S.sub }, '，'));
        nodes.push(
          h(
            'span',
            {
              key: `${index}-${entry.reason}`,
              style: entry.color === 'red' ? S.warnRed : S.warnYellow,
              'data-indicator-note': entry.color,
              'data-indicator-code': entry.reason,
            },
            String(entry.text).replace(/[。.]+$/u, ''),
          ),
        );
      });
      nodes.push(h('span', { key: 'tail', style: S.sub }, '。'));
      if (session !== '') {
        nodes.push(h('span', { key: 'session', style: S.sub }, ` ${t('indicatorSession')}: ${session}`));
      }
      return h(
        'p',
        {
          style: { margin: 0, lineHeight: '20px' },
          'data-indicator-notes': String(shown.length),
        },
        ...nodes,
      );
    }
    function AssemblyLine(props) {
      const { data, t } = props;
      const assembly = data?.section;
      const indicators = props.indicators;
      const indicator = summarizeIndicators(indicators, t);
      if (assembly === undefined || assembly === null) {
        return h('p', { style: S.sub, 'data-assembly': 'unknown' }, t('neverApplied'));
      }
      const sessionScoped = props.scope !== 'global';
      const applied = sessionScoped && typeof assembly.appliedAt === 'number';
      const dropped = sessionScoped && typeof assembly.droppedAt === 'number';
      const observed = sessionScoped && typeof assembly.assembledAt === 'number';
      const bare = !applied && !dropped && !observed;
      if (bare && sessionScoped) {
        return h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          h(
            'p',
            { style: S.row, 'data-assembly': 'unknown' },
            h('span', {
              style: S.dot(indicator.color),
              'data-dot': indicator.color,
              'data-indicator': indicator.reason,
              title: indicator.text,
            }),
            h('span', { style: S.sub }, t('neverApplied')),
          ),
          indicatorLines(indicators, assembly, t),
        );
      }
      const outcome = bare ? 'scope-global' : dropped ? 'dropped' : applied ? 'applied' : 'none';
      const order = Array.isArray(assembly.lastOrder) ? assembly.lastOrder : [];
      const orderCount = Number.isFinite(assembly.lastOrderCount) ? assembly.lastOrderCount : order.length;
      return h(
        'div',
        { 'data-assembly': outcome, style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h(
          'p',
          { style: S.row },
          h('span', {
            style: S.dot(indicator.color),
            'data-dot': indicator.color,
            'data-indicator': indicator.reason,
            title: indicator.text,
          }),
          h('span', { style: S.sub }, !sessionScoped
            ? t('assemblyGlobalScope')
            : dropped ? t('dropped') : applied ? t('applied') : t('noPersona')),
          h('span', { style: S.mono }, `· ${assembly.assemblies}`),
        ),
        indicatorLines(indicators, assembly, t),
        sessionScoped && dropped ? h('p', { style: S.warn }, t('droppedHint')) : null,
        sessionScoped && !dropped && !applied
          ? h('p', { style: S.sub, 'data-no-persona': '1' }, t('noPersonaHint'))
          : null,
        orderCount > 0
          ? h(
              'details',
              { style: { marginTop: 4 }, 'data-order-trace': '1' },
              h('summary', { style: { ...S.sub, cursor: 'pointer' } }, `${t('orderTrace')}（${orderCount}）`),
              h(
                'ol',
                {
                  style: {
                    margin: '6px 0 0',
                    padding: '0 0 0 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  },
                },
                order.map((name, index) =>
                  h(
                    'li',
                    {
                      key: `${index}-${name}`,
                      'data-section-name': name,
                      'data-self': name === assembly.name ? '1' : '0',
                      style: {
                        ...S.mono,
                        opacity: name === assembly.name ? 1 : 0.65,
                        fontWeight: name === assembly.name ? 600 : 400,
                      },
                    },
                    name,
                  ),
                ),
              ),
            )
          : null,
      );
    }
    function allSwitchesOn(switches) {
      const table = switches ?? {};
      return SWITCH_FIELDS.every((field) => table[field.key] === true);
    }
