window.__ModuleLoader__.load({
  id: 'dsh-persona-select-settings',
  factory: function settingsBundleFactory(require) {
    'use strict';
    let React = null;
    try {
      React = require('react');
    } catch {
      React = null;
    }
    const h = React !== null && typeof React.createElement === 'function' ? React.createElement : null;
    const ROUTE_PREFIX = '/persona-select';
    const NS = 'dsh-persona-select-settings';
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
        STRIP_KIND_FIELDS, SWITCH_FIELDS, RESIDENT_RETRY_MS, PRESET_SETTLE_MS,
        allSwitchesOn, byColorRank, call, checkOrderInput, ensureScrollCss,
        historyBytesOf, indicatorFor, indicatorsOf,
        ioExport: chunkHost.ioExport, logImport: chunkHost.logImport, logImportSync: chunkHost.logImportSync,
        notifyPersonaChanged, summarizeIndicators,
        useMainSessionRow, usePersonaState, useSettledTick,
        popupPanelLayout, popupPanelLayoutStyle, supportsPopover,
      };
    }
    const PERSONA_CHANGED_EVENT = 'dsh-persona-select:changed';
    const RESIDENT_RETRY_MS = 3000;
    // 切换会话预设（模式）后立刻刷一次；0 表示下一个事件循环就刷，不做等待。
    const PRESET_SETTLE_MS = 0;
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
      toolBaselineEmpty:
        '本会话的工具声明基线是空的 —— 这个会话的第一轮请求里一个工具都没有。之后回来的工具会被全部标成延迟加载，provider 会直接拒绝（INVALID_REQUEST）。要恢复工具请新开一个对话。',
      indicatorGreen:
        '绿色：正常。工具声明基线可用。',      indicatorRed: '红色：本会话工具基线为空，请新开对话。',
      storeError: '数据文件读取失败',
      warningsSummary: '需要注意的情况',
      warningsShow: '展开',
      warningsHide: '收起',
      warningsDismiss: '关闭这些提示',
      warningsDismissed: '已关闭运行提示',
      dismissFailed: '关闭失败：',
      staleServer: '插件文件已经是 {client}，服务器还在跑 {server}：重启 App 引擎后这个按钮才可用。',
      cacheResetPending: '黄色：下一句会重置缓存',
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
      indicatorYellowHistory: '黄色：预设保存的历史对话已修改，本会话仍是旧内容。',
      indicatorYellowDropped: '黄色：人设正文未进入提示词，本会话的模式导致装配结果里没有它。',
      indicatorRedPersonaMissing: '红色：选定人设已删除，请重新选择。',
      indicatorYellowNotCarried: '黄色：会话已开始，历史对话不会注入。',
    };
    const EN_JSON = "{\"nav\":\"Personas\",\"pickerLabel\":\"Persona\",\"off\":\"Off\",\"title\":\"Persona manager\",\"listTitle\":\"Personas\",\"newPersona\":\"New\",\"importButton\":\"Import\",\"importHint\":\"Read a file produced by this plugin’s Export (.json, or the .png from “Export image”): text, section order and persona history come in together and are appended as **new** personas (existing entries are never overwritten).\",\"importFailed\":\"Import failed\",\"importEmpty\":\"No importable persona in this file (no personas array, and no single persona object).\",\"importDone\":\"Imported\",\"importSkipped\":\"Skipped\",\"exportButton\":\"Export\",\"exportHint\":\"Export the persona in the editor (text + section order + history) as a file: plain JSON, or packed into a PNG you pick yourself.\",\"exportJson\":\"Export JSON\",\"exportJsonHint\":\"Export as .json: plain JSON, no compression, lossless (newlines and quotes are escaped, so the file is only ever larger than the source).\",\"exportPng\":\"Pick a PNG, inject into it, and save as a copy\",\"exportPngHint\":\"Pick a PNG as the cover; the same data is packed into the image and downloaded together. The image itself is not modified by a single byte and every normal viewer still displays it.\",\"exportPngBad\":\"That file is not a PNG. Image export needs a PNG as the cover — JPEG/WebP have no ancillary chunks for a decoder to skip, and converting would re-encode the picture, so this is refused outright.\",\"exportPngBroken\":\"This PNG is structurally incomplete (no IHDR readable); try another one.\",\"exportTooBig\":\"The file is too large — over the 32 MB per-export limit.\",\"exportNameMayDiffer\":\"(download channel unavailable; the system may rename the file)\",\"exportNotTaken\":\"Could not confirm the file was downloaded (the browser may have blocked it, or the downloader never fetched it) — check the download folder, and try again if it is not there.\",\"importPngNoData\":\"No persona data in this image (no iTXt chunk from this plugin).\",\"importPngBadCrc\":\"The persona data in this image fails its checksum (CRC mismatch): the file was modified.\",\"exportDone\":\"Exported\",\"exportFailed\":\"Export failed\",\"exportNoBrowser\":\"This environment cannot download files; export cancelled.\",\"exportRefusedNew\":\"Cannot export: the new persona has not been saved yet\",\"exportConfirmDirty\":\"The edits to the selected persona are unsaved; the export will be the pre-save original. Export anyway?\",\"activate\":\"Use\",\"builtin\":\"Built-in\",\"builtinReadonly\":\"Built-in personas are read-only. Use “Fork as new” to edit a copy.\",\"name\":\"Name\",\"text\":\"Text\",\"save\":\"Save\",\"del\":\"Delete\",\"confirmDelete\":\"Delete this persona? This cannot be undone.\",\"confirmOk\":\"OK\",\"confirmCancel\":\"Cancel\",\"activated\":\"Persona switched; effective on the next turn\",\"activatedNamed\":\"Persona switched: %s; effective on the next turn\",\"deactivated\":\"Persona injection turned off\",\"deleted\":\"Persona deleted\",\"chars\":\"chars\",\"path\":\"Data file\",\"applied\":\"Last assembly: injected\",\"dropped\":\"Last assembly: not injected\",\"droppedHint\":\"This session’s agent preset declares complete: true (DSH’s built-in “minimal” mode does), so the platform collapses the assembly into one section and plugin sections cannot enter. Switch back to standard mode.\",\"neverApplied\":\"No assembly observed yet. Send a message and look again.\",\"assemblyGlobalScope\":\"This page is global settings: assembly results only exist for a specific conversation.\",\"noPersona\":\"Last assembly: nothing to inject\",\"noPersonaHint\":\"This session has no persona selected (it is set to Off, or the selected persona's text is empty), so there was nothing to put into the system prompt this turn. That is the result of the current setting, not something being overridden.\",\"orderTrace\":\"Real section order from the last assembly\",\"switchesTitle\":\"Input suppression switches\",\"switchesHint\":\"Each switch removes one class of system-side input the model would otherwise see. All four on with no active persona = pure chat (zero system-side injection) — the starting point of a free web chat.\",\"swSoloLabel\":\"Persona only (suppress every other system-prompt section)\",\"swSoloHint\":\"Harness identity, deployment persona, tool guidance, plan-mode policy and harness-source notes are all withheld. With no persona selected the system prompt is empty.\",\"swRuntimeLabel\":\"Suppress runtime context\",\"swRuntimeHint\":\"Two families: (1) sandbox policy, approval policy and delegation rules — dynamic context delivered as user-role snapshots; (2) the runtime snapshot and skill catalog framed as `<system-reminder>` blocks (these really appear in creation mode, whose preset mounts its own skill directory). Neither lives in the system prompt, so \\\"persona only\\\" cannot reach them either — they can only be filtered by provenance before assembly. This switch now drops both.\",\"swToolsLabel\":\"Suppress tool schemas\",\"swToolsHint\":\"Tool definitions travel as a separate wire field, not as a system-prompt section, and are usually the biggest token item. With this on the model has nothing to call.\",\"swInjectedLabel\":\"Suppress history injections (workspace instructions / time readings)\",\"swInjectedHint\":\"The AGENTS.md / CLAUDE.md instruction baseline and the per-step time readings from dsh-time-context. These are likewise user-role messages appended by plugins rather than prompt sections, so they can only be filtered by provenance.\",\"pureChatButton\":\"Make it pure chat\",\"restoreButton\":\"Restore system input\",\"pureChatHint\":\"clears the persona selection and turns all four switches on\",\"pureChatState\":\"Pure chat is active: zero system-side injection — the model sees only your messages.\",\"pureChatOn\":\"Switched to pure chat\",\"restoreDone\":\"System input restored: all four switches cleared\",\"switchesSaved\":\"Switches saved; effective on the next turn\",\"strippedMessages\":\"Injected messages filtered in this conversation\",\"stripStatusTitle\":\"System injection blocks (filtered in this session)\",\"stripKindRuntime\":\"runtime snapshot\",\"stripKindSkill\":\"skill catalog\",\"stripKindInstructions\":\"workspace instructions\",\"stripKindTime\":\"time readings\",\"soloNoPersona\":\"“Persona only” is on but no persona is selected — the system prompt will be empty.\",\"soloSavings\":\"Size with only the persona kept\",\"sectionsUnit\":\"sections\",\"toolBaselineEmpty\":\"This session’s tool-declaration baseline is empty — the session’s first request carried no tools at all. Tools that come back are all marked deferred and the provider rejects the request (INVALID_REQUEST). Start a new conversation to get tools back.\",\"indicatorGreen\":\"Green: all good — the tool baseline is usable.\",\"indicatorRed\":\"Red: this session has no tool baseline — start a new conversation.\",\"storeError\":\"Could not read the data file\",\"warningsSummary\":\"Things to check\",\"warningsShow\":\"Show\",\"warningsHide\":\"Hide\",\"warningsDismiss\":\"Dismiss these notices\",\"warningsDismissed\":\"Runtime notices dismissed\",\"loading\":\"Loading…\",\"retry\":\"Retry\",\"chunkFailed\":\"This part of the interface failed to load\",\"createHint\":\"Creating (not saved yet)\",\"editHint\":\"Editing\",\"blankText\":\"The text is empty; saving will be rejected.\",\"blankSaveRefused\":\"Save refused: the persona text is empty — for an empty persona, turn on “Off”\",\"orderLabel\":\"Section order weight\",\"orderHint\":\"Sort weight of the persona section in the system prompt: lower comes first (default -1, before the preset line “You are a coding agent…”). It only changes section order and never enters the persona text. Each persona keeps its own weight, so this box follows whichever persona you are editing. Click Save to apply — validated on save: it must be an integer.\",\"orderDefaultButton\":\"Default\",\"orderFollowButton\":\"Follow\",\"orderFollowText\":\"Appended after the system prompt\",\"orderFollowHint\":\"Puts the weight after every system-prompt section (the same approach as prompt management). Click this box to go back to a number. Click Save to apply.\",\"orderProblemEmpty\":\"The section order weight cannot be empty: type an integer, or use “Default” / “Follow”.\",\"orderProblemInteger\":\"The section order weight must be an integer (for example -1, 0, 10200): decimals such as 0.1, exponents and units are not legal section orders — they would make the system prompt assembly invalid. You typed\",\"orderProblemRange\":\"The section order weight must be an integer between -1000000000 and 1000000000.\",\"orderSaved\":\"Section order saved\",\"hintLabel\":\"Help\",\"unnamed\":\"Untitled\",\"clearDraft\":\"Clear\",\"historyTitle\":\"Persona conversation history\",\"historySubtitle\":\"A stretch of \\\"already happened\\\" conversation, saved together with this persona. When this persona is selected, the first step of a new conversation injects that history as user-side context; a conversation that has already been injected is never injected again, because doing so would reset the KV cache of the whole conversation. If you need a conversation that has already started to carry history across a persona switch, you can write that history into the persona body itself. But the result is poor, so this is not recommended.\",\"historyTabEdit\":\"Edit by hand\",\"historyTabImport\":\"Import a session log\",\"historyFormatHint\":\"Default format:\\nWrap user-side content in <user_message>; wrap the model side’s thinking in <thinking> and its spoken content in <assistant_message>; wrap non-conversational or multimodal content from either side in <file>. Close every tag with “/” (for example <user_message>hi</user_message> means the user said “hi”).\\nThis format only applies to models that support thinking, such as DeepSeek\",\"historyThinkingLabel\":\"Include thinking\",\"historyCompactLabel\":\"Expand compaction\",\"historyCompactHint\":\"By default the box gets only the compaction summaries wrapped in <compacted-summary>…</compacted-summary> (copied verbatim, tags included) plus the dialogue that follows the **last** one; ordinary content before the first summary and between summaries is not imported. Ticking this box flips it: the box gets **everything except** those summaries — the compaction is expanded back into the original text. This box and “Include thinking” are independent: the latter decides whether the model side’s <thinking> comes along, this one decides whether the summaries stay or the rest of the text does; both apply together. When the imported text has no summary at all, ticking changes nothing and the only hint is “this history has not been compacted yet”.\",\"historyCompactNone\":\"This history has not been compacted yet\",\"historyCompactNoImport\":\"Nothing imported yet: this checkbox only processes imported text.\",\"historyTokenCost\":\"cost\",\"historyImportButton\":\"Import session.vN.jsonl / .zip\",\"historyImportHint\":\"Accepts the zip produced by /export, or a bare session.vN.jsonl / session.jsonl\",\"historyImportConfirm\":\"The box already has content. Importing replaces it — continue?\",\"historyImportEmpty\":\"No usable conversation text in that file (not a single user/message or assistant/message was recognised).\",\"historyImportFailed\":\"Import failed\",\"historyChars\":\"characters\",\"historyBytes\":\"bytes\",\"historyClearButton\":\"Clear history\",\"historyUndoButton\":\"Undo\",\"historySaved\":\"Conversation history saved\",\"historyCleared\":\"Conversation history cleared\",\"historyDirtyHint\":\"unsaved changes\",\"historyStored\":\"This persona has conversation history\",\"historyNotStored\":\"This persona has no conversation history yet\",\"historyMissing\":\"This persona’s history content is gone — only the record is left\",\"historyInjectedCount\":\"History messages injected\",\"historyPlaceholder\":\"Write the history here, or switch to “Import a session log” …\",\"personaSaved\":\"Persona saved\",\"saveFailed\":\"Save failed: \",\"nothingToSave\":\"Nothing to save.\",\"saving\":\"Saving…\",\"emptyPersonaName\":\"The persona name cannot be empty.\",\"unsavedTitle\":\"Not saved yet:\",\"unsavedPersona\":\"persona (name / text)\",\"unsavedOrder\":\"section order weight\",\"unsavedHistory\":\"conversation history\",\"switchConfirm\":\"Switching personas discards these unsaved changes:\",\"switchConfirmTail\":\"Continue?\",\"scopeTabCurrent\":\"Current\",\"scopeTabGlobal\":\"Global\",\"scopeSession\":\"Session\",\"scopeLayerCurrent\":\"this chat\",\"scopeLayerGlobal\":\"global\",\"pickerLayerHint\":\"This chat: settings for this conversation · Global: what new conversations follow\",\"indicatorYellowHistory\":\"Yellow: the history saved with this persona has changed; this session keeps the old content.\",\"indicatorRedPersonaMissing\":\"Red: the selected persona was deleted — pick another one.\",\"indicatorYellowNotCarried\":\"Yellow: this session has already chatted, so the history is not injected.\",\"dismissFailed\":\"Dismiss failed: \",\"staleServer\":\"Plugin files are {client} but the server still runs {server}. Restart the app engine before this button can work.\",\"cacheResetPending\":\"Yellow: the next message resets the cache\",\"indicatorYellowDropped\":\"Yellow: the persona text did not enter the prompt; this session's mode left it out of the assembly.\"}";
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
    const ja = {"nav":"ペルソナ管理","pickerLabel":"ペルソナ","off":"注入しない","title":"ペルソナ管理","listTitle":"ペルソナ一覧","newPersona":"新規","importButton":"インポート","importHint":"このプラグインの「エクスポート」で作ったファイル（.json、または「画像をエクスポート」で作った .png）を読み込みます：ペルソナ本文・セクション順の重み・会話履歴をまとめて取り込み、**新しいペルソナ**として一覧に追加します（既存の項目は上書きしません）。","importFailed":"インポートに失敗しました","importEmpty":"このファイルにインポートできるペルソナがありません（personas 配列も、単体のペルソナオブジェクトも見つかりません）。","importDone":"インポート済み","importSkipped":"スキップ","exportButton":"エクスポート","exportHint":"編集エリアのペルソナ（本文＋セクション順の重み＋会話履歴）をファイルに書き出します：そのままの JSON か、自分で選んだ PNG に詰め込むか。","exportJson":"JSON をエクスポート","exportJsonHint":".json として書き出します：純粋な JSON、無圧縮、無劣化（改行と引用符はエスケープされるので、元より大きくなるだけです）。","exportPng":"PNG を選んで注入し別名保存","exportPngHint":"PNG を 1 枚カバーとして選び、同じデータを画像に詰めて一緒にダウンロードします。画像自体は 1 バイトも変わらず、普通のビューアでそのまま表示できます。","exportPngBad":"このファイルは PNG ではありません。画像エクスポートにはカバー用の PNG が必要です —— JPEG / WebP には PNG のような「デコーダーが飛ばす付属チャンク」がないため、変換すると元画像を再エンコードすることになり、ここでは行いません。","exportPngBroken":"この PNG は構造が不完全です（IHDR が読めません）。別の画像を試してください。","exportTooBig":"ファイルが大きすぎます。1 回のエクスポート上限 32 MB を超えています。","exportNameMayDiffer":"（ダウンロード経路が使えないため、ファイル名はシステムに書き換えられる場合があります）","exportNotTaken":"ファイルがダウンロードされたことを確認できませんでした（ブラウザに止められたか、ダウンローダーが取りに来なかった可能性があります）—— ダウンロードフォルダを確認し、なければもう一度クリックしてください。","importPngNoData":"この画像にはペルソナデータがありません（このプラグインの iTXt チャンクが見つかりません）。","importPngBadCrc":"この画像のペルソナデータは検証に通りません（CRC が一致しません）。ファイルが改変されています。","exportDone":"エクスポート済み","exportFailed":"エクスポートに失敗しました","exportNoBrowser":"この環境はファイルのダウンロードに対応していません。エクスポートを中止しました。","exportRefusedNew":"エクスポートできません：新規ペルソナがまだ保存されていません","exportConfirmDirty":"選択中のペルソナの編集が未保存です。エクスポートされるのは保存前の元の内容です。続行しますか？","activate":"使用","builtin":"組み込み","builtinReadonly":"組み込みペルソナは読み取り専用です。変更するには「新しいペルソナとして複製」して、複製を編集してください。","name":"名前","text":"本文","save":"保存","del":"削除","confirmDelete":"このペルソナを削除しますか？この操作は取り消せません。","confirmOk":"OK","confirmCancel":"キャンセル","activated":"ペルソナを切り替えました。次のターンから有効です","activatedNamed":"ペルソナを切り替えました：%s。次のターンから有効です","deactivated":"ペルソナの注入をオフにしました","deleted":"ペルソナを削除しました","chars":"文字","path":"データファイル","applied":"直近の組み立て：注入済み","dropped":"直近の組み立て：未注入","droppedHint":"このセッションの agent preset が complete: true を宣言しています（DSH 内蔵の「ミニマルモード」がこれです）。プラットフォームが組み立てを 1 セクションに圧縮するため、プラグインのセクションは入りません。標準モードに戻してください。","neverApplied":"まだ組み立てを観測していません。メッセージを 1 通送ってから確認してください。","assemblyGlobalScope":"このページはグローバル設定です：組み立て結果は具体的な会話にしかありません","noPersona":"直近の組み立て：今回注入できるペルソナがありません","noPersonaHint":"このセッションではペルソナが選ばれていません（「注入しない」を選んだか、選んだペルソナの本文が空です）。そのため今回はシステムプロンプトに入れる内容がありません。これは現在の選択の結果であり、誰かに押しのけられたわけではありません。","orderTrace":"直近の組み立ての実際のセクション順","switchesTitle":"入力抑制スイッチ","switchesHint":"4 つのスイッチは、モデルが見られる 4 種類のシステム側入力をそれぞれ抑えます。すべてオンでペルソナ未使用＝純粋チャット（システム側の注入ゼロ）で、Web 版無料枠の出発点に相当します。","swSoloLabel":"ペルソナのみ読み込む（他のシステムプロンプトセクションをすべて遮断）","swSoloHint":"harness のアイデンティティ、デプロイ時のペルソナ、ツールのガイド、plan モードの戦略、harness のソース説明などはすべて送られなくなります。ペルソナ未選択ならシステムプロンプトは空になります。","swRuntimeLabel":"runtime コンテキストを遮断","swRuntimeHint":"2 種類あります：① サンドボックス方針・承認方針・委任ルールなど、user ロールのスナップショットとして現れる動的コンテキスト；② `<system-reminder>` に囲まれたランタイムスナップショットとスキル一覧（クリエイティブモードでは実際に現れます。preset が独自のスキル一覧を抱えているためです）。どちらもシステムプロンプトには入らない（「ペルソナのみ読み込む」では届かない）ので、組み立て前に出所でフィルタするしかありません —— このスイッチは両方を抑えます。","swToolsLabel":"ツールスキーマを遮断","swToolsHint":"ツール定義は wire 上の独立フィールドで、システムプロンプトには含まれず、通常はトークンの最大部分です。抑えるとモデルは呼び出せるツールを一切持ちません。","swInjectedLabel":"履歴注入を遮断（ワークスペース指示チェーン / 時刻の読み取り）","swInjectedHint":"AGENTS.md / CLAUDE.md の指示チェーンの基線、および dsh-time-context が毎ステップ追加する時刻の読み取り。これらもプラグインが履歴に追加する user メッセージで、プロンプトセクションではないため、出所で正確にフィルタするしかありません。","pureChatButton":"ワンクリックで純粋チャット","restoreButton":"システム入力を復元","pureChatHint":"ペルソナの選択を解除し、4 つのスイッチをすべてオンにします","pureChatState":"現在は純粋チャット状態です：システム側の注入ゼロ、モデルはあなたが送ったメッセージだけを見ます。","pureChatOn":"純粋チャットに切り替えました","restoreDone":"システム入力を復元しました：4 つのスイッチをすべてオフにしました","switchesSaved":"スイッチを保存しました。次のターンから有効です","strippedMessages":"この会話でフィルタされた注入メッセージ数","stripStatusTitle":"システム注入ブロック（このセッションでフィルタ済み）","stripKindRuntime":"ランタイムスナップショット","stripKindSkill":"スキル一覧","stripKindInstructions":"ワークスペース指示チェーン","stripKindTime":"時刻の読み取り","soloNoPersona":"「ペルソナのみ読み込む」がオンですが、ペルソナが選ばれていません —— システムプロンプトは空になります。","soloSavings":"ペルソナだけ残したときの規模","sectionsUnit":"セクション","toolBaselineEmpty":"このセッションのツール宣言基線は空です —— このセッションの最初のリクエストにツールが 1 つもありませんでした。後から戻ってきたツールはすべて遅延読み込み扱いになり、provider が拒否します（INVALID_REQUEST）。ツールを戻すには新しい会話を開いてください。","indicatorGreen":"緑：正常です。ツール宣言基線は使用可能です。","indicatorRed":"赤：このセッションにはツールの基線がありません。新しい会話を開いてください。","storeError":"データファイルの読み取りに失敗しました","warningsSummary":"注意が必要な状況","warningsShow":"展開","warningsHide":"折りたたむ","warningsDismiss":"これらの通知を閉じる","warningsDismissed":"実行時の通知を閉じました","loading":"読み込み中…","retry":"再試行","chunkFailed":"この部分の UI を読み込めませんでした","createHint":"新規作成中（未保存）","editHint":"編集中","blankText":"本文が空です。保存は拒否されます。","blankSaveRefused":"保存を拒否しました：ペルソナ本文が空です。空のペルソナには「注入しない」を使ってください","orderLabel":"セクション順の重み","orderHint":"ペルソナセクションのシステムプロンプト内での並び順の重み：小さいほど前（既定は -1 で、preset の「You are a coding agent…」より前）。これはセクションの順序だけを決め、ペルソナ本文には入りません。ペルソナごとに自分の重みを覚え、切り替えるとこの欄も切り替わります。変更後に「保存」を押すと有効になり、保存時に整数であることを検証します。","orderDefaultButton":"デフォルト","orderFollowButton":"追従","orderFollowText":"システムプロンプトの後に追加","orderFollowHint":"重みをすべてのシステムプロンプトセクションの後ろに置きます（prompt 管理と同じやり方）。この欄をクリックすると数値に戻せます。変更後に「保存」で有効になります。","orderProblemEmpty":"セクション順の重みは空にできません：整数を入力するか、「デフォルト」/「追従」を押してください。","orderProblemInteger":"セクション順の重みは整数でなければなりません（例：-1、0、10200）：小数（0.1 など）、指数、単位は有効なセクション順ではありません —— システムプロンプトのセクション順が不正になります。入力されたのは","orderProblemRange":"セクション順の重みは -1000000000 ～ 1000000000 の整数でなければなりません。","orderSaved":"セクション順を保存しました","hintLabel":"説明","unnamed":"無題","clearDraft":"クリア","historyTitle":"ペルソナの会話履歴","historySubtitle":"「すでに起きた会話」を 1 つ、このペルソナと一緒に保存します。ペルソナを選ぶと、新しい会話の最初のステップで会話履歴が user 側のコンテキストとして注入されます。一度注入した会話は再度注入されません（そうしないと会話全体のキャッシュがリセットされます）。すでに会話したセッションでペルソナを切り替えるときに履歴を引き継ぎたい場合は、履歴をペルソナ本文に書くこともできます。ただし効果は良くないので、おすすめしません。","historyTabEdit":"手動編集","historyTabImport":"セッションログをインポート","historyFormatHint":"既定の書き方：\nユーザー側の内容は<user_message>で囲む；モデル側の思考内容は<thinking>で囲み、会話内容は<assistant_message>；双方の非会話内容やマルチモーダル内容は<file>で囲む。終了タグには「/」を付ける（例：<user_message>こんにちは</user_message>はユーザーが「こんにちは」と送ったことを表す）。\nこの形式は deepseek など思考に対応したモデルにのみ適用されます","historyThinkingLabel":"思考過程をインポート","historyCompactLabel":"元テキストの圧縮を展開","historyCompactHint":"既定では <compacted-summary>…</compacted-summary> に囲まれた圧縮サマリーだけを入力欄に取り込み（タグごと原文どおり）、その後に**最後のサマリーより後**の会話を続けます。サマリーより前、および 2 つのサマリーの間の通常の内容は取り込みません。チェックすると逆になります：これらの圧縮サマリー**以外**の全文を取り込みます —— つまり圧縮を元テキストに展開します。これは「思考過程をインポート」とは別のことを担います：あちらはモデル側の <thinking> を一緒に取り込むか、こちらはサマリーを残すかサマリー以外を残すかを決め、両方は重ねて効きます。取り込むテキストに圧縮サマリーがない場合、チェックの有無にかかわらず全文になり、「この会話履歴はまだ圧縮されていません」とだけ表示されます。","historyCompactNone":"この会話履歴はまだ圧縮されていません","historyCompactNoImport":"まだセッションログをインポートしていません：このチェックボックスはインポートしたテキストだけを扱います。","historyTokenCost":"増加","historyImportButton":"session.vN.jsonl / .zip をインポート","historyImportHint":"/export で書き出した zip、または単体の session.vN.jsonl / session.jsonl に対応","historyImportConfirm":"入力欄にすでに内容があります。インポートすると置き換わります。続行しますか？","historyImportEmpty":"このファイルに使える会話内容がありません（user/message も assistant/message も 1 件も認識できませんでした）。","historyImportFailed":"インポートに失敗しました","historyChars":"文字","historyBytes":"バイト","historyClearButton":"履歴をクリア","historyUndoButton":"元に戻す","historySaved":"会話履歴を保存しました","historyCleared":"会話履歴をクリアしました","historyDirtyHint":"未保存の変更があります","historyStored":"このペルソナには会話履歴があります","historyNotStored":"このペルソナにはまだ会話履歴がありません","historyMissing":"このペルソナの履歴内容はもう存在せず、記録だけが残っています","historyInjectedCount":"注入済みの会話履歴数","historyPlaceholder":"ここに会話履歴を書くか、「セッションログをインポート」に切り替えてファイルから読み込みます…","personaSaved":"ペルソナを保存しました","saveFailed":"保存に失敗しました：","nothingToSave":"保存する変更がありません。","saving":"保存中…","emptyPersonaName":"ペルソナ名は空にできません。","unsavedTitle":"未保存：","unsavedPersona":"ペルソナ（名前 / 本文）","unsavedOrder":"セクション順の重み","unsavedHistory":"会話履歴","switchConfirm":"ペルソナを切り替えると、次の未保存の変更は破棄されます：","switchConfirmTail":"続行しますか？","scopeTabCurrent":"現在","scopeTabGlobal":"グローバル","scopeSession":"セッション","scopeLayerCurrent":"このセッション","scopeLayerGlobal":"グローバル","pickerLayerHint":"現在：この会話の設定 · グローバル：新しい会話が従う設定","indicatorYellowHistory":"黄：このペルソナに保存された履歴は変更されました。このセッションは古い内容のままです。","indicatorRedPersonaMissing":"赤：選択したペルソナは削除されました。選び直してください。","indicatorYellowNotCarried":"黄：このセッションはすでに会話しているため、履歴は注入されません。","dismissFailed":"閉じられませんでした：","staleServer":"プラグインは {client} ですが、サーバーはまだ {server} です。アプリのエンジンを再起動するとこのボタンが使えます。","cacheResetPending":"黄：次のメッセージでキャッシュがリセットされます","indicatorYellowDropped":"黄：ペルソナ本文がプロンプトに入っていません。このセッションのモードにより、組み立て結果に含まれていません。"};
    const es = {"nav":"Personas","pickerLabel":"Persona","off":"No inyectar","title":"Gestión de personas","listTitle":"Lista de personas","newPersona":"Nuevo","importButton":"Importar","importHint":"Lee un archivo creado por la exportación de este plugin (.json, o el .png de «Exportar imagen»): el texto de la persona, el peso del orden de sección y el historial de conversación entran juntos y se añaden como **personas nuevas** a la lista (nunca se sobrescriben las entradas existentes).","importFailed":"Error al importar","importEmpty":"Este archivo no contiene personas importables (no hay un array «personas» ni un objeto de persona suelto).","importDone":"Importado","importSkipped":"Omitido","exportButton":"Exportar","exportHint":"Exporta la persona del editor (texto + peso del orden de sección + historial) como archivo: JSON plano, o empaquetado en un PNG que elijas tú.","exportJson":"Exportar JSON","exportJsonHint":"Exportar como .json: JSON plano, sin compresión, sin pérdida (los saltos de línea y las comillas se escapan, así que el archivo solo puede ser mayor que el original).","exportPng":"Elegir un PNG, inyectar y guardar como copia","exportPngHint":"Elige un PNG como portada; los mismos datos se empaquetan en la imagen y se descargan juntos. La imagen no cambia ni un byte y cualquier visor normal la sigue mostrando.","exportPngBad":"Ese archivo no es un PNG. La exportación de imagen necesita un PNG como portada: JPEG/WebP no tienen los chunks auxiliares que un decodificador ignora, y convertir recompilaría la imagen, así que aquí se rechaza directamente.","exportPngBroken":"Este PNG está estructuralmente incompleto (no se puede leer el IHDR); prueba con otro.","exportTooBig":"El archivo es demasiado grande: supera el límite de 32 MB por exportación.","exportNameMayDiffer":"(canal de descarga no disponible; el sistema puede renombrar el archivo)","exportNotTaken":"No se pudo confirmar que el archivo se descargara (el navegador puede haberlo bloqueado o el descargador no lo recogió); mira la carpeta de descargas y, si no está, vuelve a pulsar.","importPngNoData":"Esta imagen no contiene datos de persona (no se encuentra el chunk iTXt de este plugin).","importPngBadCrc":"Los datos de persona de esta imagen no pasan la verificación (el CRC no coincide); el archivo ha sido modificado.","exportDone":"Exportado","exportFailed":"Error al exportar","exportNoBrowser":"Este entorno no permite descargar archivos; exportación cancelada.","exportRefusedNew":"No se puede exportar: la persona nueva aún no se ha guardado","exportConfirmDirty":"La edición de la persona seleccionada no está guardada; se exportará el contenido previo a guardar. ¿Continuar?","activate":"Usar","builtin":"Integrada","builtinReadonly":"Las personas integradas son de solo lectura. Para cambiarla, usa «Duplicar como persona nueva» y edita la copia.","name":"Nombre","text":"Texto","save":"Guardar","del":"Eliminar","confirmDelete":"¿Eliminar esta persona? Esta acción no se puede deshacer.","confirmOk":"Aceptar","confirmCancel":"Cancelar","activated":"Persona cambiada; se aplica en el siguiente turno","activatedNamed":"Persona cambiada: %s; se aplica en el siguiente turno","deactivated":"Inyección de persona desactivada","deleted":"Persona eliminada","chars":"caracteres","path":"Archivo de datos","applied":"Última composición: inyectada","dropped":"Última composición: no inyectada","droppedHint":"El agent preset de esta sesión declara complete: true (así es el «modo mínimo» integrado de DSH); la plataforma comprime la composición en una sola sección y la sección del plugin no entra. Vuelve al modo estándar.","neverApplied":"Aún no se ha observado ninguna composición. Envía un mensaje y vuelve a mirar.","assemblyGlobalScope":"Esta página es configuración global: el resultado de la composición solo existe en conversaciones concretas","noPersona":"Última composición: esta vez no hay persona que inyectar","noPersonaHint":"En esta sesión no hay persona seleccionada (se eligió «No inyectar», o el texto de la persona elegida está vacío), así que esta vez no hay nada que poner en la indicación del sistema. Es el resultado de la selección actual, no de que algo la haya desplazado.","orderTrace":"Orden real de secciones en la última composición","switchesTitle":"Interruptores de supresión de entrada","switchesHint":"Los cuatro interruptores suprimen cada uno de los cuatro tipos de entrada del lado del sistema que ve el modelo. Todos activados y sin persona = chat puro (cero inyección del lado del sistema), el punto de partida del nivel gratuito de la versión web.","swSoloLabel":"Cargar solo la persona (bloquear todas las demás secciones de la indicación del sistema)","swSoloHint":"La identidad del harness, la persona del despliegue, las guías de herramientas, la estrategia del modo plan, la explicación del código del harness, etc. dejan de enviarse. Sin persona elegida, la indicación del sistema queda vacía.","swRuntimeLabel":"Bloquear el contexto runtime","swRuntimeHint":"Dos cosas: ① contexto dinámico que aparece como instantáneas con rol user (política de sandbox, política de aprobación, reglas de delegación, etc.); ② la instantánea de runtime y el catálogo de skills encerrados en `<system-reminder>` (en el modo creativo sí aparecen, porque su preset trae su propio catálogo de skills). Ninguna está en la indicación del sistema (por eso «Cargar solo la persona» no las alcanza), así que solo se pueden filtrar por origen antes de componer: este interruptor suprime ambas.","swToolsLabel":"Bloquear el esquema de herramientas","swToolsHint":"Las definiciones de herramientas van en un campo aparte del wire, no en la indicación del sistema, y suelen ser la mayor parte de los tokens. Al suprimirlas, el modelo no tiene ninguna herramienta que pueda llamar.","swInjectedLabel":"Suprimir inyecciones de historial (cadena de instrucciones del espacio de trabajo / lecturas de tiempo)","swInjectedHint":"La línea base de la cadena de instrucciones de AGENTS.md / CLAUDE.md, y las lecturas de tiempo que dsh-time-context añade en cada paso. También son mensajes user que el plugin añade al historial, no secciones de la indicación, así que solo se pueden filtrar con precisión por origen.","pureChatButton":"Un clic para chat puro","restoreButton":"Restaurar entradas del sistema","pureChatHint":"Quita la selección de persona y activa los cuatro interruptores","pureChatState":"Ahora estás en chat puro: cero inyección del lado del sistema, el modelo solo ve los mensajes que envías.","pureChatOn":"Cambiado a chat puro","restoreDone":"Entradas del sistema restauradas: los cuatro interruptores desactivados","switchesSaved":"Interruptores guardados; se aplican en el siguiente turno","strippedMessages":"Mensajes inyectados filtrados en esta conversación","stripStatusTitle":"Bloques de inyección del sistema (filtrados en esta sesión)","stripKindRuntime":"Instantánea de runtime","stripKindSkill":"Catálogo de skills","stripKindInstructions":"Cadena de instrucciones del espacio de trabajo","stripKindTime":"Lecturas de tiempo","soloNoPersona":"«Cargar solo la persona» está activo, pero no hay persona elegida: la indicación del sistema quedará vacía.","soloSavings":"Tamaño al conservar solo la persona","sectionsUnit":"secciones","toolBaselineEmpty":"La línea base de declaración de herramientas de esta sesión está vacía: en la primera petición de esta sesión no había ni una herramienta. Las herramientas que vuelvan después se marcarán como carga diferida y el provider las rechazará (INVALID_REQUEST). Para recuperar las herramientas, abre una conversación nueva.","indicatorGreen":"Verde: normal. La línea base de declaración de herramientas está disponible.","indicatorRed":"Rojo: esta sesión no tiene línea base de herramientas; abre una conversación nueva.","storeError":"Error al leer el archivo de datos","warningsSummary":"Situaciones a tener en cuenta","warningsShow":"Expandir","warningsHide":"Contraer","warningsDismiss":"Cerrar estos avisos","warningsDismissed":"Avisos de ejecución cerrados","loading":"Cargando…","retry":"Reintentar","chunkFailed":"No se pudo cargar esta parte de la interfaz","createHint":"Creando (sin guardar)","editHint":"Editando","blankText":"El texto está vacío; se rechazará el guardado.","blankSaveRefused":"Guardado rechazado: el texto de la persona está vacío; para una persona vacía usa «No inyectar»","orderLabel":"Peso del orden de sección","orderHint":"Peso de orden de la sección de persona dentro de la indicación del sistema: cuanto menor, más delante (por defecto -1, antes de la frase «You are a coding agent…» del preset). Solo decide el orden de las secciones y no entra en el texto de la persona. Cada persona recuerda su propio peso y al cambiar de persona este campo cambia con ella; el cambio se aplica al pulsar «Guardar», que valida que sea un entero.","orderDefaultButton":"Predeterminado","orderFollowButton":"Seguir","orderFollowText":"Añadir tras la indicación del sistema","orderFollowHint":"Pone el peso detrás de todas las secciones de la indicación del sistema (el mismo truco que la gestión de prompts); al pulsar el campo se vuelve al valor numérico. Se aplica al pulsar «Guardar».","orderProblemEmpty":"El peso del orden de sección no puede estar vacío: escribe un entero o pulsa «Predeterminado»/«Seguir».","orderProblemInteger":"El peso del orden de sección debe ser un entero (por ejemplo -1, 0, 10200): los decimales (como 0.1), los exponentes y las unidades no son un orden de sección válido; harían inválido el orden de la indicación del sistema. Lo introducido fue","orderProblemRange":"El peso del orden de sección debe ser un entero entre -1000000000 y 1000000000.","orderSaved":"Orden de sección guardado","hintLabel":"Descripción","unnamed":"Sin nombre","clearDraft":"Limpiar","historyTitle":"Historial de conversación de la persona","historySubtitle":"Una «conversación ya ocurrida» que se guarda junto con esta persona. Al elegir la persona, en el primer paso de una conversación nueva el historial se inyecta como contexto del lado user; una conversación ya inyectada no se vuelve a inyectar, o se reiniciaría la caché de toda la conversación. Si necesitas heredar el historial al cambiar de persona en una sesión ya iniciada, puedes escribir el historial dentro del texto de la persona, pero el resultado no es bueno y no lo recomiendo.","historyTabEdit":"Edición manual","historyTabImport":"Importar registro de sesión","historyFormatHint":"Formato por defecto:\nEl contenido del lado del usuario se envuelve en <user_message>; el razonamiento del modelo en <thinking>, y el contenido de la conversación en <assistant_message>; el contenido no conversacional o multimodal de ambos lados se envuelve en <file>. La etiqueta de cierre lleva «/» (por ejemplo, <user_message>Hola</user_message> significa que el usuario envió «Hola»).\nEste formato solo se aplica a modelos con razonamiento, como deepseek","historyThinkingLabel":"Importar el razonamiento","historyCompactLabel":"Expandir la compactación del texto original","historyCompactHint":"Por defecto solo se importa al cuadro el resumen compactado encerrado en <compacted-summary>…</compacted-summary> (con etiquetas, copiado literal), y a continuación la conversación **posterior al último resumen**; el contenido normal anterior al resumen y entre dos resúmenes no se importa. Al marcarlo se invierte: se importa **todo el texto excepto** esos resúmenes compactados, es decir, se expande la compactación al original. Esto y «Importar el razonamiento» son independientes: aquello decide si entra el <thinking> del modelo, esto decide si se conservan los resúmenes o el resto del texto, y ambos se aplican juntos. Si el texto importado no tiene resúmenes compactados, con o sin marca es el texto completo y solo se avisa de que «este historial aún no se ha compactado».","historyCompactNone":"Este historial aún no se ha compactado","historyCompactNoImport":"Aún no se ha importado ningún registro de sesión: esta casilla solo afecta al texto importado.","historyTokenCost":"Aumento","historyImportButton":"Importar session.vN.jsonl / .zip","historyImportHint":"Admite el zip exportado por /export, o un session.vN.jsonl / session.jsonl suelto","historyImportConfirm":"El cuadro ya tiene contenido; al importar se reemplazará. ¿Continuar?","historyImportEmpty":"Este archivo no contiene conversación utilizable (no se reconoció ni un user/message ni un assistant/message).","historyImportFailed":"Error al importar","historyChars":"caracteres","historyBytes":"bytes","historyClearButton":"Borrar historial","historyUndoButton":"Deshacer","historySaved":"Historial de conversación guardado","historyCleared":"Historial de conversación borrado","historyDirtyHint":"Hay cambios sin guardar","historyStored":"Esta persona tiene historial de conversación","historyNotStored":"Esta persona aún no tiene historial de conversación","historyMissing":"El contenido del historial de esta persona ya no existe; solo queda un registro","historyInjectedCount":"Entradas de historial ya inyectadas","historyPlaceholder":"Escribe aquí el historial, o cambia a «Importar registro de sesión» para leerlo de un archivo…","personaSaved":"Persona guardada","saveFailed":"Error al guardar:","nothingToSave":"No hay cambios que guardar.","saving":"Guardando…","emptyPersonaName":"El nombre de la persona no puede estar vacío.","unsavedTitle":"Sin guardar:","unsavedPersona":"Persona (nombre / texto)","unsavedOrder":"Peso del orden de sección","unsavedHistory":"Historial de conversación","switchConfirm":"Cambiar de persona descartará estos cambios sin guardar:","switchConfirmTail":"¿Continuar?","scopeTabCurrent":"Actual","scopeTabGlobal":"Global","scopeSession":"Sesión","scopeLayerCurrent":"Esta sesión","scopeLayerGlobal":"Global","pickerLayerHint":"Actual: ajustes de esta conversación · Global: ajustes que siguen las conversaciones nuevas","indicatorYellowHistory":"Amarillo: el historial guardado con esta persona ha cambiado; esta sesión mantiene el contenido antiguo.","indicatorRedPersonaMissing":"Rojo: la persona elegida fue eliminada; elige otra.","indicatorYellowNotCarried":"Amarillo: esta sesión ya conversó, así que el historial no se inyecta.","dismissFailed":"No se pudo cerrar: ","staleServer":"Los archivos del plugin son {client}, pero el servidor sigue en {server}. Reinicia el motor de la app para que este botón funcione.","cacheResetPending":"Amarillo: el próximo mensaje restablece la caché","indicatorYellowDropped":"Amarillo: el texto de la persona no entró en el prompt; el modo de esta sesión lo dejó fuera del ensamblado."};
    const fr = {"nav":"Personas","pickerLabel":"Persona","off":"Ne pas injecter","title":"Gestion des personas","listTitle":"Liste des personas","newPersona":"Nouveau","importButton":"Importer","importHint":"Lire un fichier produit par l’export de ce plugin (.json, ou le .png de « Exporter l’image ») : texte de la persona, poids d’ordre de section et historique de conversation entrent ensemble et sont ajoutés comme **nouvelles personas** à la liste (les entrées existantes ne sont jamais écrasées).","importFailed":"Échec de l’import","importEmpty":"Aucune persona importable dans ce fichier (ni tableau « personas », ni objet persona seul).","importDone":"Importé","importSkipped":"Ignoré","exportButton":"Exporter","exportHint":"Exporter la persona de la zone d’édition (texte + poids d’ordre de section + historique) sous forme de fichier : JSON brut, ou enfermé dans un PNG que vous choisissez.","exportJson":"Exporter le JSON","exportJsonHint":"Exporter en .json : JSON brut, sans compression, sans perte (les retours à la ligne et les guillemets sont échappés, donc le fichier ne peut qu’être plus gros que l’original).","exportPng":"Choisir un PNG, y injecter et enregistrer une copie","exportPngHint":"Choisissez un PNG comme couverture ; les mêmes données sont enfermées dans l’image et téléchargées avec elle. L’image elle-même ne change pas d’un octet et tout visualiseur normal l’affiche.","exportPngBad":"Ce fichier n’est pas un PNG. L’export d’image exige un PNG en couverture : JPEG/WebP n’ont pas les chunks annexes qu’un décodeur ignore, et la conversion ré-encoderait l’image, donc on refuse ici.","exportPngBroken":"Ce PNG est structurellement incomplet (IHDR illisible) ; essayez-en un autre.","exportTooBig":"Fichier trop gros : au-delà de la limite de 32 Mo par export.","exportNameMayDiffer":"(canal de téléchargement indisponible ; le système peut renommer le fichier)","exportNotTaken":"Impossible de confirmer le téléchargement du fichier (navigateur bloquant ou téléchargeur ne l’ayant pas récupéré) ; vérifiez le dossier de téléchargement, sinon recliquez.","importPngNoData":"Aucune donnée de persona dans cette image (chunk iTXt de ce plugin introuvable).","importPngBadCrc":"Les données de persona de cette image échouent à la vérification (CRC incohérent) ; le fichier a été modifié.","exportDone":"Exporté","exportFailed":"Échec de l’export","exportNoBrowser":"Cet environnement ne permet pas de télécharger des fichiers ; export annulé.","exportRefusedNew":"Export impossible : la nouvelle persona n’est pas encore enregistrée","exportConfirmDirty":"La persona sélectionnée a des modifications non enregistrées ; l’export portera sur le contenu d’avant l’enregistrement. Continuer ?","activate":"Utiliser","builtin":"Intégrée","builtinReadonly":"Les personas intégrées sont en lecture seule. Pour les modifier, utilisez « Dupliquer en nouvelle persona » et éditez la copie.","name":"Nom","text":"Texte","save":"Enregistrer","del":"Supprimer","confirmDelete":"Supprimer cette persona ? Cette action est irréversible.","confirmOk":"OK","confirmCancel":"Annuler","activated":"Persona changée ; prise en compte au tour suivant","activatedNamed":"Persona changée : %s ; prise en compte au tour suivant","deactivated":"Injection de persona désactivée","deleted":"Persona supprimée","chars":"caractères","path":"Fichier de données","applied":"Dernier assemblage : injectée","dropped":"Dernier assemblage : non injectée","droppedHint":"L’agent preset de cette session déclare complete: true (c’est le cas du « mode minimal » intégré à DSH) ; la plateforme compresse l’assemblage en une seule section et celle du plugin n’entre pas. Revenez au mode standard.","neverApplied":"Aucun assemblage observé pour l’instant. Envoyez un message puis revenez voir.","assemblyGlobalScope":"Cette page est un réglage global : le résultat de l’assemblage n’existe que dans une conversation concrète","noPersona":"Dernier assemblage : aucune persona à injecter cette fois","noPersonaHint":"Aucune persona n’est sélectionnée dans cette session (« Ne pas injecter » choisi, ou texte de la persona vide), donc il n’y a rien à mettre dans l’invite système cette fois. C’est le résultat du choix actuel, pas quelque chose qui aurait été évincé.","orderTrace":"Ordre réel des sections du dernier assemblage","switchesTitle":"Interrupteurs de suppression d’entrée","switchesHint":"Les quatre interrupteurs suppriment chacun l’un des quatre types d’entrée côté système visibles par le modèle. Tous activés et aucune persona = chat pur (zéro injection côté système), l’équivalent du point de départ de l’offre gratuite web.","swSoloLabel":"Ne charger que la persona (bloquer toutes les autres sections de l’invite système)","swSoloHint":"L’identité du harness, la persona du déploiement, les guides d’outils, la stratégie du mode plan, l’explication du code du harness, etc. ne sont plus envoyés. Sans persona choisie, l’invite système est vide.","swRuntimeLabel":"Bloquer le contexte runtime","swRuntimeHint":"Deux choses : ① le contexte dynamique qui apparaît en instantanés au rôle user (politique de sandbox, d’approbation, règles de délégation, etc.) ; ② l’instantané runtime et le catalogue de skills encadrés par `<system-reminder>` (ils apparaissent vraiment en mode créatif, car son preset embarque son propre catalogue de skills). Ni l’un ni l’autre n’est dans l’invite système (donc « Ne charger que la persona » ne les atteint pas) ; on ne peut les filtrer que par origine avant l’assemblage — cet interrupteur supprime les deux.","swToolsLabel":"Bloquer le schéma des outils","swToolsHint":"Les définitions d’outils passent par un champ distinct du wire, pas par l’invite système, et représentent souvent le plus gros des tokens. Une fois supprimées, le modèle n’a plus aucun outil appelable.","swInjectedLabel":"Supprimer les injections d’historique (chaîne d’instructions de l’espace de travail / lectures d’heure)","swInjectedHint":"La ligne de base de la chaîne d’instructions AGENTS.md / CLAUDE.md, et les lectures d’heure que dsh-time-context ajoute à chaque étape. Ce sont aussi des messages user ajoutés à l’historique par des plugins, pas des sections d’invite ; on ne peut les filtrer précisément que par origine.","pureChatButton":"Un clic pour le chat pur","restoreButton":"Restaurer les entrées système","pureChatHint":"Retirer la sélection de persona et activer les quatre interrupteurs","pureChatState":"Vous êtes en chat pur : zéro injection côté système, le modèle ne voit que vos messages.","pureChatOn":"Passé en chat pur","restoreDone":"Entrées système restaurées : les quatre interrupteurs désactivés","switchesSaved":"Interrupteurs enregistrés ; effet au tour suivant","strippedMessages":"Messages injectés filtrés dans cette conversation","stripStatusTitle":"Blocs d’injection système (filtrés dans cette session)","stripKindRuntime":"Instantané runtime","stripKindSkill":"Catalogue de skills","stripKindInstructions":"Chaîne d’instructions de l’espace de travail","stripKindTime":"Lectures d’heure","soloNoPersona":"« Ne charger que la persona » est actif, mais aucune persona n’est choisie — l’invite système sera vide.","soloSavings":"Taille en ne gardant que la persona","sectionsUnit":"sections","toolBaselineEmpty":"La ligne de base des déclarations d’outils de cette session est vide : la première requête n’avait aucun outil. Les outils qui reviennent ensuite seront marqués en chargement différé et le provider les refusera (INVALID_REQUEST). Pour retrouver les outils, ouvrez une nouvelle conversation.","indicatorGreen":"Vert : normal. La ligne de base des déclarations d’outils est disponible.","indicatorRed":"Rouge : cette session n'a pas de base d'outils ; ouvrez une nouvelle conversation.","storeError":"Échec de lecture du fichier de données","warningsSummary":"Situations à surveiller","warningsShow":"Déplier","warningsHide":"Replier","warningsDismiss":"Fermer ces messages","warningsDismissed":"Messages d’exécution fermés","loading":"Chargement…","retry":"Réessayer","chunkFailed":"Cette partie de l’interface n’a pas pu être chargée","createHint":"Création en cours (non enregistrée)","editHint":"En cours d’édition","blankText":"Le texte est vide ; l’enregistrement sera refusé.","blankSaveRefused":"Enregistrement refusé : le texte de la persona est vide ; pour une persona vide, utilisez « Ne pas injecter »","orderLabel":"Poids d’ordre de section","orderHint":"Poids d’ordre de la section persona dans l’invite système : plus petit = plus tôt (par défaut -1, avant la phrase « You are a coding agent… » du preset). Il ne décide que de l’ordre des sections et n’entre pas dans le texte de la persona. Chaque persona retient son propre poids, et ce champ suit le changement de persona ; l’effet vient après « Enregistrer », qui vérifie qu’il s’agit d’un entier.","orderDefaultButton":"Par défaut","orderFollowButton":"Suivre","orderFollowText":"Ajouter après l’invite système","orderFollowHint":"Placer le poids derrière toutes les sections de l’invite système (même procédé que la gestion des prompts) ; cliquer dans le champ permet de revenir à une valeur numérique. Effet après « Enregistrer ».","orderProblemEmpty":"Le poids d’ordre de section ne peut pas être vide : saisissez un entier, ou cliquez sur « Par défaut »/« Suivre ».","orderProblemInteger":"Le poids d’ordre de section doit être un entier (par exemple -1, 0, 10200) : les décimales (0.1), les exposants et les unités ne sont pas un ordre de section valide — cela rendrait l’ordre de l’invite système invalide. Saisi :","orderProblemRange":"Le poids d’ordre de section doit être un entier entre -1000000000 et 1000000000.","orderSaved":"Ordre de section enregistré","hintLabel":"Description","unnamed":"Sans nom","clearDraft":"Effacer","historyTitle":"Historique de conversation de la persona","historySubtitle":"Une « conversation déjà passée » enregistrée avec cette persona. Quand la persona est choisie, le premier pas d’une nouvelle conversation injecte cet historique comme contexte côté user ; une conversation déjà injectée ne l’est plus (sinon le cache de toute la conversation serait réinitialisé). Pour hériter de l’historique en changeant de persona dans une session déjà engagée, vous pouvez l’écrire dans le texte de la persona, mais le résultat est médiocre et je ne le recommande pas.","historyTabEdit":"Édition manuelle","historyTabImport":"Importer un journal de session","historyFormatHint":"Écriture par défaut :\nLe contenu du côté utilisateur est encadré par <user_message> ; le raisonnement du modèle par <thinking>, le contenu de conversation par <assistant_message> ; le contenu non conversationnel ou multimodal des deux côtés par <file>. La balise de fermeture porte « / » (par exemple <user_message>Bonjour</user_message> signifie que l’utilisateur a envoyé « Bonjour »).\nCe format ne s’applique qu’aux modèles gérant le raisonnement, comme deepseek","historyThinkingLabel":"Importer le raisonnement","historyCompactLabel":"Déplier la compaction du texte original","historyCompactHint":"Par défaut, seul le résumé compacté encadré par <compacted-summary>…</compacted-summary> entre dans le champ (balises comprises, copié tel quel), suivi de la conversation **après le dernier résumé** ; le contenu ordinaire avant le résumé et entre deux résumés n’est pas importé. Coché, c’est l’inverse : tout le texte **sauf** ces résumés compactés est importé — la compaction est redépliée en original. Ceci et « Importer le raisonnement » sont indépendants : l’autre décide si le <thinking> du modèle entre, celui-ci décide si l’on garde les résumés ou le reste du texte ; les deux se cumulent. Si le texte importé n’a aucun résumé compacté, coché ou non ce sera le texte complet, avec juste la mention « cet historique n’a pas encore été compacté ».","historyCompactNone":"Cet historique n’a pas encore été compacté","historyCompactNoImport":"Aucun journal de session importé pour l’instant : cette case ne traite que le texte importé.","historyTokenCost":"Supplément","historyImportButton":"Importer session.vN.jsonl / .zip","historyImportHint":"Accepte le zip exporté par /export, ou un session.vN.jsonl / session.jsonl seul","historyImportConfirm":"Le champ contient déjà du texte ; l’import le remplacera. Continuer ?","historyImportEmpty":"Aucun contenu de conversation exploitable dans ce fichier (ni user/message ni assistant/message reconnu).","historyImportFailed":"Échec de l’import","historyChars":"caractères","historyBytes":"octets","historyClearButton":"Effacer l’historique","historyUndoButton":"Annuler","historySaved":"Historique de conversation enregistré","historyCleared":"Historique de conversation effacé","historyDirtyHint":"Modifications non enregistrées","historyStored":"Cette persona a un historique de conversation","historyNotStored":"Cette persona n’a pas encore d’historique de conversation","historyMissing":"Le contenu de l’historique de cette persona n’existe plus ; il ne reste qu’une trace","historyInjectedCount":"Entrées d’historique déjà injectées","historyPlaceholder":"Écrivez ici l’historique, ou passez à « Importer un journal de session » pour le lire depuis un fichier…","personaSaved":"Persona enregistrée","saveFailed":"Échec de l’enregistrement :","nothingToSave":"Aucune modification à enregistrer.","saving":"Enregistrement…","emptyPersonaName":"Le nom de la persona ne peut pas être vide.","unsavedTitle":"Non enregistré :","unsavedPersona":"Persona (nom / texte)","unsavedOrder":"Poids d’ordre de section","unsavedHistory":"Historique de conversation","switchConfirm":"Changer de persona perdra ces modifications non enregistrées :","switchConfirmTail":"Continuer ?","scopeTabCurrent":"Actuel","scopeTabGlobal":"Global","scopeSession":"Session","scopeLayerCurrent":"Cette session","scopeLayerGlobal":"Global","pickerLayerHint":"Actuel : réglages de cette conversation · Global : réglages suivis par les nouvelles conversations","indicatorYellowHistory":"Jaune : l'historique enregistré avec cette persona a été modifié ; cette session garde l'ancien contenu.","indicatorRedPersonaMissing":"Rouge : la persona sélectionnée a été supprimée ; choisissez-en une autre.","indicatorYellowNotCarried":"Jaune : cette session a déjà conversé, l'historique n'est donc pas injecté.","dismissFailed":"Fermeture impossible : ","staleServer":"Les fichiers du plugin sont en {client} mais le serveur tourne encore en {server}. Redémarrez le moteur de l’app pour que ce bouton fonctionne.","cacheResetPending":"Jaune : le prochain message réinitialise le cache","indicatorYellowDropped":"Jaune : le texte de la persona n'est pas entré dans le prompt ; le mode de cette session l'a laissé hors de l'assemblage."};
    const de = {"nav":"Personas","pickerLabel":"Persona","off":"Nicht injizieren","title":"Persona-Verwaltung","listTitle":"Persona-Liste","newPersona":"Neu","importButton":"Importieren","importHint":"Liest eine Datei aus dem Export dieses Plugins (.json oder das .png aus „Bild exportieren“): Persona-Text, Abschnittsreihenfolge-Gewicht und Gesprächsverlauf kommen zusammen herein und werden als **neue Personas** an die Liste angehängt (vorhandene Einträge werden nie überschrieben).","importFailed":"Import fehlgeschlagen","importEmpty":"Keine importierbare Persona in dieser Datei (weder ein personas-Array noch ein einzelnes Persona-Objekt).","importDone":"Importiert","importSkipped":"Übersprungen","exportButton":"Exportieren","exportHint":"Exportiert die Persona im Editor (Text + Abschnittsreihenfolge-Gewicht + Gesprächsverlauf) als Datei: reines JSON oder in ein selbst gewähltes PNG gepackt.","exportJson":"JSON exportieren","exportJsonHint":"Als .json exportieren: reines JSON, unkomprimiert, verlustfrei (Zeilenumbrüche und Anführungszeichen werden maskiert, die Datei wird also nur größer als das Original).","exportPng":"PNG wählen, einbetten und als Kopie speichern","exportPngHint":"Ein PNG als Cover wählen; dieselben Daten werden in das Bild gepackt und mit ihm heruntergeladen. Das Bild selbst bleibt bytegleich und jeder normale Betrachter zeigt es weiterhin an.","exportPngBad":"Diese Datei ist kein PNG. Der Bild-Export braucht ein PNG als Cover — JPEG/WebP haben keine Zusatz-Chunks, die ein Decoder überspringt, und eine Umwandlung würde das Bild neu kodieren, daher wird das hier abgelehnt.","exportPngBroken":"Dieses PNG ist strukturell unvollständig (kein lesbarer IHDR); versuche ein anderes.","exportTooBig":"Die Datei ist zu groß — über dem Limit von 32 MB pro Export.","exportNameMayDiffer":"(Download-Kanal nicht verfügbar; das System kann die Datei umbenennen)","exportNotTaken":"Der Download ließ sich nicht bestätigen (Browser hat ihn vielleicht blockiert oder der Downloader hat ihn nicht abgeholt) — schau im Download-Ordner nach und klicke sonst erneut.","importPngNoData":"Dieses Bild enthält keine Persona-Daten (kein iTXt-Chunk dieses Plugins gefunden).","importPngBadCrc":"Die Persona-Daten dieses Bildes bestehen die Prüfung nicht (CRC stimmt nicht) — die Datei wurde verändert.","exportDone":"Exportiert","exportFailed":"Export fehlgeschlagen","exportNoBrowser":"Diese Umgebung unterstützt keine Datei-Downloads; Export abgebrochen.","exportRefusedNew":"Export nicht möglich: Die neue Persona ist noch nicht gespeichert","exportConfirmDirty":"Die Bearbeitung der ausgewählten Persona ist nicht gespeichert; exportiert wird der Stand vor dem Speichern. Weiter?","activate":"Verwenden","builtin":"Integriert","builtinReadonly":"Integrierte Personas sind schreibgeschützt. Zum Ändern „Als neue Persona duplizieren“ und die Kopie bearbeiten.","name":"Name","text":"Text","save":"Speichern","del":"Löschen","confirmDelete":"Diese Persona löschen? Das lässt sich nicht rückgängig machen.","confirmOk":"OK","confirmCancel":"Abbrechen","activated":"Persona gewechselt; wirksam ab der nächsten Runde","activatedNamed":"Persona gewechselt: %s; wirksam ab der nächsten Runde","deactivated":"Persona-Injektion deaktiviert","deleted":"Persona gelöscht","chars":"Zeichen","path":"Datendatei","applied":"Letzte Zusammenstellung: injiziert","dropped":"Letzte Zusammenstellung: nicht injiziert","droppedHint":"Das agent preset dieser Sitzung deklariert complete: true (so ist der integrierte „Minimal-Modus“ von DSH); die Plattform komprimiert die Zusammenstellung auf einen Abschnitt, der Plugin-Abschnitt passt nicht hinein. Wechsle zurück in den Standardmodus.","neverApplied":"Noch keine Zusammenstellung beobachtet. Sende eine Nachricht und schau dann nach.","assemblyGlobalScope":"Diese Seite ist eine globale Einstellung: Das Ergebnis der Zusammenstellung gibt es nur in konkreten Gesprächen","noPersona":"Letzte Zusammenstellung: diesmal gibt es keine Persona zum Injizieren","noPersonaHint":"In dieser Sitzung ist keine Persona gewählt („Nicht injizieren“ gewählt oder der Text der gewählten Persona ist leer), daher gibt es diesmal nichts für die Systemanweisung. Das ist das Ergebnis der aktuellen Auswahl und nicht das Werk von etwas, das sie verdrängt hätte.","orderTrace":"Tatsächliche Abschnittsreihenfolge der letzten Zusammenstellung","switchesTitle":"Eingabeunterdrückungs-Schalter","switchesHint":"Die vier Schalter unterdrücken je eine der vier systemseitigen Eingabearten, die das Modell sieht. Alle an und keine Persona = reiner Chat (null systemseitige Injektion), der Ausgangspunkt der kostenlosen Web-Version.","swSoloLabel":"Nur die Persona laden (alle anderen Systemanweisungs-Abschnitte blockieren)","swSoloHint":"Harness-Identität, Deployment-Persona, Tool-Anleitungen, Plan-Modus-Strategie, Harness-Quellcode-Erklärung usw. werden nicht mehr gesendet. Ohne gewählte Persona ist die Systemanweisung leer.","swRuntimeLabel":"Runtime-Kontext blockieren","swRuntimeHint":"Zwei Dinge: ① dynamischer Kontext als Momentaufnahmen mit user-Rolle (Sandbox-Richtlinie, Genehmigungsrichtlinie, Delegationsregeln usw.); ② die in `<system-reminder>` eingefasste Runtime-Momentaufnahme und der Skill-Katalog (im Kreativmodus erscheinen sie wirklich, weil dessen Preset einen eigenen Skill-Katalog mitbringt). Beides steht nicht in der Systemanweisung (deshalb erreicht „Nur die Persona laden“ sie nicht) und lässt sich nur vor der Zusammenstellung nach Herkunft filtern — dieser Schalter unterdrückt beides.","swToolsLabel":"Tool-Schema blockieren","swToolsHint":"Tool-Definitionen laufen über ein eigenes Feld auf dem Wire, nicht über die Systemanweisung, und sind meist der größte Token-Anteil. Unterdrückt hat das Modell keine aufrufbaren Tools mehr.","swInjectedLabel":"Verlaufsinjektionen unterdrücken (Arbeitsbereich-Anweisungskette / Zeitablesungen)","swInjectedHint":"Die Basislinie der Anweisungskette aus AGENTS.md / CLAUDE.md und die Zeitablesungen, die dsh-time-context bei jedem Schritt anhängt. Auch das sind user-Nachrichten, die Plugins an den Verlauf anhängen, keine Anweisungs-Abschnitte; sie lassen sich nur nach Herkunft genau filtern.","pureChatButton":"Ein Klick für reinen Chat","restoreButton":"Systemeingaben wiederherstellen","pureChatHint":"Persona-Auswahl aufheben und alle vier Schalter einschalten","pureChatState":"Du bist im reinen Chat: null systemseitige Injektion, das Modell sieht nur deine Nachrichten.","pureChatOn":"Auf reinen Chat umgestellt","restoreDone":"Systemeingaben wiederhergestellt: alle vier Schalter aus","switchesSaved":"Schalter gespeichert; wirksam ab der nächsten Runde","strippedMessages":"In diesem Gespräch gefilterte injizierte Nachrichten","stripStatusTitle":"System-Injektionsblöcke (in dieser Sitzung gefiltert)","stripKindRuntime":"Runtime-Momentaufnahme","stripKindSkill":"Skill-Katalog","stripKindInstructions":"Arbeitsbereich-Anweisungskette","stripKindTime":"Zeitablesungen","soloNoPersona":"„Nur die Persona laden“ ist an, aber keine Persona gewählt — die Systemanweisung bleibt leer.","soloSavings":"Größe, wenn nur die Persona bleibt","sectionsUnit":"Abschnitte","toolBaselineEmpty":"Die Tool-Deklarationsbasislinie dieser Sitzung ist leer — in der ersten Anfrage dieser Sitzung war kein einziges Tool. Später zurückkommende Tools werden als verzögert geladen markiert und der Provider lehnt sie ab (INVALID_REQUEST). Um die Tools zurückzubekommen, öffne ein neues Gespräch.","indicatorGreen":"Grün: normal. Die Tool-Deklarationsbasislinie ist nutzbar.","indicatorRed":"Rot: Diese Sitzung hat keine Werkzeug-Basislinie; öffne ein neues Gespräch.","storeError":"Datendatei konnte nicht gelesen werden","warningsSummary":"Beachtenswerte Situationen","warningsShow":"Aufklappen","warningsHide":"Zuklappen","warningsDismiss":"Diese Hinweise schließen","warningsDismissed":"Laufzeithinweise geschlossen","loading":"Wird geladen…","retry":"Erneut versuchen","chunkFailed":"Dieser Teil der Oberfläche konnte nicht geladen werden","createHint":"Wird erstellt (noch nicht gespeichert)","editHint":"Wird bearbeitet","blankText":"Der Text ist leer; das Speichern wird abgelehnt.","blankSaveRefused":"Speichern abgelehnt: Der Persona-Text ist leer; für eine leere Persona „Nicht injizieren“ verwenden","orderLabel":"Gewicht der Abschnittsreihenfolge","orderHint":"Sortiergewicht des Persona-Abschnitts in der Systemanweisung: kleiner = weiter vorn (Standard -1, vor dem preset-Satz „You are a coding agent…“). Es bestimmt nur die Abschnittsreihenfolge und geht nicht in den Persona-Text ein. Jede Persona merkt sich ihr eigenes Gewicht, und dieses Feld wechselt mit; wirksam wird es nach „Speichern“, das auf Ganzzahl prüft.","orderDefaultButton":"Standard","orderFollowButton":"Folgen","orderFollowText":"Nach der Systemanweisung anhängen","orderFollowHint":"Setzt das Gewicht hinter alle Systemanweisungs-Abschnitte (dieselbe Methode wie die Prompt-Verwaltung); ein Klick ins Feld stellt den Zahlenwert wieder her. Wirksam nach „Speichern“.","orderProblemEmpty":"Das Gewicht der Abschnittsreihenfolge darf nicht leer sein: eine Ganzzahl eingeben oder „Standard“/„Folgen“ klicken.","orderProblemInteger":"Das Gewicht der Abschnittsreihenfolge muss eine Ganzzahl sein (z. B. -1, 0, 10200): Dezimalzahlen (0.1), Exponenten und Einheiten sind keine gültige Abschnittsreihenfolge — sie machen die Reihenfolge der Systemanweisung ungültig. Eingeben wurde","orderProblemRange":"Das Gewicht der Abschnittsreihenfolge muss eine Ganzzahl zwischen -1000000000 und 1000000000 sein.","orderSaved":"Abschnittsreihenfolge gespeichert","hintLabel":"Beschreibung","unnamed":"Unbenannt","clearDraft":"Leeren","historyTitle":"Persona-Gesprächsverlauf","historySubtitle":"Ein „bereits stattgefundenes Gespräch“, das mit dieser Persona gespeichert wird. Beim Wählen der Persona wird der Verlauf im ersten Schritt eines neuen Gesprächs als user-seitiger Kontext injiziert; ein bereits injizierter Verlauf wird nicht erneut injiziert, sonst würde der Cache des ganzen Gesprächs zurückgesetzt. Willst du den Verlauf beim Persona-Wechsel in einer laufenden Sitzung übernehmen, kannst du ihn in den Persona-Text schreiben — das Ergebnis ist aber schlecht, ich rate davon ab.","historyTabEdit":"Manuell bearbeiten","historyTabImport":"Sitzungsprotokoll importieren","historyFormatHint":"Standardschreibweise:\nInhalte der Nutzerseite in <user_message> einfassen; Denkinhalte des Modells in <thinking>, Gesprächsinhalte in <assistant_message>; nicht-konversationelle oder multimodale Inhalte beider Seiten in <file>. Das schließende Tag trägt „/“ (z. B. <user_message>Hallo</user_message> heißt, der Nutzer hat „Hallo“ gesendet).\nDieses Format gilt nur für Modelle mit Denkfähigkeit, etwa deepseek","historyThinkingLabel":"Denkprozess importieren","historyCompactLabel":"Kompaktierung des Originaltexts aufklappen","historyCompactHint":"Standardmäßig kommt nur die in <compacted-summary>…</compacted-summary> eingefasste komprimierte Zusammenfassung ins Feld (samt Tags, wörtlich kopiert), danach das Gespräch **nach der letzten Zusammenfassung**; gewöhnlicher Inhalt vor der Zusammenfassung und zwischen zwei Zusammenfassungen wird nicht importiert. Mit Haken ist es umgekehrt: Es kommt der ganze Text **außer** diesen komprimierten Zusammenfassungen — die Kompaktierung wird zum Original zurückgeklappt. Das und „Denkprozess importieren“ sind unabhängig: Letzteres entscheidet, ob das <thinking> des Modells mitkommt, dieses entscheidet, ob die Zusammenfassungen oder der Rest bleiben; beides wirkt zusammen. Enthält der importierte Text keine Zusammenfassung, ist es mit oder ohne Haken der volle Text, nur mit dem Hinweis „dieser Verlauf wurde noch nicht komprimiert“.","historyCompactNone":"Dieser Gesprächsverlauf wurde noch nicht komprimiert","historyCompactNoImport":"Noch kein Sitzungsprotokoll importiert: Dieses Kästchen behandelt nur importierten Text.","historyTokenCost":"Zuwachs","historyImportButton":"session.vN.jsonl / .zip importieren","historyImportHint":"Unterstützt das von /export erzeugte zip oder eine einzelne session.vN.jsonl / session.jsonl","historyImportConfirm":"Das Feld enthält bereits Text; der Import ersetzt ihn. Weiter?","historyImportEmpty":"Kein verwertbarer Gesprächsinhalt in dieser Datei (weder user/message noch assistant/message erkannt).","historyImportFailed":"Import fehlgeschlagen","historyChars":"Zeichen","historyBytes":"Bytes","historyClearButton":"Verlauf löschen","historyUndoButton":"Rückgängig","historySaved":"Gesprächsverlauf gespeichert","historyCleared":"Gesprächsverlauf geleert","historyDirtyHint":"Ungespeicherte Änderungen","historyStored":"Diese Persona hat einen Gesprächsverlauf","historyNotStored":"Diese Persona hat noch keinen Gesprächsverlauf","historyMissing":"Der Verlaufsinhalt dieser Persona existiert nicht mehr; nur ein Eintrag ist übrig","historyInjectedCount":"Bereits injizierte Verlaufseinträge","historyPlaceholder":"Schreibe hier den Verlauf oder wechsle zu „Sitzungsprotokoll importieren“, um ihn aus einer Datei zu lesen…","personaSaved":"Persona gespeichert","saveFailed":"Speichern fehlgeschlagen:","nothingToSave":"Keine Änderungen zum Speichern.","saving":"Speichern…","emptyPersonaName":"Der Persona-Name darf nicht leer sein.","unsavedTitle":"Noch nicht gespeichert:","unsavedPersona":"Persona (Name / Text)","unsavedOrder":"Gewicht der Abschnittsreihenfolge","unsavedHistory":"Gesprächsverlauf","switchConfirm":"Beim Persona-Wechsel gehen diese ungespeicherten Änderungen verloren:","switchConfirmTail":"Weiter?","scopeTabCurrent":"Aktuell","scopeTabGlobal":"Global","scopeSession":"Sitzung","scopeLayerCurrent":"Diese Sitzung","scopeLayerGlobal":"Global","pickerLayerHint":"Aktuell: Einstellungen dieses Gesprächs · Global: Einstellungen, denen neue Gespräche folgen","indicatorYellowHistory":"Gelb: Der mit dieser Persona gespeicherte Verlauf wurde geändert; diese Sitzung behält den alten Inhalt.","indicatorRedPersonaMissing":"Rot: Die gewählte Persona wurde gelöscht; wähle eine andere.","indicatorYellowNotCarried":"Gelb: Diese Sitzung hat bereits Gespräche, daher wird der Verlauf nicht injiziert.","dismissFailed":"Schließen fehlgeschlagen: ","staleServer":"Die Plugin-Dateien sind {client}, der Server läuft aber noch auf {server}. Starte die App-Engine neu, damit dieser Knopf wirkt.","cacheResetPending":"Gelb: Die nächste Nachricht setzt den Cache zurück","indicatorYellowDropped":"Gelb: Der Persona-Text ist nicht im Prompt gelandet; der Modus dieser Sitzung hat ihn aus der Zusammenstellung ausgelassen."};
    const ru = {"nav":"Персоны","pickerLabel":"Персона","off":"Не внедрять","title":"Управление персонами","listTitle":"Список персон","newPersona":"Создать","importButton":"Импорт","importHint":"Читает файл, созданный экспортом этого плагина (.json или .png из «Экспортировать изображение»): текст персоны, вес порядка секции и история переписки попадают вместе и добавляются в список как **новые персоны** (существующие записи никогда не перезаписываются).","importFailed":"Не удалось импортировать","importEmpty":"В этом файле нет импортируемых персон (ни массива personas, ни отдельного объекта персоны).","importDone":"Импортировано","importSkipped":"Пропущено","exportButton":"Экспорт","exportHint":"Экспортирует персону из редактора (текст + вес порядка секции + история переписки) в файл: чистый JSON или упаковано в выбранный вами PNG.","exportJson":"Экспортировать JSON","exportJsonHint":"Экспорт в .json: чистый JSON, без сжатия, без потерь (переводы строк и кавычки экранируются, поэтому файл может быть только больше исходника).","exportPng":"Выбрать PNG, внедрить и сохранить копию","exportPngHint":"Выберите PNG как обложку; те же данные упаковываются в изображение и скачиваются вместе с ним. Само изображение не меняется ни на байт, и любой обычный просмотрщик его показывает.","exportPngBad":"Этот файл не PNG. Для экспорта изображения нужен PNG как обложка — у JPEG/WebP нет вспомогательных чанков, которые декодер пропускает, а конвертация перекодировала бы картинку, поэтому здесь это отклоняется.","exportPngBroken":"Структура этого PNG неполна (IHDR не читается); попробуйте другой.","exportTooBig":"Файл слишком большой — превышен лимит 32 МБ на один экспорт.","exportNameMayDiffer":"(канал загрузки недоступен; система может переименовать файл)","exportNotTaken":"Не удалось подтвердить загрузку файла (браузер мог заблокировать, или загрузчик не забрал его) — проверьте папку загрузок, а если файла нет, нажмите ещё раз.","importPngNoData":"В этом изображении нет данных персоны (чанк iTXt этого плагина не найден).","importPngBadCrc":"Данные персоны в этом изображении не проходят проверку (CRC не совпадает), файл изменён.","exportDone":"Экспортировано","exportFailed":"Не удалось экспортировать","exportNoBrowser":"Эта среда не поддерживает скачивание файлов; экспорт отменён.","exportRefusedNew":"Экспорт невозможен: новая персона ещё не сохранена","exportConfirmDirty":"Изменения выбранной персоны не сохранены; будет экспортирован вариант до сохранения. Продолжить?","activate":"Использовать","builtin":"Встроенная","builtinReadonly":"Встроенные персоны доступны только для чтения. Чтобы изменить, используйте «Дублировать как новую персону» и правьте копию.","name":"Имя","text":"Текст","save":"Сохранить","del":"Удалить","confirmDelete":"Удалить эту персону? Действие необратимо.","confirmOk":"ОК","confirmCancel":"Отмена","activated":"Персона переключена; действует со следующего хода","activatedNamed":"Персона переключена: %s; действует со следующего хода","deactivated":"Внедрение персоны отключено","deleted":"Персона удалена","chars":"символов","path":"Файл данных","applied":"Последняя сборка: внедрена","dropped":"Последняя сборка: не внедрена","droppedHint":"agent preset этой сессии объявляет complete: true (так устроен встроенный «минимальный режим» DSH); платформа сжимает сборку в одну секцию, и секция плагина не попадает. Вернитесь в стандартный режим.","neverApplied":"Сборка пока не наблюдалась. Отправьте сообщение и посмотрите снова.","assemblyGlobalScope":"Эта страница — глобальная настройка: результат сборки есть только в конкретном диалоге","noPersona":"Последняя сборка: в этот раз нет персоны для внедрения","noPersonaHint":"В этой сессии персона не выбрана (выбрано «Не внедрять» или текст выбранной персоны пуст), поэтому в этот раз в системную инструкцию нечего положить. Это результат текущего выбора, а не чьего-то вытеснения.","orderTrace":"Реальный порядок секций последней сборки","switchesTitle":"Переключатели подавления ввода","switchesHint":"Четыре переключателя подавляют каждый свой тип системного ввода из четырёх, которые видит модель. Все включены и персона не выбрана = чистый чат (ноль системного внедрения), стартовая точка бесплатной веб-версии.","swSoloLabel":"Загружать только персону (блокировать все остальные секции системной инструкции)","swSoloHint":"Идентичность harness, персона развёртывания, руководства по инструментам, стратегия режима plan, пояснения к исходникам harness и т. п. больше не отправляются. Без выбранной персоны системная инструкция пуста.","swRuntimeLabel":"Блокировать runtime-контекст","swRuntimeHint":"Две вещи: ① динамический контекст в виде снимков с ролью user (политика песочницы, политика подтверждений, правила делегирования и т. п.); ② снимок runtime и каталог skills в `<system-reminder>` (в творческом режиме они реально появляются, потому что его preset несёт собственный каталог skills). Ни то, ни другое не в системной инструкции (поэтому «Загружать только персону» их не достаёт), фильтровать можно только по источнику до сборки — этот переключатель подавляет оба.","swToolsLabel":"Блокировать схему инструментов","swToolsHint":"Определения инструментов идут отдельным полем на wire, не в системной инструкции, и обычно составляют основную часть токенов. После подавления у модели нет ни одного вызываемого инструмента.","swInjectedLabel":"Подавить внедрение истории (цепочка инструкций рабочей области / показания времени)","swInjectedHint":"Базовая линия цепочки инструкций AGENTS.md / CLAUDE.md и показания времени, которые dsh-time-context добавляет на каждом шаге. Это тоже user-сообщения, добавляемые плагинами в историю, а не секции инструкции; фильтровать их точно можно только по источнику.","pureChatButton":"Один клик — чистый чат","restoreButton":"Восстановить системный ввод","pureChatHint":"Снять выбор персоны и включить все четыре переключателя","pureChatState":"Сейчас чистый чат: ноль системного внедрения, модель видит только ваши сообщения.","pureChatOn":"Переключено на чистый чат","restoreDone":"Системный ввод восстановлен: все четыре переключателя выключены","switchesSaved":"Переключатели сохранены; действуют со следующего хода","strippedMessages":"Отфильтровано внедрённых сообщений в этом диалоге","stripStatusTitle":"Блоки системного внедрения (отфильтрованы в этой сессии)","stripKindRuntime":"Снимок runtime","stripKindSkill":"Каталог skills","stripKindInstructions":"Цепочка инструкций рабочей области","stripKindTime":"Показания времени","soloNoPersona":"«Загружать только персону» включено, но персона не выбрана — системная инструкция будет пустой.","soloSavings":"Размер при сохранении только персоны","sectionsUnit":"секций","toolBaselineEmpty":"Базовая линия объявлений инструментов этой сессии пуста — в первом запросе не было ни одного инструмента. Вернувшиеся позже инструменты будут помечены как отложенная загрузка, и провайдер их отклонит (INVALID_REQUEST). Чтобы вернуть инструменты, откройте новый диалог.","indicatorGreen":"Зелёный: норма. Базовая линия объявлений инструментов доступна.","indicatorRed":"Красный: в этой сессии нет базовой линии инструментов; откройте новый диалог.","storeError":"Не удалось прочитать файл данных","warningsSummary":"Ситуации, требующие внимания","warningsShow":"Развернуть","warningsHide":"Свернуть","warningsDismiss":"Закрыть уведомления","warningsDismissed":"Уведомления закрыты","loading":"Загрузка…","retry":"Повторить","chunkFailed":"Эту часть интерфейса не удалось загрузить","createHint":"Создание (не сохранено)","editHint":"Редактирование","blankText":"Текст пуст, сохранение будет отклонено.","blankSaveRefused":"Сохранение отклонено: текст персоны пуст; для пустой персоны используйте «Не внедрять»","orderLabel":"Вес порядка секции","orderHint":"Вес порядка секции персоны в системной инструкции: меньше — раньше (по умолчанию -1, перед фразой preset «You are a coding agent…»). Он определяет только порядок секций и не входит в текст персоны. Каждая персона помнит свой вес, и поле переключается вместе с ней; изменение вступает в силу после «Сохранить», при сохранении проверяется целое число.","orderDefaultButton":"По умолчанию","orderFollowButton":"Следовать","orderFollowText":"Добавить после системной инструкции","orderFollowHint":"Ставит вес после всех секций системной инструкции (тот же приём, что в управлении prompt); щелчок по полю возвращает числовое значение. Вступает в силу после «Сохранить».","orderProblemEmpty":"Вес порядка секции не может быть пустым: введите целое число или нажмите «По умолчанию»/«Следовать».","orderProblemInteger":"Вес порядка секции должен быть целым числом (например, -1, 0, 10200): дроби (0.1), экспоненты и единицы — не допустимый порядок секции, из-за них порядок системной инструкции станет некорректным. Введено:","orderProblemRange":"Вес порядка секции должен быть целым числом от -1000000000 до 1000000000.","orderSaved":"Порядок секции сохранён","hintLabel":"Описание","unnamed":"Без имени","clearDraft":"Очистить","historyTitle":"История переписки персоны","historySubtitle":"«Уже состоявшийся диалог», сохраняемый вместе с этой персоной. При выборе персоны на первом шаге нового диалога история внедряется как контекст со стороны user; уже внедрённая история повторно не внедряется, иначе сбросился бы кэш всего диалога. Если нужно унаследовать историю при смене персоны в уже идущей сессии, можно записать её в текст персоны, но результат неважный, и я так не советую.","historyTabEdit":"Ручное редактирование","historyTabImport":"Импорт журнала сеанса","historyFormatHint":"Запись по умолчанию:\nСодержимое стороны пользователя оборачивается в <user_message>; рассуждения модели — в <thinking>, содержимое диалога — в <assistant_message>; недиалоговое или мультимодальное содержимое обеих сторон — в <file>. Закрывающий тег несёт «/» (например, <user_message>Привет</user_message> означает, что пользователь отправил «Привет»).\nЭтот формат применим только к моделям с рассуждением, например deepseek","historyThinkingLabel":"Импортировать рассуждения","historyCompactLabel":"Развернуть сжатие исходного текста","historyCompactHint":"По умолчанию в поле попадает только сжатое резюме в <compacted-summary>…</compacted-summary> (вместе с тегами, дословно), а затем диалог **после последнего резюме**; обычное содержимое до резюме и между двумя резюме не импортируется. С галочкой наоборот: импортируется весь текст **кроме** этих сжатых резюме — то есть сжатие разворачивается обратно. Это и «Импортировать рассуждения» независимы: то решает, войдут ли <thinking> модели, это — останутся ли резюме или остальной текст; оба действуют вместе. Если в импортируемом тексте нет сжатых резюме, с галочкой или без будет полный текст, лишь с пометкой «эта история ещё не сжималась».","historyCompactNone":"Эта история переписки ещё не сжималась","historyCompactNoImport":"Журнал сеанса ещё не импортирован: этот флажок обрабатывает только импортированный текст.","historyTokenCost":"Прирост","historyImportButton":"Импортировать session.vN.jsonl / .zip","historyImportHint":"Поддерживает zip из /export или отдельный session.vN.jsonl / session.jsonl","historyImportConfirm":"В поле уже есть текст; импорт заменит его. Продолжить?","historyImportEmpty":"В этом файле нет пригодного содержимого диалога (не распознано ни user/message, ни assistant/message).","historyImportFailed":"Не удалось импортировать","historyChars":"символов","historyBytes":"байт","historyClearButton":"Очистить историю","historyUndoButton":"Отменить","historySaved":"История переписки сохранена","historyCleared":"История переписки очищена","historyDirtyHint":"Есть несохранённые изменения","historyStored":"У этой персоны есть история переписки","historyNotStored":"У этой персоны ещё нет истории переписки","historyMissing":"Содержимое истории этой персоны больше не существует, осталась только запись","historyInjectedCount":"Уже внедрённых записей истории","historyPlaceholder":"Напишите здесь историю или переключитесь на «Импорт журнала сеанса», чтобы прочитать её из файла…","personaSaved":"Персона сохранена","saveFailed":"Не удалось сохранить:","nothingToSave":"Нет изменений для сохранения.","saving":"Сохранение…","emptyPersonaName":"Имя персоны не может быть пустым.","unsavedTitle":"Не сохранено:","unsavedPersona":"Персона (имя / текст)","unsavedOrder":"Вес порядка секции","unsavedHistory":"История переписки","switchConfirm":"При смене персоны будут потеряны эти несохранённые изменения:","switchConfirmTail":"Продолжить?","scopeTabCurrent":"Текущая","scopeTabGlobal":"Глобальная","scopeSession":"Сеанс","scopeLayerCurrent":"Этот сеанс","scopeLayerGlobal":"Глобальная","pickerLayerHint":"Текущая: настройки этого диалога · Глобальная: настройки, которым следуют новые диалоги","indicatorYellowHistory":"Жёлтый: сохранённая у этой персоны история изменена; эта сессия хранит старое содержимое.","indicatorRedPersonaMissing":"Красный: выбранная персона удалена; выберите другую.","indicatorYellowNotCarried":"Жёлтый: в этой сессии уже был диалог, поэтому история не внедряется.","dismissFailed":"Не удалось закрыть: ","staleServer":"Файлы плагина уже {client}, а сервер всё ещё {server}. Перезапустите движок приложения, чтобы кнопка заработала.","cacheResetPending":"Жёлтый: следующее сообщение сбросит кэш","indicatorYellowDropped":"Жёлтый: текст персоны не попал в промпт; режим этой сессии исключил его из сборки."};
    const pt = {"nav":"Personas","pickerLabel":"Persona","off":"Não injetar","title":"Gerenciar personas","listTitle":"Lista de personas","newPersona":"Nova","importButton":"Importar","importHint":"Lê um arquivo gerado pela exportação deste plugin (.json, ou o .png de «Exportar imagem»): texto da persona, peso da ordem da seção e histórico de conversa entram juntos e são acrescentados como **novas personas** à lista (entradas existentes nunca são sobrescritas).","importFailed":"Falha na importação","importEmpty":"Não há persona importável neste arquivo (nem array «personas», nem objeto de persona isolado).","importDone":"Importado","importSkipped":"Ignorado","exportButton":"Exportar","exportHint":"Exporta a persona da área de edição (texto + peso da ordem da seção + histórico) como arquivo: JSON puro, ou embutido num PNG que você escolher.","exportJson":"Exportar JSON","exportJsonHint":"Exportar como .json: JSON puro, sem compressão, sem perdas (quebras de linha e aspas são escapadas, então o arquivo só pode ficar maior que o original).","exportPng":"Escolher um PNG, injetar e salvar como cópia","exportPngHint":"Escolha um PNG como capa; os mesmos dados são embutidos na imagem e baixados junto. A imagem não muda um único byte e qualquer visualizador normal continua exibindo.","exportPngBad":"Esse arquivo não é um PNG. A exportação de imagem exige um PNG como capa — JPEG/WebP não têm chunks auxiliares que um decodificador ignora, e a conversão recodificaria a imagem, então aqui isso é recusado.","exportPngBroken":"Este PNG está estruturalmente incompleto (IHDR ilegível); tente outro.","exportTooBig":"O arquivo é grande demais — acima do limite de 32 MB por exportação.","exportNameMayDiffer":"(canal de download indisponível; o sistema pode renomear o arquivo)","exportNotTaken":"Não foi possível confirmar o download do arquivo (o navegador pode ter bloqueado ou o baixador não o pegou) — confira a pasta de downloads e, se não estiver lá, clique de novo.","importPngNoData":"Esta imagem não contém dados de persona (chunk iTXt deste plugin não encontrado).","importPngBadCrc":"Os dados de persona desta imagem não passam na verificação (CRC não confere); o arquivo foi alterado.","exportDone":"Exportado","exportFailed":"Falha na exportação","exportNoBrowser":"Este ambiente não suporta baixar arquivos; exportação cancelada.","exportRefusedNew":"Não é possível exportar: a nova persona ainda não foi salva","exportConfirmDirty":"A edição da persona selecionada não está salva; será exportado o conteúdo anterior ao salvamento. Continuar?","activate":"Usar","builtin":"Integrada","builtinReadonly":"Personas integradas são somente leitura. Para alterar, use «Duplicar como nova persona» e edite a cópia.","name":"Nome","text":"Texto","save":"Salvar","del":"Excluir","confirmDelete":"Excluir esta persona? Esta ação não pode ser desfeita.","confirmOk":"OK","confirmCancel":"Cancelar","activated":"Persona trocada; vale a partir do próximo turno","activatedNamed":"Persona trocada: %s; vale a partir do próximo turno","deactivated":"Injeção de persona desativada","deleted":"Persona excluída","chars":"caracteres","path":"Arquivo de dados","applied":"Última montagem: injetada","dropped":"Última montagem: não injetada","droppedHint":"O agent preset desta sessão declara complete: true (é o «modo mínimo» integrado do DSH); a plataforma comprime a montagem em uma única seção e a seção do plugin não entra. Volte ao modo padrão.","neverApplied":"Ainda não houve montagem observada. Envie uma mensagem e olhe de novo.","assemblyGlobalScope":"Esta página é configuração global: o resultado da montagem só existe em conversas concretas","noPersona":"Última montagem: desta vez não há persona para injetar","noPersonaHint":"Nesta sessão não há persona selecionada («Não injetar» escolhido, ou o texto da persona escolhida está vazio), então desta vez não há nada para pôr na instrução do sistema. É o resultado da escolha atual, não algo que tenha sido empurrado para fora.","orderTrace":"Ordem real das seções na última montagem","switchesTitle":"Interruptores de supressão de entrada","switchesHint":"Os quatro interruptores suprimem cada um dos quatro tipos de entrada do lado do sistema que o modelo vê. Todos ligados e sem persona = chat puro (zero injeção do lado do sistema), o ponto de partida do nível gratuito da versão web.","swSoloLabel":"Carregar só a persona (bloquear todas as outras seções da instrução do sistema)","swSoloHint":"Identidade do harness, persona da implantação, guias de ferramentas, estratégia do modo plan, explicação do código do harness etc. deixam de ser enviados. Sem persona escolhida, a instrução do sistema fica vazia.","swRuntimeLabel":"Bloquear o contexto runtime","swRuntimeHint":"Duas coisas: ① contexto dinâmico que aparece como instantâneos com papel user (política de sandbox, de aprovação, regras de delegação etc.); ② o instantâneo de runtime e o catálogo de skills cercados por `<system-reminder>` (no modo criativo eles realmente aparecem, porque o preset dele traz o próprio catálogo de skills). Nenhum dos dois está na instrução do sistema (por isso «Carregar só a persona» não os alcança), só dá para filtrá-los por origem antes da montagem — este interruptor suprime ambos.","swToolsLabel":"Bloquear o esquema de ferramentas","swToolsHint":"As definições de ferramentas vão num campo separado do wire, não na instrução do sistema, e costumam ser a maior parte dos tokens. Suprimidas, o modelo não tem nenhuma ferramenta chamável.","swInjectedLabel":"Suprimir injeções de histórico (cadeia de instruções do espaço de trabalho / leituras de tempo)","swInjectedHint":"A linha de base da cadeia de instruções de AGENTS.md / CLAUDE.md e as leituras de tempo que o dsh-time-context acrescenta a cada passo. Também são mensagens user que plugins acrescentam ao histórico, não seções de instrução; só dá para filtrá-las com precisão por origem.","pureChatButton":"Um clique para chat puro","restoreButton":"Restaurar entradas do sistema","pureChatHint":"Remover a seleção de persona e ligar os quatro interruptores","pureChatState":"Agora você está em chat puro: zero injeção do lado do sistema, o modelo só vê as mensagens que você envia.","pureChatOn":"Mudado para chat puro","restoreDone":"Entradas do sistema restauradas: os quatro interruptores desligados","switchesSaved":"Interruptores salvos; valem no próximo turno","strippedMessages":"Mensagens injetadas filtradas nesta conversa","stripStatusTitle":"Blocos de injeção do sistema (filtrados nesta sessão)","stripKindRuntime":"Instantâneo de runtime","stripKindSkill":"Catálogo de skills","stripKindInstructions":"Cadeia de instruções do espaço de trabalho","stripKindTime":"Leituras de tempo","soloNoPersona":"«Carregar só a persona» está ligado, mas nenhuma persona foi escolhida — a instrução do sistema ficará vazia.","soloSavings":"Tamanho ao manter só a persona","sectionsUnit":"seções","toolBaselineEmpty":"A linha de base de declarações de ferramentas desta sessão está vazia — a primeira requisição não tinha nenhuma ferramenta. As ferramentas que voltarem depois serão marcadas como carregamento adiado e o provider as recusará (INVALID_REQUEST). Para recuperar as ferramentas, abra uma conversa nova.","indicatorGreen":"Verde: normal. A linha de base de declarações de ferramentas está disponível.","indicatorRed":"Vermelho: esta sessão não tem linha de base de ferramentas; abra uma conversa nova.","storeError":"Falha ao ler o arquivo de dados","warningsSummary":"Situações a observar","warningsShow":"Expandir","warningsHide":"Recolher","warningsDismiss":"Fechar estes avisos","warningsDismissed":"Avisos de execução fechados","loading":"Carregando…","retry":"Tentar novamente","chunkFailed":"Esta parte da interface não pôde ser carregada","createHint":"Criando (ainda não salvo)","editHint":"Editando","blankText":"O texto está vazio; o salvamento será recusado.","blankSaveRefused":"Salvamento recusado: o texto da persona está vazio; para persona vazia use «Não injetar»","orderLabel":"Peso da ordem da seção","orderHint":"Peso de ordenação da seção da persona na instrução do sistema: menor = mais à frente (padrão -1, antes da frase «You are a coding agent…» do preset). Ele decide só a ordem das seções e não entra no texto da persona. Cada persona guarda o próprio peso, e este campo acompanha a troca; a mudança vale após «Salvar», que valida se é um inteiro.","orderDefaultButton":"Padrão","orderFollowButton":"Seguir","orderFollowText":"Acrescentar após a instrução do sistema","orderFollowHint":"Põe o peso depois de todas as seções da instrução do sistema (mesmo procedimento do gerenciamento de prompts); clicar no campo volta ao valor numérico. Vale após «Salvar».","orderProblemEmpty":"O peso da ordem da seção não pode ficar vazio: digite um inteiro ou clique em «Padrão»/«Seguir».","orderProblemInteger":"O peso da ordem da seção precisa ser um inteiro (por exemplo -1, 0, 10200): decimais (0.1), expoentes e unidades não são uma ordem de seção válida — deixariam a ordem da instrução do sistema inválida. O que foi digitado:","orderProblemRange":"O peso da ordem da seção precisa ser um inteiro entre -1000000000 e 1000000000.","orderSaved":"Ordem da seção salva","hintLabel":"Descrição","unnamed":"Sem nome","clearDraft":"Limpar","historyTitle":"Histórico de conversa da persona","historySubtitle":"Uma «conversa já ocorrida» salva junto com esta persona. Ao escolher a persona, no primeiro passo de uma conversa nova o histórico é injetado como contexto do lado user; um histórico já injetado não é injetado de novo, senão o cache de toda a conversa seria reiniciado. Se precisar herdar o histórico ao trocar de persona numa sessão já em andamento, dá para escrevê-lo no texto da persona, mas o resultado não é bom e não recomendo.","historyTabEdit":"Edição manual","historyTabImport":"Importar registro da sessão","historyFormatHint":"Formato padrão:\nO conteúdo do lado do usuário fica entre <user_message>; o raciocínio do modelo entre <thinking>, o conteúdo da conversa entre <assistant_message>; conteúdo não conversacional ou multimodal dos dois lados entre <file>. A tag de fechamento leva «/» (por exemplo, <user_message>Olá</user_message> significa que o usuário enviou «Olá»).\nEste formato só vale para modelos com raciocínio, como o deepseek","historyThinkingLabel":"Importar o raciocínio","historyCompactLabel":"Expandir a compactação do texto original","historyCompactHint":"Por padrão só entra no campo o resumo compactado entre <compacted-summary>…</compacted-summary> (com as tags, copiado literalmente), seguido da conversa **posterior ao último resumo**; o conteúdo comum antes do resumo e entre dois resumos não é importado. Marcado, é o contrário: entra todo o texto **exceto** esses resumos compactados — ou seja, a compactação é reexpandida no original. Isto e «Importar o raciocínio» são independentes: aquele decide se o <thinking> do modelo entra, este decide se ficam os resumos ou o resto do texto; os dois se somam. Se o texto importado não tiver resumo compactado, com ou sem marca será o texto completo, apenas com o aviso «este histórico ainda não foi compactado».","historyCompactNone":"Este histórico ainda não foi compactado","historyCompactNoImport":"Ainda não há registro de sessão importado: esta caixa só trata o texto importado.","historyTokenCost":"Acréscimo","historyImportButton":"Importar session.vN.jsonl / .zip","historyImportHint":"Aceita o zip exportado por /export, ou um session.vN.jsonl / session.jsonl avulso","historyImportConfirm":"O campo já tem conteúdo; a importação vai substituí-lo. Continuar?","historyImportEmpty":"Não há conteúdo de conversa utilizável neste arquivo (nem user/message nem assistant/message reconhecidos).","historyImportFailed":"Falha na importação","historyChars":"caracteres","historyBytes":"bytes","historyClearButton":"Limpar histórico","historyUndoButton":"Desfazer","historySaved":"Histórico de conversa salvo","historyCleared":"Histórico de conversa limpo","historyDirtyHint":"Há alterações não salvas","historyStored":"Esta persona tem histórico de conversa","historyNotStored":"Esta persona ainda não tem histórico de conversa","historyMissing":"O conteúdo do histórico desta persona não existe mais; restou só um registro","historyInjectedCount":"Entradas de histórico já injetadas","historyPlaceholder":"Escreva aqui o histórico, ou mude para «Importar registro da sessão» para lê-lo de um arquivo…","personaSaved":"Persona salva","saveFailed":"Falha ao salvar:","nothingToSave":"Não há alterações para salvar.","saving":"Salvando…","emptyPersonaName":"O nome da persona não pode ficar vazio.","unsavedTitle":"Não salvo:","unsavedPersona":"Persona (nome / texto)","unsavedOrder":"Peso da ordem da seção","unsavedHistory":"Histórico de conversa","switchConfirm":"Trocar de persona descarta estas alterações não salvas:","switchConfirmTail":"Continuar?","scopeTabCurrent":"Atual","scopeTabGlobal":"Global","scopeSession":"Sessão","scopeLayerCurrent":"Esta sessão","scopeLayerGlobal":"Global","pickerLayerHint":"Atual: configurações desta conversa · Global: configurações que as novas conversas seguem","indicatorYellowHistory":"Amarelo: o histórico salvo com esta persona foi alterado; esta sessão mantém o conteúdo antigo.","indicatorRedPersonaMissing":"Vermelho: a persona escolhida foi excluída; escolha outra.","indicatorYellowNotCarried":"Amarelo: esta sessão já conversou, então o histórico não é injetado.","dismissFailed":"Falha ao fechar: ","staleServer":"Os arquivos do plugin são {client}, mas o servidor ainda está em {server}. Reinicie o motor do app para este botão funcionar.","cacheResetPending":"Amarelo: a próxima mensagem reinicia o cache","indicatorYellowDropped":"Amarelo: o texto da persona não entrou no prompt; o modo desta sessão o deixou fora da montagem."};
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
    // 两个组件包各有一份本文件；共用同一张 store 表，避免同一会话跑两份轮询。
    const personaStores = (() => {
      try {
        if (typeof window === 'undefined') return new Map();
        if (!(window.__DSH_PERSONA_SELECT_STORES__ instanceof Map)) {
          window.__DSH_PERSONA_SELECT_STORES__ = new Map();
        }
        return window.__DSH_PERSONA_SELECT_STORES__;
      } catch {
        return new Map();
      }
    })();
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
        // 不再定时轮询：挂载、聚焦/重新可见、插件自身“已变更”、以及会话预设变化都会刷新。
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
      } catch {
      } finally {
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
        if (store.refs === 1) startPersonaStore(store);
        // 每次挂载都重拉一次：store 可能被另一个组件（例如设置面板）保活，
        // 只靠 0→1 那次刷新会让重新挂载的界面拿到旧快照。
        personaStoreReload(store, true);
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
        preset: presetOf(state, sessionId),
      };
    }
    /** 会话当前的 agent 预设。它一变，桌面端预设选择器就已经生效，面板需要重拉一次状态。 */
    function presetOf(state, sessionId) {
      if (sessionId === '') return '';
      const row = state?.byId?.[sessionId];
      const value = row?.projectionValues?.agentPreset;
      return typeof value === 'string' ? value : '';
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
      'persona-dropped': 'indicatorYellowDropped',
      'history-mismatch': 'indicatorYellowHistory',
      'history-not-carried': 'indicatorYellowNotCarried',
      'cache-reset': 'cacheResetPending',
    });
    const REASON_COLORS = Object.freeze({
      'no-tools-first-turn': 'red',
      'persona-missing': 'red',
      'persona-dropped': 'yellow',
      'history-mismatch': 'yellow',
      'history-not-carried': 'yellow',
      'cache-reset': 'yellow',
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

    function degradedPlugin(error) {
      const cause = error !== null && error !== undefined && error.message ? String(error.message).split(String.fromCharCode(10))[0] : String(error);
      try {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('[dsh-persona-select-settings] 客户端半加载失败：会以降级卡片呈现。首因：' + cause);
        }
      } catch {
      }
      function Failure() {
        return h(
          'div',
          { style: S.root, 'data-plugin': 'dsh-persona-select-settings', 'data-render-state': 'degraded' },
          h('h2', { style: S.h2 }, '人设管理 — load failure'),
          h('p', { style: S.warn }, cause),
        );
      }
      return {
        inject: ['slots'],
        apply(ctx) {
          try {
            ctx.slots.inject('settings.section', () =>
              ctx.slots.register(
                { name: 'settings.section', id: 'dsh-persona-select-settings', order: 31, label: () => '人设管理', inject: () => ({}) },
                Failure,
              ),
            );
          } catch {
          }
        },
      };
    }
    function buildPlugin() {
      return {
        inject: ['slots', 'locale'],
        apply(ctx) {
          const locale = ctx.locale;
          const t = typeof locale?.bind === 'function' ? locale.bind(NS) : (key) => key;
          fallbackT = t;
          bindSessionsService(ctx);
          ctx.effect(() => {
            if (typeof locale?.register !== 'function') return undefined;
            try {
              return locale.register(NS, { zh, en, ja, es, fr, de, ru, pt });
            } catch (error) {
              try {
                if (typeof console !== 'undefined' && typeof console.warn === 'function') {
                  console.warn('[dsh-persona-select-settings] 语言字典注册失败（已忽略，界面用 key 兜底）：', error?.message ?? String(error));
                }
              } catch {
              }
              return undefined;
            }
          }, 'dsh-persona-select-settings: 语言字典');
          const Component = chunkHost.registerComponentChunk('client.settings.js', 'dsh-persona-select-settings', (module) => {
            const impl = module.create(chunkDeps()).PersonaManagerImpl;
            return (props) => keyedByHostPresence(impl, props);
          });
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                id: 'dsh-persona-select-settings',
                order: 31,
                label: () => t('nav'),
                locale: NS,
                inject: () => ({ t }),
              },
              Component,
            ),
          );
        },
      };
    }
    if (h === null) {
      try {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('[dsh-persona-select-settings] 拿不到 react，客户端半不注册任何槽位；DSH 其余功能不受影响。');
        }
      } catch {
      }
      return { inject: [], apply() {} };
    }
    try {
      return buildPlugin();
    } catch (error) {
      return degradedPlugin(error);
    }
  },
});
