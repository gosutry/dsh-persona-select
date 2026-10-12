/**
 * `dsh-persona-select` — Client 半边。
 *
 * 手写 CommonJS 工厂，注册进浏览器模块加载器：不用打包器、不用 JSX、
 * 不用 TypeScript，运行时依赖只有 `react`。
 *
 * 两个挂载点：
 * 1. `settings.section`（id `persona-select`，order 31）—— 设置页「人设管理」：
 *    列表、编辑、新建、复制内置、删除、启用。
 * 2. `conversation.input.dock`（列表型槽位，id `persona-select`，order 30）——
 *    渲染在「标准模式 / 极简模式…」那一行**正下方**的 chip 区，
 *    与模式选择框上下相邻、同时可见。
 *    刻意**不用** `conversation.hero.agentPreset`：那是 `kind: "single"`，
 *    一个座位，占了就把模式选择框挤掉。
 *
 * 消费的是 `/persona-select/*` 的 REST 契约，与 Host 半边一一对应。
 *
 * 硬规则（照抄自 dsh-prompt-setting 的踩坑记录，都是会白屏的那种）：
 *   - 所有 hook 在 `try` **之外**调用，建树在 `try` 之内，
 *     这样失败时渲染的是一张可读的卡片而不是白屏；
 *   - 任何一步都不抛回加载器；
 *   - 模块体里不碰 `window` 之外的东西。
 *
 * 这一份代码坐在 DSH 的**内部结构**上面（槽位名与 order、槽位递进来的属性形状、
 * 浏览器模块加载器与 `require('react')`、语言字典的注册约定）。那些都**不是稳定
 * 契约**：上游改一个名字，插件不会崩，只会**安静地少做一件事**（设置页那一页
 * 消失、chip 状态滞后、甚至整张降级卡片）。所以本文件里每一处「按当前框架写死」
 * 的地方，都要对着 README 的 **「升级前必查：20 个平台私有契约」**那一节核 ——
 * 那一节按「症状 → 先查哪个函数 → 怎么确认」写成了一张表，本文件自己的新版本
 * 发布前也该先过一遍。
 *
 * @module dsh-persona-select/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-persona-select',
  factory: function personaSelectFactory(require) {
    /* @build-fingerprint:begin */
    'use strict';

    let React = null;
    try {
      React = require('react');
    } catch {
      React = null;
    }

    const h = React !== null && typeof React.createElement === 'function' ? React.createElement : null;

    /** 本插件独占的 REST 前缀，必须与 Host 半边的 ROUTE_PREFIX 一致。 */
    const ROUTE_PREFIX = '/persona-select';

    /** 语言命名空间。 */
    const NS = 'persona-select';

    /**
     * 「导出 / 导入」的文件格式（0.3.0）。
     *
     * 为什么就用**纯 JSON**：
     *   · 无损 —— 任意文本（换行、引号、控制字符、代理对）都能原样往返；
     *   · `JSON.stringify` 会把换行写成 `\n`、引号写成 `\"`，所以文件
     *     **只会比原文更大**，不会悄悄压小（需求：不压缩、甚至增大）；
     *   · 浏览器与 Node 都自带解析器，导入侧零依赖、零第三方库。
     *
     * 外层带 `format` / `version`：导入时先认这两样，认不出就报错，
     * 免得把别的 JSON 当人设吞进列表。
     */
    const EXPORT_FORMAT = 'dsh-persona-select/personas';
    const EXPORT_VERSION = 1;

    /**
     * 单次导出的字节上限（与 Host 的 HANDOFF_MAX_ENTRY_BYTES 一致）。
     *
     * **留在主包**：它唯一的外部调用点是下面「PNG 装完有没有超上限」那道闸门。
     * 分块里那份同名常量随分块一起搬走了，只在分块内部用，**不从主包注入**
     * （同名两份会当场 SyntaxError）。
     */
    const EXPORT_MAX_BYTES = 32 * 1024 * 1024;

    /**
     * 把一串字节解码成 UTF-8 文本。
     * @param {Uint8Array} bytes - 原始字节。
     * @returns {string} 文本。
     */
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

    /**
     * 一段文本的 UTF-8 字节数。
     *
     * 它对应 token 与 KV cache 的代价，也是「增耗 N tok」里那个 N 的来源
     * （N = 字节数 ÷ 4 + 32）。
     * 环境没有 `TextEncoder` 时退回 `Text.length` —— 中文会偏小，
     * 但比不显示强，而且那只在非常老的浏览器上发生。
     * @param {string} text - 文本。
     * @returns {number} 字节数。
     */
    function historyBytesOf(text) {
      const value = typeof text === 'string' ? text : '';
      try {
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(value).length;
      } catch {
        // 继续走回退。
      }
      return value.length;
    }


    /**
     * 用户方的包裹标签。
     *
     * 0.1.6 首版用的是 `【用户】` **前缀**——它只能标记「这里开始是用户」，
     * 没法标记「到哪里结束」，于是同一段被再次导入时会被再包一层、看不出边界。
     * 0.1.7 换成成对标签，导入是幂等的：剥掉外壳之后里层还是同一段文本。
     */
    const USER_OPEN = '<user_message>';
    const USER_CLOSE = '</user_message>';

    /**
     * 模型方的包裹标签（0.1.8）。
     *
     * 只包**非思考内容**：思考仍然单独放在 `<thinking>…</thinking>` 里，
     * 不被这一对标签包住 —— 需求要的就是这个分界。
     */
    const ASSISTANT_OPEN = '<assistant_message>';
    const ASSISTANT_CLOSE = '</assistant_message>';

    /**
     * 用户传入的文件在历史里的写法。
     *
     * 写成 `<file>名字.扩展名</file>`：把**全文件名**（名字 + 格式）原样放进
     * 用户方那一块里，位置就是它在原始 content 数组里的位置。
     */
    const FILE_OPEN = '<file>';
    const FILE_CLOSE = '</file>';

    /**
     * 注入外壳的标记，必须与 Host 半边 `index.js` 里的 `HISTORY_OPEN/CLOSE`、
     * `HISTORY_FRAME_OPEN/CLOSE`（以及它们的历史版本）保持一致。
     *
     * - `HISTORY_WRAPPER_LINES` 是 0.2.5 起用的两行定位符，**整行**相等才剔除：
     *   用户正文里可能自己就打了「CONTEXT_ROAD:」，只有独占一行时才算壳。
     * - `HISTORY_FRAME_LINES` 是 0.3.6 起加的外框（`<system-reminder>`），同样
     *   整行匹配；它把这段注入与工作区指令链 / 技能目录那类注入摆在同一形式下。
     * - `HISTORY_LEGACY_TAGS` / `HISTORY_LEGACY_PREAMBLE` 是 0.2.4 及更早的壳
     *   （两句开场说明 + `<persona-history>` 标签）。导入旧会话时照样要剥掉，
     *   否则每导入一次就叠一层旧说明。
     */
    const HISTORY_WRAPPER_LINES = ['CONTEXT_ROAD:', 'CONTINUE_CONTEXT.'];
    const HISTORY_FRAME_LINES = ['<system-reminder>', '</system-reminder>'];

    /**
     * 0.3.6 起，注入时会把正文里自带的 `</system-reminder>` 转义成
     * `<\/system-reminder>`（Host 的 `HISTORY_FRAME_ESCAPE`，抄的是
     * `dsh-agent-instructions` 的做法）。剥壳时要**还原**回去，这样
     * 「导入自己注入过的会话 → 存回人设」仍然是无损往返。
     */
    const HISTORY_FRAME_ESCAPE = '<\\/system-reminder>';
    const HISTORY_LEGACY_TAGS = ['<persona-history>', '</persona-history>'];
    const HISTORY_LEGACY_PREAMBLE = [
      '以下是本会话开始之前，你与用户之间已经发生过的对话记录。',
      '把它当作已经发生的事实延续下去；不要复述本段说明，也不要向用户确认收到。',
    ];

    /** 0.1.6 首版渲染留下的用户前缀标记（只在「已经渲染过的历史」里出现）。 */
    const LEGACY_USER_MARKER = '【用户】';

    /** mediaType → 扩展名。与 DSH `dsh-attachment` 的映射保持一致。 */
    const IMAGE_EXTENSIONS = Object.freeze({
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    });

    /** zstd 帧的 magic number（小端 0xFD2FB528）。用来切分多帧文件。 */
    const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

    /* ─────────── 包内分块（档 5 · X1）─────────── */
    // 三条硬规则：① 同名只装一次；② 装不上就抛（调用点必须让用户看见，不许"点了没反应"）；
    // ③ 名字必须匹配 `client.<名字>.js` —— 主/宿两边各有一份同样的正则，宿主只认"当前 rev + 精确文件名"。
    const CHUNK_NAME_RE = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/;
    const chunkCache = new Map();
    function loadChunk(fileName) {
      if (typeof require.async !== 'function') throw new Error('no-require-async：这个宿主还不支持包内分块');
      if (!CHUNK_NAME_RE.test(fileName)) throw new Error(`bad-chunk-name：${fileName}`);
      const cached = chunkCache.get(fileName);
      if (cached !== undefined) return cached;
      // 0.3.23 修：**不缓存失败**。原实现把失败 Promise 留在 Map 里，
      // `ioExport()` / `logImport()` 的 catch 只把句柄置回 null —— 下一次点击拿到的
      // 是同一个 rejected Promise，永远不再重新加载（与注释里写的"不缓存失败"相反）。
      // 这里给 Promise 挂一个失败清理：只在"还是同一个 Promise"时摘掉，避免误删并发重试。
      const promise = Promise.resolve().then(() => require.async(`./${fileName}`));
      chunkCache.set(fileName, promise);
      promise.catch(() => {
        if (chunkCache.get(fileName) === promise) chunkCache.delete(fileName);
      });
      return promise;
    }
    // 同步句柄：`importView()` 是勾选框 onChange 里同步调的，那时分块必然已装好。
    // 不变式：`historyVariants !== null` ⇒ `chunks.logImport !== null`（前者只在一次成功导入后非空，而成功导入必经 logImport()）。
    const chunks = { ioExport: null, logImport: null };
    async function ioExport() {
      if (chunks.ioExport === null) {
        try {
          chunks.ioExport = (await loadChunk('client.io-export.js')).create({ call, decodeUtf8, EXPORT_FORMAT, EXPORT_VERSION });
        } catch (problem) {
          // 装不上就把句柄置回 null：**不缓存失败**，下次再试。
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
    /** 同步句柄：只在"一次成功导入之后"用（那时 `logImport()` 已经跑过）。 */
    function logImportSync() {
      if (chunks.logImport === null) throw new Error('log-import-chunk-not-loaded');
      return chunks.logImport;
    }

    /* ─────────── 组件级惰性分块（0.3.23 · 审计 §三.1）─────────── */

    /**
     * 设置页与输入区那两个大组件搬进了包内分块，但**槽位必须在 apply() 里同步
     * 注册**（`ctx.slots.inject(name, fn)` 的 fn 当场就被调用），而包内分块只能
     * `require.async` 异步取。于是槽位拿到的是一个**壳**：
     *
     *   · 壳本身恒定只用 2 个 hook（一个 `useState` 收通知、一个 `useEffect` 挂订阅），
     *     与分块在不在、宿主能力来不来都无关；
     *   · 分块到了就把真身**作为子元素**渲染出来（React 里是另一个组件实例，
     *     它的 hook 格数与壳互不影响）；
     *   · 分块没到显示一行「正在加载」，装不上显示一张**可读的错误卡片**并给一个
     *     重试按钮 —— 不静默消失，也不白屏。
     *
     * `apply()` 一开始就点火加载（不等第一次渲染），所以正常情况下这一帧的占位
     * 用户根本看不见。
     */
    const componentChunks = new Map();

    /**
     * 取（或重新起一次）某个组件分块的加载。
     * @param {string} fileName - `client.<名字>.js`。
     * @param {string} id - 槽位 id（报错时给用户指路）。
     * @param {(module: object) => Function} build - 从分块导出里取出组件。
     * @returns {object} 这张分块的记录。
     */
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
            // 一个订阅者出错不该挡住界面（也不该冒到渲染期）。
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

    /**
     * 把一个分块记录包成可以**同步注册**的组件。
     * @param {object} record - {@link loadComponentChunk} 的记录。
     * @returns {Function} 壳组件。
     */
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

    /**
     * 分块拿得到的「主包作用域」。
     *
     * ⚠ 逐条列出组件真正用到的东西 —— 这是这块代码唯一的隐式前提：**改了分块里
     * 的组件、用到一个这里没有的名字，运行时会抛 `x is not defined`**。
     * 名单是用「在组件定义位置 eval 每个候选名」的探针实测出来的（探针与结论见
     * `ps3/tests/`），不是手抄的。多写几个不碍事，漏一个就会炸。
     * @returns {object} 注入分块的依赖对象。
     */
    function chunkDeps() {
      return {
        React, h, S, fallbackT,
        AssemblyLine, Hint, ScrollBar, layerIndicators,
        EXPORT_FORMAT, EXPORT_VERSION, EXPORT_MAX_BYTES,
        STRIP_KIND_FIELDS, SWITCH_FIELDS, RESIDENT_RETRY_MS,
        allSwitchesOn, byColorRank, call, checkOrderInput, ensureScrollCss,
        historyBytesOf, indicatorFor, indicatorsOf,
        ioExport, logImport, logImportSync,
        notifyPersonaChanged, summarizeIndicators,
        useMainSessionRow, usePersonaState, useSettledTick,
      };
    }

    /**
     * 把一个分块里的组件包成槽位要的那个组件。
     * @param {string} fileName - `client.<名字>.js`。
     * @param {string} slotId - 槽位 id。
     * @param {(module: object) => Function} build - 从分块导出里取出组件。
     * @returns {Function} 可同步注册的壳。
     */
    function registerComponentChunk(fileName, slotId, build) {
      return lazyChunkComponent(loadComponentChunk(fileName, slotId, (module) => build(module)));
    }



    /** 同页广播事件名：任何一次写操作成功后发出，另一个半边据此刷新。 */
    const PERSONA_CHANGED_EVENT = 'dsh-persona-select:changed';

    /** 跨挂载点的兜底轮询间隔（毫秒）。 */
    const PERSONA_POLL_MS = 4000;

    /**
     * 「请 Host 给这个会话采样一份记录」的重试间隔（0.2.8，毫秒）。
     *
     * 打开一个旧对话时 Host 那边的会话可能还没恢复完，`/resident` 会拿不到
     * 会话日志而拒绝采样；它一旦恢复就该补上，所以允许重试 —— 但不能每轮
     * 轮询都打一次请求，所以按这个间隔限流。
     */
    const RESIDENT_RETRY_MS = 3000;

    /** 单次请求的超时（毫秒）。写历史对话可能很大，所以给得宽。 */
    const REQUEST_TIMEOUT_MS = 30000;

    /**
     * 「大上传」的判定门槛与超时（0.3.23 · 审计 §四.2）。
     *
     * 那条 30 秒对普通 JSON 请求绰绰有余，但对**导出交接**（`PUT /handoff`，
     * 一张 32 MB 的 PNG 封面）在慢网络上可能不够：客户端会把一次正常上传
     * 报成「请求超时（30 秒没有响应）」，而对面其实还在收。这里按**这一次请求
     * 体积**给一条更宽的超时（≥1 MiB 的上传给 3 分钟），理由写在
     * `timeoutForBody()` 上；普通请求一个字节都没变。
     */
    const LARGE_UPLOAD_BYTES = 1024 * 1024;
    const LARGE_UPLOAD_TIMEOUT_MS = 180000;

    /**
     * 这一次请求该用多长的超时（毫秒）。
     *
     * 判据是**请求体的大小**，不是路径：`/handoff` 这一条（32 MB 的图片）与
     * 「保存历史对话」（16 MiB 的 JSON）都走同一个 `call()`，按体积判就不用
     * 让调用方各自记着传参数。取不到大小（流、FormData 之类）时按普通请求算。
     * @param {RequestInit|undefined} init - fetch 选项。
     * @returns {number} 超时毫秒数。
     */
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
      // 0.3.0：人设列表下方的「导入」、编辑区最右侧的「导出」。
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
      exportPng: '导出图片',
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
      // 0.3.8：新建（或内置复制出来还没保存）的人设没有 id，导不了 —— 按钮不再
      // 直接 disable，点下去给这一句，而不是什么都不发生。
      exportRefusedNew: '无法导出：新建人设尚未保存',
      // 0.3.8：非新建人设有未保存改动时，导出前先确认。导出的是**保存前那一份**
      // 原案（不是草稿），所以弹窗要先把这件事说清楚。
      exportConfirmDirty: '当前选中人设的编辑尚未保存，导出的人设为保存前的原案，确认继续导出？',
      activate: '启用',
      builtin: '内置',
      builtinReadonly: '内置人设只读。要改就「复制为新人设」，改副本。',
      name: '名字',
      text: '正文',
      save: '保存',
      del: '删除',
      confirmDelete: '确定删除这个人设？此操作不可撤销。',
      activated: '已切换人设；新一轮对话生效',
      activatedNamed: '已切换人设：%s；新一轮对话生效',
      deactivated: '已关闭人设注入',
      // 0.3.13：这句原来只是「已删除」—— 提示行独立飘在编辑区上方，光说「已删除」
      // 看不出删的是什么（0.3.9 之前这一排还会报「已切换人设…」之类），点清对象。
      deleted: '人设已删除',
      chars: '字符',
      path: '数据文件',
      applied: '最近一次装配：已注入',
      dropped: '最近一次装配：未注入',
      droppedHint:
        '本会话的 agent preset 声明了 complete: true（DSH 内置的「极简模式」就是这样），平台会把装配压成单段，插件的段进不去。换回标准模式即可。',
      neverApplied: '还没有观察到装配。发一条消息后再看。',
      // 档位 4（R2 · Q2 方向 b）：全局页不报会话级装配结论时的说明行。
      // 与 `neverApplied` 刻意分开 —— 「还没装配过」和「这一页不报会话读数」
      // 是两件事，混成一句就把真相说没了。
      assemblyGlobalScope: '这一页是全局设置：装配结果只有具体对话才有',
      // 档位 6：第三种结果 —— 装配过，但这一轮压根没有可注入的人设正文。
      // 0.3.19 没有这一条，于是这种情况被并进「人设被顶掉了」，还附带一段
      // 「极简模式」的解释（而那一轮根本没有触发过任何顶替）。
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
      // 0.3.11：删掉两句话 —— 「本会话还没有过滤掉任何系统注入块 —— 要么没注入过，
      // 要么对应的开关还没打开。」与「这四类都不是系统提示词里的段，而是别的插件按
      // user 角色追加的消息，所以只能在装配前按来源过滤。」。有过滤记录时仍然
      // 按来源列出条数（`stripStatusTitle`），一条都没有时那一行不渲染。
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
      // 指示点（0.1.5）：颜色语义 + 每条原因的一句话解释（当 tooltip / 状态行用）。
      indicatorSession: '对应会话',
      indicatorGreen:
        '绿色：正常。工具声明基线可用。',
      indicatorYellow:
        '黄色：「工具可复用」没勾选。剥工具时不再保护工具声明基线，某些会话的基线可能被清空、工具就再也拿不回来。',
      indicatorRed:
        '红色：这个会话的第一轮请求里没有任何工具（工具声明基线为空）。之后回来的工具会被标成延迟加载，provider 会拒绝；工具在本会话内拿不回来，请新开一个对话。',
      storeError: '数据文件读取失败',
      // F4（档位 2）：服务端 `/state.warnings` 那些「我降级处理了」的提醒。
      warningsSummary: '需要注意的情况',
      warningsShow: '展开',
      warningsHide: '收起',
      loading: '加载中…',
      retry: '重试',
      chunkFailed: '这一块界面没能加载',
      createHint: '正在新建（尚未保存）',
      editHint: '正在编辑',
      blankText: '正文为空，保存会被拒绝。',
      /**
       * 0.3.8：正文留空时的**整条**拒绝反馈（不再是 `saveFailed:` + 短语）。
       *
       * 它是「保存」按钮点下去唯一该说的一句话：既说明拒绝的原因，也给出
       * 空人设的出路（空人设不是没用人设 —— 它有正经用法：配合「不注入」）。
       */
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

      // ── 「人设历史对话」（0.1.6）────────────────────────────────
      historyTitle: '人设历史对话',
      historySubtitle:
        '一段「已经发生过的对话」，锁进这条人设。这条人设激活时，任何新会话的第一步都会把它作为模型侧的历史对话注入；已经聊过的会话不会被动到。' +
        '如果你需要在已经对话过的会话切换人设时继承历史，你可以把历史正文写入人设正文里。但这样做的效果并不好，不建议这样操作。',
      historyTabEdit: '手动编辑',
      historyTabImport: '导入会话日志',
      historyFormatHint:
        '默认写法：\n' +
        '用户方内容用<user_message>包裹；模型方思考内容用<thinking>包裹，对话内容<assistant_message>；' +
        '双方非对话内容或多模态内容用<file>包裹。结尾标签添“/”（例如<user_message>你好</user_message>表示用户发送了一句“你好”。）\n' +
        '本格式仅适用于deepseek等支持思考的模型',
      historyThinkingLabel: '导入思考过程',
      /**
       * 「展开原文压缩」（0.3.14；0.3.8–0.3.13 叫「仅导最后压缩」）。
       *
       * DSH 压缩过一次上下文，会话日志里就多一条「压缩摘要」消息；它本身就是
       * 被 `<compacted-summary>…</compacted-summary>` 包住的整段文本。积了几轮
       * 之后，这些摘要会一层层叠进导入结果。
       *
       * **默认（不勾）**：只导入这些压缩摘要（原文照搬、连标签），并接上最后
       * 一段之后的对话 —— 这就是「压缩视图」。
       * **勾上**：反过来，导入**除这些压缩摘要以外**的全部原文（把压缩展开回原文）。
       *
       * 与「导入思考过程」各自管一件事：那一项决定模型方的 `<thinking>` 要不要
       * 一起进来，这一项决定留摘要还是留除摘要以外的原文；两者叠加生效。
       */
      historyCompactLabel: '展开原文压缩',
      historyCompactHint:
        '默认只把被 <compacted-summary>…</compacted-summary> 包住的压缩摘要导入输入框（连标签、原文照搬），' +
        '再接上**最后一段之后**的对话；摘要之前、以及两段摘要之间的普通内容不会被导入。' +
        '勾上这一项就反过来：导入**除这些压缩摘要以外**的全部原文 —— 也就是把压缩展开回原文。' +
        '它和「导入思考过程」各管一件事：那一项决定模型方的 <thinking> 要不要一起进来，' +
        '这一项决定留摘要还是留除摘要以外的原文，两者叠加生效。' +
        '这份导入文本里没有压缩摘要时，勾不勾都是完整原文，只会提一句「该历史对话尚未压缩过」。',
      /**
       * 「这份导入文本里没有被 <compacted-summary> 包住的压缩摘要」。
       *
       * 0.3.14 定稿：只留这一句，而且化简成一句人话；
       * 「留下了 N 段 / 去掉了 N 段」那两句按需求删掉 —— 这两种情况下不再报任何提示。
       */
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
      // 0.2.0：输入框下面只剩一个「清空 / 撤回」按钮，历史对话由最下方「保存」提交。
      historyClearButton: '清空',
      historyUndoButton: '撤回',
      historySaved: '历史对话已保存',
      historyCleared: '历史对话已清空',
      historyDirtyHint: '有未保存的改动',
      historyStored: '这条人设存有历史对话',
      historyNotStored: '这条人设还没有历史对话',
      // 0.3.21：第三种状态。`historyLockedAt === null` 有两种来历 —— 「从没存过」
      // 与「存过、但磁盘上那份历史正文已经不在了」。后者原来被渲染成前者。
      historyMissing: '这条人设的历史内容已经不在了，只剩一条记录',
      historyInjectedCount: '已注入的历史对话条数',
      historyPlaceholder: '在这里写历史对话，或切到「导入会话日志」从文件读进来…',
      // 0.2.0：三段改动各自的保存结果 / 未保存提示。
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

      // ── 「当前 / 全局」两层设置（0.2.8）──────────────────────────
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
      // 0.3.5：极简模式单独一条。它不看有没有发生过对话，模式一选上就成立。
      indicatorYellowMinimal:
        '黄色：本对话的对话模式是「极简模式」—— 它的 preset 声明了 complete 段，平台会把系统提示词压成单段，本插件的人设段进不去（人设正文不会生效，人设历史对话仍照常注入）。要让人设正文生效，换回标准 / PTC / 创造模式。',
      // 0.3.22：换过人设之后，新那条人设的历史对话进不来。措辞要给出**唯一的
      // 出路**（新开一个对话），而不是只说「黄了」—— 这个会话怎么弄都不会注入。
      indicatorYellowNotCarried:
        '黄色：这个会话已经聊过，所以这条人设的历史对话不会注入进去（历史只在每个新会话的第一步注入一次）。想让这段历史生效，请新开一个对话。',
    };

    /**
     * 英文文案（档位 4 的 Q4(a)）：**用到才解析**。
     *
     * 这一段 JSON 就是原来那个 `en` 对象字面量的**等价值**，一条文案都没改，
     * 换掉的只是「装载方式」：对象字面量在引擎里是三百多个语法节点（155 条
     * 属性定义 + 155 个字面量），而一整段字符串只是**一个**。中文界面上这
     * 155 条英文文案从头到尾不会被建出来 —— 语言服务的查找在 `zh` 上就命中
     * 了，问都不会问到这里（见下面的 `en`）。
     *
     * 为什么不用「拆成独立文件按需加载」（Q3 的 (a)）：DSH 的浏览器模块加载器
     * **确实**支持包内分块（`require.async('./client.<名字>.js')` + 分块里用
     * `__ModuleLoader__.load({ id, chunk, factory })` 注册，Host 会按需从包目录
     * 取那个文件），但共享验证套件是用 `new Function(src)` **只**加载
     * `client.js` 的，分块里的东西在它那里永远取不到 —— 把这个文件一拆，
     * 导入 / 导出那一整节断言会立刻掉。这一条写在档位 4 的交接单里。
     */
    const EN_JSON = "{\"nav\":\"Personas\",\"pickerLabel\":\"Persona\",\"off\":\"Off\",\"title\":\"Persona manager\",\"listTitle\":\"Personas\",\"newPersona\":\"New\",\"importButton\":\"Import\",\"importHint\":\"Read a file produced by this plugin\u2019s Export (.json, or the .png from \u201cExport image\u201d): text, section order and persona history come in together and are appended as **new** personas (existing entries are never overwritten).\",\"importFailed\":\"Import failed\",\"importEmpty\":\"No importable persona in this file (no personas array, and no single persona object).\",\"importDone\":\"Imported\",\"importSkipped\":\"Skipped\",\"exportButton\":\"Export\",\"exportHint\":\"Export the persona in the editor (text + section order + history) as a file: plain JSON, or packed into a PNG you pick yourself.\",\"exportJson\":\"Export JSON\",\"exportJsonHint\":\"Export as .json: plain JSON, no compression, lossless (newlines and quotes are escaped, so the file is only ever larger than the source).\",\"exportPng\":\"Export image\",\"exportPngHint\":\"Pick a PNG as the cover; the same data is packed into the image and downloaded together. The image itself is not modified by a single byte and every normal viewer still displays it.\",\"exportPngBad\":\"That file is not a PNG. Image export needs a PNG as the cover \u2014 JPEG/WebP have no ancillary chunks for a decoder to skip, and converting would re-encode the picture, so this is refused outright.\",\"exportPngBroken\":\"This PNG is structurally incomplete (no IHDR readable); try another one.\",\"exportTooBig\":\"The file is too large \u2014 over the 32 MB per-export limit.\",\"exportNameMayDiffer\":\"(download channel unavailable; the system may rename the file)\",\"exportNotTaken\":\"Could not confirm the file was downloaded (the browser may have blocked it, or the downloader never fetched it) \u2014 check the download folder, and try again if it is not there.\",\"importPngNoData\":\"No persona data in this image (no iTXt chunk from this plugin).\",\"importPngBadCrc\":\"The persona data in this image fails its checksum (CRC mismatch): the file was modified.\",\"exportDone\":\"Exported\",\"exportFailed\":\"Export failed\",\"exportNoBrowser\":\"This environment cannot download files; export cancelled.\",\"exportRefusedNew\":\"Cannot export: the new persona has not been saved yet\",\"exportConfirmDirty\":\"The edits to the selected persona are unsaved; the export will be the pre-save original. Export anyway?\",\"activate\":\"Use\",\"builtin\":\"Built-in\",\"builtinReadonly\":\"Built-in personas are read-only. Use \u201cFork as new\u201d to edit a copy.\",\"name\":\"Name\",\"text\":\"Text\",\"save\":\"Save\",\"del\":\"Delete\",\"confirmDelete\":\"Delete this persona? This cannot be undone.\",\"activated\":\"Persona switched; effective on the next turn\",\"activatedNamed\":\"Persona switched: %s; effective on the next turn\",\"deactivated\":\"Persona injection turned off\",\"deleted\":\"Persona deleted\",\"chars\":\"chars\",\"path\":\"Data file\",\"applied\":\"Last assembly: injected\",\"dropped\":\"Last assembly: not injected\",\"droppedHint\":\"This session\u2019s agent preset declares complete: true (DSH\u2019s built-in \u201cminimal\u201d mode does), so the platform collapses the assembly into one section and plugin sections cannot enter. Switch back to standard mode.\",\"neverApplied\":\"No assembly observed yet. Send a message and look again.\",\"assemblyGlobalScope\":\"This page is global settings: assembly results only exist for a specific conversation.\",\"noPersona\":\"Last assembly: nothing to inject\",\"noPersonaHint\":\"This session has no persona selected (it is set to Off, or the selected persona's text is empty), so there was nothing to put into the system prompt this turn. That is the result of the current setting, not something being overridden.\",\"orderTrace\":\"Real section order from the last assembly\",\"switchesTitle\":\"Input suppression switches\",\"switchesHint\":\"Each switch removes one class of system-side input the model would otherwise see. All four on with no active persona = pure chat (zero system-side injection) \u2014 the starting point of a free web chat.\",\"swSoloLabel\":\"Persona only (suppress every other system-prompt section)\",\"swSoloHint\":\"Harness identity, deployment persona, tool guidance, plan-mode policy and harness-source notes are all withheld. With no persona selected the system prompt is empty.\",\"swRuntimeLabel\":\"Suppress runtime context\",\"swRuntimeHint\":\"Two families: (1) sandbox policy, approval policy and delegation rules \u2014 dynamic context delivered as user-role snapshots; (2) the runtime snapshot and skill catalog framed as `<system-reminder>` blocks (these really appear in creation mode, whose preset mounts its own skill directory). Neither lives in the system prompt, so \\\"persona only\\\" cannot reach them either \u2014 they can only be filtered by provenance before assembly. This switch now drops both.\",\"swToolsLabel\":\"Suppress tool schemas\",\"swToolsHint\":\"Tool definitions travel as a separate wire field, not as a system-prompt section, and are usually the biggest token item. With this on the model has nothing to call.\",\"swInjectedLabel\":\"Suppress history injections (workspace instructions / time readings)\",\"swInjectedHint\":\"The AGENTS.md / CLAUDE.md instruction baseline and the per-step time readings from dsh-time-context. These are likewise user-role messages appended by plugins rather than prompt sections, so they can only be filtered by provenance.\",\"pureChatButton\":\"Make it pure chat\",\"restoreButton\":\"Restore system input\",\"pureChatHint\":\"clears the persona selection and turns all four switches on\",\"pureChatState\":\"Pure chat is active: zero system-side injection \u2014 the model sees only your messages.\",\"pureChatOn\":\"Switched to pure chat\",\"restoreDone\":\"System input restored: all four switches cleared\",\"switchesSaved\":\"Switches saved; effective on the next turn\",\"strippedMessages\":\"Injected messages filtered in this conversation\",\"stripStatusTitle\":\"System injection blocks (filtered in this session)\",\"stripKindRuntime\":\"runtime snapshot\",\"stripKindSkill\":\"skill catalog\",\"stripKindInstructions\":\"workspace instructions\",\"stripKindTime\":\"time readings\",\"soloNoPersona\":\"\u201cPersona only\u201d is on but no persona is selected \u2014 the system prompt will be empty.\",\"soloSavings\":\"Size with only the persona kept\",\"sectionsUnit\":\"sections\",\"toolReusableLabel\":\"Reusable tools\",\"toolReusableHint\":\"Safety valve for \u201cSuppress tool schemas\u201d. DSH\u2019s tool ledger requires a non-empty tool-declaration baseline for the session: once that baseline is emptied, tools that come back are all marked deferred (defer_loading) and the provider rejects the request (INVALID_REQUEST). When checked, the plugin keeps the full tool list for one turn at exactly two moments \u2014 the session\u2019s first request, and a suspected declaration-series restart (a compaction, for example) \u2014 so a non-empty baseline is written. Afterwards tools can always be brought back no matter how you toggle \u201cSuppress tool schemas\u201d. Unchecked means no protection at all.\",\"toolStripHeldFirst\":\"Tools were kept this turn: this session has no tool-declaration baseline yet. Letting it be established with the full tool list first \u2014 stripping starts from the next turn (otherwise the tools can never come back).\",\"toolStripHeldRestart\":\"Tools were kept this turn: this request appears to restart the tool-declaration series (a compaction, for example). Letting the new baseline be established with the full tool list first \u2014 stripping continues from the next turn.\",\"toolBaselineEmpty\":\"This session\u2019s tool-declaration baseline is empty \u2014 the session\u2019s first request carried no tools at all. Tools that come back are all marked deferred and the provider rejects the request (INVALID_REQUEST). Start a new conversation to get tools back.\",\"indicatorSession\":\"Session\",\"indicatorGreen\":\"Green: all good \u2014 the tool baseline is usable.\",\"indicatorYellow\":\"Yellow: \u201cReusable tools\u201d is unchecked. Stripping no longer protects the tool-declaration baseline, so a session\u2019s baseline can be emptied and its tools can never come back.\",\"indicatorRed\":\"Red: this session\u2019s first request carried no tools at all (empty tool-declaration baseline). Tools that come back would be deferred and rejected by the provider; they cannot return within this session \u2014 start a new conversation.\",\"storeError\":\"Could not read the data file\",\"warningsSummary\":\"Things to check\",\"warningsShow\":\"Show\",\"warningsHide\":\"Hide\",\"loading\":\"Loading\u2026\",\"retry\":\"Retry\",\"chunkFailed\":\"This part of the interface failed to load\",\"createHint\":\"Creating (not saved yet)\",\"editHint\":\"Editing\",\"blankText\":\"The text is empty; saving will be rejected.\",\"blankSaveRefused\":\"Save refused: the persona text is empty \u2014 for an empty persona, turn on \u201cOff\u201d\",\"orderLabel\":\"Section order weight\",\"orderHint\":\"Sort weight of the persona section in the system prompt: lower comes first (default -1, before the preset line \u201cYou are a coding agent\u2026\u201d). It only changes section order and never enters the persona text. Each persona keeps its own weight, so this box follows whichever persona you are editing. Click Save to apply \u2014 validated on save: it must be an integer.\",\"orderDefaultButton\":\"Default\",\"orderFollowButton\":\"Follow\",\"orderFollowText\":\"Appended after the system prompt\",\"orderFollowHint\":\"Puts the weight after every system-prompt section (the same approach as prompt management). Click this box to go back to a number. Click Save to apply.\",\"orderProblemEmpty\":\"The section order weight cannot be empty: type an integer, or use \u201cDefault\u201d / \u201cFollow\u201d.\",\"orderProblemInteger\":\"The section order weight must be an integer (for example -1, 0, 10200): decimals such as 0.1, exponents and units are not legal section orders \u2014 they would make the system prompt assembly invalid. You typed\",\"orderProblemRange\":\"The section order weight must be an integer between -1000000000 and 1000000000.\",\"orderSaved\":\"Section order saved\",\"hintLabel\":\"Help\",\"unnamed\":\"Untitled\",\"clearDraft\":\"Clear\",\"historyTitle\":\"Persona conversation history\",\"historySubtitle\":\"A stretch of \\\"already happened\\\" conversation, locked into this persona. While this persona is active, the first step of every new session injects it as model-side history; conversations that already happened are never touched. If you need a conversation that already started to carry history across a persona switch, you can put that history text into the persona body itself \u2014 but the result is poor, so this is not recommended.\",\"historyTabEdit\":\"Edit by hand\",\"historyTabImport\":\"Import a session log\",\"historyFormatHint\":\"Default format:\\nWrap user-side content in <user_message>; wrap the model side\u2019s thinking in <thinking> and its spoken content in <assistant_message>; wrap non-conversational or multimodal content from either side in <file>. Close every tag with \u201c/\u201d (for example <user_message>hi</user_message> means the user said \u201chi\u201d).\\nThis format only applies to models that support thinking, such as DeepSeek\",\"historyThinkingLabel\":\"Include thinking\",\"historyCompactLabel\":\"Expand compaction\",\"historyCompactHint\":\"By default the box gets only the compaction summaries wrapped in <compacted-summary>\u2026</compacted-summary> (copied verbatim, tags included) plus the dialogue that follows the **last** one; ordinary content before the first summary and between summaries is not imported. Ticking this box flips it: the box gets **everything except** those summaries \u2014 the compaction is expanded back into the original text. This box and \u201cInclude thinking\u201d are independent: the latter decides whether the model side\u2019s <thinking> comes along, this one decides whether the summaries stay or the rest of the text does; both apply together. When the imported text has no summary at all, ticking changes nothing and the only hint is \u201cthis history has not been compacted yet\u201d.\",\"historyCompactNone\":\"This history has not been compacted yet\",\"historyCompactNoImport\":\"Nothing imported yet: this checkbox only processes imported text.\",\"historyTokenCost\":\"cost\",\"historyImportButton\":\"Import session.vN.jsonl / .zip\",\"historyImportHint\":\"Accepts the zip produced by /export, or a bare session.vN.jsonl / session.jsonl\",\"historyImportConfirm\":\"The box already has content. Importing replaces it \u2014 continue?\",\"historyImportEmpty\":\"No usable conversation text in that file (not a single user/message or assistant/message was recognised).\",\"historyImportFailed\":\"Import failed\",\"historyChars\":\"characters\",\"historyBytes\":\"bytes\",\"historyClearButton\":\"Clear\",\"historyUndoButton\":\"Undo\",\"historySaved\":\"Conversation history saved\",\"historyCleared\":\"Conversation history cleared\",\"historyDirtyHint\":\"unsaved changes\",\"historyStored\":\"This persona has conversation history\",\"historyNotStored\":\"This persona has no conversation history yet\",\"historyMissing\":\"This persona\\u2019s history content is gone \\u2014 only the record is left\",\"historyInjectedCount\":\"History messages injected\",\"historyPlaceholder\":\"Write the history here, or switch to \u201cImport a session log\u201d \u2026\",\"personaSaved\":\"Persona saved\",\"saveFailed\":\"Save failed: \",\"nothingToSave\":\"Nothing to save.\",\"saving\":\"Saving\u2026\",\"emptyPersonaName\":\"The persona name cannot be empty.\",\"unsavedTitle\":\"Not saved yet:\",\"unsavedPersona\":\"persona (name / text)\",\"unsavedOrder\":\"section order weight\",\"unsavedHistory\":\"conversation history\",\"switchConfirm\":\"Switching personas discards these unsaved changes:\",\"switchConfirmTail\":\"Continue?\",\"scopeTabCurrent\":\"Current\",\"scopeTabGlobal\":\"Global\",\"scopeSession\":\"Session\",\"scopeLayerCurrent\":\"this chat\",\"scopeLayerGlobal\":\"global\",\"pickerLayerHint\":\"This chat: settings for this conversation \u00b7 Global: what new conversations follow\",\"indicatorYellowHistory\":\"Yellow: the selected persona\u2019s conversation history no longer matches what was injected into this session (the persona history was edited or cleared after this session started). This session will not be injected again, so it keeps the old content \u2014 re-import the history and start a new conversation to change it.\",\"indicatorRedPersonaMissing\":\"Red: the persona selected for this session has been deleted, so the persona section is empty. Pick another one in the persona list.\",\"indicatorYellowPersonaDropped\":\"Yellow: this session\u2019s persona text never made it into the system prompt \u2014 its preset declares a section with complete: true (the built-in minimal mode does), so the platform replaces the whole system prompt with that one section. That is the mode working as designed, not a failure; only the persona conversation history is still injected. To make the persona text take effect, switch mode (standard / PTC / cordis) or write it into that preset.\",\"indicatorYellowMinimal\":\"Yellow: this conversation uses the minimal mode \u2014 its preset declares a complete section, so the platform collapses the system prompt into that single section and this plugin\u2019s persona section cannot enter (the persona text never takes effect; the persona conversation history is still injected). Switch back to standard / PTC / cordis mode to make the persona text effective.\",\"indicatorYellowNotCarried\":\"Yellow: this conversation has already been chatting, so this persona\u2019s conversation history will not be injected (history is injected only at the first step of a new session). To make this history take effect, start a new conversation.\"}";

    /** 英文文案表；`null` = 还没被真正需要过。 */
    let enTable = null;

    /** 第一次真的用到英文文案时，才把它解析出来（之后共用这一份）。 */
    const enOf = () => {
      if (enTable === null) enTable = JSON.parse(EN_JSON);
      return enTable;
    };

    /**
     * 取 `target` 自己的键（不看原型链）。
     *
     * 只是 `Object.prototype.hasOwnProperty.call` 的一个短名字：这几处判据在
     * 一个渲染周期里会被调很多次，写全名太吵。
     *
     * ⚠ 排在 `en` 代理**之前**（ps2 档位 1 · A3）：三个 trap 会调它，而 `const`
     * 有 TDZ —— 只要将来有谁在初始化期碰一下 `en`，排在后面就是 `ReferenceError`。
     */
    const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);

    /**
     * 交给语言服务的那一份「英文词典」。
     *
     * 形状上就是一个普通对象（`Object.keys` / 取值 / `in` / `Object.entries`
     * 全都对），但**内容直到真被取用才建**：`locale.register()` 只做一层
     * `Object.entries({ zh, en })`（不会碰词典内部），而查找走的是
     * 「先 zh、后 en」的回落链 —— 中文界面在 zh 上就命中了。
     */
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

    /**
     * 四个「输入抑制」开关在 UI 里的顺序与文案键。
     * key 必须与 lib/store.js 的 SWITCH_KEYS 完全一致。
     */
    const SWITCH_FIELDS = [
      { key: 'soloOnly', label: 'swSoloLabel', hint: 'swSoloHint' },
      { key: 'stripRuntime', label: 'swRuntimeLabel', hint: 'swRuntimeHint' },
      { key: 'stripTools', label: 'swToolsLabel', hint: 'swToolsHint' },
      { key: 'stripInjected', label: 'swInjectedLabel', hint: 'swInjectedHint' },
    ];

    /**
     * 会被「屏蔽 runtime 上下文 / 屏蔽历史注入」压掉的四类注入块（0.3.4）。
     *
     * 它们的共同点：**不是系统提示词的段**，而是别的插件按 user 角色追加的
     * 消息，所以只能在 `agent/pre-step` 里按 `source.kind` 精确过滤。
     * `kind` 必须与 Host 半边（`index.js` 的 STRIPPED_SOURCE_KINDS /
     * RUNTIME_BLOCK_SOURCE_KINDS）逐字一致。
     */
    const STRIP_KIND_FIELDS = [
      { kind: 'runtime-context', label: 'stripKindRuntime' },
      { kind: 'skill-catalog', label: 'stripKindSkill' },
      { kind: 'agent-instructions', label: 'stripKindInstructions' },
      { kind: 'time-context', label: 'stripKindTime' },
    ];

    /** 最近一次绑定到的 t，供信号量不足时的降级卡片复用。 */
    let fallbackT = (key) => key;

    /**
     * 段序权重的合法区间。必须与 Host 半边 `lib/store.js` 里的
     * `MIN_SECTION_ORDER` / `MAX_SECTION_ORDER` 一致：那一边是权威，
     * 这一边只是为了让「保存」在被点下的那一刻就给出提示，而不是等一个来回。
     */
    const ORDER_MIN = -1000000000;
    const ORDER_MAX = 1000000000;

    /**
     * 校验输入框里的段序权重。
     *
     * 规矩（与 Host 半边逐条一致）：不能为空；必须写成整数（`[+-]?\d+`）；
     * 必须是安全整数且在区间内。小数（`0.1`）、指数（`1e3`）、单位、`NaN`、
     * `Infinity` 全部不收 —— 平台的 `systemPrompt.section()` 只认有限数，
     * 而段序在 DSH 里是整数语义，写坏了会让装配直接失败。
     * @param {string} raw - 输入框里的原始文本。
     * @returns {{ok: true, value: number}|{ok: false, code: 'empty'|'integer'|'range'}} 结论。
     */
    function checkOrderInput(raw) {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text === '') return { ok: false, code: 'empty' };
      if (!/^[+-]?\d+$/.test(text)) return { ok: false, code: 'integer' };
      const value = Number(text);
      if (!Number.isSafeInteger(value) || value < ORDER_MIN || value > ORDER_MAX) return { ok: false, code: 'range' };
      return { ok: true, value };
    }

    /**
     * 发一次请求，拿回原始响应文本。
     *
     * 把「拿文本」和「解析 JSON」拆成两步，是为了让轮询那条路径能**先比字符串**：
     * `/state` 一字未变时直接返回，连 `JSON.parse` 带重渲染一起省掉（0.2.2）。
     * @param {string} path - 相对本插件前缀的路径，例如 `/state`。
     * @param {RequestInit} [init] - fetch 选项。
     * @returns {Promise<{response: Response, raw: string}>} 响应对象与原始文本。
     * @throws {Error} 网络失败（含 30 秒超时）时。
     */
    async function fetchText(path, init) {
      const headers = { accept: 'application/json' };
      if (init !== undefined && init !== null && typeof init.body === 'string') {
        headers['content-type'] = 'application/json';
      }
      // 档位 4（R7）：调用方给的 headers 必须**合并**进来，不能像以前那样被整个
      // 盖掉 —— 否则 `/state` 的 `if-none-match` 根本发不出去，304 永远命中不了。
      // 顺序：先是 accept / content-type，再让调用方覆盖（调用方更知道这次要什么）。
      if (init !== undefined && init !== null && init.headers !== null && typeof init.headers === 'object') {
        for (const [name, value] of Object.entries(init.headers)) headers[name] = value;
      }
      // 超时保护：请求挂死时，按钮不该永远停在「保存中…」。老 WebView 没有
      // `AbortController` 就退化成「不设超时」，与 0.2.1 行为一致。
      // 0.3.23：阈值按**这一次请求的体积**取（大上传更宽，见 `timeoutForBody()`）。
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
              // 已经结束了。
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

    /**
     * 把一次非 2xx 的响应变成带 `code` / `status` 的 Error。
     * @param {string} raw - 响应原文（可能不是 JSON）。
     * @param {number} status - HTTP 状态码。
     * @returns {Error} 带业务错误码的错误对象。
     */
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

    /**
     * 调一次本插件的 REST 接口。
     * @param {string} path - 相对本插件前缀的路径，例如 `/state`。
     * @param {RequestInit} [init] - fetch 选项。
     * @returns {Promise<object>} 解析后的 JSON 对象。
     * @throws {Error} 网络失败、非 2xx、或响应不是 JSON 时；error.code 带业务错误码。
     */
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

    /**
     * 读一次完整状态，并返回一个可重用的刷新函数。
     *
     * 刷新有三个来源（0.1.4 加的后两个，修「设置页换了人设、对话选框不变」）：
     *   1. 组件自己发起的操作；
     *   2. **同页事件** `dsh-persona-select:changed` —— 任何一次写操作成功后广播，
     *      两个半边（设置页 / 对话选框）只要同时在页面上就是即时同步；
     *   3. **低频轮询**（4 秒，页面隐藏时跳过）+ 回到前台 / 窗口聚焦时立刻刷新 ——
     *      覆盖「设置页与对话选框不是同一时刻挂载」以及多标签页的场景。
     * 轮询到的是一份很小的 JSON（Host 那边只是读内存 + 一次 statSync），
     * 换来的是「显示的永远是当前人设」。
     * @param {string} [sessionId] - 客户端所在会话的 id（0.1.5）。带上它，Host 就会
     *   按**那个会话**的日志现算工具声明基线 —— 切换会话窗口时指示点立刻跟着变。
     *   没有会话上下文（设置页）就不带，Host 会报「最近一次观测」。
     * @returns {{ status: string, data: object|null, error: string|null, reload: Function }} 状态。
     */
    /**
     * 模块级「一份状态 = 一条轮询」的注册表（0.3.23 · 审计 §二.2）。
     *
     * 改前 `usePersonaState` 是**每个组件实例一份**：设置页那一块与对话输入区那个
     * 选框同时挂在页面上时（正常就是这样），两边各自每 4 秒发一次 `/state` ——
     * 即使 304 命中也还是两次请求、两份 `lastRaw` / ETag 缓存、两套定时器。
     * 会话 id 相同的两个消费者读的本来就是同一份数据，没有理由各拉一次。
     *
     * 现在按**会话 id**（`''` = 没有会话上下文）共享：同 key 的组件共用一份状态、
     * 一条轮询、一份 ETag / 原文缓存；最后一个消费者退订时整条拆掉（表里也删掉，
     * 不随会话切换无限增长）。
     */
    const personaStores = new Map();

    /**
     * 取（或建）某个 key 的共享状态。
     * @param {string} key - 会话 id；'' = 没有会话上下文。
     * @returns {object} 共享状态。
     */
    function personaStoreFor(key) {
      const existing = personaStores.get(key);
      if (existing !== undefined) return existing;
      const store = {
        key,
        state: { status: 'loading', data: null, error: null },
        listeners: new Set(),
        /** 上一次落地的响应原文：一字未变就既不解析也不重渲染（0.2.2）。 */
        lastRaw: null,
        /**
         * 上一次拿到的 ETag（档位 4 · R7）。没变就只回一个**空 body 的 304**。
         * ⚠ `lastRaw` 必须留着：它是「一帧内两个半边同时刷新」的判据，
         * ETag 只是提前一步省字节，两件事不重叠。
         */
        lastEtag: null,
        /** 轮询与手动刷新会并发；只让「最新那一次」落地，慢的旧响应直接丢掉。 */
        seq: 0,
        /** 还有几个组件在用这份状态（0 → 拆掉轮询）。 */
        refs: 0,
        timer: null,
        inflight: null,
        onChanged: null,
        onVisible: null,
      };
      personaStores.set(key, store);
      return store;
    }

    /** 把新状态发给全部订阅者（只在状态**真的**变了时调）。 */
    function personaStoreEmit(store) {
      for (const listener of [...store.listeners]) {
        try {
          listener();
        } catch {
          // 一个订阅者出错不该挡住别的（也不该冒到渲染期）。
        }
      }
    }

    /** 结算一次状态：与上一份逐项相同就什么都不做（省掉一次整树重渲染）。 */
    function personaStoreApply(store, next) {
      const previous = store.state;
      if (previous.status === next.status && previous.data === next.data && previous.error === next.error) return;
      store.state = next;
      personaStoreEmit(store);
    }

    /** 真正发一次 `/state` 并把结果落进共享状态。**永不抛**。 */
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
          // 档位 4（R7）：304 = 内容一字未变。**必须排在 `!response.ok` 之前** ——
          // 304 的 `ok` 是 false，排后面会被下面那句当成错误报出来，
          // 于是每 4 秒报一次「请求失败」（本档最容易踩的坑）。
          if (response.status === 304) return;
          const etag = response.headers?.get?.('etag');
          if (typeof etag === 'string' && etag !== '') store.lastEtag = etag;
          // 轮询占绝大多数：内容一字未变时直接返回。省掉的不只是 JSON.parse，
          // 还有「每次都造一个新 data 对象 → 整张卡片重渲染」（0.2.2）。
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

    /**
     * 刷新这份共享状态。
     * @param {object} store - 共享状态。
     * @param {boolean} coalesce - true：已经有请求在飞就**复用它**（轮询用这条，
     *   两个消费者同时到点不该发两次）；false：一定发一次**新的**请求
     *   （写操作之后的刷新走这条 —— 绝不能拿写之前那次在飞的结果当回执）。
     * @returns {Promise<void>} 刷新结束（成功或失败）。
     */
    function personaStoreReload(store, coalesce) {
      if (coalesce === true && store.inflight !== null) return store.inflight;
      const run = personaStoreFetch(store);
      const tracked = run.then(() => {
        if (store.inflight === tracked) store.inflight = null;
      });
      store.inflight = tracked;
      return tracked;
    }

    /** 挂上窗口广播 / 聚焦 / 回到前台 / 4 秒轮询（每个 key 只有一份）。 */
    function startPersonaStore(store) {
      try {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        // 广播与聚焦都是「本地刚改过东西」，必须发**新**请求：不能复用可能在
        // 写之前就发出去的那一次（否则界面要等到下一次轮询才跟上）。
        const onChanged = () => {
          personaStoreReload(store, false);
        };
        store.onChanged = onChanged;
        window.addEventListener(PERSONA_CHANGED_EVENT, onChanged);
        window.addEventListener('focus', onChanged);
        store.timer = setInterval(() => {
          // 页面在后台时不做无意义的轮询（回来时会由 visibilitychange 补一次）。
          try {
            if (typeof document !== 'undefined' && document.hidden === true) return;
          } catch {
            // 拿不到 document.hidden 就当它在前台。
          }
          personaStoreReload(store, true);
        }, PERSONA_POLL_MS);
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          store.onVisible = onChanged;
          document.addEventListener('visibilitychange', onChanged);
        }
      } catch {
        // 拿不到 window / document：退化成「只在操作后刷新」，不能让组件崩。
      }
    }

    /** 拆掉窗口监听与定时器。 */
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
        // 卸载路径上不抛。
      } finally {
        store.timer = null;
        store.onChanged = null;
        store.onVisible = null;
      }
    }

    /**
     * 读一次完整状态，并返回一个可重用的刷新函数。
     *
     * 刷新有三个来源（0.1.4 加的后两个，修「设置页换了人设、对话选框不变」）：
     *   1. 组件自己发起的操作；
     *   2. **同页事件** `dsh-persona-select:changed` —— 任何一次写操作成功后广播，
     *      两个半边（设置页 / 对话选框）只要同时在页面上就是即时同步；
     *   3. **低频轮询**（4 秒，页面隐藏时跳过）+ 回到前台 / 窗口聚焦时立刻刷新 ——
     *      覆盖「设置页与对话选框不是同一时刻挂载」以及多标签页的场景。
     * 轮询到的是一份很小的 JSON（Host 那边只是读内存 + 一次 statSync），
     * 换来的是「显示的永远是当前人设」。
     *
     * 0.3.23：同一会话 id 的多个组件**共用一份状态与一条轮询**（见
     * {@link personaStoreFor}）—— 设置页与对话框同时在页面上时，4 秒一次的那条
     * 请求从 2 条降到 1 条，ETag / 原文缓存也共用一份。
     * @param {string} [sessionId] - 客户端所在会话的 id（0.1.5）。带上它，Host 就会
     *   按**那个会话**的日志现算工具声明基线 —— 切换会话窗口时指示点立刻跟着变。
     *   没有会话上下文（设置页）就不带，Host 会报「最近一次观测」。
     * @returns {{ status: string, data: object|null, error: string|null, reload: Function }} 状态。
     */
    function usePersonaState(sessionId) {
      const wanted = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '';
      const store = personaStoreFor(wanted);
      const [snapshot, setSnapshot] = React.useState(store.state);
      // 订阅这一份共享状态（快照与 store.state 同源，逐项相同时 `Apply` 不会发通知）。
      React.useEffect(() => {
        const listener = () => setSnapshot(store.state);
        store.listeners.add(listener);
        return () => {
          store.listeners.delete(listener);
        };
      }, [store]);
      // 第一个消费者挂轮询、最后一个消费者拆掉它；同时立刻拉一次。
      //
      // ⚠ 0.3.23：**只有第一个消费者**那一次立刻拉。第二个消费者（同一个会话的
      // 另一个半边）加入时不再单独发一条 —— 那份数据正被第一个消费者的 4 秒轮询
      // 保持新鲜，刚挂上的这一份最多旧 4 秒；再发一条就等于把「两个半边各自轮询」
      // 换个方式又做了一遍（实测：会话相同的两个组件挂载时仍会多出 1 条请求）。
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
          // 没人用了就把这一格从表里摘掉：状态本身没有订阅者了（与改前「组件卸载
          // 即丢」等价），表也不会随会话切换无限增长。
          if (personaStores.get(store.key) === store) personaStores.delete(store.key);
        };
      }, [store]);
      const reload = React.useCallback((options) => personaStoreReload(store, options?.coalesce === true), [store]);
      return { status: snapshot.status, data: snapshot.data, error: snapshot.error, reload };
    }

    /**
     * 广播「状态被本地改过了」，同一个页面上的另一个半边立刻重新拉一次。
     *
     * **也包括自己** —— 自己的 `usePersonaState` 同样挂了这个事件的监听器。
     * 所以拿到 `true` 的调用方就不必再 `reload()` 一遍（0.2.2：一次写操作
     * 原来会为同一个实例拉两次 `/state`）。
     * @returns {boolean} 广播成功 = true；false 表示调用方得自己刷新。
     */
    function notifyPersonaChanged() {
      try {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return false;
        if (typeof Event !== 'function') return false;
        window.dispatchEvent(new Event(PERSONA_CHANGED_EVENT));
        return true;
      } catch {
        // 广播失败没关系：还有轮询兜底。
        return false;
      }
    }

    /* ─────────── 当前对话是哪一个（0.2.8）─────────── */

    /**
     * 客户端 `sessions` 服务的落点。设置页要回答「现在是哪个对话」，
     * 而 `settings.section` 这个槽位本身不带会话上下文。
     */
    const sessionsHolder = { service: null };

    /**
     * 兜底的「当前会话」订阅：直接盯 `ctx.sessions.list` 这个 store。
     *
     * 正常情况下槽位会把 `useSessions` 当 standardProp 递进来，我们优先用它；
     * 这个兜底是给「槽位没递」或「换了一版槽位契约」留的路 —— 两条路都只订阅，
     * 都不写。
     * @param {(state: object) => unknown} selector - 选择器。
     * @returns {unknown} 选择结果。
     */
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

    /**
     * 没有宿主 `useSessions` 时，顶上**「宿主那一格」**的空实现（K1，档位 2）。
     *
     * 它必须与宿主的实现占**同样数量的记忆位**。宿主那个位置递进来的是
     * `dsh-client-ui-renderer` 的 `bindSnapshotSelector()`；K1 当时的说法是里面
     * 恰好一次 `useSyncExternalStoreWithSelector(...)` —— 也就是 **1 格**。所以
     * 这里只用 1 个 `useRef`：多一格少一格都会让后面的记忆位在切换时错位。
     *
     * ⚠ C2 / I3（审计 `client.md` §5 · ps2 档位 2）：上面那个「1 格」是**未经真机验证的假设**。
     * 读上游内联的 `use-sync-external-store@1.2.0`
     * （`dsh-client-ui-renderer/lib/client.js` 的 `require_with_selector_production_min`
     * 与 `bindSnapshotSelector()`）数出来是
     * `useRef(1) + useMemo(1) + useSyncExternalStore(2) + useEffect(1)`，
     * 开发构建再加一个 `useDebugValue(1)` —— **约 5 格**（这是**读码**，不是实测）。
     *
     * **0.3.23：这个「未验证风险」被消掉了 —— 不再需要真机去数它。**
     * 既然这一格只在「第一帧就没有宿主」的实例上出现、而 `useSessionSource`
     * 已经把实现**一次性定档**（定档之后永远只调同一个函数），那么替身与宿主
     * 的格数是否相等就不再影响任何东西：同一个实例一生只调其中**一个**，
     * 帧与帧之间恒定。真机再数出什么数都不会改变这个结论。
     * 可复跑的探针仍是 `ps2/stage2/tests/i3-hook-budget.mjs`（它量的是相对差），
     * 0.3.23 新增的 `ps3/tests/c6-hook-latch.mjs` 直接量「宿主中途出现」时的逐帧格数。
     * @param {(state: object) => unknown} _selector - 选择器（空实现用不到）。
     * @returns {undefined} 永远「没有结论」。
     */
    function useAbsentSessions(_selector) {
      React.useRef(null);
      return undefined;
    }

    /**
     * 取「当前会话」信息的**唯一入口**（K1，档位 2 的修法核心）。
     *
     * 0.3.18 的写法是「宿主给了能力就用宿主的，否则用插件自己的兜底版本」——
     * 两条路的**记忆位数量不同**（宿主的 1 格 vs 兜底的 `useState` + `useEffect`
     * 2 格）。于是只要在同一个面板的生命周期里，宿主的能力从「暂时没有」变成
     * 「有了」（或者反过来），这个组件用掉的记忆位数量就变了，React 会当场抛
     * 「这次渲染比上次多用了 hook」，**整块设置页白掉** —— 而且抛在渲染期间，
     * 外围那个「兜住一切、显示一张可读卡片」的保护盖不到它。
     *
     * 修法：**两条路的记忆位都永远占着**，只是结果二选一。
     *   · 「宿主那一格」永远调用一次 —— 见过的宿主函数记在 ref 里，所以即使
     *     某一帧的 props 里**没有**它，这一格也不会消失（这正是原来会错位的
     *     那一步）；从没见过宿主时用 {@link useAbsentSessions} 这个等量的替身顶上。
     *   · 兜底那两格也永远调用一次，只是有宿主时不看它的值。
     * 于是这个组件的记忆位数量恒定为 `宿主那 1 格 + 兜底那 2 格 = 3 格`，
     * **两个方向都不会变**（宿主能力来了、或者又走了）。
     *
     * ref 里那个引用**每帧都会更新**（只要这一帧真的递来了宿主函数），所以
     * 「同一实例上换一个宿主实现」仍然立即生效 —— 只有「这一帧没递」才会沿用
     * 上一次那个（它是 `standardProps` 缓存出来的稳定函数，继续调用是安全的）。
     *
     * 代价（Q K1 里说清过）：即使有宿主，兜底那份订阅也会挂上——同一个 store
     * 多订一次，换掉「宿主能力来去就白屏」这个隐患，值。
     * @param {Function|undefined} useSessionsProp - 槽位递进来的 `useSessions`。
     * @param {(state: object) => unknown} selector - 选择器。
     * @returns {unknown} 选中的值（宿主缺席时来自插件自己的兜底实现）。
     */
    function useSessionSource(useSessionsProp, selector) {
      const hostRef = React.useRef(null);
      const provided = typeof useSessionsProp === 'function';
      if (provided) hostRef.current = useSessionsProp;
      const host = hostRef.current;
      const fromHost = (host === null ? useAbsentSessions : host)(selector);
      const fromFallback = useSessionsFallback(selector);
      // 值只看**这一帧**有没有宿主：这一帧没有它，就用兜底那份（哪怕上一帧有）。
      return provided ? fromHost : fromFallback;
    }

    /**
     * 把「宿主能力来去」的**白屏**降级成**一次重挂载**（0.3.23 · 审计 §三.2）。
     *
     * 背景：`useSessionSource` 那个位置调的是「宿主递进来的 hook」还是插件自己的
     * 1 格替身 `useAbsentSessions`，两者**占的 hook 格数不一定相同**（宿主那个是
     * `useSyncExternalStoreWithSelector`，上游读码约 5 格；替身 1 格）。
     * 如果某个外壳第一帧没递 `useSessions`、后来递了，同一个实例的 hook 格数就会
     * 中途变化 —— 真 React 当场抛 "Rendered more hooks than during the previous
     * render"，**整块界面白掉**，而且抛在渲染期，外层那张「可读错误卡片」盖不到。
     *
     * 处置：不去猜宿主占几格（那是**上游的私有实现细节**，每次升级都可能变），
     * 而是在外面套一层**零 hook** 的壳，把「这一帧有没有宿主」写进内层元素的
     * `key`。key 一变，React 就把内层**卸载重挂**，hook 记忆位随之重置 ——
     * 于是「格数不等」这件事永远没有机会被 React 发现。
     *
     * 代价：宿主能力真的来/去时，界面会**重挂一次**（选中态、滚动位置回到初始，
     * 并且重新拉一次 `/state`）。这只发生在极端情况下，比白屏好得多。
     *
     * ⚠ 为什么不是「把两条路的格数做成一样」：那要写死上游 hook 的格数（读码约 5 格，
     * 开发构建还多一个 `useDebugValue`），上游一改就是**新的**白屏风险；
     * 也不影响 0.3.23 之前的正常路径 —— 正常路径上 `useSessions` 从第一帧就有，
     * key 恒定，一次多余的挂载都不会发生。
     *
     * 真机依据（为什么可以判断「正常路径上它一直在」）：上游
     * `dsh-client-ui-renderer` 的 `maybeObservableHook(source)` 在 source 缺席时
     * **返回的是另一个同形 hook** `useAbsentSnapshot`（它自己也走
     * `observableHook(absentSource)`），而不是 `undefined` —— 也就是标准源那一层
     * 保证「这一格永远是个函数、格数恒定」。本插件那个 1 格替身于是只在
     * **非渲染器外壳**（压根不递 standardProps）里才会被用上。见
     * `ps3/tests/c6-hook-remount-key.mjs`。
     * @param {Function} Impl - 真正的组件实现。
     * @param {object} props - 槽位递进来的 props。
     * @returns {object} 内层元素（带上决定重挂载的 key）。
     */
    function keyedByHostPresence(Impl, props) {
      const hasHost = props !== null && props !== undefined && typeof props.useSessions === 'function';
      return h(Impl, { ...props, key: hasHost ? 'session-host' : 'session-fallback' });
    }

    /**
     * 找「主视图正在看的那个会话」：它由 `mainView` 这条 retain 标记，
     * 打开设置面板**不会**释放它（面板与主视图是同一份选择）。
     *
     * ⚠ 会话列表行里的字段叫 **`id`**，不是 `sessionId` —— 行是由
     * `SessionController.projectList()` 造的：`byId[entry.sessionId] = { id: entry.sessionId, … }`，
     * 而 `sessionId` 只出现在上游的 `SessionSummary`（`items`）里，不在 `byId` 的行上。
     * 0.2.8 读的是 `row.sessionId`，于是永远拿到空串、设置页永远只有「全局」页
     * （0.2.9 修的就是这个）。第一方的读法也都是 `?.id`（见 `ui-layout` 的
     * DocumentTitle、`ui-workspace` 的 `mainSessionId`、`ui-session` 的 `publishMain`），
     * 这里保留 `sessionId` 作为旧形状的兜底。
     * @param {object|null} state - 会话列表快照。
     * @returns {string} 会话 id；没有就是空串。
     */
    function pickMainSessionId(state) {
      if (state === null || state === undefined || typeof state !== 'object') return '';
      // 更老的形状把选中的会话直接放在 `current` 上（0.1.6-alpha.2 之前）；
      // 有就先认它，别的地方（本地壳的 sessions-compat）也是这个次序。
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

    /**
     * 「当前对话」那一整行：**一次订阅拿齐三样**（id / 标题 / 是不是空对话）。
     *
     * 档位 4（R6 · Q 方向 a）。以前这三样各自调一次 `useSessionSource`，于是同一个
     * sessions store 在一个设置页上挂了 **3 份兜底订阅 + 3 次宿主 hook = 12 格**，
     * store 一动设置页要重渲染判定 4 次（含宿主那一路）。三样本来就出自**同一个
     * 快照**，一次拿齐就够了。
     *
     * ⚠ 两条不能动的纪律：
     *   1. **不许在合并里引入按条件调用的 hook** —— 这一句必须无条件执行一次；
     *   2. `useSessionsFallback` 本体不动，`useEffect` 仍挂在同一位置（合并后
     *      只剩 1 处，正是收益）；`useAbsentSessions` 也不许删（它唯一的作用
     *      就是占「宿主那一格」）。
     *
     * I3（档位 2 的契约）在这里的结论：合并后格数 12 → 4，**帧与帧之间仍恒定**，
     * 所以「宿主能力来去不白屏」这条性质不受影响。但 I3 那条真机探针（宿主那一格
     * 到底占 1 格还是读码看到的约 5 格）**仍未在本机跑过** —— 这一段不依赖那个
     * 数字，也不去猜它。
     * @param {Function|undefined} useSessionsProp - 槽位递进来的 `useSessions`。
     * @returns {{sessionId: string, title: string, blank: boolean|undefined,
     *   parent: string|null|undefined}} 那一行（含它的父会话 id）。
     */
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

    /**
     * 会话行里的「给人看的标题」（0.3.14）。
     *
     * DSH 的会话行（`SessionController.projectList()` 造的那一行）同时带：
     *   - `displayTitle`：**就是界面标题栏显示的那一个** —— 有持久标题就用它，
     *     否则退成工作目录名，再退成会话 id（见 `displayTitleOf()`）；
     *   - `title`：只有存在**持久标题**时才有这个键（没取过名字的会话没有）。
     *
     * 设置页要显示的是「当前会话的标题」，所以 `displayTitle` 优先；它不在时再退
     * 到 `title`（老形状 / 别处投影过来的行）；都没有就返回空串，调用方自己决定
     * 退回显示 id（不能在这里硬塞 id：那会让「没标题」和「标题就是 id」混在一起，
     * 调用方也就没法把 id 放到 `title` 提示里）。
     * @param {object|null} state - 会话列表快照。
     * @param {string} sessionId - 会话 id。
     * @returns {string} 标题；认不出来时是空串。
     */
    function sessionTitleOf(state, sessionId) {
      if (sessionId === '') return '';
      const row = state?.byId?.[sessionId];
      if (row === null || row === undefined) return '';
      if (typeof row.displayTitle === 'string' && row.displayTitle !== '') return row.displayTitle;
      if (typeof row.title === 'string' && row.title !== '') return row.title;
      return '';
    }


    /**
     * 这个会话是不是「新建的空对话」。
     *
     * 用它决定 `PUT /resident` 要不要请 Host 采样：空对话对应「全局」设置，
     * 采样要等第一条消息。查不到行时返回 `undefined`（= 不给意见），
     * Host 会退化成「只有活着且有内容才采样」。
     * @param {object|null} state - 会话列表快照。
     * @param {string} sessionId - 会话 id。
     * @returns {boolean|undefined} 结论。
     */
    function blankOf(state, sessionId) {
      if (sessionId === '') return undefined;
      const row = state?.byId?.[sessionId];
      if (row === null || row === undefined) return undefined;
      return row.blank === true;
    }


    /**
     * 这个会话的**直系父会话 id**（0.3.25）。
     *
     * 转发给 Host 的 `PUT /resident`：「给这个会话采样一份记录」时该抄哪一层
     * （父会话那一层，还是全局那一层）。Host 自己在「这个会话还没恢复完」时
     * **读不到** header（`sessions.get()` 拿不到），于是既读不到
     * `parentSession`，也无从判断「它到底是不是谁的子会话」—— 那一行的
     * 「父是谁 / 没有父」只有这里知道。
     *
     * ⚠ 字段名是 **`parentId`**，不是 `parentSessionId`：行由
     * `SessionController.projectList()` 造，那里把上游 `SessionSummary` 的
     * `parentSessionId` 改名成 `parentId` 才放进 `byId`
     * （`entry.parentSessionId !== undefined ? { parentId: entry.parentSessionId } : {}`）
     * —— 与 `id` / `sessionId` 那一对是同一个坑（见 `pickMainSessionId()` 的
     * 说明）。`parentSessionId` 作为**老形状**的兜底留着。
     *
     * 返回值刻意是**三态**，因为 Host 必须区分「没有父」与「不知道」：
     *   · `undefined` = 连这一行都没有（与 `blankOf()` 同源，都是「不给意见」）；
     *   · `null` = 有这一行，而它**没有父** —— Host 可以放心按全局层采样；
     *   · 字符串 = 父会话 id —— Host 从父会话的有效层继承。
     * 「不知道」时不能顺手当成「没有父」：给一个子会话抄一份全局快照是**不会被
     * 纠正**的错值（Host 那边的采样只发生一次）。
     * @param {object|null} state - 会话列表快照。
     * @param {string} sessionId - 会话 id。
     * @returns {string|null|undefined} 父会话 id / 没有父 / 不知道。
     */
    function parentOf(state, sessionId) {
      if (sessionId === '') return undefined;
      const row = state?.byId?.[sessionId];
      if (row === null || row === undefined) return undefined;
      if (typeof row.parentId === 'string' && row.parentId !== '') return row.parentId;
      if (typeof row.parentSessionId === 'string' && row.parentSessionId !== '') return row.parentSessionId;
      return null;
    }


    /**
     * 淡色正文用的字色（0.3.14）。
     *
     * **不能用 `opacity`**：它会把整棵子树一起调淡，塞在里面的问号气泡也会变成
     * 半透明（气泡底下的字会透出来）。这里给文字一个不透明的次级色 —— 取自 DSH
     * 主题的 `--dsw-alias-label-secondary`，取不到时用中性灰兜底（与插件里其它
     * 中性色同一路数）。
     */
    const DIM_TEXT = 'var(--dsw-alias-label-secondary, #61666b)';

    /** 常用内联样式，避免依赖未探明的设计令牌。 */
    const S = {
      root: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 980 },
      h2: { margin: 0, fontSize: 18, fontWeight: 600, lineHeight: '26px' },
      /**
       * 「淡一点的正文字」（0.3.14 改）。
       *
       * 以前这里是 `opacity: 0.75` —— 它把**整棵子树**一起调淡，于是塞在里面的
       * 问号气泡（`Hint` 的浮层）也跟着变半透明，气泡底下的字会透出来。
       * 现在改成给文字本身一个不透明的次级色：气泡有自己的底色，不再受影响
       * （`--dsw-alias-label-secondary` 取自 DSH 主题，取不到时用中性灰兜底）。
       */
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
        // 0.3.7：这里刻意**不用 `border` 简写**，而是三个长写键。
        //
        // 为什么：勾边颜色只在「正在预览」那一支出现（见 itemPreview 的
        // borderColor），而 react-dom 更新内联样式时**只重设变化了的键** ——
        // 从预览项变回普通项时，它会把消失的 borderColor 置空（`style.borderColor
        // = ''`），而 border 简写的值没变、不会被重设。于是这个 `<button>` 剩下
        // `border-width:1px; border-style:solid` 却没有作者给的颜色，Blink 对
        // `appearance:auto` 的按钮会回落到 UA 的 `ButtonBorder`（#767676）——
        // 每个「点过的人设」都留下一个再也去不掉的灰框（0.3.5 之前那个 bug 的
        // 真正根因；在设备上实测：计算值 `rgb(118,118,118)`，与我修好后置空的
        // 那一版对比确认）。
        //
        // 把 borderColor 放进**基样式**之后，它在这一支和预览那一支都存在，
        // react-dom 就只会改它的值、不会把它删掉。
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'transparent',
        color: 'inherit',
        font: 'inherit',
        // 0.3.4：点一下按钮就会拿到焦点，浏览器（尤其 Android WebView）会画一圈
        // 焦点环，还会留下点击高亮 —— 在列表里表现为「勾边只增不减」。勾边现在
        // 完全由 itemPreview 表达，这里先关一道；0.3.5 起还补了一条 CSS 选择器
        // 规则（见 ensureScrollCss），因为不是所有引擎都认内联的这一行。
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      },
      /**
       * 列表项的「正在预览」勾边（0.3.4 / 0.3.5 / 0.3.7）。
       *
       * 以前这一格叫 itemSelected（只有底色），勾边留给 itemActive（= 本页**已启用**
       * 的那一条）。两个概念叠在一张列表里，用户看到的是「勾边说不清、点了还越攒越多」。
       * 0.3.4 起勾边只画**正在预览**的那一条；0.3.5 起「没预览过任何一条」时它
       * 落在这一页**正在启用**的那一条上（activeId 为 null 就是「不注入」那一项），
       * 于是「全局」页刚打开也有且只有一条框。已启用与否另由右侧的指示点表达。
       *
       * ⚠ 它的两个键（`background` / `borderColor`）在 {@link S.item} 的基样式里
       * 都必须存在（0.3.7 起是这样）：这个对象只按「正在预览」条件展开，一旦某个
       * 长写键只在预览那一支出现，取消预览时它就会被 react-dom 置空并回落到浏览器
       * 默认值 —— 那正是「点过的人设都留框」的根因，详见 S.item 里的长注释。
       */
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
      // 自绘滑条里的多行输入框（人设正文 / 人设历史对话共用）：
      // 宽度交给外层 `scrollWrap` 的 flex，原生滚动条藏掉（见 ScrollBar）。
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
      // 「人设历史对话」的两个并列选框（0.1.6）。
      // 它们只是**两个视图入口**：下面那个 textarea 是同一份状态，
      // 所以切选框既不清空也不替换 —— 这一点是需求里明确要求的。
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
        // 0.3.7：与 S.item 同一个理由 —— 勾边色 / 字重都放在**基样式**里，
        // 免得「选中 → 取消选中」时 react-dom 把消失的长写键置空、回落到
        // 浏览器默认值（这里表现为按钮自己冒出一圈 #767676）。
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
      /**
       * 「当前 / 全局」两个键（0.3.0）。
       *
       * 与 `tab` 分开：那两个历史选框是「标题 + 副标题」的竖排大块，而这两个
       * 键只剩两个字 —— 沿用同一个盒子会撑成两个空荡的大方块，还占满整行。
       * 这里做成内容宽度的横排小键。
       */
      /**
       * 「导出」的一键菜单（0.3.1）。
       *
       * 用**普通块**而不是绝对定位的浮层：设置页本身是滚动容器，浮层容易被
       * 裁掉；这里要的只是「一次点击后出现两项」，落点就在按钮下方一行。
       */
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
        // 0.3.7：同 S.tab —— 长写键在两支都存在。
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
      // 自绘下拉：触发器 + 向上展开的面板。
      // 面板底色优先用 DSH 自己的设计令牌，取不到时退回 CSS 系统色 Canvas ——
      // 写死一个深色会在浅色主题下变成一块突兀的黑方块。
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
        bottom: '100%',
        left: 0,
        marginBottom: 6,
        minWidth: 220,
        // 面板本身不再滚动：滚动交给里面的列表，右侧那条自绘滑条
        // 才不会跟着面板一起被裁掉（见 pickerTrack / pickerThumb）。
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
      // 可滚动列表 + 右侧自绘滑条（0.1.4）。
      //
      // 原生滚动条在移动端又细又难点，所以把它藏起来，用一条**又宽又长**的
      // 轨道 + 大滑块代替：整条轨道都能按住拖动，点哪跳哪。
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
        // Firefox 下藏掉原生滚动条；WebKit 那一半用注入的 CSS 处理（见 ensureScrollCss）。
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
        // 拖动滑块时不要被浏览器的滚动手势抢走。
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
      warn: { fontSize: 13, lineHeight: '20px', color: '#c2410c' },
      // F4（档位 2）：顶部那条「需要注意的情况」提示条。用暖色底 + 描边把它
      // 和普通正文区分开，但**不抢眼** —— 它说的是「我降级处理了」，不是崩溃。
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
      // 0.3.5：装配判断的并列说明里，每一句按**它自己**的颜色上色
      // （红 = 报红的那几件、黄 = 报黄的那几件），与指示点用色同一套值。
      // 黄色取深一点的那支（#eab308 当正文色在白底上太浅，读不清）。
      warnRed: { fontSize: 13, lineHeight: '20px', color: '#dc2626' },
      warnYellow: { fontSize: 13, lineHeight: '20px', color: '#a16207' },
      notice: { fontSize: 13, lineHeight: '20px', color: '#15803d' },
      // 「问号 + 浮出气泡」（0.1.4）：注释不再长期占版面，点问号才浮出来。
      // 问号本身要有提示性：圆形描边 + 主题色 + 虚线下划线。
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
      // 0.3.14：问号不再带 `opacity: 0.9`（那也是一种透明），
      // 气泡底也补上不透明的前景色 —— 它可能落在淡色文字块里（见 S.sub）。
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
        // 0.3.14：不再 `inherit` —— 气泡常挂在 `S.sub` 那类淡色文字里，
        // 继承会把它自己的字也变淡；这里显式取主题的主前景色（拿不到才退回继承）。
        color: 'var(--dsw-alias-label-primary, inherit)',
        cursor: 'auto',
      },
      dot: (color) => ({
        width: 8,
        height: 8,
        borderRadius: 999,
        flex: 'none',
        // 颜色语义在 Host 那边定（见 index.js 的 indicatorOf）：
        // 绿=正常；黄=「工具可复用」没勾、或人设历史对话与已注入内容对不上；
        // 红=本会话第一轮请求里没有工具、或选定的人设已被删除。
        background: DOT_COLORS[color] ?? DOT_COLORS.green,
      }),
    };

    /**
     * 指示点用色。键就是 Host 报的 `indicator.color`。
     * 认不出来的颜色一律按绿色处理（宁可不吓人，也不白屏）。
     */
    const DOT_COLORS = Object.freeze({
      green: '#16a34a',
      yellow: '#eab308',
      red: '#dc2626',
    });

    /**
     * 「原因 → 文案键」：同一个颜色下有几个不同的原因（0.2.8 加的两个），
     * 每一句话都该说清到底是哪一件事，而不是笼统地说「黄了 / 红了」。
     */
    const INDICATOR_TEXT_KEYS = Object.freeze({
      'no-tools-first-turn': 'indicatorRed',
      'persona-missing': 'indicatorRedPersonaMissing',
      'minimal-mode': 'indicatorYellowMinimal',
      'persona-not-injected': 'indicatorYellowPersonaDropped',
      'tool-reusable-off': 'indicatorYellow',
      'history-mismatch': 'indicatorYellowHistory',
      // 0.3.22：换过人设之后，新那条人设的历史对话进不来（注入只在每个新会话
      // 的第一步发生）。Host 那边排在最末 —— 它不是"出了错"，只是"这件事这轮
      // 不适用"。
      'history-not-carried': 'indicatorYellowNotCarried',
    });

    /**
     * 「原因 → 颜色」。Host 会同时报 `reason` 和 `color`，但**按层自己算**
     * 指示点时（见 {@link layerIndicators}）只有原因，得从这里推颜色。
     * 没列出来的原因一律绿（宁可少报，也不要把绿的说成黄/红）。
     */
    const REASON_COLORS = Object.freeze({
      'no-tools-first-turn': 'red',
      'persona-missing': 'red',
      'minimal-mode': 'yellow',
      'persona-not-injected': 'yellow',
      'tool-reusable-off': 'yellow',
      'history-mismatch': 'yellow',
      // 与 `INDICATOR_TEXT_KEYS` 同增同减（0.3.22）。
      'history-not-carried': 'yellow',
    });

    /**
     * 指示点的优先级权重（0.3.5）：**红色优先，黄色其后**。
     * 排序用它，取「该显示哪个颜色」也用它。
     */
    const COLOR_RANK = Object.freeze({ red: 0, yellow: 1, green: 2 });

    /**
     * 指示点的排序规则（0.3.5）：**红色优先，黄色其后**。
     *
     * 三处并列说明都要按它排（单点清单、按层算的清单、设置页两页合并后的清单），
     * 以前是同一行代码各抄一份 —— 一份共用的实现，免得哪天只改了一处。
     * @param {{color: string}} left - 左项。
     * @param {{color: string}} right - 右项。
     * @returns {number} 比较结果。
     */
    const byColorRank = (left, right) => (COLOR_RANK[left.color] ?? 9) - (COLOR_RANK[right.color] ?? 9);

    /**
     * 按**原因**造一个指示点（颜色与文案都由原因决定）。
     * @param {string} reason - Host 用的那套原因码；'ok' 表示正常。
     * @param {Function} [t] - 翻译函数。
     * @returns {{color: string, reason: string, text: string}} 指示点结论。
     */
    function indicatorFor(reason, t) {
      const tr = typeof t === 'function' ? t : fallbackT;
      // 认不出的原因码一律当绿：`REASON_COLORS` 里只有那六个原因，而它们
      // 每一个都在 `INDICATOR_TEXT_KEYS` 里有文案 —— 所以取不到文案只可能是
      // 「原因也不认识」，那就是绿。以前这里还留了一条按颜色拼键名的岔路
      // （`indicatorRed` / `indicatorYellow`），它永远命中不到。
      const color = REASON_COLORS[reason] ?? 'green';
      const key = INDICATOR_TEXT_KEYS[reason] ?? 'indicatorGreen';
      return { color, reason, text: tr(key) };
    }

    /**
     * 把 Host 报的 `section.indicator` 归一化成能直接用来渲染的三件套。
     * @param {object|null} data - `/state` 返回的状态。
     * @param {Function} [t] - 翻译函数。
     * @returns {{color: string, reason: string, text: string}} 指示点结论。
     */
    function indicatorOf(data, t) {
      const raw = data?.section?.indicator;
      const reason = typeof raw?.reason === 'string' ? raw.reason : 'ok';
      const base = indicatorFor(reason, t);
      // Host 可以给一个「原因码在表里、颜色另有含义」的组合；颜色以它为准，
      // 文案仍按原因取（0.2.8 起原因比颜色更能说明问题）。
      const color = typeof raw?.color === 'string' && hasOwn(DOT_COLORS, raw.color) ? raw.color : base.color;
      return { color, reason, text: base.text };
    }

    /**
     * 本会话的**全部**触发项（0.3.5）。
     *
     * Host 报 `section.indicators`（红在前、黄在后，每项带自己的颜色与原因码）。
     * 老 Host 没有这个字段时退回单点 `section.indicator`，所以这一层对两个版本
     * 都成立。返回的每一项都是 {@link indicatorFor} 的三件套，并且**只留非绿**：
     * 绿色不是「触发项」，不该出现在并列说明里。
     * @param {object|null} data - `/state` 返回的状态。
     * @param {Function} [t] - 翻译函数。
     * @returns {Array<{color: string, reason: string, text: string}>} 触发项清单。
     */
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
          // 颜色以 Host 报的为准（本客户端认不出的原因码也照样能上色）。
          const color = typeof entry?.color === 'string' && hasOwn(DOT_COLORS, entry.color) ? entry.color : base.color;
          return { color, reason, text: base.text };
        })
        .filter((entry) => entry.color !== 'green')
        .sort(byColorRank);
    }

    /**
     * 把一串触发项压成**一个**指示点（小圆点一次只能有一个颜色）。
     *
     * 取优先级最高的那一项；一个都没有就是绿。
     * @param {Array<{color: string, reason: string, text: string}>} list - 触发项清单。
     * @param {Function} [t] - 翻译函数。
     * @returns {{color: string, reason: string, text: string}} 指示点结论。
     */
    function summarizeIndicators(list, t) {
      const first = Array.isArray(list) ? list[0] : undefined;
      if (first === undefined) return indicatorFor('ok', t);
      return {
        color: first.color,
        reason: first.reason,
        // tooltip 用：把所有触发项一并说清（并列说明那一行负责上色，这里不分色）。
        text: list.map((entry) => entry.text).join(' '),
      };
    }

    /**
     * **某一层自己**的触发项（0.3.5，0.2.10 起按层算）。
     *
     * 为什么不能直接用 `/state` 报的那一份：那一份说的是**本会话**。设置页的
     * 「全局」页讲的是另一层，会话读数安上去是假的；可反过来，「这一层自己的」
     * 状态又必须报出来 ——
     *
     *   - `persona-missing`：这一层选定的人设 id 已经不存在 → 红；
     *   - `tool-reusable-off`：这一层的「工具可复用」没勾选 → 黄；
     *     （0.2.9 之前这里一律压成绿，于是「全局关掉安全阀、设置页全局页不报黄」。
     *      全局那一层决定所有还没采样的对话，漏报等于让人蒙着眼睛跑。）
     *
     * 另外几条（工具基线为空、人设历史对话与注入内容对不上、极简模式）是
     * **某个会话**的读数，全局页不适用，故不在这里。
     * @param {object|null} layer - 这一层的有效值。
     * @param {Function} [t] - 翻译函数。
     * @returns {Array<{color: string, reason: string, text: string}>} 触发项清单（红在前）。
     */
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

    /**
     * 一个「问号 + 浮出气泡」的说明控件（0.1.4）。
     *
     * 长注释长期摊在卡片里会把版面撑得很长，所以收进问号里：点问号浮出气泡，
     * 再点一次或点别处收起。问号本身是圆形描边 + 主题色 + 下划线，
     * 一眼能看出「这里可以点」。
     *
     * 它经常被塞进 `<label>`（开关那一行整行都是 label）：所以点击时要
     * `preventDefault()` + `stopPropagation()`，否则点问号会顺手把开关切一下。
     * @param {object} props - `{ text, label }`。
     * @returns {import('react').ReactElement} 说明控件。
     */
    function Hint(props) {
      const text = typeof props?.text === 'string' ? props.text : '';
      // 每个调用点都显式传了 `label`（取自字典的 `hintLabel`）—— 这里不再
      // 兜一句硬编码中文，否则英文界面里真漏传时会冒出一句中文。
      const label = typeof props?.label === 'string' ? props.label : '';
      const [open, setOpen] = React.useState(false);
      /** 气泡的横向补偿：靠在屏幕右缘的问号会把 300px 的气泡推出屏幕，往左挪一点。 */
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
          // 量不到就保持 0，气泡照常浮出。
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
              // 在 <label> 里点它不能顺带切换那一行的勾选框。
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

    /**
     * 一条自绘的竖向滑条：整条轨道**可点也可按住拖**，滑块最小 44px。
     *
     * 原生滚动条在移动端又细又难点，所以三处滚动区（人设选框的列表、
     * 人设正文输入框、人设历史对话的输入框）共用这一个组件：把原生滚动条藏掉
     * （见 {@link ensureScrollCss}），右侧换成这条大滑条。
     *
     * 拖动用 pointer 事件，并设了 `touch-action: none`，不会被页面滚动手势抢走；
     * 拖动监听挂在 `window` 上，拖出轨道也不会断。
     * @param {object} props - `{ targetRef, deps, trackAttr, thumbAttr }`。
     *   `targetRef` 指向可滚动元素；`deps` 是重新量一次几何的依赖；
     *   `trackAttr` / `thumbAttr` 是给测试用的 data 属性名。
     *   **四项都是必填**：三个调用点全都显式传了，这里不再兜默认值
     *   （兜了反而会让人以为「不传也行」）。
     * @returns {object} 轨道元素。
     */
    /**
     * 「等文本停稳」的节拍器（0.2.6）。
     *
     * 打字时把一次结算推后 `delay`；`epoch` 变了表示这是一次**程序性**变更
     * （切人设 / 导入 / 清空 / 撤回 / 勾选思考过程），立即结算。
     *
     * 返回一个每次结算 +1 的 `tick`，调用方拿它当自绘滑条的重量信号，也拿它当
     * 「增耗 N tok」的重算信号 —— 于是「每敲一个字就强制布局一次 / 重算一遍全文」
     * 变成「停顿之后一次」。
     *
     * 为什么用 `epoch` 而不是「设个标记等下一次 effect 消费」：前者是幂等的 ——
     * 程序性写入如果碰巧没改变文本（例如对已经空着的输入框点「清空」），
     * 标记做法会把它残留到下一次打字上，让那一次白白丢掉防抖。
     * @param {string} text - 被观察的文本。
     * @param {number} epoch - 程序性变更计数器。
     * @returns {number} 每次结算自增的节拍。
     */
    function useSettledTick(text, epoch) {
      const [tick, setTick] = React.useState(0);
      // 初值 -1 而不是 0：挂载那一次也要**立即**结算，不能干等 150ms。
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
      /** 拖动回调里读得到的当前几何（避免闭包读到旧值）。 */
      const geomRef = React.useRef(geom);
      geomRef.current = geom;
      /**
       * K4（档位 2）：一次拖动挂在 window 上的三个监听器的**摘除函数**。
       *
       * 以前摘除只写在「手指抬起」（`onUp`）里：拖到一半面板被关掉 / 切换走了
       * （比如拖的时候点到别处导致面板收起），那三个监听器**永远不会被摘掉**，
       * 连同手里的界面元素一起留在内存里 —— 用久了界面越来越迟钝（每次泄漏
       * 一点点）。现在把手抬起与组件消失都接到同一个摘除函数上。
       */
      const dragCleanupRef = React.useRef(null);

      /** 量一次滚动几何（内容 / 视口 / 当前位置），滑块下限按轨道高度的 44px 算。 */
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
        // 几何没变就不 setState（0.2.2）：内容每次变化都会重量一次，而长度不变
        // 时滑块本来就没动 —— 白重渲染一次不划算。geomRef 这里**同步**更新，
        // 免得同一帧里连续 measure 又各触发一次渲染。
        if (previous.thumb === next.thumb && previous.ratio === next.ratio && previous.scrollable === next.scrollable) {
          return;
        }
        geomRef.current = next;
        setGeom(next);
      }, [targetRef]);

      // 初次挂载，以及**停稳之后**（`deps` 由调用方传「结算节拍」，不再传文本
      // 本身 —— 0.2.6 之前每敲一个字都会走到这里强制布局一次）重新量一次。
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

      /**
       * 用 rAF 合并高频滚动：一次滑动能触发几十个 scroll 事件，
       * 每个都 setState 会平白重渲染。一帧最多量一次。
       */
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

      // 卸载时别把待执行的那一帧漏在外面。
      React.useEffect(() => () => {
        try {
          if (rafRef.current !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafRef.current);
        } catch {
          // 取消失败无所谓：回调里的 measure() 对已卸载节点是空操作。
        }
        rafRef.current = 0;
      }, []);

      /**
       * 目标元素**自己被改尺寸**时补量一次（0.2.6）：输入框右下角可以拖着改高度，
       * 这一下既不改文本也不触发 scroll，只能靠 ResizeObserver 接住。
       * 不支持的浏览器直接跳过 —— 那时拖完高度滑块尺寸会暂时偏一点，
       * 下一次结算或滚动会把它纠正回来。
       */
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

      // 目标自己滚动时跟着更新（手指滚、原生滚动都要跟）。
      // 依赖里**不**放 deps：内容变化由上面那个 effect 负责重量，
      // 监听器没必要每敲一个字就摘掉重挂一次。
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
          // 上一次拖动要是还没收尾（理论上不该发生），先把它摘干净：
          // 两个拖动叠加会在手指抬起时留下另一半监听。
          if (typeof dragCleanupRef.current === 'function') dragCleanupRef.current();
          const onMove = (moveEvent) => {
            if (typeof moveEvent.preventDefault === 'function') moveEvent.preventDefault();
            apply(moveEvent.clientY);
          };
          const onUp = () => {
            if (typeof dragCleanupRef.current === 'function') dragCleanupRef.current();
            measure();
          };
          // K4：摘除只写一处，`onUp` 与「组件消失」都走它。
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
          // 拖不动就算了：滚动区本身还能用手指滚。
        }
      };

      // K4：组件消失时也要把「拖到一半」那几个监听摘掉（现在只写在手指抬起里）。
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
            // 内容不够长时滑块铺满轨道，压暗一点表示「现在没得滚」。
            opacity: geom.scrollable ? 1 : 0.35,
          },
          [props.thumbAttr]: '1',
        }),
      );
    }

    /**
     * 只注入一次的一小段 CSS：自绘滑条对应的原生滚动条 + 人设列表按钮的
     * 浏览器焦点痕迹。
     *
     * 滚动条：内联样式只能表达 `scrollbar-width`（Firefox），WebKit 必须要一条
     * `::-webkit-scrollbar` 规则。覆盖人设选框的列表、人设正文输入框与人设历史
     * 对话的输入框（见 {@link ScrollBar}）。
     *
     * 焦点痕迹（0.3.5）：列表项那些 `<button>` 在 Android WebView 里点一下就会
     * 拿到焦点，有的引擎不认内联的 `outline: none`，画一圈焦点环 —— 在列表里
     * 看起来就是「点过的人设都留着框」。勾边现在由 `S.itemPreview` 表达，
     * 这里把浏览器自己的痕迹按选择器一并关掉（`outline` + `box-shadow`）。
     *
     * 两件都是纯装饰：注入失败顶多滚动条和焦点环同时可见，不影响功能。
     * @returns {void}
     */
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
          // 0.3.27：这一条原来锚在 `data-history-text` 上 —— 那个名字太通用，而这张
          // 样式表是**全页生效**的（注入 `document.head`），别的插件只要也用同名属性，
          // 它的滚动条就会被一起藏掉。改成带本插件前缀的 `data-persona-history-text`：
          // 这个属性只出现在本插件的 DOM 里，规则再也命不中别人的元素。
          // ⚠ 约束：凡是被这张全页样式表锚上的属性，都必须带 `persona` 前缀。
          '[data-persona-history-text]::-webkit-scrollbar{width:0;height:0}' +
          '[data-persona-list] [data-persona-id],' +
          '[data-persona-picker-list] [data-persona-option]{outline:none !important;box-shadow:none !important}' +
          '[data-persona-list] [data-persona-id]::-moz-focus-inner' +
          '{border:0;padding:0}' +
          // 0.3.7：给「不是正在预览」的那一条兜底把勾边色钉成透明。勾边本来由内联
          // 样式的 borderColor 表达，但内联样式是 react-dom 按「变化的键」写的，
          // 一旦某个长写键在某一支里消失就会被置空、回落到 UA 的按钮描边
          // （#767676）——「点过的人设都留框」就是这么来的。这条规则让那种回落
          // 在渲染层也不可能发生（!:not([data-preview="1"]) 不碰预览那一条）。
          '[data-persona-list] [data-persona-id]:not([data-preview="1"]){border-color:transparent !important}';
        document.head.appendChild(style);
      } catch {
        // 注入失败只影响滚动条好不好看，不影响功能。
      }
    }

    /**
     * 指示点为什么是这个颜色（0.1.5 / 0.3.5）：在状态卡里、指示点**下方**
     * 把**每一项**触发的情况并列写出来，每一句按**它自己**的颜色上色
     * （红的那几件用红字、黄的那几件用黄字），句子之间用「，」连、末尾一个「。」。
     *
     * 顺带点名这个结论对应哪个会话，免得红点找不着主。
     * @param {Array<{color: string, reason: string, text: string}>} indicators - 触发项清单（红在前）。
     * @param {object} assembly - `/state` 返回的 `section`。
     * @param {Function} t - 翻译函数。
     * @returns {object|null} 说明行元素；没有触发项时返回 null。
     */
    function indicatorLines(indicators, assembly, t) {
      const shown = Array.isArray(indicators) ? indicators.filter((entry) => entry.color !== 'green') : [];
      if (shown.length === 0) return null;
      const session = typeof assembly?.sessionId === 'string' && assembly.sessionId !== '' ? assembly.sessionId : '';
      const nodes = [];
      shown.forEach((entry, index) => {
        if (index > 0) nodes.push(h('span', { key: `sep-${index}`, style: S.sub }, '，'));
        // 每句自带的句号挪到最后统一收尾，读起来才是「…，…。」而不是「…。，…。」。
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
        // 摊开传：React 两种写法都收，但摊开后的 children 是一层数组，
        // 别处按文本读这棵树时（测试 / 复制）少一层解构。
        ...nodes,
      );
    }

    /**
     * 渲染一行「装配状态」，同时在拿不到数据时给出可读的替代文本。
     * @param {object} props - `{ data, t, indicators }`。`indicators` 由设置页按
     *   当前那一页算好递进来（全局页的人设是否被删与某个会话无关，不能用
     *   同一份结论）—— 唯一调用点总是传它。
     * @returns {import('react').ReactElement} 状态行元素。
     */
    function AssemblyLine(props) {
      const { data, t } = props;
      const assembly = data?.section;
      const indicators = props.indicators;
      const indicator = summarizeIndicators(indicators, t);
      if (assembly === undefined || assembly === null) {
        return h('p', { style: S.sub, 'data-assembly': 'unknown' }, t('neverApplied'));
      }
      // 档位 6：判定一律收紧成「必须是个数字」。
      //
      // 以前写的是 `=== null` / `!== null`，而**键不存在**与「键是 null」读起来
      // 完全不同：宿主发出来的对象里漏掉某个键时读到的是 `undefined`，
      // `undefined !== null` 成立 —— 于是「本轮没有可注入的人设」被报成了
      // 「人设被顶掉了」。宿主那边已经补成"读数永远完整"，这里再收紧一次是
      // 第二道防线：哪边出问题都不会再说反话。
      //
      // 档位 4（R2 · Q2 方向 b）：这三个数字说的是**某一个会话**那一次装配，
      // 而「全局」页讲的是另一层 —— 会话读数安在全局页上就是假的（实测 D 场景：
      // 卡片报「被顶掉」、旁边圆点是绿的）。所以先过 `scope` 这道闸：
      // 全局页一律**不报**会话级结论，卡片与指示点从此同源。
      //
      // ⚠ 判定必须在**这里**做，不能在调用点把三个数字抹成 null 再传下来 ——
      // 那样卡片会说「还没有观察到装配」，而真相是「全局页不报会话读数」。
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
      // 三种结果，按「有没有东西被人设占了位」排序：
      //   dropped  = 想要人设，但它没进最终段列表（极简模式等）→ 黄点 + 说明
      //   applied  = 想要人设，且它确实进去了
      //   其余     = 这一轮没有可注入的人设正文（不注入 / 正文为空）→ 中性一句话
      //
      // 全局页那一种是 `scope-global`：**不是**「还没装配过」，而是「这一页不报
      // 会话读数」。这个取值同时就是「全局页只说本层」的测试锚点。
      const outcome = bare ? 'scope-global' : dropped ? 'dropped' : applied ? 'applied' : 'none';
      const order = Array.isArray(assembly.lastOrder) ? assembly.lastOrder : [];
      // 那个 `（N）` 用 Host 报的**真实段数**：`lastOrder` 只保留前 64 段，
      // 跟着数组长度显示就会少报（Host 侧注释里早有这条要求）。老 Host 不带
      // 这个字段时退回数组长度。
      const orderCount = Number.isFinite(assembly.lastOrderCount) ? assembly.lastOrderCount : order.length;
      return h(
        'div',
        { 'data-assembly': outcome, style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h(
          'p',
          { style: S.row },
          // 指示点（0.1.5）：颜色由 Host 的 indicatorOf() 定（取触发项里优先级最高的那一个），
          // 具体有哪几件、各自什么颜色，由下面那行并列说明逐条讲清。
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
        // 只有真的被顶掉才是橙色告警；「本轮没有可注入的人设」只是如实说明，
        // 用普通淡色文字，不制造"出事了"的错觉。
        // 档位 4（R2）：这两条都是**会话级**提示，全局页一条都不出。
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

    /**
     * 一张开关表里的四个输入抑制开关是不是全开着。
     *
     * 「一键为纯聊天」在设置页和模式选择框里都用它决定是否改名为「系统输入还原」——
     * 两处必须是同一个判据，否则同一个状态下两个地方会显示不同的按钮。取哪一层
     * 的开关表由调用方决定（设置页按当前页给本会话那一份或全局那一份）。
     * @param {object|null} switches - 某一层的开关表。
     * @returns {boolean} 四个开关全开时为 true。
     */
    function allSwitchesOn(switches) {
      const table = switches ?? {};
      return SWITCH_FIELDS.every((field) => table[field.key] === true);
    }

    /* ─────────── 会话日志导入（0.1.6）─────────── */



    /* 0.3.23：PersonaManagerImpl 搬进 client.settings.js（见 lazyChunkComponent）。 */



/* 0.3.23：PersonaPickerImpl 搬进 client.picker.js（见 lazyChunkComponent）。 */


    /**
     * 最后一道防线：任何一步失败时，渲染一张可读的卡片而不是白屏。
     *
     * 只有 `buildPlugin()` 的 catch 会调它，而那条路已经先挡掉了「拿不到 React」
     * （见文件末尾），所以这里不必再判一次 `h`。
     * @param {Error|unknown} error - 抛出的值。
     * @returns {object} 一个永远合法的插件描述符。
     */
    function degradedPlugin(error) {
      const cause = error !== null && error !== undefined && error.message ? String(error.message).split('\n')[0] : String(error);
      try {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error(`[dsh-persona-select] 客户端半加载失败：设置页会以降级卡片呈现。首因：${cause}`);
        }
      } catch {
        // 连 console 都没有时，只能沉默。
      }
      function Failure() {
        return h(
          'div',
          { style: S.root, 'data-plugin': 'dsh-persona-select', 'data-render-state': 'degraded' },
          h('h2', { style: S.h2 }, 'Persona manager — load failure'),
          h('p', { style: S.warn }, cause),
        );
      }
      return {
        inject: ['slots'],
        apply(ctx) {
          try {
            ctx.slots.inject('settings.section', () =>
              ctx.slots.register(
                { name: 'settings.section', id: 'persona-select', order: 31, label: () => '人设管理', inject: () => ({}) },
                Failure,
              ),
            );
          } catch {
            // 宿主不收这张卡也照样能启动。
          }
        },
      };
    }

    /**
     * 构建插件描述符。
     * @returns {object} 插件描述符。
     */
    function buildPlugin() {
      return {
        inject: ['slots', 'locale'],
        apply(ctx) {
          const locale = ctx.locale;
          const t = typeof locale?.bind === 'function' ? locale.bind(NS) : (key) => key;
          fallbackT = t;
          // 设置页要回答「现在是哪个对话」，而 `settings.section` 这个槽位不
          // 带会话上下文。首选槽位递进来的 `useSessions`（standardProps），
          // 这里再挂一条**可选**依赖当兜底（`ctx.inject` 不是硬依赖：会话服务
          // 不在时其余功能照常，只是设置页认不出「当前对话」、退化成只有「全局」页）。
          try {
            const got = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
            sessionsHolder.service = got ?? ctx.sessions ?? null;
          } catch {
            sessionsHolder.service = null;
          }
          try {
            if (typeof ctx.inject !== 'function') throw new Error('no ctx.inject');
            ctx.inject(['sessions'], (scoped) => {
              sessionsHolder.service = scoped.sessions ?? sessionsHolder.service;
            });
          } catch {
            // 拿不到就走上面那次探测的结果；两条都拿不到时设置页只有「全局」页。
          }

          // ⚠ 这里**没有**包 try —— 这段注释原来写着「每一次 locale 调用都包了
          // try」，那是**假的**，现在改成事实描述。上面两处只用 `typeof` 检查
          // 「方法在不在」，方法自己抛的错会一路冒出 `ctx.effect`。
          //
          // 已知会抛的一种：宿主 `register` 对**同一个命名空间 + 同一种语言**的
          // 第二次注册**直接 throw**（`locale namespace "…" already has locale
          // "…"`，见 `dsh-client-locale`）。它冒到哪一层取决于 Cordis 对 effect
          // 抛错的处置，最坏的情况是整个插件退化成一张降级卡片（设置页和 chip
          // 全没）。要治就得给 `register` 包一层 try 并吞咽「已注册」这一类错误
          // —— 重注册本来就该是幂等的。本条记在 README 的
          // 「升级前必查：20 个平台私有契约」第 13 条。
          //
          // 丢掉实时切语言可以接受，白屏不可以。0.3.23 起这条防线**真的**包住了
          // 「register 自己抛」：宿主对**同一个命名空间 + 同一种语言**的第二次
          // 注册是直接 throw 的（`dsh-client-locale`），而热更新 / 重挂载会让这段
          // `apply` 再跑一次 —— 以前那个错会一路冒出去，最坏把整个插件退化成一张
          // 降级卡片（设置页和 chip 全没）。现在吞掉它：语言字典是**幂等**的东西，
          // 第二份要么与第一份逐字相同（那就该吞），要么是热更新带来的新版本
          // （宿主自己会在下一轮接管）。这里只换掉「设置页整块没」，代价只是
          // 「这一次热更新后文案可能还是旧的」。
          ctx.effect(() => {
            if (typeof locale?.register !== 'function') return undefined;
            try {
              return locale.register(NS, { zh, en });
            } catch (error) {
              try {
                if (typeof console !== 'undefined' && typeof console.warn === 'function') {
                  console.warn('[dsh-persona-select] 语言字典注册失败（已忽略，界面用 key 兜底）：', error?.message ?? String(error));
                }
              } catch {
                // 连 console 都没有时只能沉默。
              }
              return undefined;
            }
          }, 'persona-select: 语言字典');

          // 0.3.23（审计 §三.1）：这两个大组件搬进了包内分块，槽位同步拿到的是**壳**
          // （分块到了就把真身作为子元素渲染出来；装不上给一张可读的错误卡片 + 重试）。
          // `keyedByHostPresence()` 仍然是内层那一层：宿主能力来/去时换 key 重挂载，
          // 而不是让 React 发现 hook 格数变了（见那个函数上的说明）。
          const PersonaManager = registerComponentChunk('client.settings.js', 'persona-select', (module) => {
            const impl = module.create(chunkDeps()).PersonaManagerImpl;
            return (props) => keyedByHostPresence(impl, props);
          });
          const PersonaPicker = registerComponentChunk('client.picker.js', 'persona-select', (module) => {
            const impl = module.create(chunkDeps()).PersonaPickerImpl;
            return (props) => keyedByHostPresence(impl, props);
          });
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                id: 'persona-select',
                // 现有 order：account -10、general 0、models 10、plugins 15、
                // agent-presets 20、prompt-setting 30 —— 31 紧跟其后。
                order: 31,
                label: () => t('nav'),
                locale: NS,
                inject: () => ({ t }),
              },
              PersonaManager,
            ),
          );

          // ⚠ 不要用 `conversation.hero.agentPreset`。
          //
          // 那个槽位在 dsh-client-ui-conversation 里被声明为
          // `kind: "single", scope: "session-maybe"` —— **只有一个座位**，
          // 而座位已经被 `dsh-client-ui-agent-preset` 的模式选择 chip 占了。
          // SlotCore.register 对 single 同 priority 的第二次注册是**直接抛错**的
          // （dsh-client-ui-slots/lib/index.js 的 single 分支），文档原话是
          // 「register at a different priority to shadow it (lowest renders)」——
          // 也就是说：要么被它挤掉，要么把它挤掉，**永远不可能并存**。
          //
          // 所以改用 `conversation.input.dock`：它是 `kind: "list"` 的**列表型**
          // 槽位（必须给 id），第一方自己就用它挂了 todo(0) / goal(10) / queue(20)，
          // 并且它渲染在 hero 那一行的正下方、同一个 composerStack 里 ——
          // 模式选择 chip 和人设选择框上下相邻、同时可见。
          ctx.slots.inject('conversation.input.dock', () =>
            ctx.slots.register(
              {
                name: 'conversation.input.dock',
                id: 'persona-select',
                // 第一方 dock 条目：todo 0、goal 10、queue 20 —— 30 排在它们之后。
                order: 30,
                locale: NS,
                // 这个槽位是 `scope: "session"`，注册时给的 inject face 会收到
                // 当前会话 id（`inject(sessionId)`）。0.1.5 把它递给组件：
                // 有了会话 id，切换会话窗口时指示点才能按**那个会话**重新检查。
                inject: (sessionId) => ({ t, sessionId: typeof sessionId === 'string' ? sessionId : '' }),
              },
              PersonaPicker,
            ),
          );
        },
      };
    }

    if (h === null) {
      // 槽位渲染的本来就是 React 组件，没有 React 就没有能注册的东西。
      // 这是诚实的降级（和 dsh-prompt-setting 同一取舍）：什么都不注册，
      // 只留一行 console，而不是注册一个渲染时必炸的组件。
      try {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('[dsh-persona-select] 拿不到 react，客户端半不注册任何槽位；DSH 其余功能不受影响。');
        }
      } catch {
        // 连 console 都没有时只能沉默。
      }
      return { inject: [], apply() {} };
    }

    try {
      return buildPlugin();
    } catch (error) {
      return degradedPlugin(error);
    }
    /* @build-fingerprint:end */
  },
});
