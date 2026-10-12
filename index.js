/**
 * `dsh-persona-select` — Host 半边。
 *
 * 职责：
 * 1. 拥有 `/persona-select/*` 路由前缀（人设的增删改查、激活、切换开关，
 *    以及「这一份设置属于全局还是本会话」）；
 * 2. 拥有一个 prompt 段 `plugin:persona-select`，正文由**这个会话选定的
 *    激活人设**决定；段序则通过 `agent.ctx` 注册一份 per-agent 覆盖，
 *    让每个会话排在自己的位置上；
 * 3. 观察 `system-prompt/assemble`，判断这一段到底有没有进入最终提示词
 *    ——用来如实报告「本会话的 preset 声明了 complete:true，人设没生效」，
 *    并按**这个会话**的开关决定剥不剥工具 / 只留人设；
 *    0.3.5 起「这个 preset 会不会把系统提示词压成单段」（内置「极简模式」）
 *    另外走一条**与对话无关**的路：按会话问 `agentPreset` 的声明文档，
 *    见 `presetCollapses()` —— 装配读数对极简模式恒为假，不能只靠它；
 * 4. 在 `agent/pre-step` 里过滤「屏蔽历史注入」那一类别的消息，把当前激活
 *    人设存下的「人设历史对话」注入还没有发生过对话的新会话，并在会话
 *    还没有记录时**采样一次**（0.2.8）。注入的那段文本 0.3.6 起框在
 *    `<system-reminder>` 里（与工作区指令链 / 技能目录同一套写法），
 *    见 `renderHistoryBlock()` 与 `canonicalHistoryText()`；
 *    0.3.16 起同一个监听器还负责**人设切换时的收敛**：本会话选定的人设
 *    id 变了，就让这一步重启请求序列（`startsRequestSeries: true`），
 *    见 `convergeOnPersonaSwitch()`；0.3.17 起这份判据的读数**按会话落盘**
 *    （`sessions[<id>].promptPersonaId`），因为 agent 对象在重启 / 恢复会话 /
 *    可续子会话里都会被换掉，只按它记账的话第一次切换必漏。
 *
 * 为什么用一个**自己的段名**而不是 `deployment:persona-prefix`：
 * 后者被提示词注册表在全局层无条件注册（`dsh-system-prompt` 构造函数），
 * 全局再注册同名会直接抛错（`NamedEntries` 的重复检查），
 * 这正是 `@deepseek-ai/dsh-persona` 只能挂在 agent preset 里的原因。
 * 用独有段名就没有这个约束，可以挂在 profile 层、对所有 preset 生效。
 *
 * **设置跟着会话走**（0.2.8）：数据文件里多了一层 `sessions`，记下每个会话
 * 自己选定的人设与四个开关。读取侧一律走 `lib/store.js` 里那几个
 * 「按会话取有效值」的函数（`switchValueOf` / `activeIdOf` / `activeTextOf` …），
 * 绝不直接读 `state.doc.stripTools` —— 那是全局那一层，只在会话没有记录时才是答案。
 *
 * 装配路径上的纪律：`section.text` 每次装配都会被求值，所以它**只读内存**，
 * 外加一次微秒级的 `statSync` 用于发现外部手改；真正的读盘发生在路由请求里。
 *
 * 这一份代码坐在 DSH 的**内部结构**上面（服务名 / 事件名与数据形状 / 做事的先后
 * 顺序），那些都**不是稳定契约**：上游改一个名字，插件不会崩，只会**安静地少做
 * 一件事**。所以本文件里每一处「按当前框架写死」的地方，都要对着 README 的
 * **「升级前必查：20 个平台私有契约」**那一节核 —— 那一节按「症状 → 先查哪个函数
 * → 怎么确认」写成了一张表，本文件自己的新版本发布前也该先过一遍。
 *
 * @module dsh-persona-select
 */

import { createHash, randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

import {
  DEFAULT_SECTION_ORDER,
  FOLLOW_SECTION_ORDER,
  MAX_NAME_LENGTH,
  MAX_PERSONAS,
  MAX_TEXT_LENGTH,
  PERSONA_HISTORY_SOURCE_KIND,
  SWITCH_KEYS,
  TOOL_REUSABLE_KEY,
  acceptSectionOrder,
  activeFoundOf,
  activeHistoryOf,
  activeHistoryStatsOf,
  activeIdOf,
  activeTextOf,
  auditHistoryFileOf,
  effectiveSectionOrder,
  emptyStore,
  fileSignatureOf,
  mergeView,
  migrateHistoryFiles,
  needsHistoryMigration,
  newPersonaId,
  normalizeHistory,
  normalizeName,
  normalizeSessionId,
  normalizeText,
  personaHistoryOf,
  personaTextOf,
  readStoreFile,
  sampledRecord,
  sampledRecordFrom,
  sectionOrderMode,
  sessionInfoOf,
  sessionRecordOf,
  storeNoticesOf,
  storePath,
  switchValueOf,
  textLimitWarnings,
  toolReusableOf,
  withSessionRecord,
  withoutSessionRecords,
  writeStoreFile,
} from './lib/store.js';

/** 插件名（与 package.json 的 name 一致）。 */
const PLUGIN_NAME = 'dsh-persona-select';
/** 插件版本（与 package.json 的 version 一致）。 */
const PLUGIN_VERSION = '0.3.27';

/** 本插件独占的路由前缀。 */
const ROUTE_PREFIX = '/persona-select';

/** 本插件独占的 prompt 段名——刻意不等于 `deployment:persona-prefix`。 */
const SECTION_NAME = 'plugin:persona-select';

/**
 * 「人设历史对话」在会话日志里的投影单元 key（0.1.6）。
 *
 * Host-only（不给 `wire`）：这个状态只有插件自己在 `agent/pre-step` 里读，
 * Client 没有理由看到它，也就不必让注册表为它算 view。
 */
const HISTORY_PROJECTION_KEY = 'personaSelectHistory';

/**
 * 「这个会话在跑哪个 agent preset」的投影单元 key（0.3.5）。
 *
 * 是 `@deepseek-ai/dsh-agent-preset-registry` 注册的单元（`session.js` 里
 * `key: 'agentPreset'`）—— 本插件只**读**它，用来判断「本对话是不是
 * 极简模式那种把系统提示词压成单段的 preset」，见 `presetCollapses()`。
 * 读不到时退回 `agent.agentPreset`，再退回按会话记过的那一份。
 */
const PRESET_PROJECTION_KEY = 'agentPreset';

/**
 * 段序权重用的几个常量都从 `lib/store.js` 导入（`DEFAULT_SECTION_ORDER`、
 * `FOLLOW_SECTION_ORDER`；那个文件的 `SECTION_ORDER_FOLLOW` 是它自己的私有
 * 取值，不对外），因为设置页可以**按人设**直接改权重。
 *
 * 0.1.4 起段序权重是**每个人设自己的**：注册用的那个 order 由
 * **当前激活人设**决定（`effectiveSectionOrder(doc, configured)`），
 * 换人设就换一次注册，见 `syncSection()`。没有填过权重的人设回落到
 * `DEFAULT_SECTION_ORDER`（`-1`）——而不是 0.1.3 那个全局值。
 *
 * 默认 `-1` 的含义：排在人设前缀区（`DEPLOYMENT_PERSONA_PREFIX`，order `0`）**之前**，
 * 也就是排在 preset 那句 “You are a coding agent powered by the … model.” 之前。
 * 不取 `0` 是因为同序再按段名排时 `deployment:…` < `plugin:…`，
 * 用户主动选的人设会被一句通用模板压在下面；不更靠前是因为
 * `HARNESS_IDENTITY`（`-1000`）是平台固定开场白，应当留在最前。
 */

/** 路由请求体大小上限。 */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * 允许通过 `/handoff` 导出下载的类型（0.3.1）。
 *
 * 白名单而不是透传：这个值会原样进响应头，收窄到这两种就够用了，
 * 也免得将来有人拿它当任意文件中转站。
 */
const EXPORT_MIMES = new Set(['application/json', 'image/png']);

/**
 * 取件响应的类型怎么定（0.3.3）。
 *
 * 按**文件真实类型**回（`image/png` / `application/json`），不再用
 * `application/octet-stream`：Android 给下载文件命名走的是
 * `URLUtil.guessFileName(url, contentDisposition, mimeType)`，其中扩展名
 * 可能从 **MIME 类型**推出来（`octet-stream` → `.bin`，那正是 0.3.2 的
 * "保存成 bin 文件"）。类型与扩展名一致，两种取名规则都能落到 `.png` / `.json`。
 * 客户端声明什么就回什么，但要过 {@link EXPORT_MIMES} 白名单。
 */

/**
 * 「人设历史对话」这一条路由专属的请求体上限。
 *
 * 为什么单独开一个更大的口子：通用上限是 256 KiB，而历史对话 0.2.0 起
 * **没有字数上限** —— 一份装满汉字、或者到处是 `"` `\` `\n` 的导入结果，
 * JSON 编码后会迅速膨胀。用通用上限会在用户点「保存」时回一个 413 式的失败，
 * 而那份文本本身完全合法。这里给一个足够宽松的上界，只用来拦真正的攻击。
 *
 * 0.3.19（档位 2 的 Q12(a)）起从 **64 MiB 降到 16 MiB**：这一条路的实现是
 * 「主线程上一次性 `Buffer.concat` + 一次 `JSON.parse`」，64 MiB 的请求体
 * 在解析那一刻会实打实多占一百多 MiB（审计报告 DH10）。真实的数据文件目前
 * 约 1 MiB，16 MiB 对正常历史有 16 倍余量；二进制导入（PNG）另走
 * `HANDOFF_MAX_ENTRY_BYTES`（32 MiB），没动。
 */
const MAX_HISTORY_BODY_BYTES = 16 * 1024 * 1024;

/** 诊断里最多记录多少个段名（只用于展示，不参与任何判断）。 */
const MAX_RECORDED_SECTIONS = 64;

/**
 * 「记小账」延迟合并写的窗口（毫秒）—— I1，档位 2 的 Q7(a)。
 *
 * 「给新会话采样一份设置」「记下这一轮渲染的是哪条人设」这两件事都发生在
 * **每一轮对话开始之前**，而它们以前走的是完整写盘：把整份数据文件重新整理、
 * 重新序列化、**同步**写下去。实测 1 MB 约 17 ms、32 MB 约 334 ms，而且这期间
 * 整台 DSH 都停摆（别的对话、别的插件、模型自己的输出一起卡住）。
 *
 * 现在同一小段时间里的多次记账只在窗口末尾落盘一次。窗口取 250 ms：长到足以
 * 合并「同一轮里先后发生的那两次」，短到用户随手关掉再打开设置页也看不出
 * 「刚记下的东西还没落盘」。
 */
const DEFERRED_WRITE_MS = 250;

/**
 * 「屏蔽历史注入」开关会按 `message.source.kind` 精确过滤这两个来源。
 * 它们是插件往历史里追加的 user 角色消息，不是提示词段。
 */
const STRIPPED_SOURCE_KINDS = ['agent-instructions', 'time-context'];

/**
 * 「屏蔽 runtime 上下文」涉及的来源码（0.3.4；0.3.19 起带上各自的 `form`）。
 *
 * 这两类都**不是**系统提示词的段，而是别的插件按 user 角色塞进消息流的块，
 * 而且都框在 `<system-reminder>` 里 ——
 * `systemPrompt.suppressRuntimeContext()` 清 `contexts` 那一条对它们无效，
 * 所以只能在 `agent/pre-step` 的最外层按来源精确过滤。
 *
 * 值是该来源**真实内容**的 `form`：只有带着这个 `form` 的消息才是要丢的内容，
 * 平台补的那条「已作废」通知不带 `form`，必须放行。下面有详细说明。
 */
const RUNTIME_BLOCK_FORMS = new Map([
  ['runtime-context', 'snapshot'],
  ['skill-catalog', 'catalog'],
]);

/**
 * 这条消息的来源是不是「要屏蔽掉的 runtime 块内容」（G2，档位 2 的 Q6(a)）。
 *
 * 平台的来源对象带一个 `form`：
 *   - 真的运行时快照：`{ kind: 'runtime-context', form: 'snapshot', sections }`
 *     （`dsh-agent-loop/lib/index.js` 的 `RuntimeContextProjection.project()`）；
 *   - 技能目录 / 目录更新：`{ kind: 'skill-catalog', form: 'catalog', … }`
 *     （`dsh-tool-skill/lib/index.js` 两处 `createUserMessage`）。
 * 而**抑制生效之后**平台补的那条「之前那份运行时信息已经作废」的通知是
 *   `Current runtime context: none. Earlier runtime-context snapshots no longer apply.`
 * 它的来源对象**只有 `kind`、没有 `form`**（`project()` 里 `sections.length === 0`
 * 的那一支走 `{ kind: SOURCE }`，而 `current.length === 0` 时正文换成 CLEARED）。
 *
 * 那条通知是平台**唯一**用来告诉模型「别再按老信息办事」的通道。以前这里按
 * `kind` **整类**删掉，于是旧快照还在、作废通知被删 —— 模型看到的是一份看起来
 * 仍然有效的过期信息（审计报告的 C10）。所以现在只丢「有 `form` 的那些」。
 *
 * ⚠ 这是**平台私有契约**：上面三处都对照本机已装的 `@deepseek-ai/dsh` 0.1.7-rc.2
 * 逐条确认过。平台若哪天给 CLEARED 也补上 `form: 'snapshot'`，这条判据会失效 ——
 * 那时退回「按 kind 整类删」即可（只是回到 C10 的老行为），不会崩。
 * @param {object|undefined} source - 消息的 `source`。
 * @returns {boolean} 要丢掉时为 true。
 */
function isRuntimeBlockSource(source) {
  if (source === null || source === undefined || typeof source !== 'object') return false;
  const form = RUNTIME_BLOCK_FORMS.get(source.kind);
  return form !== undefined && source.form === form;
}

/** Cordis 注入的服务名。缺任何一个都会让 mount 直接失败（可见的，不是静默）。 */
export const inject = ['webServer', 'connection', 'systemPrompt'];

/* ──────────────────────────── 小工具 ──────────────────────────── */

/**
 * 发一个 JSON 响应。
 * @param {import('node:http').ServerResponse} res - Node 响应对象。
 * @param {number} status - HTTP 状态码。
 * @param {unknown} body - 要序列化的响应体。
 * @returns {void}
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}

/**
 * 405 响应，带上允许的方法。
 * @param {import('node:http').ServerResponse} res - Node 响应对象。
 * @param {string} allow - 允许的方法，逗号分隔。
 * @returns {void}
 */
function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405;
  res.setHeader('allow', allow);
  res.end();
}

/**
 * 在跑任何业务逻辑之前拦掉不可信请求——与 `dsh-prompt-setting` 用同一道栅栏。
 *
 * `connection` 是插件的必需依赖（`apply()` 声明了它），框架只有在拿得到时才会
 * 挂载本插件 —— 所以这里不再单独处理「它不见了」：真到那一步，插件早就被卸了。
 * @param {object} ctx - Host 插件上下文。
 * @param {import('node:http').IncomingMessage} req - Node 请求对象。
 * @param {import('node:http').ServerResponse} res - Node 响应对象。
 * @returns {boolean} 已经拒绝并结束响应时返回 true，调用方必须立即返回。
 */
function rejected(ctx, req, res) {
  const connection = Reflect.get(ctx, 'connection');
  const rejection = connection.requestRejection(req);
  if (rejection === undefined) return false;
  res.statusCode = rejection;
  res.end();
  return true;
}

/**
 * 解析请求 URL。前缀路由拿到的是完整 URL，所以要用一个丢弃的 origin 解析。
 * @param {import('node:http').IncomingMessage} req - Node 请求对象。
 * @returns {URL} 解析结果。
 */
function requestUrl(req) {
  return new URL(String(req.url ?? '/'), 'http://localhost');
}

/**
 * 造一个「请求体有问题」的错误（0.3.0）。
 *
 * 它带 `status: 400` 和一个稳定的 `code`，路由的 catch 据此回 400 —— 否则
 * 一个写坏的请求体会被当成服务端故障报成 500，看日志的人会去找错地方。
 * @param {string} message - 给调用方看的原因。
 * @returns {Error & {status: number, code: string}} 带状态码的错误。
 */
function badRequestBody(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'bad-request-body';
  return error;
}

/**
 * 造一个「请求体太大」的错误（H10/S2（ps2 档位 2 · F4））。
 *
 * 与 {@link badRequestBody} 同一族 —— 都是**客户端**把请求写坏了 —— 但状态码是
 * **413** 而不是 400：语义是「体量超限」，不是「格式不对」。改前这里只是一个裸
 * `Error`（无 `status`、无 `code`），路由兜底于是报成 **500 internal-error**，
 * 用户看到的是「插件内部出错」，会去重装插件，而真正要做的是把内容拆成几次发。
 * @param {number} maxBytes - 本次请求允许的体上限。
 * @returns {Error & {status: number, code: string}} 带状态码的错误。
 */
function bodyTooLarge(maxBytes) {
  const error = new Error(`请求体超过 ${maxBytes} 字节上限：请拆成几次再发`);
  error.status = 413;
  error.code = 'body-too-large';
  return error;
}

/**
 * 客户端自己声明的请求体长度（0.3.23）。
 *
 * 只用来做「还没收就拒」的抢跑判断 —— 拿不到、不是数字、是负数一律返回 `null`
 * （当作没说），真正的上限仍然由收完 / 收超那一刻的 `size > maxBytes` 兜底。
 * @param {object} req - Node 请求对象（测试装置里的假对象没有 `headers`）。
 * @returns {number|null} 声明的字节数，或 null（不知道）。
 */
function declaredLengthOf(req) {
  const headers = req === null || req === undefined ? undefined : req.headers;
  if (headers === null || headers === undefined || typeof headers !== 'object') return null;
  const raw = headers['content-length'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const size = Number(value);
  return Number.isFinite(size) && size >= 0 ? size : null;
}

/**
 * 读请求体并解析成 JSON。超过上限或不是对象一律拒绝。
 *
 * **只结算一次**（J4，档位 2）：超限那一支会先 `reject()` 再 `req.destroy()`，
 * 而断开又会触发一次 `error` —— 于是这个 Promise 被结算两次（第二次是无害的
 * no-op，但顺序上不该依赖它）。这里补上与 `readBinaryBody()` 同款的 `settled`
 * 守卫，两条读取路径的写法就此一致。
 *
 * 关于「中途断开会不会让 Promise 一直悬着」：档位 2 **实测过**，结论是**不会**。
 * 客户端 abort / 半关闭（FIN）/ 还没发一个字节就断 / chunked 没写终止块就断，
 * 四种场景都由 `req` 的 `error` 事件（`ECONNRESET`）落在 `reject` 上，约 80 ms
 * 内结算。所以这里**没有**加超时或额外的 `close` 监听 —— 加了反而是给一个
 * 不存在的问题加一层可能出错的代码。（探针见交接单。）
 * @param {import('node:http').IncomingMessage} req - Node 请求对象。
 * @param {number} [maxBytes] - 本次请求允许的体上限，默认 {@link MAX_BODY_BYTES}。
 *   只有「保存历史对话」会传一个更大的值（见 {@link MAX_HISTORY_BODY_BYTES}）。
 * @returns {Promise<object>} 解析后的对象。
 * @throws {Error} 超限、非法 JSON、或顶层不是对象时。
 */
function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    // 0.3.23：两处省内存 / 省一次白收的改动（上限本身一个字没动，仍是 16 MiB）：
    //   ① 客户端自己报的 `content-length` 已经超限 → **一个字节都不收**就拒掉。
    //      改前要先把它读进内存、再在 `size > maxBytes` 那一支拒 —— 一份 200 MiB
    //      的恶意体在拒绝之前已经占满了内存。
    //   ② 用 `StringDecoder` 逐块解码后 `join`，不再 `Buffer.concat` —— 少一整份
    //      与请求体等大的 Buffer 峰值（跨块的半个 UTF-8 字符由解码器兜住，
    //      与原来 `toString('utf8')` 的结果逐字相同）。
    const decoder = new StringDecoder('utf8');
    const parts = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const succeed = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const declared = declaredLengthOf(req);
    if (declared !== null && declared > maxBytes) {
      fail(bodyTooLarge(maxBytes));
      req.destroy();
      return;
    }
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        // F4（审计 B7/B8 · ps2 档位 2）：走 413 `body-too-large`，别再让路由把它报成 500。
        fail(bodyTooLarge(maxBytes));
        req.destroy();
        return;
      }
      parts.push(decoder.write(chunk));
    });
    req.on('end', () => {
      if (settled) return;
      const raw = parts.join('') + decoder.end();
      if (raw.trim() === '') {
        succeed({});
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        // 带上 `status`：这是**客户端**写错了，不该由路由报成 500。
        fail(badRequestBody(`请求体不是合法 JSON：${error?.message ?? String(error)}`));
        return;
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        fail(badRequestBody('请求体必须是 JSON 对象'));
        return;
      }
      succeed(parsed);
    });
    req.on('error', (error) => fail(error));
  });
}

/**
 * 读一个**二进制**请求体（0.3.1）。
 *
 * 导出交接用：图片动辄几 MB，走 JSON + base64 会平白胖三成，还要多一次
 * 编解码，所以这一条路由直接收原始字节 —— 文件名与类型放在查询参数里。
 * @param {import('node:http').IncomingMessage} req - Node 请求对象。
 * @param {number} maxBytes - 本次请求允许的体上限。
 * @returns {Promise<Buffer>} 收到的字节（可能为空）。
 */
function readBinaryBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    // 0.3.23：与 `readJsonBody()` 同一条抢跑 —— 声明就超限的上传不必先收进内存。
    const declared = declaredLengthOf(req);
    if (declared !== null && declared > maxBytes) {
      fail(badRequestBody(`导出文件超过 ${maxBytes} 字节上限`));
      req.destroy();
      return;
    }
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        fail(badRequestBody(`导出文件超过 ${maxBytes} 字节上限`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => fail(error));
  });
}

/* ══════════════ 导出交接（0.3.1）══════════════ */

/**
 * 把客户端给的文件名收拾成一个**安全的单段文件名**。
 *
 * 这条路由的文件名最终要进 `Content-Disposition` 响应头，所以引号、反斜杠、
 * 换行这类能撬动响应头的字符必须**删掉**（不是转义 —— 少一层出错的机会）。
 * 路径分隔符一并换成下划线：这东西只该是一个文件名，不该是一条路径。
 *
 * 另外把「整名就是 `.` / `..`」的情况按空处理：文件名会拼进取件 URL 的路径，
 * 而浏览器会把这样的一段「吃掉」（路径归一化），下载链接于是打不开。
 * 名字中间的点照旧保留 —— 扩展名就靠它（见 {@link contentDispositionFor}）。
 *
 * 0.3.23（审计 §四.1）：名字为空时的**兜底名跟着 MIME 走**。改前无论导出什么
 * 都回 `persona.json` —— 一份 PNG 导出的兜底名于是叫 `persona.json`，
 * 与取件响应声明的 `image/png` 打架（老下载器按名字存盘，用户拿到一个
 * 后缀是 .json 的图片）。调用方总是会带上一个非空名字，所以这一改只在
 * 「客户端没给名字」时生效，正常导出一个字都不变。
 * @param {unknown} raw - 请求里带的文件名。
 * @param {string} [mime] - 同一次导出声明的 MIME 类型（用来决定兜底扩展名）。
 * @returns {string} 安全文件名（保证非空）。
 */
function safeExportName(raw, mime = '') {
  const flat = String(raw ?? '')
    // 控制字符（含 CR/LF）、引号、反斜杠、路径分隔符 —— 全部换成下划线。
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '_')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, 80)
    .replace(/^\.\.?$/, '');
  if (flat !== '') return flat;
  return mime === 'image/png' ? 'persona.png' : 'persona.json';
}

/**
 * 造 `Content-Disposition` 头（0.3.1）。
 *
 * 两条都给：`filename=` 是给老客户端的 ASCII 兜底，`filename*=` 才是带中文的
 * 真名（RFC 5987）。Android 的下载器两者都认，桌面浏览器也都认 —— 这正是
 * 「应用内 WebView 拿不到 `<a download>`，但认响应头」那条路的落点。
 *
 * 0.3.23（审计 §四.5）：ASCII 兜底**只取最后一段扩展名**。改前它把文件名里
 * 从第一个点之后的所有段都拼上去（`dsh-persona${ext}` 里的 `ext` 来自
 * `filename.slice(dot)`），于是 `鱼崽崽.persona.png` 的兜底名是
 * `dsh-persona.persona.png` —— 只认这一条的老下载器会拿到一个多一截的名字。
 * 现在兜底是 `dsh-persona.png`。`filename*=` 那一支一个字没动。
 * @param {string} filename - 已经过 {@link safeExportName} 的名字。
 * @returns {string} 完整的响应头值。
 */
function contentDispositionFor(filename) {
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '') : '';
  return `attachment; filename="dsh-persona${ext === '' ? '' : `.${ext}`}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** 交接表的总容量上限（字节）。图片可能很大，所以给得宽，但仍然封顶。 */
const HANDOFF_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
/** 单次交接的大小上限（字节）。 */
const HANDOFF_MAX_ENTRY_BYTES = 32 * 1024 * 1024;
/** 交接表最多同时保留几条。 */
const HANDOFF_MAX_ENTRIES = 4;
/** 交接条目的存活时间（毫秒）：下载发起后就没用了，不该长期占内存。 */
const HANDOFF_TTL_MS = 120000;

/**
 * 清掉过期的交接条目。
 * @param {Map<string, object>} table - 交接表。
 * @param {number} now - 当前时间戳。
 * @returns {void}
 */
function pruneHandoffs(table, now) {
  for (const [token, entry] of table) {
    if (entry.expiresAt <= now) table.delete(token);
  }
}

/**
 * 收下一份待下载的文件，返回取件 token（0.3.1）。
 *
 * 为什么绕这一圈：本插件的导出原先在浏览器里造 `blob:` 再点 `<a download>`，
 * 而应用内 WebView 的下载桥**看不到那个属性** —— 它只拿到 blob URL 和 MIME，
 * 于是文件被存成 `<uuid>.json`，和界面上提示的名字对不上。改成「Host 收下
 * 字节 → 客户端下这个 URL」，文件名就走 `Content-Disposition`，这条路是
 * DSH 自己的会话导出在用的，同一个 WebView 上名字是对的。
 * @param {Map<string, object>} table - 交接表。
 * @param {{filename: string, mime: string, bytes: Buffer}} item - 待取内容。
 * @returns {{token: string, url: string}} 取件信息。
 */
function stashHandoff(table, item) {
  const now = Date.now();
  pruneHandoffs(table, now);
  // 先按条数腾地方，再按总字节腾：从最老的开始丢。
  while (table.size >= HANDOFF_MAX_ENTRIES) table.delete(table.keys().next().value);
  let total = 0;
  for (const entry of table.values()) total += entry.bytes.length;
  while (total + item.bytes.length > HANDOFF_MAX_TOTAL_BYTES && table.size > 0) {
    const oldest = table.keys().next().value;
    total -= table.get(oldest).bytes.length;
    table.delete(oldest);
  }
  const token = randomUUID();
  table.set(token, { ...item, expiresAt: now + HANDOFF_TTL_MS, servedAt: null });
  // 文件名**放进路径最后一段**（percent-encoded）。为什么不能只靠响应头：
  // `URLUtil.guessFileName` 那个正则是 `attachment;\s*filename\s*=\s*("?)([^"]*)\1\s*$`
  // —— **锚定结尾**，所以头部里 `filename` 后面只要还有参数（比如标准的
  // `filename*=UTF-8''…`）就整个匹配不上，它会退回去拿 URL 的最后一段当名字。
  // 放这里它就会 `Uri.decode` + `URLDecoder.decode`，中文照样还原。
  return { token, url: `${ROUTE_PREFIX}/handoff/${token}/${encodeURIComponent(item.filename)}` };
}

/**
 * 读一份交接内容（0.3.2：**不再取一次就删**）。
 *
 * 0.3.1 是"读到就删"，于是下载器只要多问一次（先 HEAD 探路、或者断点续传
 * 再发一次）就会撞上 404 —— 用户看到的就是「文件处理失败，服务返回HTTP404」。
 * 现在改成"TTL 内可重复读"，并用 `servedAt` 记下**有没有真的被取过数据**：
 *   · HEAD 探路不动 `servedAt`（它没拿数据）；
 *   · GET / Range 取到数据时打上时间戳。
 * 客户端就靠这个标记判断"这次下载到底有没有发生"，不再盲目报成功。
 * @param {Map<string, object>} table - 交接表。
 * @param {string} token - 取件 token。
 * @returns {object|null} 条目；不存在或已过期时返回 null。
 */
function readHandoff(table, token) {
  pruneHandoffs(table, Date.now());
  const entry = table.get(token);
  return entry === undefined ? null : entry;
}

/**
 * 取一个请求头（大小写不敏感，数组取第一个）。
 * @param {import('node:http').IncomingMessage} req - Node 请求对象。
 * @param {string} name - 头名（小写）。
 * @returns {string|undefined} 头值。
 */
function requestHeader(req, name) {
  const headers = req === null || req === undefined ? undefined : req.headers;
  if (headers === null || headers === undefined) return undefined;
  const value = headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

/**
 * `parseByteRange()` 的「**明确不可能满足**」返回值（H1，档位 2）。
 *
 * 与 `null` 分开：`null` = 「这个 Range 我不认识 / 我不打算支持」→ 回整包 200，
 * 忽略 Range 是**合法**行为；而这个值 = 「区间写得没问题，但那段字节根本不存在」
 * → 必须回 416，下载器才知道「已经下完了」。
 * @type {symbol}
 */
const RANGE_UNSATISFIABLE = Symbol('range-unsatisfiable');

/**
 * 解析单区间 `Range` 头（0.3.2）。
 *
 * 只支持最常见的 `bytes=a-b` / `bytes=a-` / `bytes=-n`；解析不出来就返回
 * `null`，调用方回整包 200 —— 忽略 Range 是合法行为，比编一个错误码稳。
 *
 * **0.3.19（H1）起多了一档**：写法合法但起点已经越过文件末尾（`start >= size`）
 * 时返回 {@link RANGE_UNSATISFIABLE}，调用方回 **416**。以前这种情况也回
 * 「200 + 整份内容」，而支持断点续传的下载器会把 200 理解成「服务端不支持
 * 断点续传」，于是**从头再下一遍**；收到 416 它就明白「这份已经下完了」。
 * @param {string|undefined} header - `Range` 头的值。
 * @param {number} size - 内容总长度。
 * @returns {{start: number, end: number}|null|symbol} 闭区间 / 不适用 / 不可能满足。
 */
function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (match === null) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;
  let start;
  let end;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start < 0) return null;
  // 起点已经越过末尾：这不是「写法不认识」，是**明确不可能满足**。
  // ⚠ 这一条必须排在 `end < start` **前面**：`bytes=99-`（省略末尾）算出来的
  // end 是 `size - 1`，一定小于 start —— 先判 `end < start` 会把它误降级成
  // 「忽略 Range」，又变回 200 + 整份（H1 要修的正是这个）。
  if (start >= size) return RANGE_UNSATISFIABLE;
  if (end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

/**
 * 响应一次取件请求（0.3.2）。
 *
 * 允许 `GET` 与 `HEAD`：
 *   · `HEAD` 是下载器**探路**用的（先问类型和长度再决定下不下），只回头、
 *     不消费 —— 0.3.1 把 HEAD 当"没有这条路由"回 404，下载器就直接放弃了；
 *   · `GET` 拿数据，支持单区间 `Range`（206），断点续传/重试都能过；
 *   · 两种都带 `X-Handoff-Served`，客户端据此判断下载究竟有没有发生。
 * @param {Map<string, object>} table - 交接表。
 * @param {string} token - 取件 token。
 * @param {import('node:http').IncomingMessage} req - 请求对象。
 * @param {import('node:http').ServerResponse} res - 响应对象。
 * @returns {void}
 */
function serveHandoff(table, token, req, res) {
  const entry = readHandoff(table, token);
  if (entry === null) {
    sendJson(res, 404, { ok: false, code: 'handoff-expired', message: '这份导出已经过期了，请重新导出。' });
    return;
  }
  const head = req.method === 'HEAD';
  const size = entry.bytes.length;
  const parsed = head ? null : parseByteRange(requestHeader(req, 'range'), size);
  if (parsed === RANGE_UNSATISFIABLE) {
    // H1（档位 2）：写法合法但那段字节不存在 —— 回 416，并带上真实长度。
    // **不打 `servedAt`**：这一趟一个字节都没发出去（`servedAt` 的语义是
    // 「真的取到过数据」，见 `readHandoff` 的说明）。
    res.statusCode = 416;
    res.setHeader('content-type', entry.mime);
    res.setHeader('content-disposition', contentDispositionFor(entry.filename));
    res.setHeader('cache-control', 'no-store');
    res.setHeader('accept-ranges', 'bytes');
    // RFC 9110：416 用 `bytes */<长度>` 说明「文件就这么多」。
    res.setHeader('content-range', `bytes */${size}`);
    res.setHeader('x-handoff-served', entry.servedAt === null ? '0' : '1');
    res.setHeader('content-length', '0');
    res.end();
    return;
  }
  const range = parsed;
  if (!head) entry.servedAt = Date.now();
  res.statusCode = range === null ? 200 : 206;
  // 回**声明的真实类型**，让"扩展名从 MIME 推"的规则也能推对（见 EXPORT_MIMES）。
  res.setHeader('content-type', entry.mime);
  res.setHeader('content-disposition', contentDispositionFor(entry.filename));
  // 交给下载器的东西不该被任何一层缓存。
  res.setHeader('cache-control', 'no-store');
  res.setHeader('accept-ranges', 'bytes');
  // 0 = 还没人取过数据，1 = 已经被取走过了（客户端据此如实报结果）。
  res.setHeader('x-handoff-served', entry.servedAt === null ? '0' : '1');
  if (range === null) {
    res.setHeader('content-length', String(size));
    res.end(head ? undefined : entry.bytes);
    return;
  }
  res.setHeader('content-range', `bytes ${range.start}-${range.end}/${size}`);
  res.setHeader('content-length', String(range.end - range.start + 1));
  res.end(entry.bytes.subarray(range.start, range.end + 1));
}

/**
 * 记一条诊断信息到宿主日志。
 *
 * 只走框架的 logger：它本身就会写到终端，这里再往控制台打一份就是同一句话
 * 两遍。**只有拿不到 logger（或它自己抛了）时才退回控制台** —— 去重不能以
 * 「某条诊断彻底消失」为代价。
 * @param {object} ctx - Host 插件上下文（可能不可用）。
 * @param {string} message - 单行可读信息。
 * @returns {void}
 */
function logToHost(ctx, message) {
  try {
    const logger = ctx === null || ctx === undefined ? undefined : ctx.logger;
    if (logger !== null && logger !== undefined && typeof logger.error === 'function') {
      logger.error(message);
      return;
    }
  } catch {
    // logger 自己抛了：退到控制台，别把这条信息丢了。
  }
  try {
    console.error(message);
  } catch {
    // 没有可用的 stderr：放弃记录，但不能因此抛出去。
  }
}

/* ──────────────────────────── mount ──────────────────────────── */

/**
 * 标记「一次操作开始了」：上一次操作问到的文件时间戳就此作废。
 *
 * 「一次操作」= 一个路由请求，或装配路径上的一次钩子回调。同一个操作里
 * `refresh()` 会被叫好几次（`ensureSessionRecord` / `historyMismatchOf` /
 * `currentText` …），每次都 `statSync` 一遍纯属重复。这里让它们共用同一次
 * 读数：**只有操作的第一问真的去问操作系统**，所以「外部手改在操作边界被
 * 发现」这条语义不变。
 *
 * 0.3.23（`owner`）：一轮对话里 `system-prompt/assemble` 会被两个监听器各跑一次、
 * 之后还有一次 `agent/pre-step` —— 旧实现每处都 `beginStat(state)`，于是**同一轮里
 * 整份读取 + sha1 要跑三次**（本机实测：100 KB 主文件 3.8 ms/次、16 MB 23 ms/次）。
 * 现在传进宿主那一轮的 `AbortSignal` 当 `owner`：同一个 `owner` 的第二次起直接复用，
 * 而每一轮的 signal 都是新的（`dsh-agent-loop` 每轮 `new AbortController()`），
 * 所以「每一轮开头重新问一次盘」这条语义一个字没变。
 *
 * ⚠ 不传 `owner`（`null`）= 旧行为（每次都重新问）—— 路由、`agent/created`、
 * 会话删除这些**不属于某一轮**的入口走这条，宁可多读一次也不复用别处的读数。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object|null} [owner] - 这次问盘属于哪一轮（宿主那一轮的 signal），null = 不属于任何一轮。
 * @returns {void}
 */
function beginStat(state, owner = null) {
  const scope = owner ?? null;
  if (scope !== null && state.statOwner === scope) return;
  state.statOwner = scope;
  state.statCache = STAT_UNKNOWN;
}

/**
 * 「这一次操作还没问过盘」的哨兵（0.3.23）。
 *
 * 以前用 `null` 同时表示「还没问」与「问过了，答案是 null（文件不存在 / 读不到）」，
 * 于是**数据文件不存在时那张缓存永远settle不下来**：每一次 `statSignature()` 都
 * 重新 statSync + 读一遍（失败路径也不便宜），而同一操作里 `refresh()` 会被叫好
 * 几次。用一个专属符号把两种含义分开，语义与「问过了」时才置的缓存一致。
 */
const STAT_UNKNOWN = Symbol('persona-select:stat-unknown');

/**
 * 这一次操作里的数据文件**身份**（同一个操作只问操作系统一次）。
 *
 * G1/Q3(a)（审计 host.md §2 C2、store-性能.md §6(1) 的 H3/S7 · ps2 档位 2）：以前这里只取 `mtimeMs`。实测（`host.md` §2 C2、
 * `store-性能.md` §6(1)）相邻两次写入的 `mtimeMs` 在 400 次里 **339 次完全相同**
 * （`/sdcard` 上是 162/399），时钟量化在 4 ms 栅格上；用 `utimesSync` 把 mtime
 * 复原之后，外部改了内容也**完全看不见**，下一个请求就按内存那一份整份盖回去。
 * 现在的一问读的是 `ino:size:mtimeMs`，等长改写之外的改动都能被发现。
 * @param {object} state - 本次 mount 的可变状态。
 * @returns {string|null} 文件签名，或 null（文件不存在 / 读不到）。
 */
function statSignature(state) {
  if (state.statCache === STAT_UNKNOWN) state.statCache = fileSignatureOf(state.path);
  return state.statCache;
}

/**
 * 从磁盘重新载入文档。**永不抛**——失败时保留旧文档并记下错误。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} [knownSig] - 调用方刚问到的文件签名（省一次 statSync）。
 * @returns {void}
 */
function reload(state, knownSig) {
  try {
    const read = readStoreFile(state.path);
    const warnings = [...read.warnings];
    const doc = read.doc;
    // 档位 4 的 S1：主文件里还带着「历史对话」正文 = 旧格式。**这一轮先按旧格式用**
    // （旧格式一直读得懂，见 `normalizeHistory`），下一个 tick 再排进写队列迁移。
    //
    // 档位 4（R1）把它从这条同步路径里摘出来的原因：迁移 = 把 954 KB 正文写进
    // `history/`，同步做就是一次读盘里的整机停摆。异步之后这里只剩一次纯内存判断。
    if (needsHistoryMigration(doc)) scheduleHistoryMigration(state);
    state.doc = doc;
    state.error = null;
    state.warnings = warnings;
    state.fileSig = knownSig === undefined ? statSignature(state) : knownSig;
    state.statCache = state.fileSig;
    state.failedSig = null;
    state.loaded = true;
  } catch (error) {
    state.error = `${error?.code ?? 'error'}: ${error?.message ?? String(error)}`;
    // 故意不动 state.doc：磁盘坏了也要让人设继续用上一次的好数据。
    // 但要记下**是在哪个签名上失败的**：同一个签名不再反复重试（J3）。
    state.failedSig = knownSig === undefined ? statSignature(state) : knownSig;
    state.statCache = state.failedSig;
  }
}

/**
 * 把「旧格式 → history/ 独立文件」的迁移排进写队列（档位 4 · R1）。
 *
 * 三条纪律：
 *   1. **不让 sync 读盘路径等它**：调用方（`reload()`）立刻按旧格式把数据交给
 *      上层，迁移在下一个 tick 才跑 —— 读盘一次都不能因此变慢；
 *   2. **临界区里重新对齐**：排队期间可能又有人写过文件，所以进去先 `refresh()`
 *      再复查一次 `needsHistoryMigration()`（可能已经不需要了）；
 *   3. **失败只记提醒**：迁移失败不算读盘失败，旧格式继续可用。超限被闸门拦住
 *      `personas-over-limit` 更不是故障（用户删到上限以内，第一次成功写入就会
 *      顺带写成新格式），措辞与原来那条一字不差。
 * @param {object} state - 本次 mount 的可变状态。
 * @returns {void}
 */
function scheduleHistoryMigration(state) {
  if (state.migrationScheduled) return;
  state.migrationScheduled = true;
  setImmediate(() => {
    state.migrationScheduled = false;
    const run = enqueueWrite(state, async () => {
      refresh(state);
      if (!needsHistoryMigration(state.doc)) return;
      const done = await migrateHistoryFiles(state.path, state.doc);
      if (done.migrated <= 0) return;
      state.doc = done.doc;
      // 刚写过主文件：手上这个签名已经作废，必须重新问一次操作系统。
      state.fileSig = fileSignatureOf(state.path);
      state.statCache = state.fileSig;
      state.failedSig = null;
      state.loaded = true;
      state.warnings = [
        ...(Array.isArray(state.warnings) ? state.warnings : []),
        `已把 ${done.migrated} 段「人设历史对话」搬到独立文件（history/ 目录），主文件不再跟着它们变大；迁移前的旧文件备份在 ${done.backup}`,
      ];
    }).catch((error) => {
      const note = error?.code === 'personas-over-limit'
        ? '「人设历史对话」搬到独立文件这件事会等人设降到上限以内再自动完成'
          + '（现在磁盘上还超限，保存被拒绝；但每删一条都会立刻落盘，删够了就自动搬完）。'
        : `「人设历史对话」自动迁移没成功（${error?.code ?? 'error'}: ${error?.message ?? String(error)}）：仍按旧格式使用，磁盘上的主文件没有被改动。`;
      state.warnings = [...(Array.isArray(state.warnings) ? state.warnings : []), note];
    });
    state.migrationPromise = run;
    run.catch(() => {}).then(() => { if (state.migrationPromise === run) state.migrationPromise = null; });
  });
}

/**
 * 有迁移在飞就等它落地（档位 4 · R1）。
 *
 * **永不抛**：迁移失败只记提醒，请求照常按旧格式办（旧格式一直读得懂）。
 * @param {object} state - 本次 mount 的可变状态。
 * @returns {Promise<void>}
 */
async function settlePendingMigration(state) {
  const pending = state.migrationPromise;
  if (pending === null || pending === undefined) return;
  try {
    await pending;
  } catch {
    // 失败已经被 `scheduleHistoryMigration()` 的 catch 记进 warnings 了。
  }
}

/**
 * 磁盘被外部改过就重读。
 *
 * 这里**只有一次 `statSync`**（微秒级），内容变了才真正读文件。
 * 不用时间节流：那会让「手改了 personas.json 但界面/模型一分钟内没反应」
 * 变成需要解释的行为，而 stat 的成本根本不值得用这种代价去省。
 * 装配路径与路由请求走的是同一个函数，语义只有一份。
 *
 * 唯一一处「不重试」的例外是 J3：**同一个坏文件只解析失败一次**。以前文件一
 * 坏，之后每次刷新都会重新读、重新 `JSON.parse` 失败一遍（界面照样能用，
 * 但机器会莫名变慢、发烫）。失败时的文件签名记在 `state.failedSig` 上，
 * 同一个签名不再重试；用户把文件改好（签名变了）就自动恢复。
 * @param {object} state - 本次 mount 的可变状态。
 * @returns {void}
 */
function refresh(state) {
  const sig = statSignature(state);
  if (state.loaded && sig === state.fileSig) return;
  if (state.failedSig !== null && sig === state.failedSig) return;
  reload(state, sig);
}

/**
 * 会话日志里的「工具声明基线」缓存：session -> { length, tools, declared }。
 *
 * 用 WeakMap 而不是 Map：session 是会话级的，强引用会随会话数无限增长。
 * 存的是**折叠的中间状态**（扫到第 `length` 个事件时的基线 + 已声明工具表），
 * 所以日志追加时可以从断点续扫，而不是每次重头来一遍（0.2.7）。
 */
const sessionLogCache = new WeakMap();

/**
 * `headers`（seq → 那一轮的请求头工具表）最多保留多少条（0.3.23）。
 *
 * 这张表只服务一件事：`developer/message` 里的 `tool-addition` 块按 `headerSeq`
 * 回查「那一轮的工具定义」。而那个 `headerSeq` 指向的就是**当前这一轮**的请求头
 * （`tool-addition` 与它引用的 header 在日志里是挨着的）。以前这张表只增不减 ——
 * 一个聊了几百轮的会话会留下几百到上千个 Map 条目，全部挂在按会话的
 * `sessionLogCache` 上（`WeakMap` 只在会话对象被回收时才释放）。
 * 64 条足够覆盖「引用落在前面几轮」的写法，同时把增长封住。
 */
const HEADER_HISTORY_KEEP = 64;

/**
 * 工具定义的序列化指纹缓存（0.3.23）。
 *
 * `redeclared` 判据要在每个请求头的每个工具上比较「定义变了没有」，
 * 改前是无条件双向 `JSON.stringify`（首次全扫 = O(请求数 × 工具数 × schema 大小)）。
 * 按**对象身份**缓存指纹之后：① 同一个对象第二次比较直接命中；
 * ② 与 `declared` 里存的是同一个对象时连指纹都不用算（见下面的 `before === tool`）。
 * 用 `WeakMap` 而不是 `Map`：工具定义对象是宿主给的，不替它挡垃圾回收。
 */
const toolFingerprints = new WeakMap();

/**
 * 一个工具定义的「逐字序列化」指纹（算过就缓存，按对象身份）。
 * @param {unknown} tool - 工具定义对象（非对象按原样序列化，不缓存）。
 * @returns {string} 序列化结果。
 */
function toolFingerprint(tool) {
  if (tool === null || typeof tool !== 'object') return JSON.stringify(tool) ?? 'undefined';
  const cached = toolFingerprints.get(tool);
  if (cached !== undefined) return cached;
  const next = JSON.stringify(tool) ?? 'undefined';
  toolFingerprints.set(tool, next);
  return next;
}

/**
 * 一份会话日志只从头到尾扫**一遍**，同时产出四件事。
 *
 * 以前是四份独立的实现各扫一遍、各配一张缓存、各记一份长度（0.3.18 的
 * `baselineCache` / `injectedHistoryCache` + 两处即时循环）。它们问的是四个
 * 不同的问题，但读的是**同一份日志**：
 *
 *   1. `tools` / `declared`：本会话的工具声明基线（工具渐进披露账本的第一条声明）；
 *   2. `historyFound`：这个会话注入过「人设历史对话」没有；
 *   3. `historyText`：那条注入消息归一化之后的正文（没注入过是 `null`）；
 *   4. `hadConversation` / `hasUserContent`：这条会话到底「聊过没有」。
 *
 * 循环是纯**左折叠**：每个事件的更新只依赖当前累加器与当前事件，不看日志总长、
 * 也不看后面的事件。所以「缓存里的中间状态 + 从 `cached.length` 接着扫」与
 * 「从 0 重扫」逐位等价 —— 这也是原来那张基线缓存的护栏，现在四份结果共用它。
 *
 * 为什么不直接用 `session.toolHistory()`：那个快照在「当前工具集 ≠ 可用工具集」
 * 时会退化成 `{ tools: active }` —— 于是「基线其实是好的、只是这一轮被本插件
 * 剥空了」与「基线真的空」返回**同一个形状**，分不出来。日志才是那本账本本身。
 *
 * ⚠ 护栏（照抄原来那条，理由不变）：日志**变短**（回退 / 重写 / 就地压缩）时
 * 缓存前缀不再成立，必须退回全扫。少了它就会把过期的基线当成最新的 —— 而基线
 * 误判成「ready 而实际是空」会让安全阀放行剥工具，触发那个会话内不可逆的
 * INVALID_REQUEST。所以 `log.length > cached.length` 是硬条件；老格式缓存
 * （没有 `declared` / `headers`）也一律不续扫。
 *
 * **J6（档位 2）对照的平台版本**：`@deepseek-ai/dsh` **0.1.7-rc.2** 的
 * `@deepseek-ai/dsh-session/lib/index.js` 里的 `ToolHistoryProjection`。
 * 那个类的 `apply()` 处理**两类**事件：
 *   · `request/header` —— 维护 `headers`（seq → 工具表）、`declared`（当前声明
 *     系列里见过的定义）、`active`，并在「首个 / `reason === 'series'` /
 *     `startsSeries` / 定义被重声明」时重置基线 `history.tools`；
 *   · `developer/message` —— 处理消息内容里的 `tool-addition` / `tool-removal`
 *     块：addition 会把定义写进 `declared`（按 `headerSeq` 回查那个 header 的
 *     工具表）并加入 `available`，removal 只从 `available` 里去掉。
 * 0.3.18 的插件只抄了前一半，于是 `declared` 可能比平台少了一批工具 ——
 * 「这一轮的工具定义是不是被**重声明**过」的判断时机就会与平台不一致，
 * 进而影响工具基线指示点与「刻意保留工具」的判断。
 *
 * **刻意的两点差异**（都不影响基线）：
 *   1. 平台在 `tool-addition` 找不到定义时会 **throw**；这里是**跳过** ——
 *      本函数挂在装配路径上，绝不能因为一条坏日志让一轮对话失败。
 *   2. 平台还维护 `available`（可用工具名集合）。本插件**没有任何地方读它**
 *      （判断只需要 `tools` 基线与 `declared`），所以不跟着记，免得白养一张表。
 * @param {object} session - DSH 会话对象。
 * @returns {{length: number, tools: Array<object>|undefined, declared: Map, headers: Map, historyFound: boolean, historySeen: boolean, historyText: string|null, hadConversation: boolean, hasUserContent: boolean}|null}
 *   扫描结果；读不到日志（没有 `.log` 数组）时是 `null`。
 */
function scanSessionLog(session) {
  const log = Array.isArray(session?.log) ? session.log : null;
  if (log === null) return null;
  const cached = sessionLogCache.get(session);
  if (cached !== undefined && cached.length === log.length) return cached;

  const canResume =
    cached !== undefined
    && cached.declared instanceof Map
    && cached.headers instanceof Map
    && log.length > cached.length;
  let tools = canResume ? cached.tools : undefined;
  let declared = canResume ? cached.declared : new Map();
  // J6：`headers` 是给 `developer/message` 的 `headerSeq` 回查用的。存的是
  // **日志里那些工具数组的引用**（不复制 schema），所以只是 O(请求数) 个指针。
  let headers = canResume ? cached.headers : new Map();
  let historyFound = canResume ? cached.historyFound : false;
  // `historySeen` 与 `historyFound` 分开：前者是「第一条注入消息已经处理过」，
  // 后者是「有没有注入过」。只取**第一条**注入消息的正文 —— 判据本来就是
  // 「一个会话只注入一次」，第一条就是那一条。
  let historySeen = canResume ? cached.historySeen : false;
  let historyText = canResume ? cached.historyText : null;
  let hadConversation = canResume ? cached.hadConversation : false;
  let hasUserContent = canResume ? cached.hasUserContent : false;

  for (let i = canResume ? cached.length : 0; i < log.length; i += 1) {
    const event = log[i];
    const type = event?.type;
    if (type === 'request/header') {
      const data = event.data ?? {};
      const headerTools = Array.isArray(data.header?.tools) ? data.header.tools : [];
      // J6：`headers` 也要记 —— `developer/message` 的 `tool-addition` 靠
      // `headerSeq` 回这里取它引用的工具定义（与平台同一个做法）。
      headers.set(event.seq, headerTools);
      // 0.3.23：封住这张表的增长（见 `HEADER_HISTORY_KEEP`）。只丢最旧的，
      // 而 `tool-addition` 回查的是最近那一轮，所以判据不受影响。
      while (headers.size > HEADER_HISTORY_KEEP) {
        const oldest = headers.keys().next();
        if (oldest.done === true) break;
        headers.delete(oldest.value);
      }
      const redeclared = headerTools.some((tool) => {
        const before = declared.get(tool?.name);
        if (before === undefined) return false;
        // 0.3.23：同一个对象 ⇒ 定义必然逐字相同，连序列化都不用做
        // （`declared` 里存的就是上一次基线里的那些对象本身）。
        if (before === tool) return false;
        return toolFingerprint(before) !== toolFingerprint(tool);
      });
      if (tools === undefined || data.reason === 'series' || data.startsSeries === true || redeclared) {
        tools = headerTools;
        declared = new Map(headerTools.map((tool) => [tool?.name, tool]));
      }
      continue;
    }
    if (type === 'developer/message') {
      // J6（档位 2 的 Q13(b)）：**这一段 0.3.18 完全没抄**。
      // 平台的处理见本函数头上的「对照的平台版本」；这里逐字补上影响
      // `declared` 的那一半（`tool-addition` 会把定义重新写进账本，于是之后
      // 一个**内容没变**的 `request/header` 不会被误判成「重声明」）。
      const data = event?.data ?? {};
      const content = Array.isArray(data.message?.content) ? data.message.content : [];
      if (content.length === 0) continue;
      const definitions = data.headerSeq === undefined ? undefined : headers.get(data.headerSeq);
      for (const block of content) {
        if (block?.type !== 'tool-addition') continue;
        const tool = definitions === undefined
          ? undefined
          : definitions.find((entry) => entry?.name === block.toolName);
        // 平台在这里**抛错**；本函数在装配路径上，坏日志只跳过（见函数说明）。
        if (tool === undefined) continue;
        declared.set(tool.name, tool);
      }
      continue;
    }
    if (type === 'user/message') {
      const kind = event?.data?.source?.kind;
      if (isPersonaHistorySource(event?.data?.source)) {
        historyFound = true;
        if (!historySeen) {
          historySeen = true;
          const content = Array.isArray(event?.data?.content) ? event.data.content : [];
          const parts = [];
          for (const block of content) {
            if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
          }
          historyText = canonicalHistoryText(parts.join('\n'));
        }
      } else if (kind === 'user') {
        // 「用户真打的字」才算内容：插件注入的快照、系统提示词都不算。
        hasUserContent = true;
      }
      continue;
    }
    if (type === 'assistant/message') hadConversation = true;
  }

  const state = {
    length: log.length,
    tools,
    declared,
    headers,
    historyFound,
    historySeen,
    historyText,
    hadConversation,
    hasUserContent,
  };
  sessionLogCache.set(session, state);
  return state;
}

/**
 * 读本会话的**工具声明基线**（工具渐进披露账本里的第一条声明）。
 *
 * 这里刻意复刻 `@deepseek-ai/dsh-session` 里 ToolHistoryProjection 的重置规则：
 * 基线 = 当前声明系列里的第一个 `request/header` 的工具列表，只有
 * 「还没有基线 / `reason === 'series'` / `startsSeries` / 工具定义被重声明」才重置。
 *
 * **对照版本（J6 要求写明）**：`@deepseek-ai/dsh` **0.1.7-rc.2** 的
 * `@deepseek-ai/dsh-session/lib/index.js` → `ToolHistoryProjection.apply()`。
 * 0.3.19 起连 `developer/message` 里的 `tool-addition` / `tool-removal` 那一段
 * 也一并复刻（见 {@link scanSessionLog}）—— 平台再改这里，先对着那个版本核。
 *
 * 为什么值得缓存、为什么必须能续扫：见 {@link scanSessionLog} —— 一次重扫要对
 * **每个** `request/header` 的**每个**工具做 `JSON.stringify` 双向比对，是
 * O(请求数 × 工具数 × schema 大小)，而且它挂在装配路径上（实测 30 工具 /
 * 1000 个请求头时 205ms）。
 *
 * 纯只读；读不到日志时返回 `null`（未知），不要和「还没有请求头部」（`undefined`）混淆。
 * @param {object} session - DSH 会话对象。
 * @returns {Array<object>|null|undefined} 基线工具列表 / 读不到 / 还没有请求头部。
 */
function baselineToolsOf(session) {
  const state = scanSessionLog(session);
  return state === null ? null : state.tools;
}

/**
 * 从一个 agent 或 session 对象里取会话 id。拿不到就返回 null。
 * @param {object|undefined} agentOrSession - agent（有 `.session`）或 session 本身。
 * @returns {string|null} 会话 id。
 */
function sessionIdOf(agentOrSession) {
  try {
    const session = agentOrSession?.session ?? agentOrSession;
    const id = session?.id ?? session?.header?.id;
    return typeof id === 'string' && id !== '' ? id : null;
  } catch {
    return null;
  }
}

/**
 * 按 id 找一个**活着的**会话对象（拿来算它的工具声明基线）。
 *
 * 两条路都试：先问 `sessions` 服务（浏览一个会话时它就已经在 store 里），
 * 再退到 `agents`（正在驱动一轮时 agent 一定有 session）。
 * 服务不可用、会话不活着都只是「拿不到」，绝不抛。
 * @param {object} ctx - Host 插件上下文。
 * @param {string} id - 会话 id。
 * @returns {object|undefined} session 对象（带 `.log`）。
 */
function sessionById(ctx, id) {
  if (typeof id !== 'string' || id === '') return undefined;
  try {
    const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
    const hit = sessions !== undefined && sessions !== null && typeof sessions.get === 'function' ? sessions.get(id) : undefined;
    if (hit !== undefined && hit !== null) return hit;
  } catch {
    // 服务不可用不算错：接着看 agents。
  }
  try {
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined;
    const agent = agents !== undefined && agents !== null && typeof agents.get === 'function' ? agents.get(id) : undefined;
    const session = agent?.session;
    if (session !== undefined && session !== null) return session;
  } catch {
    // 同上。
  }
  return undefined;
}

/* ══════════════ 导入 / 导出（0.3.0）══════════════ */

/**
 * 从导入请求体里取出人设数组（0.3.0）。
 *
 * 只认两种形状：
 *   1. 本插件导出的那种容器：`{ format, version, personas:[…] }`；
 *   2. 单条对象：`{ name, text, … }`（手写一份导进来时不用套壳）。
 * 认不出的返回 `null`，由调用方回 400 —— 这里不猜，宁可让人去改文件。
 *
 * 文件本身是**裸数组**（`[{…}, {…}]`）也支持，但那一步在客户端就读掉了：
 * 它会把数组包成 `personas` 再发过来，所以这里不必再认一遍。
 * @param {unknown} body - 请求体（`readJsonBody` 只放对象进来）。
 * @returns {Array<object>|null} 人设条目数组（已滤掉非对象项）。
 */
function importListOf(body) {
  if (body === null || typeof body !== 'object') return null;
  // H2（档位 2）：**不再在这里把形状不对的条目悄悄滤掉** —— 以前那一层
  // `filter(entry => entry !== null && typeof entry === 'object')` 会让
  // `null` / `'x'` / `42` 这类条目连「跳过」都不算（用户看到「导入 2 条、
  // 跳过 1 条」，剩下 3 条无处交代）。现在原样带上，由调用方逐条判定并记账，
  // 同时保留**原始下标**（用户按位置去修才对得上）。
  if (Array.isArray(body.personas)) return body.personas.map((raw, index) => ({ index, raw }));
  if (typeof body.name === 'string' || typeof body.text === 'string') return [{ index: 0, raw: body }];
  return null;
}

/**
 * 「名字 / 正文不能为空」只写一次（ps2 档位 1 · A4）。
 *
 * 只回答**哪一项空了**，反应留在各自调用点：`/save` 当场回 400，
 * `/import` 记进跳过名单 —— 两边的原因码与用户可见原文逐字不变。
 * 判序必须是**先名字、后正文**（两个调用点原来都是这个顺序；反过来会把
 * 「两样都空」的回执换一个码）。
 * @param {string} name - 归一化后的名字。
 * @param {string} text - 归一化后的正文。
 * @returns {'empty-name'|'empty-text'|null} 空掉的那一项，都不空时为 `null`。
 */
function emptyFieldOf(name, text) {
  if (name === '') return 'empty-name';
  if (text === '') return 'empty-text';
  return null;
}

/** 上面两种空的**用户可见原文**：只在 `/save` 用，一个字都不是新写的。 */
const EMPTY_FIELD_MESSAGES = Object.freeze({
  'empty-name': '人设名字不能为空',
  'empty-text': '人设正文不能为空',
});

/**
 * 人设条数到没到上限（档位 4 · R8）。
 *
 * `/save` 与 `/import` 各判一次「还能不能再塞一条」，而两边的**回执语义真的
 * 不同**（`/save` 是 409 明确拒绝，`/import` 是逐条进跳过名单）—— 所以这里
 * 只抽「到没到」这一个 boolean，**不抽回执**、也不统一措辞。
 * （审计 §10 更正 3 专门点过：200 条上限三处语义不等价，不许合并。
 *  该合并的那一半 —— 名字/正文为空 —— 档 1 的 A4 已经收成 `emptyFieldOf()` 了。）
 * @param {number} count - 当前（准备追加之前的）人设条数。
 * @returns {boolean} 已经到上限时为 true。
 */
function personaLimitReached(count) {
  return Number.isFinite(count) && count >= MAX_PERSONAS;
}

/**
 * 归一化导入条目里的「人设历史对话」（0.3.0）。
 *
 * 接受两种写法：`{ text, lockedAt }`（本插件导出的形状）和裸字符串（手写的）。
 * 空文本 = 没有历史。走 {@link normalizeHistory}，所以「不裁切」这条规则与在
 * 设置页里保存历史完全一致 —— 导入不会把大历史砍掉。
 * @param {unknown} raw - 条目里的 `history`。
 * @param {number} now - 本次导入的时间戳，用作缺失的 `lockedAt`。
 * @returns {{text: string, bytes: number, lockedAt: number|null}|null} 归一化结果。
 */
function importHistoryOf(raw, now) {
  const source = typeof raw === 'string' ? { text: raw, lockedAt: now } : raw;
  if (source === null || typeof source !== 'object') return null;
  const text = typeof source.text === 'string' ? source.text : '';
  if (text.trim() === '') return null;
  const normalized = normalizeHistory({
    text,
    lockedAt: Number.isFinite(source.lockedAt) ? source.lockedAt : now,
  });
  if (normalized === null) return null;
  return { text: normalized.text, lockedAt: normalized.lockedAt };
}

/* ══════════════ 会话记录层（0.2.8）══════════════ */


/**
 * 一次写操作该落在哪一层。
 *
 * 规则（就是需求里那条「选框在旧对话对应当前、在新对话对应全局」）：
 * 这个会话**已经有记录** → 写它自己那一份；否则 → 写全局那一份。
 * 于是新对话里改设置只影响全局（也就是还没采样的那些新对话），
 * 而任何已经记住设置的会话——包括正在跑任务的那个——都不会被碰。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {unknown} rawSession - 请求里带的会话 id。
 * @returns {{kind: 'session'|'global', id: string|null}} 目标层。
 */
function layerFor(state, rawSession) {
  const id = normalizeSessionId(rawSession);
  if (id !== null && sessionRecordOf(state.doc, id) !== null) return { kind: 'session', id };
  return { kind: 'global', id: null };
}

/**
 * 把一次改动写进指定层并落盘。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {{kind: 'session'|'global', id: string|null}} layer - 目标层。
 * @param {number} now - 时间戳。
 * @param {(target: object) => void} mutate - 就地改目标（全局层收到的是文档副本）。
 * @returns {Promise<void>}
 */
async function writeLayer(state, layer, now, mutate) {
  const derive = () => {
    if (layer.kind === 'global') {
      const next = { ...state.doc };
      mutate(next);
      return next;
    }
    // 记录理论上总在（layerFor 刚判过），这里仍然兜一层：真丢了就按当前全局采样，
    // 至少不会写出半条记录。
    const base = sessionRecordOf(state.doc, layer.id) ?? sampledRecord(state.doc, now);
    const record = { ...base, updatedAt: now };
    mutate(record);
    return withSessionRecord(state.doc, layer.id, record);
  };
  // 档位 4（R1）：一次保存可能排在别人后面，重放必须按**新的**基线再派生一次，
  // 所以落盘统一走 `saveWithRetry()`（它会在 `stale-baseline` 之后对齐基线重放）。
  //
  // 0.3.26 删掉了「外部传入副本就不重放」那条分支与它的第五个参数（`baseDoc`）：
  // 全仓没有任何调用点那样用 —— 旧注释写的「只有一个调用点这样用」是假的。留着
  // 会让读者以为存在一条绕过 `saveWithRetry()` 的落盘路径，从而对 stale-baseline
  // 的覆盖面做错误推断。
  await saveWithRetry(state, () => commit(state, derive()));
}

/**
 * 这个会话的**直系父会话 id**（没有父 / 读不到就是 `null`）。
 *
 * 0.3.25 新增：采样要能改从父会话的有效层取值，先得把父 id 找出来。两条来源，
 * 按可靠度排：
 *   1. 请求体里的 `parent` —— 客户端从会话列表那一行转发过来的（`row.parentId`，
 *      见 `client.js` 的 `parentOf()`）。这是**唯一**在「宿主还没看见这个会话」
 *      时仍然可用的一条；
 *   2. 活会话的 `session.header.parentSession`。
 *
 * 刻意**不**为冷会话去引 `sessionPersistence.list()`：那会把
 * `ensureSessionRecord()` 变成异步，而它的另一个调用点在 `agent/pre-step` 里是
 * 同步调用的。冷会话由「客户端转发」这一条兜住，兜不住就等宿主真的把它恢复起来
 * （那时 header 读得到，`/resident` 的重试与首次对话的采样都会补上）。
 * @param {object} ctx - Host 插件上下文。
 * @param {string} sessionId - 会话 id。
 * @param {object|null} body - 请求体（可能为 null）。
 * @returns {string|null} 父会话 id；没有就是 null。
 */
function parentSessionIdOf(ctx, sessionId, body) {
  const fromBody = normalizeSessionId(body?.parent);
  if (fromBody !== null) return fromBody;
  try {
    return normalizeSessionId(sessionById(ctx, sessionId)?.header?.parentSession);
  } catch {
    return null;
  }
}

/**
 * 这个请求里的客户端**到底知不知道**这个会话的父是谁。
 *
 * 三态，靠 `parent` 这个键在不在区分（JSON 里缺失与 `null` 是两件事）：
 *   · 键不在 = **不知道**（客户端没看那一行，比如选择框只拿得到会话视图）；
 *   · `parent: null` = 看过那一行，**它没有父**（那一份全局快照就是正确答案）；
 *   · `parent: '<id>'` = 它有父，从这一层继承。
 *
 * 「不知道」必须能表达出来：`/resident` 在看不见这个会话时不敢拿全局层给一个
 * 可能是子会话的会话落采样（那一份错值再也不会被纠正，见 `ensureSessionRecord`
 * 的说明），而它又无法凭空判断「没有父」—— 只有客户端能回答这个问题。
 * @param {object|null} body - 请求体（可能为 null）。
 * @returns {boolean} 客户端明确回答过「它的父是谁 / 有没有父」时为 true。
 */
function bodyKnowsParent(body) {
  return body !== null && typeof body === 'object' && Object.hasOwn(body, 'parent');
}

/**
 * 给一个会话采样一份自己的记录（已经有就什么都不做）。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string} sessionId - 会话 id。
 * @param {object} [options] - 采样参数。
 * @param {boolean} [options.afterAssembly] - 这次采样是不是发生在**同一轮装配
 *   之后**（只有 `agent/pre-step` 那条路是）。J7（档位 2）：`/resident` 与
 *   `agent/created` 是你打开对话 / 平台刚把 agent 建起来时触发的，**根本没有
 *   发生装配**，写下的 `promptPersonaId` 就是把「不知道」写成了「知道」（一个
 *   假的过去）。审计结论是这不会造成数据损坏（同样场景下「完全不采样」也会漏掉
 *   那一次，之后会自愈），但既然是假的就不该记。所以只给装配之后那次写这个读数。
 * @param {string|null} [options.parentId] - 这个会话的父会话 id（没有父时 null）。
 *   0.3.25：给了它就**从父会话的有效层**采样（父有记录读父那一份，父没有就落回
 *   全局），于是分叉 / 委派出来的子会话继承父的设置与人设，而不是抄一份全局快照。
 * @returns {boolean} 真的新建了记录时为 true。
 */
function ensureSessionRecord(state, sessionId, options = {}) {
  const { afterAssembly = true, parentId = null } = options;
  try {
    refresh(state);
    const id = normalizeSessionId(sessionId);
    if (id === null) return false;
    if (sessionRecordOf(state.doc, id) !== null) return false;
    const now = Date.now();
    const record = sampledRecordFrom(state.doc, parentId, now);
    // 「不知道」的表达方式就是**不写这个键**（见 `normalizeSessionRecord`）：
    // 缺失与显式 `null`（当时没人设）是两种不同的状态。
    if (!afterAssembly) delete record.promptPersonaId;
    // I1（Q7(a)）：走**延后合并写**，不给这一轮对话压一次整份同步写盘。
    // 内存立刻生效，所以 `sessionRecordOf()` 之类马上就能看到这条记录。
    deferSessionRecord(state, id, record);
    return true;
  } catch {
    return false;
  }
}

/**
 * 这个会话到底有没有「内容」——也就是「它是一条旧对话」还是「新建的空对话」。
 *
 * 判据只看会话日志：有模型说过的话，或者**用户真打的字**
 * （`source.kind === 'user'`；插件注入的快照、系统提示词都不算）。
 * 拿不到会话（不活着）时返回 false —— 宁可晚一点采样，也不要给一条
 * 还没开始的会话写下一份会把后续设置冻住的记录。
 * @param {object} ctx - Host 插件上下文。
 * @param {string} sessionId - 会话 id。
 * @returns {boolean} 有内容时为 true。
 */
function sessionHasContent(ctx, sessionId) {
  try {
    const session = sessionById(ctx, sessionId);
    const state = scanSessionLog(session);
    if (state === null) return false;
    // 模型说过的话，或者**用户真打的字**（`source.kind === 'user'`）——
    // 两件都在同一次遍历里顺手记下了，见 {@link scanSessionLog}。
    return state.hadConversation || state.hasUserContent;
  } catch {
    return false;
  }
}

/**
 * 归档会话的 id 集合。
 *
 * **删除记录时必须跳过它们**：归档只是注册表上的一条标记，会话日志原封不动，
 * 所以「持久化里还在」本来就不会把归档会话当成已删除 —— 这里再查一遍是为了
 * 防住「注册表读得到、持久化那一刻读不到」这种瞬时状态。
 * @param {object} ctx - Host 插件上下文。
 * @returns {Set<string>} 归档会话 id。
 */
function archivedSessionIdsOf(ctx) {
  try {
    const registry = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : undefined;
    const ids = registry?.archivedSessionIds;
    return new Set(Array.isArray(ids) ? ids.map((id) => String(id)) : []);
  } catch {
    return new Set();
  }
}

/**
 * 清理「已经被删除的会话」留下的记录。
 *
 * 判据是**持久化存储里还在不在**，不是任何「会话离开了内存」的信号 ——
 * DSH 里 `session/disposed` / `api-session/removed` 在普通卸载时也会发，
 * 拿它当删除会把活得好好的会话的记录删掉。
 *
 * 只有下面三件事同时成立才删：
 *   1. 这个 id 在 `sessionPersistence.list()` 里**找不到**（真的被删了）；
 *   2. 它现在也不是活着的会话（`sessions.get()` 拿不到）；
 *   3. 它不在归档集合里。
 * 只要持久化服务不可用或列举失败，就**一条都不删**（失败的关闭方向是保守）。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} ctx - Host 插件上下文。
 * @param {string[]} [only] - 只检查这几个 id（`api-session/removed` 那条路用）；
 *   省略 = 检查文档里的全部记录。
 * @returns {Promise<{removed: string[], skipped: string|null}>} 结果。
 */
async function reconcileSessionRecords(state, ctx, only) {
  const persistence = typeof ctx.get === 'function' ? ctx.get('sessionPersistence') : undefined;
  if (persistence === undefined || persistence === null || typeof persistence.list !== 'function') {
    return { removed: [], skipped: 'persistence-unavailable' };
  }
  let snapshots;
  try {
    snapshots = await persistence.list();
  } catch {
    return { removed: [], skipped: 'list-failed' };
  }
  const known = new Set();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const id = snapshot?.header?.id ?? snapshot?.id;
    if (typeof id === 'string' && id !== '') known.add(id);
  }
  const live = new Set();
  try {
    const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
    if (sessions !== undefined && sessions !== null && typeof sessions.list === 'function') {
      for (const session of sessions.list()) {
        const id = session?.id ?? session?.header?.id;
        if (typeof id === 'string' && id !== '') live.add(id);
      }
    }
  } catch {
    // 拿不到活会话列表不影响判断：`known` 才是主判据。
  }
  const archived = archivedSessionIdsOf(ctx);
  const wanted = Array.isArray(only) && only.length > 0 ? only : Object.keys(state.doc.sessions ?? {});
  const removable = [];
  for (const raw of wanted) {
    const id = normalizeSessionId(raw);
    if (id === null) continue;
    if (!Object.prototype.hasOwnProperty.call(state.doc.sessions ?? {}, id)) continue;
    if (known.has(id) || live.has(id) || archived.has(id)) continue;
    removable.push(id);
  }
  if (removable.length === 0) return { removed: [], skipped: null };
  // await 之后文档可能已经被别的请求换掉了：基于**最新**那一份删。
  // 档位 4（R1）：派生与落盘一起重放（`removable` 是上面按 id 判出来的，
  // 与新基线无关，所以重放安全）。
  let removedCount = 0;
  await saveWithRetry(state, async () => {
    refresh(state);
    const next = withoutSessionRecords(state.doc, removable);
    if (next === state.doc) { removedCount = 0; return; }
    await commit(state, next);
    removedCount = removable.length;
  });
  if (removedCount > 0) {
    logToHost(ctx, `[${PLUGIN_NAME}] 已清理 ${removedCount} 条已删除会话的记录：${removable.slice(0, 5).join(', ')}`);
  }
  return { removed: removedCount > 0 ? removable : [], skipped: null };
}

/**
 * 本会话工具基线的状态。
 *
 * 读法：DSH 的工具渐进披露账本里，**基线**里的工具按原样发送，之后才出现的工具
 * 一律被标成 `defer_loading: true`；provider 拒绝「所有工具都延迟」，所以基线一旦是空的，
 * 之后工具回来时请求会直接以 INVALID_REQUEST 失败 —— 而且基线只在
 * 「首个请求 / 系列重启 / 定义变更」时重置，**会话内不可逆**。
 *
 * 因此本插件必须在**源头**避免把基线清空：宁可某一轮不剥工具，也不能留下空基线。
 * @param {object|undefined} agent - 装配上下文里的 agent。
 * @returns {'none'|'ready'|'empty'|'unknown'} 基线状态。
 *   - `none`：还没有请求头部，这是本会话第一次请求 —— 必须让它带着完整工具落基线；
 *   - `ready`：基线非空，剥工具是安全的；
 *   - `empty`：基线已经是空的（旧版本插件、或保护关掉时造成的）—— 只能继续剥，
 *     否则会立刻触发那个 provider 错误；恢复工具需要新开一个对话；
 *   - `unknown`：读不到会话（例如探测调用）—— 按可剥离处理。
 */
function toolBaselineState(agent) {
  try {
    const session = agent?.session;
    if (session === null || typeof session !== 'object') return 'unknown';
    const baseline = baselineToolsOf(session);
    if (baseline === null) return 'unknown';
    if (baseline === undefined) return 'none';
    return baseline.length > 0 ? 'ready' : 'empty';
  } catch {
    return 'unknown';
  }
}

/**
 * 每个 agent 上次观察到的 surface 内容代次。
 * 用 WeakMap 而不是 Map：agent 对象是会话级的，强引用会随会话数无限增长。
 */
const lastSurfaceGeneration = new WeakMap();

/**
 * 每个 agent 上一次**真的发出请求**时用的是哪个人设（0.3.16）。
 *
 * `undefined` = 还没见过（首个请求不收敛）；`null` = 当时（会话层与全局层
 * 合起来）没选人设；字符串 = 那条人设的 id。
 *
 * **0.3.17 起这只是退路**：权威读数是会话记录里的 `promptPersonaId`（持久，
 * 见 `rememberPromptPersona()`）。本表只在两种情况下被用到 —— 会话记录里还
 * 没有那个字段（0.3.17 之前的记录、以及还没采样的会话），或者记录读不到。
 * 为什么不能只靠它：这个对象在重启、恢复会话、可续子会话里都会被换掉，换了
 * 就是「没见过」，于是第一次切换必然漏掉（0.3.16 的真机实测就是这样）。
 *
 * 只在 `agent/pre-step` 的出口处写，而且**只在 `messages.length > 0` 时写**：
 * `turn()` 在「上一轮已经结束、又没有新消息」时会拿空 messages 再问一次
 * pre-step，然后直接 break —— 那种步骤不会走到 `project()`，也不是一次请求。
 * 记了就等于把这次切换吞掉，「用户切完人设、还没开口」这种最常见的时序会失效。
 *
 * WeakMap：agent 对象是会话级的，强引用会随会话数无限增长。
 */
const personaInRequest = new WeakMap();

/**
 * 每个 agent 本步装配**真的渲染进提示词**的是哪个人设（0.3.16）。
 *
 * 由两个 `section.text` 求值时写入（`noteRenderedPersona()`），`agent/pre-step`
 * 里读它做切换判据。取装配当时的读数而不是事后重读磁盘，是因为瀑布里
 * `next()` 前后的代码跨了 await —— 用户在这个窗口里恰好切换人设时，
 * 事后重读会拿到「下一步才会用到的那一份」，判据就不再是「这一步渲染了什么」。
 * 与 `personaDroppedOf()` 同一个道理：判据取真实装配的读数。
 *
 * WeakMap：agent 对象是会话级的，强引用会随会话数无限增长。
 */
const personaRendered = new WeakMap();

/**
 * 记下本步装配渲染的是哪个人设。**永不抛**：装配路径上抛出去等于整轮装配失败。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object|undefined} agent - 装配上下文里的 agent。
 * @param {string|null} sessionId - 会话 id。
 * @returns {void}
 */
function noteRenderedPersona(state, agent, sessionId) {
  try {
    if (agent === null || typeof agent !== 'object') return;
    if (typeof sessionId !== 'string' || sessionId === '') return;
    personaRendered.set(agent, activeIdOf(state.doc, sessionId));
  } catch {
    // 记不上最多是这一次不收敛，绝不能挡住装配。
  }
}

/**
 * 判断本轮是否可能「重启工具声明系列」。
 *
 * 基线除了在**首个请求**建立，还会在 `reason: 'series'` / `startsSeries` 时重置，
 * 后者对应 surface 内容代次变化（最典型的是**压缩**）以及目标轮次驱动。
 * 如果那一刻工具正好被剥空，新的基线又是空的 —— 又掉回同一个坑。
 *
 * 这里用「本 agent 的 surface 内容代次跟上一次观察到的不一样」当作信号：
 * 代次没变就绝不会重启系列；变了一次就保守地保留一轮工具。
 * 这是**预测**（装配发生在 `buildRequest` 之前），所以只能靠代次这类先兆。
 * @param {object|undefined} agent - 装配上下文里的 agent。
 * @returns {boolean} 疑似系列重启时为 true。
 */
function seriesRestartRisk(agent) {
  try {
    if (agent === null || typeof agent !== 'object') return false;
    const generation = agent?.session?.surface?.contentGeneration;
    if (typeof generation !== 'number') return false;
    const previous = lastSurfaceGeneration.get(agent);
    lastSurfaceGeneration.set(agent, generation);
    return previous !== undefined && previous !== generation;
  } catch {
    return false;
  }
}

/**
 * 把「本步请求里渲染的是哪个人设」记进**这个会话自己的记录**（0.3.17）。
 *
 * 为什么必须落盘：收敛判据是在「上一次请求渲染了谁」与「本步渲染了谁」之间比对
 * 差值，而 agent 对象会在重启、恢复会话、可续子会话时被换掉 —— 0.3.16 把读数
 * 只放在按 agent 记账的 WeakMap 上，结果在那几种情况下每一次切换都判成「首个
 * 请求」（真机实测：三轮三个新实例、三次都追加，一次都没收敛）。
 *
 * 只在**真的要发请求**的那一步写，而且只在值真的变了时写：会话第一次学习一次，
 * 之后每切换一次写一次。`updatedAt` 刻意不动 —— 它记的是「用户什么时候改过
 * 这个会话的设置」，不是本插件自己的簿记时间。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} sessionId - 会话 id。
 * @param {string|null} id - 本步渲染的人设 id（`null` = 没人设）。
 * @returns {void}
 */
function rememberPromptPersona(state, sessionId, id) {
  try {
    if (typeof sessionId !== 'string' || sessionId === '') return;
    const record = sessionRecordOf(state.doc, sessionId);
    if (record === null) return;
    if (record.promptPersonaId === id) return;
    // I1（Q7(a)）：这是另一次「记小账」。它和「新会话采样」常常在同一轮里先后
    // 发生，延后合并之后这两笔只落盘一次。记录由 `sessionRecordOf` 现取，
    // 所以与采样那笔天然合并在同一条记录上。
    deferSessionRecord(state, sessionId, { ...record, promptPersonaId: id });
  } catch {
    // 写不进去只影响「换实例之后那一次切换能不能收敛」，绝不能挡住一轮对话。
  }
}

/**
 * 「本会话选定的人设换了一条」→ 让这一步**重启请求序列**（0.3.16）。
 *
 * 为什么需要它：`deepseek-official/deepseek-flash` 这类路由在模型目录里声明了
 * `systemPromptUpdate: 'in-history'`，agent loop 于是把**变化后的整份提示词**
 * 追加到已缓存历史之后（而不是改写第 0 号节点）。这对缓存友好，但旧人设的
 * 指令会一直躺在上下文里，切几次就叠几份整份提示词。
 *
 * 返回 `true` 时，loop 的 `SystemPromptProjection.project()` 走 `startsSeries`
 * 那一支：第 0 号节点换成本步这份新提示词、后面所有非空系统节点被清空
 * （空 content 的消息不进请求，日志里仍然留着）。代价是这次请求从第 0 个 token
 * 起缓存失效 —— 所以**只在人设 id 真的变了的那一步**返回 true。
 *
 * 判据刻意只认 id：同一条人设改正文、被删掉这一类变化留给 in-history 的追加
 * （它对缓存更友好），本插件不替平台决定那些。
 *
 * 「上一次是谁」的取值顺序（0.3.17）：会话记录里的 `promptPersonaId`（持久）→
 * 不行才退回按 agent 内存记账的 `personaInRequest`。两者都没有 = 不知道 = 不猜。
 *
 * 记账时机：只有 `messages.length > 0`（这一步真的会发请求）才记；空 messages 的
 * 步骤不记，于是这次切换会一直留到下一个真请求的那一步才收敛。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object|undefined} agent - 正在进入步骤的 agent。
 * @param {string|null} sessionId - 会话 id。
 * @param {number} outgoing - 本步真正会交给 loop 的消息条数。
 * @returns {boolean} 需要重启请求序列时为 true。
 */
function convergeOnPersonaSwitch(state, agent, sessionId, outgoing) {
  try {
    if (agent === null || typeof agent !== 'object') return false;
    const rendered = personaRendered.get(agent);
    // 没见过（本步没走到本插件那段）就不猜。
    if (rendered === undefined) return false;
    const record = typeof sessionId === 'string' && sessionId !== '' ? sessionRecordOf(state.doc, sessionId) : null;
    const durable = record === null ? undefined : record.promptPersonaId;
    const before = durable !== undefined ? durable : personaInRequest.get(agent);
    if (outgoing > 0) {
      personaInRequest.set(agent, rendered);
      if (durable !== rendered) rememberPromptPersona(state, sessionId, rendered);
    }
    const switched = before !== undefined && before !== rendered;
    // 0.3.22：换成另一条人设这件事本身要记一笔 ——「这条人设的历史对话不会
    // 补进来」那条黄（`history-not-carried`）判的就是它。
    //
    // 两个门槛都不能去掉：
    //   · `before !== undefined` —— 新会话第一次发请求时上一次渲染的是谁**不
    //     知道**，那不叫换（而且那一刻历史刚好会被注入，报了就是误报）；
    //   · `outgoing > 0` —— 这一步真的发出去了才算换过；空 messages 的步骤
    //     走不到 `project()`，用户可能转头就改了主意。
    if (switched && outgoing > 0) rememberPersonaSwitched(state, sessionId);
    return switched;
  } catch {
    // 簿记出错最多是这一次不收敛，绝不能挡住一轮对话。
    return false;
  }
}

/**
 * 把本插件那一段移到所有段之后（纯函数；没动就原样返回）。
 *
 * 只在段非空时才移：空段会被 renderPrompt 丢掉，移它只是白白改诊断里的次序。
 * 这一步是「追随」模式的兜底 —— 光靠 `order = 1000000` 挡不住
 * 「另一个插件注册了更大的有限数」以及「与 prompt 管理同序时按段名排」。
 * @param {object} assembly - 瀑布下游的装配结果。
 * @returns {object} 本段已在末尾（或不存在 / 为空）时原样返回。
 */
function moveOwnSectionLast(assembly) {
  const sections = assembly?.sections;
  if (!Array.isArray(sections)) return assembly;
  const index = sections.findIndex((section) => section?.name === SECTION_NAME);
  if (index === -1 || index === sections.length - 1) return assembly;
  const mine = sections[index];
  if (String(mine?.text ?? '') === '') return assembly;
  return {
    ...assembly,
    sections: [...sections.slice(0, index), ...sections.slice(index + 1), mine],
  };
}

/**
 * 记录**最终**装配结果里的段序（只记段名，不记正文）。
 *
 * 这是「人设到底排在哪」的可核对证据：用户不必相信文档，设置页会把真实次序列出来。
 * 关键在于**必须由最外层那个监听器、在全部改写之后调用**：
 * `system-prompt/assemble` 的瀑布里 `next()` 之后的代码由内向外跑，内层记录到的
 * 是「还没被移到末尾」的列表 —— 0.2.5 之前正是这样，于是「追随」明明生效了，
 * 设置页的段序检测却把本段显示在中间。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} assembly - 最终装配结果。
 * @returns {void}
 */
function recordFinalOrder(state, assembly) {
  const sections = Array.isArray(assembly?.sections) ? assembly.sections : [];
  state.assembly.lastOrder = sections
    .slice(0, MAX_RECORDED_SECTIONS)
    .map((section) => String(section?.name ?? ''));
  state.assembly.lastOrderCount = sections.length;
}

/**
 * 统计一组段的字符总量（只算数，不取内容）。用于「仅加载人设」前后的规模对比。
 * @param {object[]} sections - 段列表。
 * @returns {number} 字符总数。
 */
function totalChars(sections) {
  let total = 0;
  for (const section of sections) total += String(section?.text ?? '').length;
  return total;
}

/**
 * 这个会话应当注入的正文。**永不抛**：抛出会让整轮装配失败。
 *
 * `sessionId` 为空（拿不到会话、或问的是全局那一层）时按全局取 —— 与 0.2.7
 * 的行为一致，这是给「没有会话上下文的装配」留的退路。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} [sessionId] - 会话 id。
 * @returns {string} 正文；未选或出错时为空串。
 */
function currentText(state, sessionId = null) {
  try {
    refresh(state);
    return activeTextOf(state.doc, sessionId);
  } catch {
    return '';
  }
}

/**
 * 把一次落盘排进那条唯一的写链（档位 4 · R1）。
 *
 * 为什么必须有它：写盘改成异步之后，「派生新文档」与「真正写下去」之间**真的**
 * 会让出主线程，于是两次保存可以重叠。没有串行化，后写完的那份会把先写完的
 * 整份盖掉（同一条丢更新，从跨进程搬进了同进程）。
 *
 * ⚠ 队尾的失败**不能断链**：`state.writeQueue` 记的是「没有结果的那条链」，
 * 于是队里某一项抛错之后，后面的照样能跑（否则一次失败会把插件永久锁死）。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {() => Promise<unknown>} task - 这一项要做的事。
 * @returns {Promise<unknown>} 这一项自己的结果 / 错误（调用方要自己接）。
 */
function enqueueWrite(state, task) {
  const run = state.writeQueue.then(task, task);
  state.writeQueue = run.then(() => {}, () => {});
  return run;
}

/**
 * 保存类路径的统一入口：先试一次「派生 + 落盘」，基线过期就对齐后重放一次。
 *
 * 什么时候会过期：两次保存重叠时，后一项进临界区发现内存基线已经不是自己派生
 * 时用的那一份了（`commit()` 里那道身份检查）。这时有两种选择 ——
 *   · 拿旧基线整份盖上去：前一次的改动**静默消失**（正是要修的病）；
 *   · 报 `409 stale-baseline` 让调用方重试：`refresh()` 对齐到最新那份，
 *     再按新的基线派生一次。用户看到的还是「保存成功」。
 * 重放**最多一次**：第二次还撞上就说明有人一直在写，那时把 409 交出去是对的
 * （路由那层会把它变成 `{ok:false, code:'stale-baseline'}` + 409）。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {() => Promise<unknown>} attempt - 派生 + `commit()`；每次调用都要重新派生。
 * @returns {Promise<unknown>} 成功那次的结果。
 * @throws {Error} 非 stale-baseline 的错误原样抛出；两次都过期时抛 409。
 */
async function saveWithRetry(state, attempt) {
  try {
    return await attempt();
  } catch (error) {
    if (error?.code !== 'stale-baseline') throw error;
    refresh(state);
    return attempt();
  }
}

/**
 * 落盘并同步内存。写失败时保持内存原样（磁盘仍是旧状态，二者一致）。
 *
 * **档位 2 改过的契约（档位 4 必读）**：
 *   · 内存以**实际落盘的那一份**为准（Q1(b)）：`writeStoreFile()` 归一化之后
 *     的文档才是真话，直接用返回值覆盖 `state.doc`。以前这里写 `nextDoc`，
 *     于是「磁盘上被规整掉了一条、内存里还留着」—— 界面里就多出一条其实
 *     不存在的人设，编辑它还会一路报「保存成功」。
 *   · **写后核对**（Q9(a)）：`fileChangedByOther` 说明我们 rename 完到 stat
 *     之间，文件被别的进程/编辑器换掉了。那时**绝不**把别人的时间戳记成自己
 *     的（否则从此认为「没变过」，对方的改动被永久无视，还会被下次保存覆盖）——
 *     直接按磁盘为准重读一次。
 *
 * **档位 4（R1）改了两件事，都在这一层**：
 *   · **时序**：整个函数变成异步，落盘排进 `state.writeQueue`；
 *   · **临界区里复查基线**：排队期间可能已经有人写完了，拿旧基线整份盖上去
 *     = 把前一次的改动悄悄抹掉。所以进去先比一次身份（`baseDoc`），
 *     不一致就抛 `stale-baseline`（409），由 `saveWithRetry()` 对齐后重放。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} nextDoc - 要写入的文档。
 * @param {object} [baseDoc] - `nextDoc` 是从哪一份内存文档派生出来的（身份比较用）。
 *   默认 `state.doc`：调用点都在同一个同步块里「派生前读一次 → 立刻调这里」，
 *   中间没有 await，所以默认值就是真正的基线。
 * @returns {Promise<void>}
 * @throws {Error} 写入失败（含人设超限）或基线过期（`code='stale-baseline'`、`status=409`）时。
 */
async function commit(state, nextDoc, baseDoc = state.doc) {
  // 档位 5（P0 修复）：把「改动前有几条人设」告诉写盘层，好让「删一条」这种
  // **让条数变少**的写入穿过「超限拒绝」闸门 —— 否则磁盘上超限的用户连删都删不掉
  // （删除 = 一次保存），只能手改 JSON。详见 `writeStoreFile()` 的 `shrinks`。
  const previousPersonaCount = Array.isArray(baseDoc?.personas)
    ? baseDoc.personas.length
    : null;
  await enqueueWrite(state, async () => {
    // ① 基线还在不在。`reload()`（外部改了文件）也会换掉 `state.doc`，所以这里
    //    比的是**身份**，不是内容 —— 内容比较在 30 MB 的数据上本身就是一次停摆。
    if (state.doc !== baseDoc) {
      const error = new Error('这次保存依据的是旧的内存快照，已放弃，请重试');
      error.code = 'stale-baseline';
      error.status = 409;
      throw error;
    }
    const written = await writeStoreFile(state.path, nextDoc, previousPersonaCount);
    // ② 「内存以落盘那份为准」**必须**在 await 之后：文档归一化发生在写盘层，
    //    挪到 await 之前，界面会多出磁盘上并不存在的人设（Q1(b) 的幽灵人设）。
    state.doc = written.doc;
    state.error = null;
    state.loaded = true;
    if (written.fileChangedByOther) {
      // 空档里被换了：清掉读数，按磁盘重读一份。
      state.fileSig = null;
      state.statCache = STAT_UNKNOWN;
      state.failedSig = null;
      reload(state);
      return;
    }
    // 刚写完，必须重新问一次操作系统；顺手把读数记进本次操作的缓存，
    // 后面同一操作里的 `refresh()` 就不必再问。
    state.fileSig = fileSignatureOf(state.path);
    state.statCache = state.fileSig;
    state.failedSig = null;
    // I1：这次落盘**已经**把某些待落盘的「记小账」写进去了（所有调用点都是
    // 从 `state.doc` 派生的，而 `state.doc` 已经含那些记账）。确认逐字一致之后
    // 把它们从待写表里摘掉，免得窗口末尾再把同一份内容写一遍。
    if (state.deferredRecords !== undefined && state.deferredRecords.size > 0) {
      for (const [id, record] of state.deferredRecords) {
        const landed = written.doc.sessions[id];
        if (landed !== undefined && JSON.stringify(landed) === JSON.stringify(record)) {
          state.deferredRecords.delete(id);
        }
      }
      if (state.deferredRecords.size === 0 && state.deferredTimer !== null) {
        clearTimeout(state.deferredTimer);
        state.deferredTimer = null;
      }
    }
  });
}

/**
 * 把一次「记小账」推迟到窗口末尾，同一窗口里的多次记账合并成**一次**落盘。
 *
 * I1（档位 2 的 Q7(a)）：只改「什么时候写、写几次」，不动存储格式。
 *
 * 流程刻意分成「立刻生效」和「延后落盘」两半：
 *   1. **内存立刻生效**：`state.doc` 马上换成新的。判断「要不要收敛」「这个会话
 *      有没有记录」读的都是内存里的值，所以行为与同步写盘时**逐位一致**；
 *   2. **落盘延后合并**：同一个 `sessionId` 在这个窗口里被改多次，只保留最后
 *      那一份记录（`Map` 天然覆盖），窗口末尾一次性写下去。
 *
 * 正确性上还有一条护栏：落盘那一刻会先 `refresh()` 对一次磁盘 —— 这中间要是
 * 别人改过文件，就在**那一份**上再叠加我们这笔记账，而不是拿脑子里那份把它
 * 整份盖掉（Q9 那条纪律）。所以「延迟」不会把外部改动吃掉。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} sessionId - 记给哪个会话。
 * @param {object} record - 这条会话记录的完整形状（不是补丁）。
 * @returns {boolean} 内存里真的改了时为 true。
 */
function deferSessionRecord(state, sessionId, record) {
  const id = normalizeSessionId(sessionId);
  if (id === null) return false;
  state.doc = withSessionRecord(state.doc, id, record);
  state.deferredRecords.set(id, record);
  if (state.deferredTimer === null) {
    state.deferredTimer = setTimeout(() => {
      state.deferredTimer = null;
      // 档位 4（R1）：fire-and-forget —— 它自己已经永不 reject，这个 catch 是
      // 第二道保险（`.catch()` 挂上就绝不会变成 unhandledRejection）。
      flushDeferredRecords(state).catch(() => {});
    }, DEFERRED_WRITE_MS);
    // 不让这条定时器把进程钉住（测试里尤其重要）；窗口很短，不影响落盘。
    if (typeof state.deferredTimer.unref === 'function') state.deferredTimer.unref();
  }
  return true;
}

/**
 * 立刻把待落盘的记账写下去（幂等；没有待写的就是空操作）。
 *
 * 调用时机：窗口到期、插件卸载。**永不抛** —— 这两处记账原来的 `try/catch`
 * 就写着「写不进去绝不能挡住一轮对话」，延迟写不该把这个性质改掉。
 *
 * 档位 4（R1）：变成异步，并且**派生与落盘一起重放**。卸载那一处是同步响应的
 * （`disposer` 不能 await），但只要这个函数被调用，`commit()` 就会把这次写
 * **同步排进 `state.writeQueue`**（`async` 函数在第一个 `await` 之前是同步跑的）
 * —— 「卸载前写一次」这条保证因此原样成立。
 * @param {object} state - 本次 mount 的可变状态。
 * @returns {Promise<void>} 永不 reject。
 */
async function flushDeferredRecords(state) {
  if (state.deferredTimer !== null) {
    clearTimeout(state.deferredTimer);
    state.deferredTimer = null;
  }
  if (state.deferredRecords.size === 0) return;
  const pending = [...state.deferredRecords];
  state.deferredRecords.clear();
  try {
    await saveWithRetry(state, () => {
      // 先对一次磁盘：中间别人改过就在那一份上叠加，不整份盖掉。
      refresh(state);
      let next = state.doc;
      for (const [id, record] of pending) next = withSessionRecord(next, id, record);
      return commit(state, next);
    });
  } catch {
    // 记不上就算了：下一次同一会话再有动作时会重新记一遍。
  }
}

/**
 * 让**全局那一层** prompt 段的注册段序与文档一致（幂等：目标值没变就直接返回）。
 *
 * 目标值来自 `effectiveSectionOrder(doc, configured, null)` —— 全局那层选定
 * 人设的权重。单个会话的段序**不靠这里**：那条路走 {@link ensureAgentSection}，
 * 在 `agent.ctx` 上注册一份 per-agent 覆盖（平台原话：per-agent override 要
 * 通过那个 agent 的 `agent.ctx` 注册）。
 *
 * `systemPrompt.section()` 的 `order` 只在注册时读一次，所以改段序＝
 * **拆掉旧注册、用新 order 再注册一次**。顺序刻意是「先算目标值 → 再拆旧的 →
 * 再注册新的」，并且注册失败时回退到默认段序：
 * `section()` 对非有限值会抛（`order must be a finite number`），
 * 抛出去会让插件连自己的 prompt 段都没有（0.1.2 之前那只会在挂载时炸，
 * 现在还可能发生在运行时改段序的路上）。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} ctx - Host 插件上下文。
 * @returns {void}
 */
function syncSection(state, ctx) {
  const wanted = effectiveSectionOrder(state.doc, state.configuredOrder, null);
  if (state.section.disposer !== null && state.section.order === wanted) return;
  const register = (order) => {
    if (state.section.disposer !== null) {
      const previous = state.section.disposer;
      state.section.disposer = null;
      try {
        previous();
      } catch {
        // 拆不掉旧注册不能挡住新注册；同名校验由平台自己保证。
      }
    }
    const disposer = ctx.effect(
      () =>
        ctx.systemPrompt.section({
          name: SECTION_NAME,
          order,
          interpolate: false,
          // 用装配上下文里的 agent 定会话：即便这一份是全局注册，
          // 正文也会读**那个会话**的人设（段序仍由 per-agent 覆盖负责）。
          // 0.3.16 起顺手记下「本步渲染的是哪个人设」，供 `agent/pre-step`
          // 判断要不要收敛（`noteRenderedPersona()`）。
          text: (context) => {
            const agent = context?.agent;
            const sessionId = sessionIdOf(agent);
            noteRenderedPersona(state, agent, sessionId);
            return currentText(state, sessionId);
          },
        }),
      `${PLUGIN_NAME}: prompt 段 ${SECTION_NAME}（order ${order}）`,
    );
    state.section.disposer = typeof disposer === 'function' ? disposer : null;
    state.section.order = order;
  };
  try {
    register(wanted);
  } catch (error) {
    logToHost(
      ctx,
      `[${PLUGIN_NAME}] 段序 ${JSON.stringify(wanted)} 注册失败，已回退到 ${DEFAULT_SECTION_ORDER}：${
        error?.message ?? String(error)
      }`,
    );
    register(DEFAULT_SECTION_ORDER);
  }
}

/**
 * 让某个 agent 的 prompt 段覆盖与「这个会话选定人设的段序」一致。
 *
 * 为什么需要它：段的排序权重**只在注册时读一次**，而全局只能注册一份，
 * 所以「每个会话排在自己的位置」只能靠 per-agent 的 scoped 注册
 * （`agent.ctx`，scoped 同名段会盖住全局那一份）。人设没填过权重时回落到
 * 插件配置 / 默认值，与全局那一份同源。
 *
 * 幂等：目标 order 没变就什么都不做。换注册失败时退回默认段序，
 * 绝不让一个会话因为段序写坏了而**连人设段都没有**。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} ctx - Host 插件上下文（J2（审计 host.md §5 H11 · ps2 档位 2）新增：注册失败要留痕）。
 * @param {object} agent - 装配上下文里的 agent。
 * @returns {void}
 */
function ensureAgentSection(state, ctx, agent) {
  try {
    if (agent === null || typeof agent !== 'object') return;
    const sessionId = sessionIdOf(agent);
    if (sessionId === null) return;
    const wanted = effectiveSectionOrder(state.doc, state.configuredOrder, sessionId);
    const current = state.agentSections.get(sessionId);
    if (current !== undefined && current.order === wanted) return;
    if (current !== undefined) {
      state.agentSections.delete(sessionId);
      try {
        current.disposer();
      } catch {
        // 拆不掉旧注册不能挡住新注册。
      }
    }
    const scoped = agent.ctx;
    if (scoped === undefined || scoped === null || scoped.systemPrompt === undefined) return;
    const register = (order) =>
      scoped.systemPrompt.section({
        name: SECTION_NAME,
        order,
        interpolate: false,
        // 与全局那一份同理：正文之后顺手记下本步渲染的人设（0.3.16）。
        text: () => {
          noteRenderedPersona(state, agent, sessionId);
          return currentText(state, sessionId);
        },
      });
    let order = wanted;
    let disposer;
    try {
      disposer = register(order);
    } catch (firstError) {
      order = DEFAULT_SECTION_ORDER;
      try {
        disposer = register(order);
      } catch (secondError) {
        // J2（审计 host.md §5 H11 · ps2 档位 2）：这一条以前是**静默 return** —— 用户的可见后果
        // （这个对话的人设段排在错误位置）一个字都没留痕。同一种故障在
        // `/save`、`/active` 都会 `logToHost`，只有这里不说。
        logToHost(ctx, `[${PLUGIN_NAME}] per-agent 段序注册失败：${secondError?.message ?? String(secondError)}`);
        rememberNotice('这个对话的人设段没有排到正确位置（段序注册失败）。');
        return;
      }
    }
    state.agentSections.set(sessionId, {
      order,
      disposer: typeof disposer === 'function' ? disposer : () => {},
    });
  } catch (error) {
    // per-agent 注册是可选的加成：失败时全局那一份照常工作。
    //
    // J2（审计 host.md §5 H11 · ps2 档位 2）：但「照常工作」不等于「不用告诉用户」—— 段序错了用户
    // 是看得见的（界面显示的与实际注册的不一致），所以留痕 + 挂一条去重提醒。
    // 提示文案与上一处**逐字相同**，去重靠整句文案（见 `rememberNotice`）。
    logToHost(ctx, `[${PLUGIN_NAME}] per-agent 段序注册失败：${error?.message ?? String(error)}`);
    rememberNotice('这个对话的人设段没有排到正确位置（段序注册失败）。');
  }
}

/**
 * 拆掉某个会话的 scoped prompt 段（agent 被回收 / 插件卸载时调用）。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} sessionId - 会话 id。
 * @returns {void}
 */
function releaseAgentSection(state, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return;
  const current = state.agentSections.get(sessionId);
  if (current === undefined) return;
  state.agentSections.delete(sessionId);
  try {
    current.disposer();
  } catch {
    // 卸载路径上不抛。
  }
}

/**
 * 指示点的**触发项清单**（0.3.5）。
 *
 * 0.1.5 到 0.3.4 这里只回一个 `{color, reason}`：一个颜色只能表达「最严重的
 * 那一件」，于是同时报红又报黄时界面只看得见一件，另外几件被静默吞掉。
 * 0.3.5 改成回一张**清单**，每一项带自己的原因码与颜色，客户端把每一项按
 * 自己的颜色并列写在设置页装配判断的指示点下方。
 *
 * 顺序固定：**红在前、黄在后**（需求原话「红色优先，黄色其后」）；同一颜色内
 * 按下面 push 的次序，也就是从最严重到最轻。
 *
 * 判据（全部是**读数**，不是猜测）：
 *   红：
 *     a. `no-tools-first-turn` —— 本会话第一轮的初始请求里没有任何工具
 *        （工具声明基线为空）。最严重的一个：provider 拒绝「所有工具都延迟」，
 *        而这个基线只在「首个请求 / 系列重启 / 定义变更」时重置，会话内不可逆；
 *     b. `persona-missing` —— 这个会话选定的人设 id 已经不存在了（人设被删），
 *        此时人设段是空的，而界面还显示着那条人设的名字；
 *   黄：
 *     c. `minimal-mode`（0.3.5）—— 本对话的 preset 把系统提示词压成单段
 *        （内置「极简模式」就是 `minimal`，它给 `@deepseek-ai/dsh-persona`
 *        声明了 `complete: true`），本插件的段进不去。这条**不看有没有发生过
 *        对话**：模式一选上就成立，所以新旧对话都报；
 *     d. `persona-not-injected` —— 同一件事，但判据是**每一轮真实装配的读数**
 *        （想要人设正文、段列表里却没有本段）。留着它是因为别的做法也可能把
 *        本段挤掉，装配读数对任何原因都成立；
 *     e. `tool-reusable-off` —— 这个会话的「工具可复用」没勾选：剥工具时不再
 *        保护基线；
 *     f. `history-mismatch` —— 这个会话选定人设的「人设历史对话」与已经注入
 *        进去的那一份对不上（会话开始后被改过 / 被清空）；
 *     g. `history-not-carried`（0.3.22）—— 这个会话换过人设、而且它是在
 *        **聊开之后**才换的，所以新人设的「人设历史对话」不会补注入进来
 *        （注入只在每个新会话的第一步发生）。它**只在这四件事同时成立**时
 *        出现：换过（`personaSwitchedOf()` 的账）、日志里从没注入过、模型
 *        已经回过话、当前人设确实有非空历史。理由是同一件事不要换个说法
 *        重复报：注入过就对不上 → 是 f；没换过 → 用户既没操作、也没什么
 *        「没生效」的期待。
 *
 * `minimal-mode` 成立时不再重复报 `persona-not-injected`：同一件事说两遍只是噪声。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {'none'|'ready'|'empty'|'unknown'|null} sessionBaseline - 本会话的基线状态。
 * @param {string|null} sessionId - 本会话 id（决定读哪一层设置）。
 * @param {boolean} historyMismatch - 人设历史对话与已注入内容是否对不上。
 * @param {boolean} personaDropped - 本会话最近一次装配里人设段是否被顶掉。
 * @param {boolean} minimalMode - 本会话的 preset 是否把系统提示词压成单段。
 * @param {boolean} historyNotCarried - 换过人设之后，那条人设的历史对话是否进不来。
 * @returns {Array<{code: string, color: 'red'|'yellow'}>} 触发项清单（红在前）。
 */
function findingsOf(state, sessionBaseline, sessionId, historyMismatch, personaDropped, minimalMode, historyNotCarried) {
  const red = [];
  const yellow = [];
  if (sessionBaseline === 'empty') red.push('no-tools-first-turn');
  if (!activeFoundOf(state.doc, sessionId)) red.push('persona-missing');
  if (minimalMode === true) yellow.push('minimal-mode');
  else if (personaDropped === true) yellow.push('persona-not-injected');
  if (toolReusableOf(state.doc, sessionId) === false) yellow.push('tool-reusable-off');
  if (historyMismatch === true) yellow.push('history-mismatch');
  if (historyNotCarried === true) yellow.push('history-not-carried');
  return [
    ...red.map((code) => ({ code, color: 'red' })),
    ...yellow.map((code) => ({ code, color: 'yellow' })),
  ];
}

/**
 * 把触发项清单压成**一个**指示点结论（最高优先级的那个）。
 *
 * 小圆点一次只能有一个颜色，所以取清单第一项：「红色优先，黄色其后」。
 * 一条都没触发就是绿。
 * @param {Array<{code: string, color: string}>} findings - {@link findingsOf} 的结论。
 * @returns {{color: 'red'|'yellow'|'green', reason: string}} 指示点结论。
 */
function indicatorOf(findings) {
  const first = Array.isArray(findings) ? findings[0] : undefined;
  if (first === undefined) return { color: 'green', reason: 'ok' };
  return { color: first.color, reason: first.code };
}

/**
 * 内置「极简模式」的 preset id（0.3.5）。
 *
 * 出处：`@deepseek-ai/dsh-web-app/presets/minimal.patch.yml` —— 那里声明了
 * `id: minimal`，并给 `@deepseek-ai/dsh-persona` 配了 `complete: true`，
 * 所以它就是「系统提示词被压成单段」的样板。写成快速通道是为了「模式一选上
 * 就报黄」不必等一次异步读文档：别的、同样声明 complete 的自定义 preset
 * 走 {@link presetCollapses} 的文档探测。
 */
const COLLAPSING_PRESET_IDS = new Set(['minimal']);

/** preset 文档探测结果的有效期（0.3.5）：preset 可以被设置页改写，所以带 TTL。 */
const PRESET_PROBE_TTL_MS = 5 * 60 * 1000;

/**
 * 记下「这个会话用的是哪个 preset」（0.3.5）。
 *
 * 会话关掉之后 `agents.get()` 就查不到了，而指示点还要照常回答这个会话的
 * 模式，所以见过的 id 要按会话 id 留一份。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string} sessionId - 会话 id。
 * @param {string} presetId - preset id。
 * @returns {void}
 */
function rememberPresetId(state, sessionId, presetId) {
  boundedRemember(state.presetBySession, sessionId, presetId);
}

/**
 * 这个会话用的是哪个 agent preset（0.3.5）。
 *
 * 唯一来源是**会话投影** `agentPreset` —— `@deepseek-ai/dsh-agent-preset-registry`
 * 自己记的「这个会话实际在跑哪个 preset」，原话是
 * 「Reconstruction reads the `agentPreset` Session projection, never the
 * header alone」（创建头只说明它**开始时**是哪个，中间还可能改）。读法
 * 与 `historyFlagsOf()` 同一个：`sessionProjections.stateOf(session, key)`。
 *
 * I2/Q6(a)（审计 I2 · ps2 档位 2）：0.3.5 起这里还有第二条兜底 —— 有的版本把投影镜像到
 * `agent.agentPreset` 上，原来写成 `?? livePresetOf(agentOfSession(...))`。
 * 上一轮用户已裁定删掉这两个函数，当时没删成、理由是「会掉 7 条断言」；
 * 实测根因是**验证套件的投影桩不像真身**（真身对 `agentPreset` 回字符串 id，
 * 桩回对象），套件于是只能靠兜底跑通。这次先把桩改成真身的样子（那 7 条在没有
 * 兜底时仍全绿），再删兜底 —— 用户当年的裁定如实施行。
 *
 * ⚠ 能力收窄（写给后面的档）：投影服务拿不到 `agentPreset` 的版本不再报
 * 「极简模式」黄点，退化为**不报**（与 `presetCollapses` 的「宁可不报」一致）。
 *
 * 投影也给不出就用按会话记过的那一份（会话关掉之后这条路是唯一的路）。拿不到是 `null`。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} ctx - Host 插件上下文。
 * @param {string|null} sessionId - 会话 id。
 * @returns {string|null} preset id 或 null。
 */
function presetIdOfSession(state, ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  try {
    // `sessionById` 先问 sessions 服务、再退回 agents.get(id).session ——
    // 两条都是同一个会话对象，投影读得到。
    const live = projectedPresetOf(ctx, sessionById(ctx, sessionId));
    if (live !== null) {
      rememberPresetId(state, sessionId, live);
      return live;
    }
  } catch {
    // 拿不到活的会话就退回记过的那一份，不抛。
  }
  return state.presetBySession.get(sessionId) ?? null;
}

/**
 * 从会话投影里读「这个会话在跑哪个 preset」（0.3.5）。
 * 投影不可用（profile 没挂那个服务）时返回 null，由调用方兜底。
 * @param {object} ctx - Host 插件上下文。
 * @param {object|undefined} session - 活的会话对象。
 * @returns {string|null} preset id 或 null。
 */
function projectedPresetOf(ctx, session) {
  try {
    const projections = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined;
    if (
      projections === undefined ||
      projections === null ||
      typeof projections.stateOf !== 'function' ||
      session === undefined ||
      session === null
    ) {
      return null;
    }
    const state = projections.stateOf(session, PRESET_PROJECTION_KEY);
    return typeof state === 'string' && state !== '' ? state : null;
  } catch {
    return null;
  }
}

/**
 * 这个 preset 会不会把系统提示词压成单段（0.3.5）。
 *
 * 为什么不能只靠装配读数：`SystemPrompt.assemble()` 是**先跑完瀑布、再**把段
 * 列表换成那个 `complete` 段（`dsh-system-prompt/lib/index.js` 末尾那句
 * `sections: completeSection === void 0 ? transformed.sections : [completeSection]`），
 * 所以瀑布监听器里看到的 `sections` 永远还带着本插件的段 —— 0.3.4 那套
 * 「被顶掉」检测对极简模式**恒为假**，指示点一直报绿，这正是 0.3.5 修的 bug。
 *
 * 于是直接问 preset 自己：`agentPresets.readDocument(id)` 给出这个 preset
 * 声明的插件清单（YAML 文本），里面有 `complete: true` 就是把提示词压成单段的
 * 那一类。结果按 preset id 缓存（TTL 见 {@link PRESET_PROBE_TTL_MS}），异步
 * 探测只在第一次问到时发一次，**不阻塞** `/state`：这一轮报「还不知道」，
 * 下一次轮询（≤4 秒）就报准了。读不到文档时一律当「不压」—— 宁可不报，
 * 也不凭空报黄。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} ctx - Host 插件上下文。
 * @param {string|null} presetId - preset id。
 * @returns {boolean} 已知会压成单段时为 true。
 */
function presetCollapses(state, ctx, presetId) {
  if (typeof presetId !== 'string' || presetId === '') return false;
  if (COLLAPSING_PRESET_IDS.has(presetId)) return true;
  const cached = state.presetCollapse.get(presetId);
  const fresh = cached !== undefined && Date.now() - cached.at < PRESET_PROBE_TTL_MS;
  if (!fresh && !state.presetProbe.has(presetId)) {
    state.presetProbe.add(presetId);
    void (async () => {
      let value = false;
      try {
        const presets = typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined;
        const document = presets !== null && presets !== undefined && typeof presets.readDocument === 'function'
          ? await presets.readDocument(presetId)
          : null;
        value = /(^|\n)[ \t]*complete:[ \t]*true[ \t]*(\n|$)/.test(String(document?.content ?? ''));
      } catch {
        // 读不到就当「不压」：宁可不报，也不凭空报黄。
        value = false;
      }
      state.presetProbe.delete(presetId);
      // 档位 4（R3）：按 **preset id** 记账的纯缓存，同样要封顶
      // （常量名字义是「会话」，但这里记的是 preset；套同一上限只是兜底，
      //  不另造常量 —— 见交接单第 8 节）。
      boundedRemember(state.presetCollapse, presetId, { value, at: Date.now() });
    })();
  }
  return cached !== undefined && cached.value === true;
}

/**
 * 内存里最多记多少个会话的基线结论。
 *
 * 每条只是一个状态字符串，但进程可能见过成千上万个会话；超过就丢最旧的
 * （Map 保持插入顺序，所以第一个键就是最久没被提到的那个）。
 */
const MAX_REMEMBERED_SESSIONS = 200;

/**
 * 「先删再插 + 超上限丢最久没提过的」——四处逐字重复的循环，收成一处（档位 4 · R3）。
 *
 * ⚠ **只给纯读数 / 纯缓存用**（`presetBySession` / `observed` / `personaDropped` /
 * `stripStats` / `assemblyBySession` / `presetCollapse`）。`state.agentSections`
 * 与 `runtime.agents` 里放的是**活句柄**，绝不能按「最久没提过」淘汰：
 *   · `agentSections` 记的是「这个会话的 scoped 段还没拆」的账，淘汰一条 =
 *     那个会话的段永远拆不掉（挂在 `agent.ctx` 上，重装插件还会叠加）；
 *   · `runtime.agents` 是 `syncAllSuppressors()` 唯一的重同步目标来源，
 *     丢掉一个还活着的 agent，它的抑制器就再也同步不到了。
 *   那两张表走 {@link pruneDeadAgents}（只清确认已经不存在的）。
 *
 * 「先删再插」不是风格问题：`Map` 按插入顺序迭代，不先删就留下旧位置，
 * 淘汰时丢掉的**恰恰是刚看过的那一个**会话。
 * @param {Map|Set} map - 要记账的表。
 * @param {*} key - 键（`Set` 时与 value 相同）。
 * @param {*} value - 值（`Set` 时忽略）。
 * @param {number} [limit] - 上限，默认 {@link MAX_REMEMBERED_SESSIONS}。
 * @returns {void}
 */
function boundedRemember(map, key, value, limit = MAX_REMEMBERED_SESSIONS) {
  map.delete(key);
  // Set 也要走这里，所以要按能力分流，不能无条件 `map.set()`。
  //
  // 本条由**合并验收**（stage6-fix）抓到：`state.personaDropped` 是 `Set`
  // （建表处 `new Set()`），而这里原来写死了 `map.set(key, value)` ——
  // 对 `Set` 抛 `TypeError: map.set is not a function`。这个异常又被装配瀑布
  // 同一轮的 `catch { rewritten = downstream; }` 静默吞掉，于是排在调用点之后
  // 的「屏蔽工具」「仅加载人设」与 before/after 记账整段被跳过：表现是
  // 「开关打开了，被屏蔽的工具照样下发」。其余调用点
  // （`presetBySession` / `observed` / `stripStats` / `assemblyBySession` /
  // `presetCollapse` / `canonicalCache`）都是 `Map`，只有它一个例外，
  // 所以单跑任何一层都看不出来，只有合并版上才现形。
  if (typeof map.set === 'function') map.set(key, value);
  else map.add(key);
  while (map.size > limit) map.delete(map.keys().next().value);
}

/**
 * 记下一笔「这个会话的工具声明基线是什么」。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} id - 会话 id。
 * @param {string} baseline - 'none' / 'ready' / 'empty' / 'unknown'。
 * @returns {void}
 */
function rememberBaseline(state, id, baseline) {
  if (typeof id !== 'string' || id === '') return;
  // 先删再插：刚被提到的会话排到最后，淘汰时先丢最久没提过的。
  boundedRemember(state.observed, id, baseline);
}

/**
 * 记下「这个会话的人设段被顶掉了」（0.3.4）。
 *
 * 判据不是猜 preset，而是每一轮真实装配的读数：这一轮想要人设正文、最终段
 * 列表里却找不到本段 —— 别的做法把本段挤掉时就会这样。
 *
 * ⚠ 它**认不出极简模式**：`assemble()` 是先跑完瀑布、再换成 complete 段，
 * 监听器里看到的 `sections` 永远还带着本段（见 `presetCollapses()`）。
 * 「极简模式报黄」由 `presetCollapses()` 单独负责，这条只当兜底。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} id - 会话 id。
 * @returns {void}
 */
function rememberPersonaDropped(state, id) {
  if (typeof id !== 'string' || id === '') return;
  boundedRemember(state.personaDropped, id, id);
}

/**
 * 清掉「人设被顶掉」的记录：这一轮它已经进了系统提示词。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} id - 会话 id。
 * @returns {void}
 */
function forgetPersonaDropped(state, id) {
  if (typeof id !== 'string' || id === '') return;
  state.personaDropped.delete(id);
}

/**
 * 这个会话最近一次装配里，人设段有没有被顶掉。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} id - 会话 id。
 * @returns {boolean} 被顶掉过时为 true。
 */
function personaDroppedOf(state, id) {
  if (typeof id !== 'string' || id === '') return false;
  return state.personaDropped.has(id);
}

/**
 * 记一笔「这个会话换过人设」（0.3.22）。
 *
 * 只在 `convergeOnPersonaSwitch()` 判出**真的换了**（上一次发出去渲染的是另一条
 * 人设）时调用。这条标记只喂给 `history-not-carried` 那一条黄：新会话第一次
 * 选人设不算换，所以新对话不会被它报黄。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} id - 会话 id。
 * @returns {void}
 */
function rememberPersonaSwitched(state, id) {
  if (typeof id !== 'string' || id === '') return;
  boundedRemember(state.personaSwitched, id, id);
}

/**
 * 这个会话换过人设吗。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} id - 会话 id。
 * @returns {boolean} 换过时为 true。
 */
function personaSwitchedOf(state, id) {
  if (typeof id !== 'string' || id === '') return false;
  return state.personaSwitched.has(id);
}

/**
 * 记一笔「这个会话被过滤掉的注入消息」（0.3.4）。
 *
 * 界面上「输入抑制开关」那张卡用它说明**实际**压掉了哪几类，而不是只写一句
 * 笼统的「已过滤 N 条」。只计数，不记正文。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} id - 会话 id。
 * @param {string} kind - 消息的 `source.kind`。
 * @returns {void}
 */
function countStripped(state, id, kind) {
  if (typeof id !== 'string' || id === '') return;
  const record = state.stripStats.get(id) ?? {};
  record[kind] = (record[kind] ?? 0) + 1;
  // 先删再插：刚被提到的会话排到最后，淘汰时先丢最久没提过的。
  boundedRemember(state.stripStats, id, record);
}

/**
 * 这个会话按来源码统计的「被过滤条数」。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} id - 会话 id。
 * @returns {Record<string, number>} 来源码 → 条数（没有就是空对象）。
 */
function stripStatsOf(state, id) {
  if (typeof id !== 'string' || id === '') return {};
  return { ...(state.stripStats.get(id) ?? {}) };
}

/**
 * **这个会话**被抑制开关过滤掉的消息条数（0.3.23）。
 *
 * 与 `stripStatsOf()` 的分工：那个按来源码细分，这个只有一个总数，供「当前」页
 * 那一行显示。没有会话上下文时返回 `null`（界面那一行本来也只在「当前」页渲染），
 * 有会话但没有记录时返回 `0`（这个对话确实一条都没过滤）。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} id - 会话 id。
 * @returns {number|null} 条数，或 null（不知道是哪个会话）。
 */
function strippedMessagesOf(state, id) {
  if (typeof id !== 'string' || id === '') return null;
  const count = state.strippedMessagesBySession.get(id);
  return typeof count === 'number' ? count : 0;
}

/**
 * 解析「这个会话」的工具声明基线状态。
 *
 * - 请求里带了 `session` 且这个会话**活着**（在 `sessions` / `agents` 里）→ 现算，
 *   并把结果记进内存表；
 * - 会话不活着 → 用这张表里记过的（本进程内见过就算数），否则 `unknown`；
 * - 请求里没带 `session`（设置页那种没有会话上下文的地方）→ 用**最近一次观测**。
 *
 * 现算这条是「切换会话窗口时即时检查」的关键：客户端把人设选框所在的会话 id
 * 带上来，服务端就能按那个会话的日志判断它的第一轮请求里有没有工具。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} ctx - Host 插件上下文。
 * @param {string} wanted - 请求里带的会话 id（空串 = 没带）。
 * @returns {{baseline: 'none'|'ready'|'empty'|'unknown'|null, sessionId: string|null}} 结论。
 */
function baselineForSession(state, ctx, wanted) {
  if (typeof wanted === 'string' && wanted !== '') {
    const session = sessionById(ctx, wanted);
    if (session !== undefined) {
      const baseline = toolBaselineState({ session });
      rememberBaseline(state, wanted, baseline);
      return { baseline, sessionId: wanted };
    }
    const remembered = state.observed.get(wanted);
    return { baseline: remembered === undefined ? 'unknown' : remembered, sessionId: wanted };
  }
  return { baseline: state.assembly.toolBaseline, sessionId: state.assembly.sessionId };
}

/**
 * 记一次装配读数 —— **按会话**记一份（J1，档位 2 的 Q8(a)）。
 *
 * 以前这几个读数只有整机一份（`state.assembly`），而设置页把它们当**当前会话
 * 的事实**显示：B 会话刚跑过，切到 A 会话打开设置页就会看到 B 的「人设段被顶掉」
 * 「刻意保留了工具」。同一份面板里那些红点黄点走的却是**按会话**的另一套记录，
 * 两套账互相打架 —— 用户不知道该信哪个。
 *
 * 现在按会话存；`state.assembly` 仍然同步更新，因为其中的 `count` / `lastOrder`
 * / `before` / `after` 本来就是整机读数（段序面板要的是「最近一次真实装配」）。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} sessionId - 这一轮装配属于哪个会话。
 * @param {object} patch - 要记下的读数。
 * @returns {void}
 */
function rememberAssembly(state, sessionId, patch) {
  const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '';
  // 档位 6：新记录先铺一层完整的「什么都不知道」读数，再叠上已有的和本次的。
  //
  // 为什么必须铺这一层：本函数是**合并式**写入，而每一轮装配都会写两笔
  // （`toolBaseline`、`toolStripHeld`）—— 于是「这个会话装配过了、但一次
  // 人设都没想要过」时，记录里**根本没有** `appliedAt` / `droppedAt` 这两个键。
  // 客户端判的是 `assembly.droppedAt !== null`，而键不存在时读到 `undefined`，
  // `undefined !== null` 成立 —— 卡片于是把「本轮没有可注入的人设」误报成
  // 「人设被顶掉了」，还附上那段「极简模式」的说明（悬浮提示同款误报）。
  // 铺一层就等于恢复 0.3.18 的旧形状：整机那份读数是 `{appliedAt: null,
  // droppedAt: null, …}` 初始化出来的，键永远在，判定不会踩空。
  // 档位 4（R3 · Q 方向 b）：这张表以前**一次都没淘汰过**（全文件只有
  // `agent/disposed` 那一处 delete），而它的同族 `personaDropped` 有 200 上限
  // —— 于是老会话「卡片说被顶掉、圆点却报绿」两套读数永久分叉。
  // 它是纯读数，套 LRU 封顶；被挤出去的老会话卡片回 `unknown`、圆点回绿，
  // 两边**一起**归零（这正是 C4 要的），而不是只留一边。
  boundedRemember(state.assemblyBySession, key, {
    ...NO_ASSEMBLY_READINGS,
    ...(state.assemblyBySession.get(key) ?? {}),
    ...patch,
  });
  Object.assign(state.assembly, patch);
}

/** 一个没有装配记录的会话该报的读数：全是「不知道」，绝不拿别人的冒充。 */
const NO_ASSEMBLY_READINGS = Object.freeze({
  appliedAt: null,
  droppedAt: null,
  // 档位 6：这一轮装配**发生过了**（不管有没有人设可注入）。
  // 有了它，客户端才能把「还没装配过」和「装配过、但本轮没有可注入的人设」
  // 分开说 —— 0.3.19 时这两种都表现为 appliedAt/droppedAt 是 null，只能瞎猜。
  assembledAt: null,
  // 档位 4（R4）：`before` / `after` 是「仅加载人设」那一次的规模对比，原来
  // 只写进**整机**那一份、`viewOf` 原样发出 —— 于是「S2 从没开过 soloOnly，
  // 却报出 S1 的对比」。它们和上面几个一样是**按会话**的读数，所以也进这张表；
  // 没开过这个开关的会话报 `null`，客户端自己就不显示那一块（不做假）。
  before: null,
  after: null,
  toolBaseline: null,
  toolStripHeld: false,
  toolStripHeldReason: null,
});

/**
 * 「这个会话」的那一份装配读数（J1）。
 *
 * 有记录就用它；**没有记录就报「不知道」**，而不是回落成整机最近一次 ——
 * 回落正是 J1 要修的那个 bug。请求里没带会话时才用整机那一份（设置页在
 * 全局页上没别的可报）。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {string|null} wantSession - 请求里带的会话 id。
 * @returns {object} 读数。
 */
function assemblyForSession(state, wantSession) {
  if (typeof wantSession !== 'string' || wantSession === '') {
    return {
      appliedAt: state.assembly.appliedAt,
      droppedAt: state.assembly.droppedAt,
      assembledAt: state.assembly.assembledAt,
      // 档位 4（R4）：整机那一份也有 `before` / `after`（只给「没带会话」的
      // 调用方看，设置页在全局页上没别的可报）。
      before: state.assembly.before,
      after: state.assembly.after,
      toolBaseline: state.assembly.toolBaseline,
      toolStripHeld: state.assembly.toolStripHeld,
      toolStripHeldReason: state.assembly.toolStripHeldReason,
    };
  }
  return state.assemblyBySession.get(wantSession) ?? NO_ASSEMBLY_READINGS;
}

/**
 * 组装给客户端的完整状态。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} ctx - Host 插件上下文。
 * @param {string} [sessionId] - 客户端所在会话的 id（可选；没有就报最近一次观测）。
 * @returns {object} 可直接序列化的状态对象。
 */
/* ── 「需要注意的情况」：进程内去重的一条通道（J2（审计 host.md §5 H11 · ps2 档位 2）） ── */

/**
 * 进程内需要让用户知道、但**不能每 4 秒重复报**的情况。
 *
 * 与 `lib/store.js` 的 `storeNotices` 同一套语义。判重键就是**整句文案**，
 * 所以同一类失败必须用同一句话（别把 `error.message` 拼进去），否则去重失效、
 * 提示条会被同一件事刷屏。
 */
const hostNotices = new Map();

/** 上限：只保留最近 50 条不同文案（防同一件事的无数变体撑爆内存）。 */
const HOST_NOTICE_CAP = 50;

/** 有史以来至少顶掉过一条旧的（只用来在满员之后说一句实话，不再静默）。 */
let hostNoticeEvicted = false;

/**
 * 0.3.23 修（静默丢弃）：原实现是 `if (hostNotices.size < 50) add` —— 一旦累计
 * 50 条不同文案，**之后所有新提醒都被悄悄丢掉**，而且旧提醒没有时间戳、没有清除
 * 入口，用户只能重启进程。真正重要的一条（比如某条人设的历史里有坏字符）于是
 * 永远不出现在界面上。
 *
 * 现在改成「插入序 Map + 满员淘汰最旧一条」：
 *   · 新提醒**一定**进得来（这是这条修复的全部意义）；
 *   · 同一句文案仍然只记一次（判重键不变，见上）；
 *   · 真发生过淘汰时，`hostNoticesOf()` 会在末尾多报一句，让"有提醒被顶掉"可见。
 */
function rememberNotice(message) {
  if (typeof message !== 'string' || message === '') return;
  if (hostNotices.has(message)) return;
  if (hostNotices.size >= HOST_NOTICE_CAP) {
    const oldest = hostNotices.keys().next();
    if (!oldest.done) {
      hostNotices.delete(oldest.value);
      hostNoticeEvicted = true;
    }
  }
  hostNotices.set(message, true);
}

/** 满员之后追加的一句说明（没发生过淘汰就不出现，不影响常规回路）。 */
const HOST_NOTICE_OVERFLOW_NOTE = `需要注意的情况太多了：这里只保留最近 ${HOST_NOTICE_CAP} 条，更早的已被新提醒顶掉。`;

/** 现有提醒（并进 `/state.warnings`）。 */
function hostNoticesOf() {
  const out = [...hostNotices.keys()];
  if (hostNoticeEvicted) out.push(HOST_NOTICE_OVERFLOW_NOTE);
  return out;
}

/**
 * 去掉**逐字重复**的提醒（0.3.22）。
 *
 * `/state.warnings` 有五个来源，其中三个会撞车：
 *   · `state.warnings`：重读主文件时那一次核对（0.3.22 起核全部人设）；
 *   · `historyAudit`：`/state` 对**当前激活**那一条的补核（G2）；
 *   · `hostNoticesOf()` 里被 `/persona` 记下的那条：点开任一条人设时又补核一次
 *     （0.3.26 起经 `rememberNotice()` 落进这一档；改前是**直接追加进
 *     `state.warnings`**，于是同一句话会随点选次数堆在常驻数组里）。
 * 同一条「历史对话文件不在了」于是可以同时由两三条路产生 —— 用户看到的是
 * 同一句话说两遍。判重键是**整句文案**（与 `rememberNotice` 同一套语义）：
 * 文案里带的是文件名与数字，不同的事自然不同句。
 *
 * 只在出口去重，不动那三个来源各自的语义：`state.warnings` 是**常驻**数组
 * （重读时才整体替换），在入口去重会改变它的内容；出口去重只影响这一份回执。
 * @param {string[]} list - 待发出的提醒（可能有重复）。
 * @returns {string[]} 去掉重复后的提醒（保持原次序）。
 */
function uniqueWarnings(list) {
  const seen = new Set();
  const out = [];
  for (const note of list) {
    if (seen.has(note)) continue;
    seen.add(note);
    out.push(note);
  }
  return out;
}

/** G4（审计 B21/B22/B23 · ps2 档位 2）：正文里有没有读不回来的坏字符（U+FFFD）。 */
const REPLACEMENT_CHAR = '\uFFFD';

/**
 * 正文里有没有替换字符（`U+FFFD`）。
 *
 * ⚠ `U+FFFD` 是**合法字符** —— 正文里本来就用它的用户会被误报。所以文案必须
 * 写成「读不出来的坏字符」而不是「文件被改坏」，把判断权交回用户。
 * @param {unknown} text - 文本。
 * @returns {boolean} 含有替换字符时为 true。
 */
function hasReplacementChars(text) {
  return typeof text === 'string' && text.indexOf(REPLACEMENT_CHAR) !== -1;
}

function viewOf(state, ctx, sessionId) {
  // 段序可能刚被手改（外部编辑器 / 另一个进程）：先让注册跟上，再报告。
  // 幂等：目标值没变时它什么都不做。
  try {
    syncSection(state, ctx);
  } catch (error) {
    // 报告状态不能因为注册失败而失败 —— 段序会保持上一次的值，装配照常。
    //
    // J2（审计 host.md §5 H11 · ps2 档位 2）：但「照常」不等于「不用告诉用户」—— 界面报的段序可能与
    // 实际注册的不一致，用户看得见却无从解释。去重靠整句文案，见 `rememberNotice`。
    logToHost(ctx, `[${PLUGIN_NAME}] 段序同步失败：${error?.message ?? String(error)}`);
    rememberNotice('界面报的段序可能与实际注册的不一致（同步失败）。');
  }
  const wantSession = typeof sessionId === 'string' && sessionId !== '' ? sessionId : null;
  // 这份「内置 + 用户」名单只重建一次（`mergeView()` 按 doc 身份缓存），
  // 下面所有按人设取值的地方都复用它，不再各要一份。
  const { personas } = mergeView(state.doc);
  // 有效值一律按**这个会话**取（没有会话就是全局那一层）。
  const activeId = activeIdOf(state.doc, wantSession);
  const activeFound = activeFoundOf(state.doc, wantSession);
  // G2（审计 B18/B19/P4 · ps2 档位 2）：主文件没动时不会重读（`readStoreFile()`
  // 只在重读时逐条核历史文件），这里对**当前激活的那一条**再补一次 —— 于是
  // 「自己在外面把历史删短了」不必重启，刷新一下面板就跟上；提醒里也写清了
  // 它怎么才会消失。判据与文案全复用 `auditHistoryFiles()`。
  // ⚠ 只做一次、只对激活的那一条：这是给「完全零 IO 的轮询」加的一次 stat。
  // （0.3.22 起重读也核全部人设，所以同一条提醒两侧都可能产生 —— 交给下面的
  // `uniqueWarnings()` 去重，打开面板不会同一句话说两遍。）
  const historyAudit = [];
  auditHistoryFileOf(state.doc, activeId, historyAudit);
  // J1/Q(方向 B)（审计 host.md §2 C5 · ps2 档位 2）：不改写入时机，只把「静默」去掉。
  // 这是**进程级**数字，不塞进 `warnings`——每 4 秒一次会把提示条刷爆。
  const pendingRecords = state.deferredRecords.size;
  if (pendingRecords > 0) {
    logToHost(ctx, `[${PLUGIN_NAME}] 还有 ${pendingRecords} 条会话记账没落盘`);
  }
  const seen = baselineForSession(state, ctx, typeof sessionId === 'string' ? sessionId : '');
  // 会话活着时才能比对「已经注入进去的那一份」；拿不到就不报黄（宁可不报）。
  const mismatch = historyMismatchOf(state, ctx, seen.sessionId);
  // 本会话最近一次装配里人设段有没有被顶掉（0.3.4）：内置「极简模式」这类
  // 声明了 `complete: true` 的 preset 会把系统提示词换成那一段，本段随之消失。
  const dropped = personaDroppedOf(state, wantSession);
  // J1（档位 2 的 Q8(a)）：这几个读数**按会话**报，不再拿整机最近一次装配冒充。
  const own = assemblyForSession(state, typeof sessionId === 'string' ? sessionId : '');
  // 本对话的 preset 是不是「把系统提示词压成单段」的那一类（0.3.5）。
  // 这一条**不看有没有发生过对话** —— 模式一选上就成立，所以新旧对话都报。
  // （0.3.4 那套装配读数对极简模式恒为假，见 presetCollapses 的注释。）
  const minimalMode = presetCollapses(state, ctx, presetIdOfSession(state, ctx, wantSession));
  // 0.3.22：这个会话换过人设、又早就聊开了 —— 新人设的「人设历史对话」再也
  // 注入不进来（注入只在每个新会话的第一步发生）。不报的话界面是全绿的，
  // 用户只会觉得「我选了它，历史怎么没进来」。
  const notCarried = historyNotCarriedOf(
    state, ctx, seen.sessionId, personaSwitchedOf(state, seen.sessionId),
  );
  // 指示点的全部触发项（红在前、黄在后）。
  const findings = findingsOf(state, seen.baseline, wantSession, mismatch, dropped, minimalMode, notCarried);
  return {
    ok: true,
    plugin: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    path: state.path,
    // 这个会话记了什么 —— 设置页只读 `hasRecord`（要不要显示「当前」页）；
    // 其余读数（source / activeId / found / sampledAt / updatedAt）没有任何
    // 界面读它们，不再跟着每 4 秒的轮询一起传。
    session: { hasRecord: sessionInfoOf(state.doc, wantSession).hasRecord },
    // J1（审计 host.md §2 C5 · ps2 档位 2）：还有几笔「会话记账」只在内存里、没落盘（`/resident` 之后
    // 那 250 ms 窗口内的新会话采样）。正常情况下恒为 0；窗口内被杀就靠它留下痕迹，
    // 而不是「新对话对设置的记忆静默消失」。
    pendingRecords,
    // 全局那一层原样带上：设置页的「全局」页要一次拿齐，不必再来一个来回。
    global: {
      activeId: activeIdOf(state.doc, null),
      found: activeFoundOf(state.doc, null),
      switches: Object.fromEntries(SWITCH_KEYS.map((key) => [key, switchValueOf(state.doc, null, key)])),
      [TOOL_REUSABLE_KEY]: toolReusableOf(state.doc, null),
    },
    section: {
      name: SECTION_NAME,
      // 插件配置里的兜底段序（profile 补丁里的 sectionOrder）。
      orderConfigured: state.configuredOrder,
      // 没填过权重时界面该显示的默认值（-1）。
      orderDefault: DEFAULT_SECTION_ORDER,
      // 「追随」模式实际用的那个数（与 prompt 管理同款）。
      orderFollow: FOLLOW_SECTION_ORDER,
      // J1（档位 2 的 Q8(a)）：下面这四项都是**这个会话自己的**读数。
      // 没有记录的会话报「不知道」（null / false），不拿别的会话的冒充。
      appliedAt: own.appliedAt,
      droppedAt: own.droppedAt,
      assembledAt: own.assembledAt,
      assemblies: state.assembly.count,
      // 最近一次真实装配的段序（只含段名）。UI 用它把「人设排在哪」摆出来。
      lastOrder: state.assembly.lastOrder,
      // 真实段数：`lastOrder` 只保留前 MAX_RECORDED_SECTIONS 个，界面那个
      // `（N）` 用它才不会被截断（0.3.19 起界面改用它）。
      lastOrderCount: state.assembly.lastOrderCount,
      // 「仅加载人设」生效前 / 后的规模对比（只记段数与字符数，不记正文）。
      // 档位 4（R4 · Q 方向 a）：跟 `appliedAt` 一样**按会话**取，不再原样
      // 发出整机那一份 —— 否则切到另一个对话会看到别人那一次的对比。
      before: own.before,
      after: own.after,
      // 本会话工具声明基线的状态（none / ready / empty / unknown / null）。
      //
      // `sessionBaseline` 是**这次请求问的那个会话**的（切窗口时由客户端带 session 上来
      // 现算）；`toolBaseline` 仍旧是「最近一次装配观测到的」，向后兼容 ——
      // 0.3.19 起它也跟着 `sessionId` 走（J1），不再跨会话串读数。
      toolBaseline: own.toolBaseline,
      sessionBaseline: seen.baseline,
      sessionId: seen.sessionId,
      // 指示点（0.1.5 / 0.2.8 / 0.3.4）：设置页 / 人设选框上那些小圆点按它上色。
      // 一次只能有一个颜色，所以这里是**最高优先级**的那一项。
      indicator: indicatorOf(findings),
      // 0.3.5：**全部**触发项（红在前、黄在后），每项带自己的原因码与颜色。
      // 设置页把每一项按自己的颜色并列写在装配判断的指示点下方。
      indicators: findings,
      // 0.3.5：本对话的 preset 会不会把系统提示词压成单段（内置「极简模式」就是）。
      // 与「有没有发生过对话」无关，所以新旧对话都成立。
      minimalMode,
      // 「人设历史对话跟已注入内容对不对得上」这个判据**只由 `indicators` 表达**
      // （上面的 `history-mismatch`，ps2 档位 1 · A1）：0.2.8 起这里还额外回报过一个
      // 同义的 `historyMismatch` 布尔，但界面上没有任何一处读它、说明书也从没写过它，
      // 于是删掉；判据本身（`mismatch` / `historyMismatchOf()`）一个字没动。
      // 本轮是否为了保住非空基线而刻意保留了工具，以及原因（**按会话**，J1）。
      toolStripHeld: own.toolStripHeld,
      toolStripHeldReason: own.toolStripHeldReason,
      // 「人设历史对话」（0.1.6）：给设置页显示注入计数。
      historyInjections: state.historyInjections,
    },
    switches: Object.fromEntries(SWITCH_KEYS.map((key) => [key, switchValueOf(state.doc, wantSession, key)])),
    // 「工具可复用」是安全阀，不属于输入抑制，所以不放进 switches 里，单独暴露。
    [TOOL_REUSABLE_KEY]: toolReusableOf(state.doc, wantSession),
    // 0.3.23：这两个数不再混用 —— 「当前」页那一行读的是**本会话**的条数
    // （`strippedMessages`），进程级累计另走 `strippedMessagesTotal`。
    strippedMessages: strippedMessagesOf(state, wantSession),
    strippedMessagesTotal: state.strippedMessages,
    // 本会话按来源码统计的「注入消息被过滤条数」（0.3.4）。
    // 「输入抑制开关」那张卡用它说明每个开关**实际**压掉了什么。
    stripStats: stripStatsOf(state, wantSession),
    activeId,
    activeFound,
    personas: personas.map((entry) => ({
      id: entry.id,
      name: entry.name,
      builtin: entry.builtin,
      ...textStatsOf(state, entry),
      // 这条人设自己的段序权重：null = 没设置过（界面显示 -1），
      // 整数 / 'follow' = 存过的值。设置页按人设回填这个框。
      order: entry.sectionOrder ?? null,
      // 这条人设存下的「历史对话」（0.1.6）。只报**规模与时间**，不报正文：
      // 设置页切换人设时要看正文，会另外走 GET /persona?id=…（一次取齐）
      // ——否则 200 条人设各带几十 KB 会让每次轮询都变成一次巨型传输。
      historyLockedAt: entry.history?.lockedAt ?? null,
    })),
    limits: { maxName: MAX_NAME_LENGTH, maxText: MAX_TEXT_LENGTH },
    error: state.error,
    // F4 + F2（档位 2）：读盘时的降级提醒（非法编号、重复人设、段序写法不对、
    // 会话记录超量、文件为空…）**加上**由当前文档现算的「正文超长」提醒。
    //
    // 客户端设置页顶部那条提示条读的就是它。0.3.18 之前这个字段每 4 秒跟着
    // 面板数据发到浏览器、然后被**直接丢掉** —— 那些「我悄悄降级了」于是全都
    // 变成了静默丢数据。
    // 第 3 条来源是存储层自己挂出来的写盘降级（目前只有「正文里有不成对的
    // 代理项、UTF-8 存不下」这一种，见 `lib/store.js` 的 `storeNoticesOf()`）。
    // 第 4 条是 `index.js` 自己挂的、**去重后**的情况（J2，见 `rememberNotice`）——
    // 0.3.26 起 `/persona` 那条历史文件核对提醒也并进这一档（改前它直接追加进
    // 第 1 条那个常驻数组，会随点选次数堆积）。
    // 第 5 条是 G2 对「当前激活人设」补做的那一次历史文件核对。
    // ⚠ 0.3.22 起这五条**出口再去一次重**（`uniqueWarnings()`）：重读核全部人设
    // 之后，第 1 条与第 2、5 条会产生同一句话，不去重就是同一件事说两遍。
    warnings: uniqueWarnings([
      ...state.warnings,
      ...textLimitWarnings(state.doc),
      ...storeNoticesOf(),
      ...hostNoticesOf(),
      ...historyAudit,
    ]),
  };
}

/**
 * 一段「人设历史对话」的规模（字数 / 字节数），**不读正文文件**。
 *
 * 3 版起主文件里就记着这两个数字（`history.chars` / `history.bytes`），
 * `/state` 每 4 秒轮询一次、直接拿来报即可。只有旧格式（正文还在内存里）
 * 才现算一遍。
 *
 * 这两个是**记账字段**、不是冗余（ps2 档位 1 · A5）：来历与「删掉它的代价」
 * 写在 `lib/store.js` 的 `summarizeHistory()` 上，改动前先读那一段。
 * @param {object|null} history - 归一化后的历史对话对象。
 * @returns {{chars: number, bytes: number}} 规模。
 */
function historySizeOf(history) {
  if (history === null || history === undefined) return { chars: 0, bytes: 0 };
  if (typeof history.text === 'string') {
    return { chars: history.text.length, bytes: Buffer.byteLength(history.text, 'utf8') };
  }
  return {
    chars: Number.isFinite(history.chars) ? history.chars : 0,
    bytes: Number.isFinite(history.bytes) ? history.bytes : 0,
  };
}

/**
 * 每条人设正文的规模统计（字节 / 字数 / 是否空白），以及它那份「历史对话」
 * 的字节数与字数 —— 都按需现算，不落盘。
 *
 * 按 `state.doc` 的**对象身份**缓存：文档一旦被改动（`commit` / `reload`）
 * 就换成新对象，缓存自然失效，不需要额外的版本号。`/state` 每 4 秒被轮询
 * 一次，人设多、正文长时 `Buffer.byteLength` 是一笔纯浪费的固定开销。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} entry - `mergeView` 给出的人设条目。
 * @returns {{bytes: number, chars: number, blank: boolean, historyBytes: number, historyChars: number}} 规模统计。
 */
function textStatsOf(state, entry) {
  if (state.stats === null || state.stats.doc !== state.doc) {
    state.stats = { doc: state.doc, map: new Map() };
  }
  const cache = state.stats.map;
  let stats = cache.get(entry.id);
  if (stats === undefined) {
    const history = entry.history ?? null;
    stats = {
      bytes: Buffer.byteLength(entry.text, 'utf8'),
      chars: entry.text.length,
      blank: entry.text.trim() === '',
      // 「人设历史对话」的规模（3 版起）**直接取主文件里的摘要**：
      // 正文已经搬到 `history/<人设编号>.txt`，为了报这两个数字去读几百 KB
      // 的文件正是这一档要消掉的开销。旧格式（正文还在内存里）才现算。
      historyBytes: historySizeOf(history).bytes,
      historyChars: historySizeOf(history).chars,
    };
    cache.set(entry.id, stats);
  }
  return stats;
}

/* ══════════════ 人设历史对话（0.1.6）══════════════ */

/**
 * 注入消息的头尾标记（0.2.5）与外框（0.3.6）。
 *
 * 只在正文前后各留一行**结构性**定位符，正文本身原样下发；0.3.6 起整段再套一层
 * `<system-reminder>`（与 `dsh-agent-instructions` / `dsh-tool-skill` 注入上下文
 * 用的是同一套写法）：
 *
 *   <system-reminder>
 *   CONTEXT_ROAD:
 *   （空行）
 *   …用户存下的正文…
 *   （空行）
 *   CONTINUE_CONTEXT.
 *   </system-reminder>
 *
 * 头尾各空两行，是为了让标记与正文在视觉上分开（正文自己可以有很多段）。
 * 0.2.4 及更早那版还在里面塞了「这是什么 / 不要复述本段说明」两句说明加一对
 * `<persona-history>` 标签 —— 那两句既占 token，又会让模型对着说明（而不是
 * 对话）做反应，所以 0.2.5 起整段删掉。
 */
const HISTORY_OPEN = 'CONTEXT_ROAD:';

/** 结尾那一行。两行标记都不带对话语义，只负责圈出「这是一段续接的上下文」。 */
const HISTORY_CLOSE = 'CONTINUE_CONTEXT.';

/**
 * 0.3.6 加的外框（两行，各自独占一行）。
 *
 * 为什么要有它：DSH 里「别的插件注入给模型的上下文」（工作区指令链、技能目录、
 * 运行时快照）都框在 `<system-reminder>` 里 —— 那是模型侧区分「注入的状态」
 * 与「用户真的说了什么」的既有约定。人设历史对话本质上是同一类东西，跟着这个
 * 约定走，模型的解读才与别的注入一致。
 */
const HISTORY_FRAME_OPEN = '<system-reminder>';

/** 外框的收尾行。 */
const HISTORY_FRAME_CLOSE = '</system-reminder>';

/**
 * 正文里出现收尾标签时改用的转义写法（`<\/system-reminder>`）。
 *
 * 抄 `dsh-agent-instructions` 的 `escapeInstructionFrameBody()`：正文自己带一个
 * 收尾标签时（从会话日志导入的历史里很常见 —— 别的插件注入的 reminder 就是那段
 * 正文的一部分），不转义就会**提前把外框关掉**，后半段变成裸用户文本。
 * 只转义收尾标签：开标签嵌在正文里无害。
 */
const HISTORY_FRAME_ESCAPE = '<\\/system-reminder>';

/**
 * 把存下的正文包成最终下发给模型的那段文本。
 *
 * 形状（0.3.6 起）：外框一行 → 定位符一行 → 空行 → 正文 → 空行 → 收尾定位符
 * → 外框收尾。正文里若自带收尾标签，先按 {@link HISTORY_FRAME_ESCAPE} 转义。
 * @param {string} text - 用户存下 / 导入的正文。
 * @returns {string} 完整注入文本。
 */
function renderHistoryBlock(text) {
  const body = typeof text === 'string' ? text.split(HISTORY_FRAME_CLOSE).join(HISTORY_FRAME_ESCAPE) : '';
  return `${HISTORY_FRAME_OPEN}\n${HISTORY_OPEN}\n\n${body}\n\n${HISTORY_CLOSE}\n${HISTORY_FRAME_CLOSE}`;
}

/**
 * 深冻结一个对象图。
 *
 * 平台自己造的消息（`createUserMessage`）都是深冻结的，插件插进去的那条
 * 也要一致 —— 否则下游任何一处「就地改消息」都会在插件这条上成功、
 * 在平台那条上抛错，变成一个只有装了本插件才复现的诡异 bug。
 * @param {unknown} value - 要冻结的值。
 * @returns {unknown} 同一个值（已冻结）。
 */
function deepFreeze(value) {
  const seen = new WeakSet();
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return node;
    if (seen.has(node)) return node;
    seen.add(node);
    for (const key of Object.keys(node)) walk(node[key]);
    return Object.freeze(node);
  };
  return walk(value);
}

/**
 * 这条消息是不是本插件注入的「人设历史对话」。
 *
 * `source.kind` 是整件事唯一的锚（见 {@link createHistoryMessage}）：注入前的
 * 「已经注入过没有」判定、投影单元的状态推进、以及 0.3.25 起子 agent 的
 * 「不注入」判定都读它。判据只写这一处 —— 三个地方各写一遍
 * `=== PERSONA_HISTORY_SOURCE_KIND` 时，漏改一处的表现是「有的地方认得出来、
 * 有的地方认不出来」，那种不一致查起来最费劲。
 * @param {object|undefined} source - 消息的 `source`。
 * @returns {boolean} 是本插件的「人设历史对话」时为 true。
 */
function isPersonaHistorySource(source) {
  return source?.kind === PERSONA_HISTORY_SOURCE_KIND;
}

/**
 * 造一条「人设历史对话」消息。
 *
 * `source.kind` 是整件事的锚：会话日志里只要出现一条带这个 kind 的
 * `user/message`，「本会话已经注入过」就成立 —— 判据不需要插件自己记账，
 * 于是重启、恢复、fork 之后都还对得上。
 *
 * `form: 'snapshot'` 是给下游读者看的形式标签（与 `dsh-tmux-context`
 * 的每步读数、`dsh-session-reference` 的跨会话快照同类）：它表明这条
 * user 消息不是用户真打的字，而是某一时刻的状态快照。
 * @param {string} text - 用户存下的正文。
 * @returns {object} 冻结后的 user 角色消息。
 */
function createHistoryMessage(text) {
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: renderHistoryBlock(text) }],
    source: { kind: PERSONA_HISTORY_SOURCE_KIND, form: 'snapshot', version: 1 },
  });
}

/**
 * 「本会话注入过没有 / 发生过真实对话没有」的投影单元定义。
 *
 * 为什么用投影而不是在 `agent/pre-step` 里现扫日志：投影注册表只订阅一次
 * `session/event`、逐个已提交事件主动驱动 `apply`，插件因此不必自己做
 * 订阅 + 重扫，而且**冷读从检查点起步**，不会随会话变长而变慢。
 *
 * `apply` 必须**同步**、且对无关事件返回**同一个引用**（引用不变 = 下游零工作）。
 * @returns {object} 投影单元定义（host-only，不给 `wire`）。
 */
function historyProjectionDefinition() {
  return {
    key: HISTORY_PROJECTION_KEY,
    stateVersion: 1,
    /**
     * 校验状态的小 schema。
     *
     * 注册表只用到 `.parse`（冷读检查点时会走一遍），所以这里刻意手写一个
     * 最小实现，而不引 `zod` —— 插件不声明任何依赖，多一个运行时依赖
     * 就是多一个「装到别的 profile 上解析不到」的失败模式。
     */
    stateSchema: {
      parse(value) {
        const record = value !== null && typeof value === 'object' ? value : {};
        return {
          injected: record.injected === true,
          hadConversation: record.hadConversation === true,
        };
      },
    },
    init: () => ({ injected: false, hadConversation: false }),
    apply: (state, event) => {
      const type = event?.type;
      if (type === 'user/message') {
        if (!isPersonaHistorySource(event?.data?.source)) return state;
        return state.injected ? state : { ...state, injected: true };
      }
      if (type === 'assistant/message') {
        // 「真实对话」= 模型真的说过话。工具轮、系统提示词更新、标题生成
        // 都不算 —— 只认 assistant/message，与需求里那句「assistant/message
        // 仍然算真实对话」一致。
        return state.hadConversation ? state : { ...state, hadConversation: true };
      }
      return state;
    },
  };
}

/**
 * 回退路径：直接扫会话原始日志。投影服务缺席（profile 没挂
 * `dsh-session-projection`）时用它，而不是让整个注入功能静默失效。
 * @param {object|undefined} session - 会话对象（带 `.log`）。
 * @returns {{injected: boolean, hadConversation: boolean}|null} 结论；读不到日志返回 null。
 */
function scanHistoryFlags(session) {
  const state = scanSessionLog(session);
  if (state === null) return null;
  return { injected: state.historyFound, hadConversation: state.hadConversation };
}

/**
 * 取一个 agent 所在会话的两个判定位。**永不抛**：拿不到就返回 null
 * （调用方据此决定「宁可不注入」）。
 * @param {object} ctx - Host 插件上下文。
 * @param {object|undefined} agent - 正在进入步骤的 agent。
 * @returns {{injected: boolean, hadConversation: boolean}|null} 判定位，或 null。
 */
function historyFlagsOf(ctx, agent) {
  try {
    const projections = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined;
    const session = agent?.session;
    if (
      projections !== undefined &&
      projections !== null &&
      typeof projections.stateOf === 'function' &&
      session !== undefined &&
      session !== null
    ) {
      const state = projections.stateOf(session, HISTORY_PROJECTION_KEY);
      if (state !== null && state !== undefined) {
        return { injected: state.injected === true, hadConversation: state.hadConversation === true };
      }
    }
  } catch {
    // 投影不可用不是错：退回扫日志。
  }
  return scanHistoryFlags(agent?.session);
}

/* ─────────── 注入内容比对（0.2.8 的黄色指示点）─────────── */

/** 0.2.4 及更早那版注入壳的标签与开场说明（比对时要一并剥掉）。 */
const LEGACY_HISTORY_TAGS = ['<persona-history>', '</persona-history>'];
const LEGACY_HISTORY_PREAMBLE = [
  '以下是本会话开始之前，你与用户之间已经发生过的对话记录。',
  '把它当作已经发生的事实延续下去；不要复述本段说明，也不要向用户确认收到。',
];

/**
 * 把一段「人设历史对话」文本归一成**可以逐字比对**的形式。
 *
 * ⚠ 关键约定：**注入侧与存储侧必须用同一个函数**。
 *
 * 0.2.10 及更早只对**注入侧**做「剥壳」，而那个剥壳里带着两条破坏性操作 ——
 * 去掉定位符所在的行、把连续空行压成一行。于是只要人设历史里本来就有
 * 两个连续空行（`\n\n\n`，导入来的历史很常见），
 * 剥完的注入内容就和存储的那一份对不上：**新对话刚注入就报黄**，
 * 而且这个会话此后一直黄。内容其实一个字都没改。
 *
 * 两侧同规则归一之后：
 *   - 外壳（0.3.6 的 `<system-reminder>` 外框、0.2.5 的两行定位符、
 *     0.2.4 的 `<persona-history>` 标签与开场说明）只在注入侧存在，
 *     归一后被去掉；
 *   - 空行压缩、行尾空白这类**对称**操作在两侧同时发生，误差互相抵消；
 *   - 正文真被改过时两侧仍然不同，黄点照报。
 *
 * 定位符只按**整行**匹配：用户自己写的正文里完全可能出现同样的字符串
 * （而对存储侧而言，整行删除也是对称的，不会凭空造出差异）。
 *
 * 0.3.6 起还多一条对称还原：注入侧把正文里的 `</system-reminder>` 转义成了
 * `<\/system-reminder>`（见 {@link HISTORY_FRAME_ESCAPE}），这里在**两侧**都
 * 还原回原样，于是「正文自带收尾标签」的那份历史不会因为转义而对不上。
 * @param {unknown} text - 注入消息原文，或人设存下的历史对话。
 * @returns {string} 归一后的文本。
 */
function canonicalHistoryText(text) {
  let out = typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
  // 0.3.6：先还原注入时对正文做的转义（两侧同规则），再按整行剔壳。
  out = out.split(HISTORY_FRAME_ESCAPE).join(HISTORY_FRAME_CLOSE);
  // 0.2.4 及更早的壳：一对标签 + 两句开场说明。
  for (const tag of LEGACY_HISTORY_TAGS) out = out.split(tag).join('');
  out = out
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === HISTORY_OPEN || trimmed === HISTORY_CLOSE) return false;
      if (trimmed === HISTORY_FRAME_OPEN || trimmed === HISTORY_FRAME_CLOSE) return false;
      return !LEGACY_HISTORY_PREAMBLE.some((marker) => line.includes(marker));
    })
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 会话日志里那条「人设历史对话」注入消息**归一之后的内容**（拿不到时 `null`）。
 *
 * 只取**第一条**：判据本来就是「一个会话只注入一次」，第一条就是那一条。
 * 结果与另外三件事一起由 {@link scanSessionLog} 一次遍历产出、共用一张按
 * `session.log.length` 记账的缓存：轮询 `/state` 时日志没长就直接命中，
 * 既不用重扫日志、也不用重新归一几十万字。
 * @param {object|undefined} session - 会话对象（带 `.log`）。
 * @returns {string|null} 归一后的内容，或 null（没注入过）。
 */
function injectedHistoryOf(session) {
  const state = scanSessionLog(session);
  return state === null ? null : state.historyText;
}

/**
 * 这个会话的「已注入人设历史对话」与**它选定人设当前存的那一份**是否对不上。
 *
 * 判据（0.2.8 的黄色指示点）：日志里确实注入过（不然没法比），而归一之后
 * 的内容 ≠ 那个人设此刻存下的历史对话文本。典型来源是「会话开始后，人设的
 * 历史对话又被改过 / 被清空」—— 这个会话不会重新注入，所以它带着的是旧内容，
 * 必须报出来。
 *
 * 两侧都走 {@link canonicalHistoryText}：只有**内容**参与比对，
 * 注入时的头尾包裹词、空行与行尾空白的差异都不算「不一致」（0.2.11 修的
 * 就是这一点 —— 0.2.10 只归一了注入侧，于是新对话刚注入就误报）。
 *
 * 拿不到会话（冷会话、会话不活着）时返回 `false`：**宁可不报**。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} ctx - Host 插件上下文。
 * @param {string|null} sessionId - 会话 id。
 * @returns {boolean} 对不上时为 true。
 */
function canonicalHistoryCached(state, sessionId, text) {
  // 键 = 「哪条会话 + 那段历史的可观察身份」。
  //
  // 为什么用 `activeHistoryStatsOf`（只报主文件摘要 + lockedAt，一个字节都不读）
  // 而不是自己去 stat：它的失效维度就是**我们已有的**那一份，不多不少。
  // 带上 `text.length` 是因为另一侧 `readHistoryText` 的缓存判据是
  // size + mtimeMs、对「同尺寸同刻度改写」本来也看不见 —— 键带上正文长度，
  // 正好与它**同盲区**（刻意不引入第二个判据来源；真要更准就得每轮询 statSync，
  // 那是把 R3/S6 刚消掉的开销重新买回来，本档不做）。
  const size = activeHistoryStatsOf(state.doc, sessionId);
  const key = `${sessionId}\u0000${size.lockedAt ?? ''}\u0000${size.chars}\u0000${size.bytes}\u0000${text.length}`;
  const hit = state.canonicalCache.get(key);
  if (hit !== undefined) return hit;
  const value = canonicalHistoryText(text);
  // 与 R3 同一套「先删再插 + 封顶」：这张表按「会话 × 人设版本」涨，不封顶
  // 等于把 R3 的活重做一遍。
  boundedRemember(state.canonicalCache, key, value);
  return value;
}

function historyMismatchOf(state, ctx, sessionId) {
  try {
    if (typeof sessionId !== 'string' || sessionId === '') return false;
    const session = sessionById(ctx, sessionId);
    if (session === undefined) return false;
    const injected = injectedHistoryOf(session);
    if (injected === null) return false;
    refresh(state);
    const current = canonicalHistoryCached(state, sessionId, activeHistoryOf(state.doc, sessionId));
    return injected !== current;
  } catch {
    return false;
  }
}

/**
 * 这个会话**换过人设**、又早就聊开了，而新人设存着历史对话 —— 那段历史进不来。
 *
 * 为什么要有它（0.3.22，用户报的）：注入只发生在**每个新会话的第一步**
 * （`!flags.injected && !flags.hadConversation`，见装配瀑布里的 ②）。所以一个
 * 已经聊了几轮的会话里再选一条带历史的人设，历史**不会**被补进来，而
 * `history-mismatch` 恰好是「注入过但对不上」，`injected === null` 时它按设计
 * 闭嘴 —— 界面于是全绿，用户只会觉得「我明明选了它，历史怎么没进来」。
 *
 * 四个条件缺一不可：
 *   1. `switched` —— 这个会话真的换过人设（`personaSwitchedOf()` 记的账）。
 *      这条是**窄口径**：不换人设就不报，于是「压缩把注入消息挤掉了」
 *      「恢复一个从没注入过的老会话」这类与用户操作无关的情形不会来烦人；
 *   2. 会话活着、日志读得到（拿不到就**宁可不报**，与 `historyMismatchOf` 一致）；
 *   3. 日志里**从没注入过**（注入过的话这件事已经发生过，比对交给
 *      `history-mismatch`），而**模型已经回过话**（还能注入就什么都不缺）；
 *   4. 当前选定的人设确实存着非空历史（没历史就没什么"没带进来"的）。
 * @param {object} state - 本次 mount 的可变状态。
 * @param {object} ctx - Host 插件上下文。
 * @param {string|null} sessionId - 会话 id。
 * @param {boolean} switched - 这个会话换过人设吗（`personaSwitchedOf()`）。
 * @returns {boolean} 该报黄时为 true。
 */
function historyNotCarriedOf(state, ctx, sessionId, switched) {
  try {
    if (switched !== true) return false;
    if (typeof sessionId !== 'string' || sessionId === '') return false;
    // 人设已经被删了是**红**的事（`persona-missing`），别在这里再补一句黄。
    if (!activeFoundOf(state.doc, sessionId)) return false;
    const session = sessionById(ctx, sessionId);
    if (session === undefined) return false;
    const scan = scanSessionLog(session);
    if (scan === null) return false;
    if (scan.historyFound === true) return false;
    if (scan.hadConversation !== true) return false;
    refresh(state);
    const current = activeHistoryOf(state.doc, sessionId);
    return typeof current === 'string' && current.trim() !== '';
  } catch {
    return false;
  }
}

/**
 * 挂载全部内容。与 {@link apply} 分开，好让守卫只包一层、只维护一张清理表。
 * @param {object} ctx - Host 插件上下文。
 * @param {object} config - 插件配置（只读 `sectionOrder`）。
 * @param {Array<() => void>} cleanups - 本次 mount 的清理函数表。
 * @returns {void}
 */
function mount(ctx, config, cleanups) {
  const configuredOrder = Number(config?.sectionOrder);
  const state = {
    path: storePath(),
    doc: emptyStore(),
    /**
     * 数据文件的**身份**：`ino:size:前 16 位 sha1`（档 5 · X3；此前是 `ino:size:mtimeMs`）。
     *
     * 只比 mtime 会漏掉同一个 4 ms 刻度内的改动（档 2 的 G1 因此加了 `size`），
     * 但**同尺寸改正文**连 `size` 都拦不住（实测 179/200 次连前 64 字节都逐字节
     * 相同），所以 X3 把判据换成整份摘要。类型仍是 `string | null`，判据本身
     * 一行都没改（还是 `===`），见 `statSignature()` / `refresh()`。
     */
    fileSig: null,
    /**
     * 本次操作里问到的文件签名（见 `beginStat()`）；`STAT_UNKNOWN` = 还没问 / 该问了。
     * （0.3.23 起用专属哨兵，不再拿 `null` 兼任「还没问」—— 文件不存在时那次
     * 读到的就是 `null`，混在一起会让缓存永远失效。）
     */
    statCache: STAT_UNKNOWN,
    /**
     * 「这一次问盘属于谁」（0.3.23 · `beginStat()` 的第二个参数）。
     *
     * 宿主为**每一轮**新建一个 `AbortController`，而同一个 `signal` 对象同时出现在
     * `system-prompt/assemble` 的 context 与 `agent/pre-step` 的载荷里（见
     * `dsh-agent-loop` 的 `preStep()`：先 `assemble(assembleContextFor(this, signal))`、
     * 再瀑布 `agent/pre-step`）。于是「同一个 signal」就是**这一轮**的身份证：
     * 一轮里的两次装配钩子 + 一次 pre-step 共用同一次问盘读数，
     * 整份读取 + sha1 从三次降到一次，而「每一轮开头必须重新问一次」的语义不变。
     * 路由请求 / `agent/created` / 会话删除传 `null`（每次都重新问），完全照旧。
     */
    statOwner: null,
    /**
     * 上一次**解析失败**发生在这个签名上（J3，档位 2）。
     *
     * 磁盘坏掉时我们故意保留上一份好数据（`state.doc` 不动），但以前不记
     * 「是在哪个签名上失败的」—— 于是之后每次刷新都会把那个坏文件重新读
     * 一遍、重新解析失败一遍，白白烧 CPU。记下它就等于「同一个签名只试一次」；
     * 文件再变一次（用户去修它）就会自动重试。
     */
    failedSig: null,
    loaded: false,
    error: null,
    warnings: [],
    /** `/state` 的正文规模缓存：`{ doc, map }`，按 `state.doc` 身份失效。 */
    stats: null,
    /**
     * 档位 4（R5）：`canonicalHistoryText()` 的结果缓存。
     *
     * `/state` 每 4 秒要对**当前激活人设**那段历史跑一次全量归一
     * （`\r\n` 归一 → 逐段 split/join → 正则 → 空行压缩 → trim）。
     * 实测 2000 字 p50 = 1.58 ms、4000000 字 p50 = 15.76 ms，线性 ≈4 ms/百万字，
     * 按 16 MiB 的正文上限外推 ≈60 ms/次 —— 每 4 秒白付一遍。
     * 键带上「那段历史的可观察身份」，所以内容真的变了必然换键。
     */
    canonicalCache: new Map(),
    // 插件配置里的兜底段序；用户一旦在设置页保存过，磁盘上的值优先。
    configuredOrder: Number.isFinite(configuredOrder) ? configuredOrder : DEFAULT_SECTION_ORDER,
    /**
     * prompt 段的注册句柄。段序可以从设置页改，而
     * `systemPrompt.section()` 的 order 只在注册时读一次，所以改段序＝换一次注册。
     * `order` 记的是**当前真正生效**的那个数（viewOf 报的就是它）。
     */
    section: { order: null, disposer: null },
    assembly: {
      appliedAt: null,
      droppedAt: null,
      assembledAt: null,
      count: 0,
      lastOrder: [],
      // 真实段数。`lastOrder` 只保留前 MAX_RECORDED_SECTIONS 个，
      // 数量不能跟着截断 —— 设置页那个 `（N）` 一旦少报就等于在骗人。
      lastOrderCount: 0,
      before: null,
      after: null,
      toolBaseline: null,
      // 最近一次观测属于哪个会话（会话窗口切来切去时要能说清「这个红点说的是谁」）。
      sessionId: null,
      toolStripHeld: false,
      toolStripHeldReason: null,
    },
    /**
     * 「会话 id → 那一次装配的读数」（J1，档位 2）。
     *
     * `state.assembly` 是**整机**最近一次装配，其中的 `count` / `lastOrder` /
     * `before` / `after` 是给段序面板用的整机读数；而 `appliedAt` / `droppedAt` /
     * `toolBaseline` / `toolStripHeld*` 是「这个会话真实的样子」，必须分会话
     * （设置页把它们当当前会话的事实显示）。键 `''` = 没有会话上下文的那一次。
     */
    assemblyBySession: new Map(),
    /**
     * I1（档位 2 的 Q7(a)）：「记小账」的待落盘表（`sessionId → 记录`）。
     *
     * 同一个会话在窗口里被改多次只保留最后一份；内存（`state.doc`）**立刻**
     * 生效，落盘推迟到窗口末尾并且合并。见 `deferSessionRecord()`。
     */
    deferredRecords: new Map(),
    /** I1：窗口定时器；`null` = 没有待落盘的东西。 */
    deferredTimer: null,
    /**
     * 档位 4（R1）：**落盘串行化**的那条链。
     *
     * 写盘从同步改成异步之后，两次保存可以真的重叠：A 派生完还没写完，B 也
     * 从同一份内存基线派生了。没有这条链就会「后写完的那份把先写完的整份盖掉」。
     * 所有落盘都排在这一条链上（见 `enqueueWrite()`），链尾的失败不会断链。
     */
    writeQueue: Promise.resolve(),
    /**
     * 档位 4（R1）：旧格式迁移是不是已经排过一次队。
     *
     * 迁移从 `reload()` 的同步路径里摘出来了（它以前在读盘里同步写 954 KB），
     * 改成下一个 tick 排进写队列；这个标记防止同一次迁移被反复排队。
     */
    migrationScheduled: false,
    /**
     * 档位 4（R1）：正在进行的那次迁移（没有就是 `null`）。
     *
     * 请求进来时如果它还在飞，就先等它落地（见 `settlePendingMigration()`）——
     * 这样「第一次读到旧格式 → 立刻按新格式用」这条 0.3.20 就有的可观察行为
     * 原样保留（旧同步写法是在读盘里直接迁完）。等的是真实异步 I/O，
     * 事件循环照样是自由的，所以没有把停摆买回来。
     */
    migrationPromise: null,
    /**
     * 本进程内见过的「会话 id → 工具声明基线状态」。
     *
     * 会话活着时直接现算（更准）；会话被关掉之后还能靠这张表回答
     * 「上次看到它的时候，第一轮请求里有没有工具」。只存状态字符串，不存正文。
     */
    observed: new Map(),
    /**
     * 「会话 id → 它用的 agent preset id」（0.3.5）。
     *
     * 会话活着时现查 `agents.get(id).agentPreset`；会话关掉之后靠这张表
     * 继续回答「它当时用的是哪个模式」。只存 id 字符串。
     */
    presetBySession: new Map(),
    /**
     * 「preset id → { value, at }：这个 preset 会不会把系统提示词压成单段」（0.3.5）。
     *
     * `value` 来自 `agentPresets.readDocument(id)` 的 YAML 里有没有
     * `complete: true`；带时间戳是因为 preset 可以被设置页改写（TTL 见
     * `PRESET_PROBE_TTL_MS`）。
     */
    presetCollapse: new Map(),
    /** 正在探测的 preset id（0.3.5）：同一个 id 不并发发多次 `readDocument`。 */
    presetProbe: new Set(),
    /**
     * 累计被抑制开关过滤掉的消息条数（只计数，不记内容）。
     *
     * ⚠ 0.3.23 起这是**进程级累计**，界面上「当前」页显示的已经不是它 ——
     * 见下面的 `strippedMessagesBySession`。留着它是为了 `/state` 仍能报一个总量
     * （`strippedMessagesTotal`），也为了记账有一个不受会话淘汰影响的兜底。
     */
    strippedMessages: 0,
    /**
     * 「会话 id → 被过滤条数」（0.3.23 修）。
     *
     * 原实现把**进程级累计数**当成本会话的读数显示在「当前」页：用户看到
     * 「已过滤的注入消息总条数: 37」，那 37 条可能来自另外十个对话，而
     * 这一页上方那句按来源的明细（`stripStats`）却是本会话的 —— 两个数对不上。
     * 现在按会话各记各的，与 `stripStats` 同一套封顶 / 淘汰规则（`boundedRemember`）。
     */
    strippedMessagesBySession: new Map(),
    /**
     * 「人设段被顶掉过」的会话集合（0.3.4）。
     *
     * 判据是每一轮**真实装配**的读数（本段想要人设正文、最终段列表里却没有），
     * 不是猜 preset —— 内置「极简模式」声明了 `complete: true`，平台会把系统
     * 提示词强制换成那一段，本段就被顶掉。指示点据此报黄，按会话各记各的。
     */
    personaDropped: new Set(),
    /**
     * 「这个会话换过人设」的会话集合（0.3.22 · 新黄条 `history-not-carried`）。
     *
     * 判据是**这一步真的发出去了**、而且上一次发出去渲染的是**另一条**人设
     * （见 `convergeOnPersonaSwitch()`）—— 「人设段被 preset 顶掉」「重读了一次
     * 设置」「新会话第一次选人设」都不算换。
     *
     * 为什么只在内存里：它只决定界面上要不要多报一句，落盘就得定义存储格式
     * （v4）、处理旧记录缺字段与并发写，代价远大于收益。Web 重启后清零 ——
     * 复现方式就是再换一次人设。与 `personaDropped` 一样按会话 id 存字符串，
     * 不钉住 agent 对象（上限同 `MAX_REMEMBERED_SESSIONS`）。
     */
    personaSwitched: new Set(),
    /**
     * 「会话 id → 来源码 → 被过滤条数」（0.3.4）。
     *
     * 界面上「输入抑制开关」那张卡用它说明**实际**压掉了什么，而不是笼统一句。
     * 只计数，不记正文。
     */
    stripStats: new Map(),
    /**
     * 累计注入过多少条历史对话消息（只计数，不记内容）。
     *
     * 0.2.0 起历史对话**没有字数上限**：不再有 `historyMaxBytes` 配置项，
     * 也不再裁切；界面上只报「增耗多少 token」。
     */
    historyInjections: 0,
    /**
     * 每个会话的 scoped prompt 段（0.2.8）：`sessionId -> { order, disposer }`。
     *
     * 按**会话 id** 而不是 agent 对象记账：agent 对象是会话级的，用 Map 存它
     * 等于把整个 agent 钉在内存里；按 id 存就只是一张字符串表。
     * 用 Map 而不是 WeakMap：要在卸载时把它们逐个拆掉（它们挂在 `agent.ctx`
     * 上，卸载本插件并不会自动带走），所以得能遍历。`agent/disposed` 会删条目。
     */
    agentSections: new Map(),
    /**
     * 「导出交接」表（0.3.1）：客户端把要下载的文件字节交上来，换一个 token，
     * 再由浏览器去下 `<前缀>/handoff/<token>`。绕这一圈是为了让文件名走
     * `Content-Disposition` —— 应用内 WebView 认响应头，不认 `<a download>`。
     * 条目一次性、带 TTL、有总量上限（见 `stashHandoff`）。
     */
    handoffs: new Map(),
  };
  reload(state);

  /**
   * runtime 句柄：只有 suppressRuntimeContext() 的 disposer 需要随开关存续。
   * 不放进 state 是因为它不是数据，是活的注册。
   */
  /**
   * runtime 句柄：只保留**按会话**的抑制器，外加这张「活着的 agent」表。
   *
   * 0.3.19（档位 2 的 Q5(a)）起**不再注册任何全局抑制**。原因见
   * {@link syncAgentSuppressor}：平台的装配判据是「全局层有抑制 **或** 本
   * 会话有抑制」，只要全局层有一个，所有会话都被抑制、任何会话都取消不掉 ——
   * 于是「在新对话里打开这个开关」会锁死整台机器。
   */
  const runtime = { agents: new Map(), agentSuppressors: new Map() };

  /**
   * 注册一个 effect 并记下如何撤销：后续步骤失败时能整体回滚，不留半挂载。
   * @param {string} label - effect 标签。
   * @param {() => unknown} factory - effect 工厂。
   * @returns {void}
   */
  const effect = (label, factory) => {
    const disposer = ctx.effect(factory, label);
    if (typeof disposer !== 'function') {
      throw new TypeError(`ctx.effect(${JSON.stringify(label)}) 没有返回 disposer`);
    }
    cleanups.push(disposer);
  };

  /**
   * 让某个会话的 runtime 上下文抑制器与「**这个会话**的有效开关值」一致。
   *
   * `suppressRuntimeContext()` 是**注册**（返回 disposer），不是一次性调用，
   * 所以开关要能来回切换就必须持有并释放那个 disposer。它压的是 sandbox /
   * approval / delegation policy 这些以 user 角色快照出现的动态上下文 ——
   * 它们不在系统提示词里，所以 `soloOnly` 管不到。
   *
   * **为什么只能按会话注册（G1 / Q5(a)）**：`SystemPrompt.assemble()` 的判据是
   *
   *   `!global.runtimeContextSuppressors.isEmpty() || scopeLayers.some(...)`
   *
   * 也就是说**全局层只要有一份抑制，所有会话都被抑制**，而取消抑制需要拆掉
   * 全局那一份 —— 「关掉本会话的开关」做不到。0.3.18 之前这里同时还注册了
   * 一份全局抑制，于是「在任意一个新对话里打开这个开关」＝ 从此谁都不许恢复。
   * 现在只有这一条路：开关的**有效值**由 `switchValueOf()` 按会话取（没有
   * 记录的会话自然回落到全局值），注册挂在那个会话自己的 `agent.ctx` 上。
   *
   * 顺带修掉一个隐蔽的记账问题：抑制器挂在 **agent 的 ctx** 上，而 agent 在
   * 重启 / 恢复会话 / 可续子会话时会被换掉。所以这里记下「这份注册属于哪个
   * agent」，换了就先把旧的那份拆掉，否则新 agent 永远拿不到抑制、而旧注册
   * 又一直留着（两边都不对）。
   * @param {object} state - 本次 mount 的可变状态。
   * @param {object} agent - 装配上下文里的 agent。
   * @returns {void}
   */
  function syncAgentSuppressor(state, agent) {
    try {
      if (agent === null || typeof agent !== 'object') return;
      const sessionId = sessionIdOf(agent);
      if (sessionId === null) return;
      // 记下「这个会话现在归哪个 agent」：`/switches` 改全局层时要能回头
      // 把每一份注册都同步一遍（见 `syncAllSuppressors`）。
      if (runtime.agents.get(sessionId) !== agent) runtime.agents.set(sessionId, agent);
      // 档位 4（R3）：`runtime.agents` 里是活句柄，不能按 LRU 淘汰；但也不能
      // 「只增不减」——平台漏发 `agent/disposed` 时会一直涨。所以只在这里
      // （真的超过上限时）问一次平台「谁已经不在了」，只清确认死掉的。
      if (runtime.agents.size > MAX_REMEMBERED_SESSIONS) pruneDeadAgents(state, ctx);
      const wanted = switchValueOf(state.doc, sessionId, 'stripRuntime') === true;
      let held = runtime.agentSuppressors.get(sessionId);
      if (held !== undefined && held.agent !== agent) {
        // 这个会话换了 agent：旧注册挂在已经作废的 ctx 上，必须先拆。
        runtime.agentSuppressors.delete(sessionId);
        if (held.disposer !== null) {
          try {
            held.disposer();
          } catch {
            // 拆不掉旧的不能挡住新的。
          }
        }
        held = undefined;
      }
      if (wanted && held === undefined) {
        const scoped = agent.ctx;
        if (scoped === undefined || scoped === null || scoped.systemPrompt === undefined) return;
        const disposer = scoped.systemPrompt.suppressRuntimeContext();
        runtime.agentSuppressors.set(sessionId, {
          agent,
          disposer: typeof disposer === 'function' ? disposer : null,
        });
      } else if (!wanted && held !== undefined) {
        runtime.agentSuppressors.delete(sessionId);
        if (held.disposer !== null) held.disposer();
      }
    } catch {
      // 抑制器切不动不能影响其他功能。
    }
  }

  /**
   * 把已经不在的 agent 从 `runtime.agents` 里摘掉（只清确认死掉的，绝不猜）。
   *
   * 为什么不用 LRU：这张表里的每一项都是**活句柄**，是全局开关改动后回头
   * 同步每一份抑制器的唯一线索（见 `syncAllSuppressors()`）。按「最久没提过」
   * 淘汰会把还活着的会话一起丢掉，那个会话的抑制器从此再也同步不到。
   * 所以判据只能是「平台自己也说它已经不在了」。
   * @param {object} state - 本次 mount 的可变状态。
   * @param {object} ctx - Host 插件上下文。
   * @returns {number} 摘掉了几条。
   */
  function pruneDeadAgents(state, ctx) {
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined;
    if (agents === undefined || agents === null || typeof agents.get !== 'function') return 0;
    let removed = 0;
    for (const sessionId of [...runtime.agents.keys()]) {
      if (agents.get(sessionId) !== undefined) continue;   // 还活着：留着
      runtime.agents.delete(sessionId);
      releaseAgentSection(state, sessionId);               // 顺手释放它的 scoped 段
      removed += 1;
    }
    return removed;
  }

  /**
   * 让**所有活着的会话**的抑制器与磁盘一致。
   *
   * 开关是在设置页改的（`/switches`），而注册必须发生在**下一次装配之前** ——
   * 装配瀑布里再注册已经晚了（平台的判据在瀑布之前就算好了），表现就是
   * 「关掉开关之后这一轮还在屏蔽」。所以改完开关立刻按这张表逐个同步。
   * @param {object} state - 本次 mount 的可变状态。
   * @returns {void}
   */
  function syncAllSuppressors(state) {
    for (const agent of [...runtime.agents.values()]) syncAgentSuppressor(state, agent);
  }

  /**
   * 释放某个会话的 runtime 抑制器。
   * @param {string|null} sessionId - 会话 id。
   * @returns {void}
   */
  function releaseAgentSuppressor(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') return;
    const held = runtime.agentSuppressors.get(sessionId);
    runtime.agentSuppressors.delete(sessionId);
    if (held === undefined || held.disposer === null) return;
    try {
      held.disposer();
    } catch {
      // 回收路径上不抛。
    }
  }

  // I2（档位 2 的 Q11(a)）：过期取件内容**到点就自己释放**。
  //
  // `stashHandoff()` / `readHandoff()` 都会顺手 `pruneHandoffs()`，但那两次都要
  // 等「下一次有人导出 / 取件」—— 用户导出完就不再导出的话，那份内容（最坏
  // `HANDOFF_MAX_TOTAL_BYTES` = 64 MiB）会一直压在内存里。这里补一个定时清理，
  // 周期取该表自己的 TTL（2 分钟）：既不会白白空转，也不会让过期内容多待很久。
  // `unref()` 是为了不因为这条定时器把进程钉住（测试里尤其重要）。
  effect(`${PLUGIN_NAME}: 取件表定时清理`, () => {
    const timer = setInterval(() => {
      try {
        pruneHandoffs(state.handoffs, Date.now());
      } catch {
        // 清理失败不能影响别的功能。
      }
    }, HANDOFF_TTL_MS);
    if (typeof timer.unref === 'function') timer.unref();
    return () => clearInterval(timer);
  });

  // ── 1. 路由 ────────────────────────────────────────────────────
  const ROUTES = new Map([
    [`${ROUTE_PREFIX}/state`, ['GET']],
    // 「读一条人设」：名字 / 正文 / 段序权重 / 历史对话一次给齐。
    //
    // 0.2.1 之前是分开的 `/text` + `/history`（切换人设要两次往返）。写入
    // （保存 / 清空）仍然统一走 `/save`，这样「保存」按钮一次提交三部分改动。
    [`${ROUTE_PREFIX}/persona`, ['GET']],
    [`${ROUTE_PREFIX}/save`, ['PUT']],
    // 0.2.8：会话记录层。`/resident` = 「这个会话该有自己的一份了」，
    // `/gc` = 清掉已经删除的会话留下的记录。
    [`${ROUTE_PREFIX}/resident`, ['PUT']],
    [`${ROUTE_PREFIX}/gc`, ['PUT']],
    // 0.3.0：把「导出」出来的纯 JSON 收回来，逐条**新建**人设。
    // 0.3.1 起同一个入口也吃「导出图片」那种 PNG（客户端先把块拆出来）。
    [`${ROUTE_PREFIX}/import`, ['PUT']],
    // 0.3.1：导出交接。PUT 收字节、GET（`/handoff/<token>`）带文件名发回去。
    [`${ROUTE_PREFIX}/handoff`, ['PUT']],
    [`${ROUTE_PREFIX}/delete`, ['DELETE']],
    [`${ROUTE_PREFIX}/active`, ['PUT']],
    [`${ROUTE_PREFIX}/switches`, ['PUT']],
  ]);

  effect(`${PLUGIN_NAME}: ${ROUTE_PREFIX} 路由`, () => {
    const disposer = ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: async (req, res) => {
        if (rejected(ctx, req, res)) return;
        const url = requestUrl(req);
        // GET / HEAD /handoff/<token>：路径里带 token，进不了精确路由表，先处理掉。
        // HEAD 必须在这里就回 200 —— 那是下载器的探路请求（0.3.2 修的 404）。
        if (
          (req.method === 'GET' || req.method === 'HEAD')
          && url.pathname.startsWith(`${ROUTE_PREFIX}/handoff/`)
        ) {
          // `<token>` 后面还可能跟着 `/文件名`（见 stashHandoff），取第一段就是 token。
          const rest = url.pathname.slice(`${ROUTE_PREFIX}/handoff/`.length);
          serveHandoff(state.handoffs, rest.split('/')[0], req, res);
          return;
        }
        const methods = ROUTES.get(url.pathname);
        if (methods === undefined) {
          sendJson(res, 404, { ok: false, code: 'not-found', message: `没有这条路由：${url.pathname}` });
          return;
        }
        if (!methods.includes(req.method)) {
          sendMethodNotAllowed(res, methods.join(', '));
          return;
        }
        try {
          // 每个成功进入处理的请求都先对一次磁盘 mtime：
          // 外部手改、配置同步工具、另一个进程写的，都能被下一个请求看见。
          // `beginStat()` 让这一次请求里后面几处 `refresh()` 复用同一个读数。
          beginStat(state);
          refresh(state);
          // 档位 4（R1）：如果这一读刚触发（或碰上）旧格式迁移，先等它落地 ——
          // 于是「第一次读旧格式就已经是新格式」这条可观察行为与 0.3.20 一致。
          await settlePendingMigration(state);

          // 客户端所在的会话（可选）。带上它，工具基线就按那个会话现算 ——
          // 这是「切换会话窗口时指示点即时更新」的关键。
          const askedSession = url.searchParams.get('session') ?? '';

          if (url.pathname === `${ROUTE_PREFIX}/state`) {
            // 档位 4（R7 · Q3 方向 a）：给 `/state` 加 ETag + 304。
            //
            // 为什么值得：这份响应体随人设条数线性膨胀（200 条实测 35,947 字节），
            // 设置页与对话选框同时活着就是两份 4 秒轮询 ≈18 KB/s —— 而内容通常
            // 一个字都没变。客户端那边的 `lastRawRef` 只省了 CPU（不 parse、
            // 不重渲染），**一个字节的流量都没省**。
            //
            // ① **`no-store` 有意留着**（原样保留 `sendJson` 的两行响应头）：
            //    这份状态不该被 HTTP 缓存住。条件请求由**客户端 JS 自己在内存里**
            //    带 `If-None-Match` 发出来（见 `usePersonaState`），浏览器缓存
            //    参不参与都不影响结论。
            // ② 只给 `/state` 加。`/persona` 那些响应里是用户正文，多一套缓存
            //    语义只会多一类「为什么这次拿到的还是旧的」问题。
            // ③ `createHash` 走 `node:crypto`（`randomUUID` 本来就在同一行），
            //    **不新增任何依赖**。
            const payload = JSON.stringify(viewOf(state, ctx, askedSession));
            const etag = `"${createHash('sha1').update(payload).digest('hex')}"`;
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            res.setHeader('etag', etag);
            // 假 req（测试装置）没有 `headers`，真 http 请求有 —— 两边都要活。
            const ifNoneMatch = req !== null && typeof req === 'object' && req.headers !== null
              && typeof req.headers === 'object'
              ? req.headers['if-none-match']
              : undefined;
            if (ifNoneMatch === etag) {
              // 内容一字未变：一个字节的状态都不传。
              res.statusCode = 304;
              res.end();
              return;
            }
            res.end(payload);
            return;
          }
          // 「读一条人设」：设置页选中人设时，一次往返拿齐
          // 名字 / 正文 / 段序权重 / 历史对话。
          //
          // 为什么合成一个：这四样总是一起要（选中即全部回填），分开就是两次
          // 往返；而它们又**不能**塞进 `viewOf` —— 正文可能很大，而 `/state`
          // 每 4 秒被轮询一次。
          //
          // 只读。写入统一走 `/save`：历史对话是这条人设的一个字段，
          // 和人设正文 / 段序权重一样由最下方那个「保存」按钮提交。
          if (url.pathname === `${ROUTE_PREFIX}/persona`) {
            const id = url.searchParams.get('id') ?? '';
            const text = personaTextOf(state.doc, id);
            const history = personaHistoryOf(state.doc, id);
            // G2/G3（审计 B18/B19/P4 与 store-性能.md §2 · ps2 档位 2）：这条人设
            // 的历史文件到了「真读正文」这一刻才核 —— 0.3.22 起重读也核全部，
            // 但两次重读之间用户手改的那一次只能靠这里补上（判据与文案复用
            // `auditHistoryFiles()` 那条路）。`/persona` 的回执没有提醒字段，所以
            // 这条提醒要经 `rememberNotice()` 落进「宿主提醒」那一档，下一次
            // `/state` 轮询（`viewOf()` 里的 `hostNoticesOf()`）才会带给用户。
            //
            // ⚠ 0.3.26：以前这里写的是 `auditHistoryFileOf(state.doc, id, state.warnings)`
            // —— 直接往常驻的 `state.warnings` 里追加。那个数组的定位是「只在
            // `reload()`（重读主文件）时整体替换」，而这里是**每点开一条人设就跑一次**；
            // `auditHistoryFileOf()` 又把去重明确交给调用方（`lib/store.js` 的注释），
            // 于是同一条「历史对话文件不在了 / 读不出来」会随点选次数线性堆进数组。
            // 出口的 `uniqueWarnings()` 会去掉重复，界面一直看不出差别，坏的是那份
            // 常驻数组本身（每次 `/state` 都要把它整个复制一遍再带去重）。
            // `rememberNotice()` 有 50 条封顶 + 按整句去重，语义正合适。
            const historyAudit = [];
            auditHistoryFileOf(state.doc, id, historyAudit);
            for (const note of historyAudit) rememberNotice(note);
            // G4/Q4(a+c)（审计 B21/B22/B23 · ps2 档位 2）：正文**已经在手上**（`personaHistoryOf()`
            // 刚读过这一份），所以只扫这份已读回来的正文，不额外扫盘。
            // 坏字节（非 UTF-8）被换成 U+FFFD 且长度不变时，以前一路静默注入给
            // 模型 —— 这里挂一条去重提醒（每 4 秒一次不会刷屏，见 `rememberNotice`）。
            if (history.found && hasReplacementChars(history.text)) {
              rememberNotice(
                `人设「${history.name}」的历史对话里有读不出来的坏字符（已显示成 \uFFFD）：重存一次这段历史就能落成正常文字。`,
              );
            }
            sendJson(res, 200, {
              ok: true,
              id,
              found: text.found,
              name: text.name,
              text: text.text,
              order: text.order,
              // 没存过历史时 `historyText` 是空串、`historyLockedAt` 是 null ——
              // 「这条人设存在但没有历史」用 `found` + 这两个值表达就够了。
              //
              // G5（审计 B16/B17 · ps2 档位 2）：但「**文件丢了**」与「没存过」是两件事。
              // 前者以前也报空串，`historyLockedAt` 却来自主文件那条记录、照样
              // 有值 —— 界面于是一边显示空、一边显示「已锁定」。现在文件读不到
              // 时 `lost` 为真：`historyLockedAt` 一起收成 null，并明确报出来。
              historyText: history.found ? history.text : '',
              historyLockedAt: history.found ? history.lockedAt : null,
              historyMissing: history.found === true && history.missing === true,
            });
            return;
          }
          if (url.pathname === `${ROUTE_PREFIX}/save`) {
            const body = await readJsonBody(req, MAX_HISTORY_BODY_BYTES);

            const rawId = typeof body.id === 'string' ? body.id : '';
            const hasPersona = Object.hasOwn(body, 'name') || Object.hasOwn(body, 'text');
            const hasOrder = Object.hasOwn(body, 'sectionOrder');
            const hasHistory = Object.hasOwn(body, 'history') || body.historyClear === true;
            const now = Date.now();

            if (!hasPersona && !hasOrder && !hasHistory) {
              sendJson(res, 400, {
                ok: false,
                code: 'empty-request',
                message: '请求里既没有人设（name + text），也没有 sectionOrder / history',
              });
              return;
            }

            if (rawId.startsWith('builtin:')) {
              sendJson(res, 400, {
                ok: false,
                code: 'builtin-readonly',
                message: '内置人设只读；请先「复制为新人设」再编辑',
              });
              return;
            }

            // ① 段序权重先校验。校验放在这里而不是只在界面上做：界面那一份是为了
            //    立刻给提示，这一份才是权威 —— 值最终要交给 `systemPrompt.section()`，
            //    而它对非有限值会抛（`order must be a finite number`），
            //    小数 / 指数 / 空串 / 单位都会让整轮装配失败。
            let orderValue = null;
            if (hasOrder) {
              const verdict = acceptSectionOrder(body.sectionOrder);
              if (!verdict.ok) {
                sendJson(res, 400, { ok: false, code: verdict.code, message: verdict.message });
                return;
              }
              orderValue = verdict.value;
            }

            // ② 历史对话归一化（0.2.0 起**不裁切**：只统一换行、去首尾空白）。
            //    空串 = 清空这条人设的历史对话。
            let historyValue = null;
            let historyClear = false;
            if (hasHistory) {
              if (body.historyClear === true || typeof body.history !== 'string' || body.history.trim() === '') {
                historyClear = true;
              } else {
                historyValue = normalizeHistory({ text: body.history, lockedAt: now });
              }
            }

            // ③ 人设正文（可选）：给了 name/text 才算一次人设保存。
            let name = '';
            let text = '';
            if (hasPersona) {
              name = normalizeName(body.name);
              text = normalizeText(body.text);
              const empty = emptyFieldOf(name, text);
              if (empty !== null) {
                sendJson(res, 400, { ok: false, code: empty, message: EMPTY_FIELD_MESSAGES[empty] });
                return;
              }
            }

            // ⑤ 到这里为止的校验都与内存文档无关，可以先做完再谈写盘。
            //
            //   以下这一段**依赖 `state.doc`**（找条目、查上限、造编号），而它现在
            //   要能重来一遍：档位 4（R1）把写盘变成异步之后，一次保存可能排在
            //   别人后面，进临界区时基线已经不是派生时那一份了。所以整段收成一个
            //   「按给定基线派生一份新文档」的纯函数 —— 重放时用**新的**基线再派生
            //   一次，而不是拿旧基线整份盖上去（那正是要修的丢更新）。
            //
            //   回执要用的 `saved` / `id` / `layer` 必须取**成功那一次**的产物。
            const plan = (base) => {
              const next = { ...base };
              /** 这一次到底存了什么：'persona' / 'order' / 'history'。 */
              const saved = [];
              const personas = [...next.personas];
              let index = rawId === '' ? -1 : personas.findIndex((entry) => entry.id === rawId);
              if (index === -1 && !hasPersona) {
                // 只改权重 / 只存历史时必须点名一条**已经存在**的人设。
                return {
                  error: {
                    status: 404,
                    code: 'not-found',
                    message: rawId === '' ? '只保存权重或历史对话时要带上人设 id' : `没有人设 ${rawId}`,
                  },
                };
              }

              let id = rawId;
              if (hasPersona) {
                if (index === -1) {
                  // F1(a)（档位 2 的 Q1）：到上限就**明确拒绝**，不要造出一条
                  // 磁盘上并不存在的人设 —— 否则界面、面板、连「选中它看详情」
                  // 都以为它在，编辑还一路报「保存成功」，直到重启才凭空消失，
                  // 用户为它写的正文一起没了。
                  if (personaLimitReached(personas.length)) {
                    return {
                      error: {
                        status: 409,
                        code: 'personas-over-limit',
                        message: `人设已达 ${MAX_PERSONAS} 条上限，请先删一条再新建。`,
                      },
                    };
                  }
                  id = rawId !== '' && /^[A-Za-z0-9:_-]{1,80}$/.test(rawId) ? rawId : newPersonaId();
                  if (personas.some((entry) => entry.id === id)) id = newPersonaId();
                  personas.push({
                    id,
                    name,
                    text,
                    // 新人设：没给权重就是「未设置」（读出来按默认 -1）。
                    sectionOrder: hasOrder ? orderValue : null,
                    history: null,
                    createdAt: now,
                    updatedAt: now,
                  });
                  index = personas.length - 1;
                } else {
                  id = personas[index].id;
                  personas[index] = { ...personas[index], name, text, updatedAt: now };
                }
                saved.push('persona');
              }

              // ④ 权重与历史对话都落在**这条人设**上。
              if (hasOrder || hasHistory) {
                const entry = { ...personas[index], updatedAt: now };
                if (hasOrder) {
                  entry.sectionOrder = orderValue;
                  saved.push('order');
                }
                if (hasHistory) {
                  // 只给「正文 + 锁定时间」：文件名与规模摘要由 `writeStoreFile()`
                  // 在落盘那一步一并生成（那时候才知道它叫什么、多大）。
                  entry.history = historyClear || historyValue === null
                    ? null
                    : { text: historyValue.text, lockedAt: historyValue.lockedAt };
                  saved.push('history');
                }
                personas[index] = entry;
              }

              next.personas = personas;
              // `activate` 是「保存人设时顺手选中它」的可选动作。它和「启用」
              // 按钮走同一条分层规则：有会话记录写本会话，否则写全局。
              //
              // 这两件改动**合在同一份副本上、只落盘一次**：0.3.18 之前这里是
              // 「先 commit 人设、再为了切换启用项 writeLayer 一次」—— 同一个请求
              // 把同一份文件完整重写两遍。档位 4（R1）把启用那一半从
              // `writeLayer()` 收进这里，就是为了让它与上面那些人设改动**一起**
              // 可重放（否则重放只能重放一半）。
              const layer = layerFor(state, body.session);
              const activating = hasPersona && body.activate === true;
              let written = next;
              if (activating) {
                if (layer.kind === 'global') {
                  next.activeId = id;
                } else {
                  const record = {
                    ...(sessionRecordOf(next, layer.id) ?? sampledRecord(next, now)),
                    updatedAt: now,
                    activeId: id,
                  };
                  written = withSessionRecord(next, layer.id, record);
                }
              }
              return { next: written, saved, id, layer, activating };
            };

            let outcome = null;
            await saveWithRetry(state, async () => {
              const planned = plan(state.doc);
              if (planned.error !== undefined) {
                // 校验失败：不写盘、不重放，直接把这条回执交出去。
                const error = new Error(planned.error.message);
                error.code = planned.error.code;
                error.status = planned.error.status;
                throw error;
              }
              await commit(state, planned.next);
              outcome = planned;
            });
            const { saved, id, layer, activating } = outcome;
            // 段序刚可能变了：立刻换一次注册，下一轮装配就生效。
            // 换注册失败不能把「已经落盘的保存」报成失败：syncSection 自己会回退到默认段序。
            try {
              syncSection(state, ctx);
            } catch (error) {
              logToHost(ctx, `[${PLUGIN_NAME}] 保存后同步段序失败：${error?.message ?? String(error)}`);
            }
            sendJson(res, 200, {
              ok: true,
              saved,
              id,
              // 这次写到了哪一层（`null` = 没写层，只写了人设本身）。与
              // `/switches` / `/active` 的回执同一个字段，且说的是**实际**
              // 落盘的那一层 —— 以前这里跟着一份没有会话上下文的 `viewOf`
              // 报全局读数，报文和写入位置对不上。
              layer: activating ? layer.kind : null,
              // F2（档位 2 的 Q2(b)）：正文超长不再截断，但要**当场**说一声。
              // 同一份提醒也由 `/state.warnings` 每 4 秒带一次（界面顶部那条
              // 提示条读的就是它），这里只是让它立刻可见。
              warnings: textLimitWarnings(state.doc),
            });
            return;
          }
          // PUT /handoff?filename=…&mime=… —— 收下一份待下载的文件，返回取件 URL。
          //
          // 客户端不再自己造 `blob:` 去点 `<a download>`：应用内 WebView 的下载桥
          // 看不到那个属性，只会拿 blob URL 的 UUID 当文件名（0.3.0 的 bug）。
          // 这里收下字节，再由浏览器 GET 取件，文件名走 `Content-Disposition`。
          //
          // 请求体是**原始字节**（不是 JSON）：图片几 MB 起，套 base64 平白胖三成。
          if (url.pathname === `${ROUTE_PREFIX}/handoff`) {
            const bytes = await readBinaryBody(req, HANDOFF_MAX_ENTRY_BYTES);
            if (bytes.length === 0) {
              sendJson(res, 400, { ok: false, code: 'empty-export', message: '交接的导出内容为空。' });
              return;
            }
            const mime = url.searchParams.get('mime') ?? '';
            if (!EXPORT_MIMES.has(mime)) {
              sendJson(res, 400, {
                ok: false,
                code: 'bad-mime',
                message: `不支持的导出类型：${mime === '' ? '(空)' : mime}`,
              });
              return;
            }
            const filename = safeExportName(url.searchParams.get('filename'), mime);
            const { token, url: handoffUrl } = stashHandoff(state.handoffs, { filename, mime, bytes });
            sendJson(res, 200, { ok: true, token, url: handoffUrl, filename, bytes: bytes.length });
            return;
          }
          // PUT /import —— 把「导出」出来的纯 JSON 收进来，逐条**新建**人设。
          //
          // 契约（0.3.0 起，格式由本插件自己定）：
          //   { format: 'dsh-persona-select/personas', version: 1,
          //     personas: [ { name, text, sectionOrder, history } ] }
          // 外层壳只当参考 —— {@link importListOf} 也接受裸数组和单条对象，
          // 手写一份导进来不该被壳挡住。
          //
          // 每条都当**新人设**（重新发 id）：同一份文件导入两次就是两条，
          // 既不会覆盖已有条目，也不会碰到任何人设的正文 / 权重 / 历史。
          if (url.pathname === `${ROUTE_PREFIX}/import`) {
            // 导出文件可能很大（历史对话没有字数上限），所以给历史那一档的体上限。
            const body = await readJsonBody(req, MAX_HISTORY_BODY_BYTES);
            const incoming = importListOf(body);
            if (incoming === null) {
              sendJson(res, 400, {
                ok: false,
                code: 'bad-format',
                message: '导入文件里没有 personas 数组（也不是单条人设对象或对象数组）。',
              });
              return;
            }
            if (incoming.length === 0) {
              sendJson(res, 400, { ok: false, code: 'empty-import', message: '导入文件里一条人设都没有。' });
              return;
            }
            const now = Date.now();
            // 档位 4（R1）：这一段依赖 `state.doc`，同样收成「按给定基线派生一份」
            // 的纯函数，理由与 `/save` 那一段相同（写盘异步之后必须能重放）。
            // 每次重放都会重新发一批 id —— 第一次没写成，所以不存在「两个编号」。
            const plan = (base) => {
              const personas = [...base.personas];
              const ids = [];
              const skipped = [];
              incoming.forEach(({ index, raw }) => {
                // 上限在写入前就拦住：`normalizeStore` 也会拦，但那是读盘时，
                // 表现为「存进去又悄悄少一条」，不如在这里明说。
                if (personaLimitReached(personas.length)) {
                  skipped.push({ index, code: 'limit' });
                  return;
                }
                // H2（档位 2）：**形状不对的也要记账**。以前 `importListOf()`
                // 直接把 `null` / `'x'` / `42` 滤掉，于是那些条数既没导入、
                // 也不在「跳过」里 —— 回执上的数字加起来对不上文件里写着的条数。
                if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
                  skipped.push({ index, code: 'bad-shape' });
                  return;
                }
                const name = normalizeName(raw.name);
                const text = normalizeText(raw.text);
                const empty = emptyFieldOf(name, text);
                if (empty !== null) { skipped.push({ index, code: empty }); return; }
                const verdict = acceptSectionOrder(raw.sectionOrder);
                const id = newPersonaId();
                personas.push({
                  id,
                  name,
                  text,
                  // 权重写法不认识就按「未设置」收下，不因为一个字段废掉整条人设。
                  sectionOrder: verdict.ok ? verdict.value : null,
                  history: importHistoryOf(raw.history, now),
                  createdAt: now,
                  updatedAt: now,
                });
                ids.push(id);
              });
              return { next: { ...base, personas }, ids, skipped };
            };
            let outcome = null;
            let nothingImported = null;
            await saveWithRetry(state, async () => {
              const planned = plan(state.doc);
              if (planned.ids.length === 0) {
                // 「一条都导不进来」不是错误、也不写盘：**回执形状不许变**
                // （400 + ok:false + skipped），所以不能靠抛错走上面那个 catch。
                nothingImported = planned;
                return;
              }
              await commit(state, planned.next);
              outcome = planned;
            });
            if (outcome === null) {
              sendJson(res, 400, {
                ok: false,
                code: 'nothing-imported',
                message: `没有一条能导入（名字或正文为空、条目形状不对，或 ${MAX_PERSONAS} 个位置已占满）。`,
                skipped: nothingImported.skipped,
              });
              return;
            }
            sendJson(res, 200, {
              ok: true,
              imported: outcome.ids.length,
              ids: outcome.ids,
              skipped: outcome.skipped,
            });
            return;
          }
          if (url.pathname === `${ROUTE_PREFIX}/delete`) {
            const id = url.searchParams.get('id') ?? '';
            if (id.startsWith('builtin:')) {
              sendJson(res, 400, {
                ok: false,
                code: 'builtin-readonly',
                message: '内置人设不可删除',
              });
              return;
            }
            // F3（审计 C6 · ps2 档位 2）：没带编号 ≠ 这条不存在。改前两种情形共用一条
            // `not-found`，提示还是「没有人设 」（末尾空着），用户不知道要改什么。
            if (id.trim() === '') {
              sendJson(res, 400, {
                ok: false,
                code: 'empty-request',
                message: '没有带人设编号：这条路由只认查询串，例如 delete?id=p-xxxx',
              });
              return;
            }
            // 档位 4（R1）：派生与落盘一起重放（理由同 `/save`）。
            await saveWithRetry(state, () => {
              const next = {
                ...state.doc,
                personas: state.doc.personas.filter((entry) => entry.id !== id),
              };
              if (next.personas.length === state.doc.personas.length) {
                const error = new Error(`没有人设 ${id}`);
                error.code = 'not-found';
                error.status = 404;
                throw error;
              }
              if (next.activeId === id) next.activeId = null;
              return commit(state, next);
            });
            sendJson(res, 200, { ok: true });
            return;
          }
          if (url.pathname === `${ROUTE_PREFIX}/switches`) {
            const body = await readJsonBody(req);
            // F2/Q2(a)（审计 C3 · ps2 档位 2）：这两类字段的**类型**先校验，再谈改动。
            // 改前同一个 `{x:1}` 对四个抑制开关是「关」、对安全阀是「开」
            // （`toolReusable` 只显式 `false` 才关），回执只回一个 `touched`，
            // 既不说最终值也不说拒绝 —— 用户以为开着的开关其实是关的。
            // 校验放在 `writeLayer()` **之前**：被拒绝的请求连一次落盘都不留下。
            const badTypes = [...SWITCH_KEYS, TOOL_REUSABLE_KEY, 'pureChat']
              .filter((key) => Object.hasOwn(body, key) && typeof body[key] !== 'boolean');
            if (badTypes.length > 0) {
              sendJson(res, 400, {
                ok: false,
                code: 'bad-switch-type',
                message: `这些开关只认 true / false：${badTypes.join(' / ')}`,
              });
              return;
            }
            // 先算出这次到底改了哪几项，**再**决定写不写：
            // 一个什么都不认的请求不该留下一次落盘（连 mtime 都不该动）。
            const touched = [];
            for (const key of SWITCH_KEYS) if (Object.hasOwn(body, key)) touched.push(key);
            if (Object.hasOwn(body, TOOL_REUSABLE_KEY)) touched.push(TOOL_REUSABLE_KEY);
            // 0.3.23 修（契约不一致）：类型校验允许 `pureChat: false`，但下面只认
            // `=== true`，于是 `{pureChat:false}` 会掉进「什么都没改」的
            // `400 empty-request` —— 回执说"请求里没有任何可改开关"，可用户明明
            // 发了 pureChat。现在把它单独挡下来并说清原因。
            //
            // 为什么不做成"显式 false = 退出纯聊天"：一个 false 说不清要把哪几个
            // 开关关掉（客户端自己也是靠逐个开关发显式值来还原的，见
            // `onPrimaryAction` 的 `restoreDone` 那一支），顺手替用户猜会改错。
            if (Object.hasOwn(body, 'pureChat') && body.pureChat !== true) {
              sendJson(res, 400, {
                ok: false,
                code: 'bad-pure-chat',
                message: 'pureChat 只认 true（一键切纯聊天）；要退出纯聊天，请把四个抑制开关逐个发显式 false。',
              });
              return;
            }
            if (body.pureChat === true) touched.push('pureChat');
            if (touched.length === 0) {
              sendJson(res, 400, {
                ok: false,
                code: 'empty-request',
                message: `请求里没有任何可改开关（${SWITCH_KEYS.join(' / ')} / ${TOOL_REUSABLE_KEY} / pureChat）`,
              });
              return;
            }
            const layer = layerFor(state, body.session);
            const now = Date.now();
            // 档位 4（R1）：落盘改成异步，这一句要等它写完再回执。
            await writeLayer(state, layer, now, (target) => {
              for (const key of SWITCH_KEYS) {
                if (Object.hasOwn(body, key)) target[key] = body[key] === true;
              }
              // 「工具可复用」：与四个抑制开关方向相反 —— 只有显式 false 才关闭，
              // 其余（含坏类型）一律保持开启，因为关闭它才是危险的那一侧。
              if (Object.hasOwn(body, TOOL_REUSABLE_KEY)) {
                target[TOOL_REUSABLE_KEY] = body[TOOL_REUSABLE_KEY] !== false;
              }
              // 「一键纯净」：一次把四个开关打开，并清掉这一层的人设。
              // 刻意不动「工具可复用」：它是安全阀，不该被纯聊天顺手关掉。
              if (body.pureChat === true) {
                target.activeId = null;
                for (const key of SWITCH_KEYS) target[key] = true;
              }
            });
            syncAllSuppressors(state);
            sendJson(res, 200, {
              ok: true,
              touched,
              layer: layer.kind,
            });
            return;
          }
          // PUT /resident —— 「这个会话该有自己的一份记录了」。
          //
          // 两种触发（0.2.8）：
          //   1. 对话页左侧选中一个**还没有记录**的旧对话 → 采样一次；
          //   2. 设置页打开时问一次，好决定要不要显示「当前」页。
          // 新对话（`blank`）**不采样**：它按需求对应「全局」设置，
          // 等第一轮消息真的发出去时由 `agent/pre-step` 采样。
          //
          // 判据顺序：活着且已经有内容 → 采样；否则看客户端给的那一位 `blank`
          // （它来自 Host 自己的会话列表，客户端只是转发）。会话不活着又没拿到
          // 这一位时**什么都不做** —— 宁可晚一点，也不要给一条还没开始的会话
          // 写下一份会把后续设置冻住的记录。
          //
          // 0.3.25 收紧一处（子会话继承）：客户端那位 `blank: false` 单独成立时
          // **不再够用**。分叉出来的子对话正是「非空 + 宿主还没把它恢复起来」，
          // 只凭 `blank` 就落采样的话，采样读不到 header 也就读不到
          // `parentSession`，只能抄一份全局层 —— 而那一份对子会话是错的，且
          // 一旦落下再也不会被纠正（`ensureSessionRecord` 见到记录就不再采样）。
          // 现在补一条：要么宿主**看得见**这个会话（header 读得到，父 id 一定准），
          // 要么客户端**明确回答过**父是谁（`parent` 这个键在不在，见
          // `bodyKnowsParent()`）。两条都不成立就什么都不做 —— 选择框会每 3 秒
          // 重试一次，`agent/created` 与首次对话那两条路也都会补上，而那时父 id
          // 是读得到的。
          if (url.pathname === `${ROUTE_PREFIX}/resident`) {
            const body = await readJsonBody(req);
            const id = normalizeSessionId(body.session);
            if (id === null) {
              sendJson(res, 400, { ok: false, code: 'bad-session', message: 'resident 要带上 session（非空字符串）' });
              return;
            }
            let created = false;
            if (sessionRecordOf(state.doc, id) === null) {
              const eligible = sessionHasContent(ctx, id) || body.blank === false;
              const visible = sessionById(ctx, id) !== undefined;
              // J7：这条路由**没有发生装配**，所以不写「上次渲染的是哪条人设」
              // 那个读数 —— 只采样设置字段。
              if (eligible && body.blank !== true && (visible || bodyKnowsParent(body))) {
                created = ensureSessionRecord(state, id, {
                  afterAssembly: false,
                  parentId: parentSessionIdOf(ctx, id, body),
                });
              }
            }
            sendJson(res, 200, { ok: true, created });
            return;
          }
          // PUT /gc —— 清理「已经被删除的会话」留下的记录。
          //
          // 判据是**持久化存储里还在不在**，而不是「有没有事件」：归档只是
          // 一条注册表标记，日志原封不动，所以归档会话照旧在 `list()` 里，
          // 不会被清掉 —— 需求里那句「不能包括归档对话等等」就是靠这个成立的。
          if (url.pathname === `${ROUTE_PREFIX}/gc`) {
            const body = await readJsonBody(req);
            const result = await reconcileSessionRecords(state, ctx);
            sendJson(res, 200, {
              ok: true,
              removed: result.removed,
              skipped: result.skipped,
            });
            return;
          }
          // F1/Q1(a)（审计 C1）+ F5（审计 host.md §8 H2）（ps2 档位 2）：最后一段改成**显式路径判定**。
          //
          // 改前这里没有 `if`，靠「前面 9 条都 return 了」兜住 —— 一旦有人在
          // `ROUTES` 里多声明一条路径却忘了写分支，请求就会静默落进「切人设」，
          // 把用户正在用的人设换掉（实测：只加一行声明，`PUT /favorite {id:乙}`
          // 就真的把 `activeId` 改成了乙，界面一句提示都没有）。
          if (url.pathname === `${ROUTE_PREFIX}/active`) {
            const body = await readJsonBody(req);
            const rawId = typeof body.id === 'string' ? body.id : '';
            // F1：「请求里没写 id」与「用户主动不注入」是两件事。改前任何空值
            // 都被当成后者，回 200「成功」而用户选好的人设已经变成 null。
            //
            // 2026-10-10 修正（用户报「对话界面选不了『不注入』」）：**不能**把
            // 「显式发 `id: ''`」也当成"没写"。对话界面选框那一项一直发的是空串
            // （`client.js` 的 `onPickPersona('')`），一刀切成 400 会让它整条失效。
            // 所以判据收紧到三件事：
            //   · 键不存在 / 值不是字符串 / 值只由空白组成 → 400「没写 id」；
            //   · 显式 `id: ''` 与 `id: 'builtin:off'` → 都是「不注入」（兼容两种写法）；
            //   · 其余照旧。
            const hasStringId = typeof body.id === 'string';
            const isOff = hasStringId && (rawId === '' || rawId === 'builtin:off');
            if (!hasStringId || (rawId.trim() === '' && rawId !== '')) {
              sendJson(res, 400, {
                ok: false,
                code: 'empty-request',
                message: '请求里没有 id（要取消注入请发 {"id":"builtin:off"} 或 {"id":""}）',
              });
              return;
            }
            const layer = layerFor(state, body.session);
            if (!isOff) {
              const { personas } = mergeView(state.doc);
              if (!personas.some((entry) => entry.id === rawId)) {
                sendJson(res, 404, { ok: false, code: 'not-found', message: `没有人设 ${rawId}` });
                return;
              }
            }
            const now = Date.now();
            // 档位 4（R1）：落盘改成异步，这一句要等它写完再回执。
            await writeLayer(state, layer, now, (target) => {
              // `builtin:off` 与显式 `''` 都表示「不注入」，只是不再接受
              // 「靠不写字段来取消」。
              target.activeId = isOff ? null : rawId;
            });
            // 人设换了 → 这个会话的段序可能也换了。全局那一层立即换注册；
            // 会话那一层由装配时的 ensureAgentSection 跟上（下一轮生效）。
            try {
              syncSection(state, ctx);
            } catch (error) {
              logToHost(ctx, `[${PLUGIN_NAME}] 切人设后同步段序失败：${error?.message ?? String(error)}`);
            }
            sendJson(res, 200, {
              ok: true,
              layer: layer.kind,
            });
            return;
          }
          // F5：能走到这里说明 `ROUTES` 声明了这条路径，但上面没有分支接它。
          // 这不是「未知路由」—— 那条在 `ROUTES.get()` 为 undefined 时已经回了
          // 404；这是**接线漏了**。直接报出来，绝不让它落进任何别的动作里。
          logToHost(ctx, `[${PLUGIN_NAME}] 路由声明了但没有处理分支：${req.method} ${url.pathname}`);
          sendJson(res, 500, {
            ok: false,
            code: 'route-not-wired',
            message: `这条路由没有接线：${url.pathname}`,
          });
        } catch (error) {
          // 客户端把请求体写坏时回 400（见 `badRequestBody`），其余才是 500。
          const status = Number.isFinite(error?.status) ? error.status : 500;
          sendJson(res, status, {
            ok: false,
            code: typeof error?.code === 'string' ? error.code : 'internal-error',
            message: error?.message ?? String(error),
          });
        }
      },
    });
    if (typeof disposer !== 'function') {
      throw new TypeError('webServer.register() 没有返回 disposer');
    }
    return disposer;
  });

  // ── 2. 装配观察 + 「仅加载人设」重写 ────────────────────────────
  //
  // 为什么用「瀑布里重写 sections」而不是给段加 `complete: true`：
  //
  // `complete` 语义确实是「这一段成为唯一系统提示词」，但 `assemble()` 的**第一件事**
  // 就是数 complete 段，超过一个直接抛错
  // （dsh-system-prompt/lib/index.js:335-336 ─ multiple complete prompt sections）。
  // DSH 内置的「极简模式」preset 自带一个 complete 段，所以一旦本插件也用 complete，
  // 两边一撞就是**每一轮对话都失败**，而且那个检查在瀑布之前，任何监听器都救不了。
  //
  // 同一个函数的**末尾**是：瀑布跑完之后，
  //   completeSection === void 0 ? transformed.sections : [completeSection]
  // 也就是说没有 complete 段时，瀑布监听器返回什么就下发什么。
  // 于是本监听器把 sections 换成「只剩自己这一段」，效果与 complete 等价，
  // 却**永远不会**触发那个抛错；而且在极简模式下会被对方的 complete 覆盖，
  // 表现为「本开关不生效」而不是「对话崩掉」—— 优雅降级。
  effect(`${PLUGIN_NAME}: system-prompt/assemble 观察 + 仅加载人设`, () =>
    ctx.on(
      'system-prompt/assemble',
      async (assembly, context, next) => {
        const downstream = await next();
        let rewritten = downstream;
        try {
          // 0.3.23：这一轮的 signal 就是「问盘事务」的身份证 —— 同轮里两个装配钩子
          // 加 pre-step 只整份读一次（见 `beginStat()`）。
          beginStat(state, context?.signal);
          const sections = Array.isArray(downstream?.sections)
            ? downstream.sections
            : Array.isArray(assembly?.sections)
              ? assembly.sections
              : [];
          // 这一轮装配属于哪个会话：正文、开关、段序全部按它取（0.2.8）。
          const agentForSession = context?.agent;
          const sessionId = sessionIdOf(agentForSession);
          const text = currentText(state, sessionId);
          // 段序也可能被外面手改过；refresh() 刚在上面跑过，顺手让注册跟上。
          // 装配已经拿到自己的段列表快照，所以这里只影响**下一轮**。
          try {
            syncSection(state, ctx);
            ensureAgentSection(state, ctx, agentForSession);
            syncAgentSuppressor(state, agentForSession);
          } catch {
            // 换注册失败不能影响这一轮的装配结果。
          }
          const wanted = text !== '';
          state.assembly.count += 1;
          // 段序记录**不在这里**：本监听器在内层，看到的还是别的插件（以及
          // 「追随」）改写之前的列表。记录由最外层那个监听器负责，见
          // recordFinalOrder()。
          // 档位 6：`assembledAt` **每一轮都记**（不管有没有人设），它回答的是
          // 「这个会话到底装配过没有」—— 0.3.19 缺了这个读数，客户端只能从
          // appliedAt/droppedAt 是不是 null 去猜，于是把「本轮没有可注入的人设」
          // 说成了「人设被顶掉了」。
          const assembledAt = Date.now();
          if (wanted) {
            const present = sections.some(
              (section) => section?.name === SECTION_NAME && String(section.text ?? '').trim() !== '',
            );
            if (present) {
              // 生效时清掉「被吞」标记：否则一次极简模式的经历会永久挂在界面上。
              rememberAssembly(state, sessionId, { assembledAt, appliedAt: assembledAt, droppedAt: null });
              // 按会话记一份：指示点要按会话报黄（0.3.4）。
              forgetPersonaDropped(state, sessionId);
            } else {
              rememberAssembly(state, sessionId, { assembledAt, droppedAt: assembledAt });
              rememberPersonaDropped(state, sessionId);
            }
          } else {
            // 这一轮压根没有想要人设（选了「不注入」，或选定人设的正文是空的）。
            // 上一次「想要过」的读数到这里就**过期**了 —— 留着它，卡片会在你
            // 明明没选人设的时候继续说「已注入」或「未注入」，而「被吞」标记还会
            // 让指示点一直黄着。都清成 null，卡片只能说真话。
            rememberAssembly(state, sessionId, { assembledAt, appliedAt: null, droppedAt: null });
            forgetPersonaDropped(state, sessionId);
          }

          // 「屏蔽工具」：把工具 schema 清空。
          //
          // 注意 schema 是 wire 上的独立字段，不在系统提示词里，
          // 所以 `soloOnly` 管不到它 —— 而它通常是 token 的最大头。
          //
          // 但**不能无条件清空**：请求头部记录的就是这一轮发出的工具列表，
          // 清空会让本会话的工具声明基线变成空的，之后工具回来时全被标成
          // `defer_loading: true`，provider 直接拒
          // （INVALID_REQUEST: at least one tool must have defer_loading=false）。
          // 而基线只在「首个请求 / 系列重启 / 定义变更」时重置，会话内不可逆。
          //
          // 所以「工具可复用」（默认开）在「本会话第一次请求」和「疑似系列重启」
          // 这两轮**先保留完整工具**，让（新）基线落在非空值上；其余轮次照剥不误。
          // 关掉它则完全不设防，行为与 0.1.1 逐字一致（代价是基线一旦清空，
          // 本会话内工具再也回不来）。
          //
          // 0.1.5 起这一项**每次装配都算**（不再只在开「屏蔽工具」时算）：
          // 指示点要能如实报告「本会话第一轮请求里根本没有工具」这个红色状态，
          // 而那个状态与用户开不开屏蔽无关。
          const baselineState = toolBaselineState(agentForSession);
          state.assembly.sessionId = sessionId;
          rememberAssembly(state, sessionId, { toolBaseline: baselineState });
          rememberBaseline(state, sessionId, baselineState);

          if (switchValueOf(state.doc, sessionId, 'stripTools') === true) {
            const reusable = toolReusableOf(state.doc, sessionId);
            const restart = reusable ? seriesRestartRisk(agentForSession) : false;
            if (reusable && (baselineState === 'none' || restart)) {
              // 这一轮放完整工具过去，让（新）基线落在非空值上。
              // 代价是每个会话的第一次请求、以及每次系列重启多带一轮 schema，
              // 换来之后可以随时剥、随时安全恢复。
              rememberAssembly(state, sessionId, {
                toolStripHeld: true,
                toolStripHeldReason: baselineState === 'none' ? 'first-request' : 'series-restart',
              });
            } else {
              rememberAssembly(state, sessionId, { toolStripHeld: false, toolStripHeldReason: null });
              rewritten = { ...rewritten, tools: [] };
            }
          } else {
            rememberAssembly(state, sessionId, { toolStripHeld: false, toolStripHeldReason: null });
          }

          // 「仅加载人设」：把 sections 压成只剩自己这一段。
          if (switchValueOf(state.doc, sessionId, 'soloOnly') === true) {
            const mine = sections.find((section) => section?.name === SECTION_NAME);
            if (mine !== undefined) {
              const before = {
                sections: sections.length,
                chars: totalChars(sections),
              };
              const solo = [{ ...mine }];
              const after = { sections: solo.length, chars: totalChars(solo) };
              state.assembly.before = before;
              state.assembly.after = after;
              // 档位 4（R4）：按会话记一份。`rememberAssembly` 是**合并式**写入，
              // 所以三个写点都必须显式传值 —— 关掉开关后那个会话才会真的回到 null。
              rememberAssembly(state, sessionId, { before, after });
              // 基于 `rewritten` 而不是 `downstream` 展开：上面「屏蔽工具」
              // 可能已经改过它，用 downstream 会把那次改动丢掉。
              rewritten = { ...rewritten, sections: solo };
            } else {
              // 自己这一段根本不在（例如本会话 preset 声明了 complete），
              // 什么都不做 —— 让平台自己的结果原样下发，不制造空提示词。
              state.assembly.before = null;
              state.assembly.after = null;
              rememberAssembly(state, sessionId, { before: null, after: null });
            }
          } else {
            state.assembly.before = null;
            state.assembly.after = null;
            rememberAssembly(state, sessionId, { before: null, after: null });
          }
        } catch {
          // 观察/重写失败绝不能影响装配结果：退回下游原值。
          rewritten = downstream;
        }
        return rewritten;
      },
    ),
  );

  // ── 3. prompt 段本身 ───────────────────────────────────────────
  //
  // `interpolate: false` 是硬要求，不是偏好：正文完全是用户自由文本，
  // DSH 的严格插值器遇到未知 `{{...}}` 会抛，从而让整轮装配失败。
  // 关掉插值，这个失败模式在结构上就不存在。
  //
  // 注册由 syncSection() 负责（段序可以被设置页改，所以要能换注册），
  // 这里只补一张「卸载时把当前那次注册拆掉」的账：
  // ctx.effect 已经把它挂在本插件的 fiber 上，这里是同一张 ledger 的第二道保险。
  syncSection(state, ctx);
  cleanups.push(() => {
    if (state.section.disposer !== null) {
      try {
        state.section.disposer();
      } catch {
        // 卸载路径上不能因为拆注册失败而中断。
      }
      state.section.disposer = null;
    }
  });

  // ── 3b. 每个 agent 的 scoped 覆盖（0.2.8）────────────────────────
  //
  // 段的**排序权重**只在注册时读一次，全局又只能注册一份，所以「每个会话
  // 排在自己的位置」只能靠 per-agent 的 scoped 注册（scoped 同名段盖住全局
  // 那一份）。同一条路还要管「屏蔽 runtime 上下文」——它也是注册，不是数据。
  //
  // 两份都挂在 `agent.ctx` 上：DSH 卸载本插件**不会**带走它们，所以这里
  // 自己记一张账，`agent/disposed` 和插件卸载时都要拆。
  //
  // 0.3.25 在这里多一件事：**有父会话的 agent 一建起来就先继承一份设置**。
  // 为什么非要抢在 `ensureAgentSection()` 之前：`agent/created` 是「这个会话
  // 第一次装配之前」唯一一个拿得到 agent（因而拿得到 `header.parentSession`）
  // 的钩子。放在 `agent/pre-step` 里采样就太晚了 —— 装配发生在 pre-step **之前**，
  // 于是子会话第一轮的人设段、段序、runtime 抑制器全都按**全局层**渲染了一轮，
  // 第二轮才改过来。分叉出来的子对话靠 `/resident` 抢在前面（选择框在你开口
  // 之前就问过），但 **subagent / subagent_fork 没有选择框**，只有这一条路。
  // 只对**有父**的会话做：新对话必须继续跟随全局（它要等第一条消息才采样），
  // 那是「在新对话里改设置 = 改全局默认」那条需求的落点。
  effect(`${PLUGIN_NAME}: agent/created 建立 scoped 段与 runtime 抑制器`, () =>
    ctx.on('agent/created', ({ agent }) => {
      try {
        beginStat(state);
        refresh(state);
        // 采样发生在**装配之前**，所以不写 `promptPersonaId`（J7，见
        // `ensureSessionRecord`）；那个读数会在第一次真的发请求时由
        // `convergeOnPersonaSwitch()` 自己学一遍。
        const parentId = normalizeSessionId(agent?.session?.header?.parentSession);
        if (parentId !== null) {
          const sessionId = sessionIdOf(agent);
          if (sessionId !== null) {
            ensureSessionRecord(state, sessionId, { afterAssembly: false, parentId });
          }
        }
        ensureAgentSection(state, ctx, agent);
        syncAgentSuppressor(state, agent);
      } catch {
        // 建立失败只影响这一个会话的段序，绝不能让 agent 建不起来。
      }
    }),
  );
  effect(`${PLUGIN_NAME}: agent/disposed 回收 scoped 覆盖`, () =>
    ctx.on('agent/disposed', ({ agent }) => {
      const sessionId = sessionIdOf(agent);
      releaseAgentSection(state, sessionId);
      releaseAgentSuppressor(sessionId);
      // J1：这个会话没了，它那份装配读数跟着走（否则这张表只增不减）。
      if (typeof sessionId === 'string' && sessionId !== '') {
        state.assemblyBySession.delete(sessionId);
        runtime.agents.delete(sessionId);
        // J3（审计 client.md §3 C3 · ps2 档位 2）：只清装配读数会让卡片说「还没装配过」、而圆点还黄着
        // —— 圆点读的是另一张表（`personaDropped`），全文件原来只有 1 处 delete
        // （`clearPersonaDropped`，装配成功那条路）。会话回收后两边必须一起归零，
        // 否则「我刚把一个对话关掉再打开」会看到两处互相矛盾的说法。
        state.personaDropped.delete(sessionId);
      }
    }),
  );

  // ── 3c. 启动时清理已删除会话的记录（0.2.8）────────────────────────
  //
  // 不 await：挂载不能被一次磁盘列举拖住。失败也不报错（下一次打开设置页
  // 或下一次会话销毁还会再来一遍）。
  void reconcileSessionRecords(state, ctx).catch(() => {});

  // ── 4. 「追随」模式：把本段移到所有系统提示词段之后 ──────────────
  //
  // 段序取 `FOLLOW_SECTION_ORDER`（与 dsh-prompt-setting 的自定义段同款，
  // 含义是「排在仓库自己定义的每一个段之后」）。但 `order` 只能保证
  // 「比某个数大」，别的插件仍可以用更大的有限数注册；而且与 prompt 管理
  // 同为 1000000 时按段名排，`plugin:…` 会排在 `prompt-setting:…` **前面**。
  // 所以要真正做到「追加在系统提示词后」，还需要在瀑布里把它移到末尾：
  // 本监听器用 `{ prepend: true }` 抢到最外层，`next()` 之后的代码最后跑，
  // 看到的是所有监听器改完之后的段列表。
  effect(`${PLUGIN_NAME}: 追随模式保持段在末尾 + 记录最终段序`, () =>
    ctx.on(
      'system-prompt/assemble',
      async (assembly, context, next) => {
        const downstream = await next();
        try {
          beginStat(state, context?.signal);
          refresh(state);
          // 「追随」是**这个会话选定人设**的权重模式（权重按人设存），
          // 换一个普通人设就该回到数值排序。会话 id 只能从装配上下文拿。
          const sessionId = sessionIdOf(context?.agent);
          const final = sectionOrderMode(state.doc, sessionId) === 'follow' ? moveOwnSectionLast(downstream) : downstream;
          // 记录放在移动**之后**：这一段代码是最外层 `next()` 之后的收尾，
          // 看到的才是下发给模型的真实段序。
          recordFinalOrder(state, final);
          return final;
        } catch {
          // 移动 / 记录失败绝不能影响装配结果。
          return downstream;
        }
      },
      { prepend: true },
    ),
  );

  // ── 5. 「人设历史对话」+ 「屏蔽历史注入」（0.1.6 / 0.2.0）──────
  //
  // 两块东西，缺一不可，所以放在同一节里读：
  //
  //   ① `ctx.sessionProjections.register()` —— 一个 host-only 的投影单元，
  //      从**已提交的会话事件**里折出两个判定位：
  //        `injected`        本会话日志里有没有 source.kind === 'persona-history'
  //                          的 user/message（有 = 注入过了）
  //        `hadConversation` 本会话有没有发生过真实对话（assistant/message 才算）
  //      用它而不是在 pre-step 里现扫日志：注册表只订阅一次 `session/event`
  //      并主动驱动 `apply`，冷读还能走检查点。
  //
  //   ② `agent/pre-step` 合并监听器 —— 先按 source.kind 过滤别人追加的历史
  //      注入，再在 `!injected && !hadConversation` 成立时把历史对话放在
  //      `decision.messages` 的第 0 位（见本节末尾）。
  //
  // 0.2.0 起**不再注册 `/persona-history` 命令**：注入本来就是自动的
  // （激活人设锁着历史对话，新会话第一步就带上），命令只是重复了一遍同一件事。
  //
  // `sessionProjections` 用 `ctx.get()` 取，**不进 `inject` 列表**：profile 少挂它
  // 时，本插件的其余功能（人设段、四个抑制开关、工具安全阀）必须照常工作，
  // 而不是整个挂不上。取不到就退化成「现扫会话日志」，并留一行日志。
  const projections = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined;
  if (projections !== undefined && projections !== null && typeof projections.register === 'function') {
    effect(`${PLUGIN_NAME}: 投影单元 ${HISTORY_PROJECTION_KEY}`, () => {
      const disposer = projections.register(historyProjectionDefinition());
      if (typeof disposer !== 'function') {
        throw new TypeError('sessionProjections.register() 没有返回 disposer');
      }
      return disposer;
    });
  } else {
    logToHost(
      ctx,
      `[${PLUGIN_NAME}] 拿不到 sessionProjections 服务，「人设历史对话」的判定退化为现扫会话日志。`,
    );
  }

  /**
   * 按来源过滤掉消息（0.3.4）。
   *
   * 只做**精确匹配**：判据是 `message.source.kind`（以及 runtime 那一类还要看
   * `source.form`，见 {@link isRuntimeBlockSource}），不做任何模糊判断。
   * 顺带按 `会话 → 来源码` 记一笔条数，「输入抑制开关」那张卡要用它说明实际
   * 压掉了什么 —— **只剩一条「作废通知」被放行时不计入**（它没被压掉）。
   * @param {Array<object>} current - 当前消息列表。
   * @param {string|null} sessionId - 本会话 id（记账用）。
   * @param {(source: object|undefined) => boolean} shouldStrip - 这条来源要丢吗。
   * @returns {Array<object>} 过滤后的列表（没丢东西时返回原数组）。
   */
  const stripByKind = (current, sessionId, shouldStrip) => {
    // 0.3.23 顺手：原来 `shouldStrip` 被调两遍（filter 一遍、统计再一遍）。
    // 现在一趟走完 —— 顺手把「丢掉的来源码」收集起来，统计时直接数它们。
    // 判据本身（谁该丢、谁该留、顺序）一个字没变。
    const kept = [];
    const droppedKinds = [];
    for (const message of current) {
      const source = message?.source;
      if (shouldStrip(source)) {
        const kind = source?.kind;
        if (typeof kind === 'string') droppedKinds.push(kind);
      } else {
        kept.push(message);
      }
    }
    if (droppedKinds.length === 0) return current;
    for (const kind of droppedKinds) countStripped(state, sessionId, kind);
    // 0.3.23 修：进程级累计之外，**再按会话记一份** —— 「当前」页显示的是后者。
    const dropped = droppedKinds.length;
    state.strippedMessages += dropped;
    if (typeof sessionId === 'string' && sessionId !== '') {
      boundedRemember(
        state.strippedMessagesBySession,
        sessionId,
        (state.strippedMessagesBySession.get(sessionId) ?? 0) + dropped,
      );
    }
    return kept;
  };

  /** 「屏蔽历史注入」的判据：`kind` 在名单里就丢。 */
  const stripInjectedSource = (source) => {
    const kind = source?.kind;
    return typeof kind === 'string' && STRIPPED_SOURCE_KINDS.includes(kind);
  };

  /**
   * **这个会话**选定人设存下的历史对话正文。**永不抛**：出错时返回空串（= 不注入）。
   * @param {object} state - 本次 mount 的可变状态。
   * @param {string|null} sessionId - 会话 id。
   * @returns {string} 正文或空串。
   */
  const lockedHistoryText = (current, sessionId) => {
    try {
      refresh(current);
      return activeHistoryOf(current.doc, sessionId);
    } catch {
      return '';
    }
  };

  // `{ prepend: true }` 是关键：瀑布里 `next()` 之后的代码是**由内向外**跑的，
  // 注册得越早越靠外。抢到最外层之后，`next()` 之后的代码最后跑，拿到的
  // `decision.messages` 是**所有下游监听器都改完之后**的那一份 ——
  // 「屏蔽历史注入」才过滤得掉别的插件追加的消息，历史对话注入也才能把
  // 自己的消息放在数组第 0 位。只过滤确切的 source.kind，不做任何模糊匹配。
  // 0.3.16 起这里还多一件事：人设换了就让这一步重启请求序列（收敛），
  // 见 `convergeOnPersonaSwitch()`。
  effect(`${PLUGIN_NAME}: agent/pre-step 历史注入过滤 + 人设历史对话注入 + 人设切换收敛`, () =>
    ctx.on(
      'agent/pre-step',
      async ({ agent, signal }, next) => {
        // 0.3.23：与上面两次装配钩子共用**同一个 signal**（宿主每轮新建一个
        // `AbortController`，装配的 context 与这里的载荷拿到的是同一个对象）→
        // 这一轮的三处问盘合并成一次。
        beginStat(state, signal);
        const decision = await next();
        // 不拥有这个决策就原样放行：`kind: 'reject'` 是别的监听器明确的拒绝。
        if (decision === null || typeof decision !== 'object') return decision;
        if (decision.kind === 'reject') return decision;
        if (signal !== undefined && signal !== null && signal.aborted === true) return decision;
        if (!Array.isArray(decision.messages)) return decision;
        let messages = decision.messages;
        const sessionId = sessionIdOf(agent);

        // ⓪ 会话记录（0.2.8）：「新对话发送消息后首轮采样一次并记录」。
        //    这里也覆盖「从没被打开过的旧对话」——它下一轮就跑起来了，
        //    先把自己的设置固定下来，之后别人改全局不会再影响它。
        //    采样发生在装配之后，但采的正是**这一轮装配用的那一层值**，
        //    所以语义完全一致；下一轮起它只跟着自己走。
        //
        //    0.3.25：有父会话的从**父会话的有效层**采样，不再无条件抄全局层。
        //    父 id 直接读 `agent.session.header.parentSession`（此刻 agent 就在
        //    手里，子会话一定是活的，这条永远读得到）。走不到这里的情形 ——
        //    子会话的 agent 一创建就已经被 `agent/created` 采样过了 —— 由那条
        //    更早的路兜住。
        try {
          if (sessionRecordOf(state.doc, sessionId) === null) {
            ensureSessionRecord(state, sessionId, {
              parentId: normalizeSessionId(agent?.session?.header?.parentSession),
            });
          }
        } catch {
          // 采样失败只是「这个会话继续跟随全局」，绝不能让这一轮失败。
        }

        // ① 「屏蔽历史注入」：`dsh-agent-instructions`（AGENTS.md / CLAUDE.md
        //    指令链基线）与 `dsh-time-context`（每步追加的时间读数）不是提示词段，
        //    而是别的插件往历史里追加的 user 角色消息，所以只能按来源过滤。
        //    0.2.8 起按**这个会话**的开关判断。
        if (switchValueOf(state.doc, sessionId, 'stripInjected') === true) {
          try {
            messages = stripByKind(messages, sessionId, stripInjectedSource);
          } catch {
            // 过滤失败必须原样放行：绝不能让一轮对话因为本插件而失败。
          }
        }

        // ①b 「屏蔽 runtime 上下文」：把框在 `<system-reminder>` 里的两块
        //     用户消息也压掉（0.3.4）。
        //
        //     它们（运行时快照 / 技能目录）**不在系统提示词里**，所以
        //     `systemPrompt.suppressRuntimeContext()` 清 `contexts` 那一条对它们
        //     完全无效 —— 与 ① 同理，是别的插件按 user 角色追加的消息，只能在
        //     瀑布最外层按来源过滤。这也是「创造模式下 <system-reminder> 屏不掉」
        //     的真正原因：技能目录只有创造模式有内容（preset 挂了自带技能目录）。
        //
        //     G2（档位 2 的 Q6(a)）：**只丢「内容本身」，放过平台那句
        //     「之前那份已经作废」的通知** —— 判据是 `source.form`，见
        //     `isRuntimeBlockSource()`。以前这里按 `kind` 整类删，于是旧快照
        //     还在、作废通知被删，模型反而拿着过期信息当现况。
        if (switchValueOf(state.doc, sessionId, 'stripRuntime') === true) {
          try {
            messages = stripByKind(messages, sessionId, isRuntimeBlockSource);
          } catch {
            // 过滤失败必须原样放行。
          }
        }

        // ② 「人设历史对话」：一个会话只注入一次，且只在模型还没回过话之前。
        //    注入内容永远是「这个会话选定人设此刻存下的那一份」。
        //
        //    0.3.25：**委派出来的子 agent 不注入**。它继承父的设置与人设词
        //    （那是它按父的编排干活的依据），但「人设历史对话」是给**人**看的
        //    上下文快照 —— 父会话拿它当谈资，子 agent 拿着它只会平白多出一段
        //    与本次委派无关的对话记录，还会永久留在子会话日志里。
        //
        //    判据刻意是 `origin === 'subagent'` 而**不是**「有父会话」：侧栏
        //    「分叉」出来的子对话同样有 `parentSession`，但它是**独立对话**，
        //    要带着自己继承来的那段历史（用户就是为接着聊才分叉的）。两者的
        //    区别正是 DSH 那个 `origin` 字段：`SessionStore.fork()` 只写
        //    `parentSession` + `isSeeded`，而 `childSessionMeta()` 还会多写一个
        //    `origin: 'subagent'`。把这条判据退化成「有父」会把侧栏分叉一起削掉。
        //
        //    ⚠ 这里只管**新注入**，管不住 `subagent_fork` 从父会话日志里
        //    继承下来的那一条：那一条是 fork 时按日志前缀复制进子会话的
        //    **既有事件**，而 `decision.messages` 只是**本步新增**的消息
        //    （`dsh-agent-loop` 的 `inbox.claim()`），它压根不在这里；请求里的
        //    历史由 `session.deriveMessages()` 从会话 surface 重新导出，所以按
        //    来源过滤**够不着它**。要滤掉它只能占 surface 层（消息投影，或一次
        //    `replace` 遮蔽），风险与本版范围都不允许 —— 理由与后续做法写在
        //    `cordis.patch.yml` 的 0.3.25 那一段。
        try {
          const isSubagentChild = agent?.session?.header?.origin === 'subagent';
          const flags = historyFlagsOf(ctx, agent);
          // 拿不到判定位时**宁可不注入**：一次多余的注入会永久留在会话日志里，
          // 而漏掉一次注入的代价只是新开一个对话。
          if (flags !== null && !flags.injected && !flags.hadConversation && !isSubagentChild) {
            const text = lockedHistoryText(state, sessionId);
            if (text.trim() !== '') {
              state.historyInjections += 1;
              messages = [createHistoryMessage(text), ...messages];
            }
          }
        } catch (error) {
          // 注入失败必须原样放行，绝不能让一轮对话因为本插件而失败。
          logToHost(ctx, `[${PLUGIN_NAME}] 历史对话注入失败，已跳过：${error?.message ?? String(error)}`);
        }

        // ③ 「人设切换 → 收敛」（0.3.16）：本会话选定的人设换成另一条了，就让
        //    这一步重启请求序列。`in-history` 路由（deepseek 系声明了
        //    `systemPromptUpdate: 'in-history'`）本来会把**变化后的整份提示词**
        //    追加到历史末尾：缓存友好，但旧人设的指令会一直躺在上下文里、
        //    切几次就叠几份。重启序列则反过来 —— 第 0 号节点换成本步这份新
        //    提示词、后面那些累积的系统节点被清空，代价是这一步从第 0 个 token
        //    起缓存失效。判据与记账时机都写在 `convergeOnPersonaSwitch()` 里。
        //
        //    必须放在 ②「历史对话注入」**之后**：那一步可能往数组前面塞一条消息，
        //    而「这一步会不会真的发请求」看的正是**最终交给 loop 的那一份**
        //    （空 messages 的步骤不会走到 `project()`，不能记成已发出）。
        const converge = convergeOnPersonaSwitch(state, agent, sessionId, messages.length);

        // 别的监听器（例如 `dsh-goal-round-driver`）已经要求重启序列时保持原样。
        const startsRequestSeries = decision.startsRequestSeries === true || converge;
        if (messages === decision.messages && !converge) return decision;
        return {
          ...decision,
          messages,
          ...startsRequestSeries ? { startsRequestSeries: true } : {},
        };
      },
      { prepend: true },
    ),
  );

  // ── 6. 会话被删除 → 顺手清掉它的记录（0.2.8）────────────────────
  //
  // 这里**不把 `api-session/removed` 当成删除**：DSH 在普通卸载（agent 被
  // 回收、Web 重启）时也会发它。真正的判据是「持久化里还在不在」，所以这条
  // 监听只是**触发一次核查**：会话还在 → 一条都不删。
  //
  // 这一条覆盖「热删除」（`dsh-web-mobile` 的删除路由会先把活会话摘下来，
  // 于是会经过这里）；冷删除（会话没活着）由设置页打开时那次 `/gc` 兜住。
  effect(`${PLUGIN_NAME}: api-session/removed 核查会话记录`, () =>
    ctx.on('api-session/removed', (sessionId) => {
      try {
        beginStat(state);
        const id = normalizeSessionId(sessionId);
        if (id === null) return;
        if (sessionRecordOf(state.doc, id) === null) return;
        void reconcileSessionRecords(state, ctx, [id]).catch(() => {});
      } catch {
        // 核查失败不是错：记录留着，下次 /gc 还会来。
      }
    }),
  );

  // G1（档位 2 的 Q5(a)）：**挂载时不再注册任何全局抑制**。
  // 以前这里按全局开关注册一份挂在插件自己 ctx 上的抑制器，而平台的判据是
  // 「全局层有抑制 **或** 本会话有抑制」—— 全局那一份一旦注册，所有会话都被
  // 屏蔽、谁都取消不掉。抑制器一律改成按会话挂（`agent/created` 与装配路径
  // 各同步一次），本会话的开关说什么就是什么。
  //
  // 卸载时释放 runtime 抑制器：它是一条活的注册，不释放会留下一个
  // 谁也叫不醒的抑制器（重装本插件时就会叠加）。
  cleanups.push(() => {
    runtime.agents.clear();
  });
  cleanups.push(() => {
    // I1：卸载前把待落盘的「记小账」写完 —— 这是延后合并写唯一可能丢东西的
    // 时刻（窗口还没到就卸载）。`flushDeferredRecords()` 永不抛。
    //
    // 档位 4（R1）：这里不能 `await`（disposer 是同步的），但**不需要**：
    // `flushDeferredRecords()` 在第一个 await 之前就会调 `commit()`，
    // 而 `commit()` 同步地把这次写排进 `state.writeQueue` —— 排队就是
    // 「不会丢」所需要的那一步，落盘本身在事件循环后面完成。
    flushDeferredRecords(state);
  });
  // 卸载时拆掉所有 per-agent 的 scoped 段与抑制器：它们挂在 `agent.ctx` 上，
  // 不会随本插件卸载自动消失（不拆就会在重装后叠加）。
  cleanups.push(() => {
    for (const sessionId of [...state.agentSections.keys()]) releaseAgentSection(state, sessionId);
    state.handoffs.clear();
    state.agentSections.clear();
    for (const sessionId of [...runtime.agentSuppressors.keys()]) releaseAgentSuppressor(sessionId);
    runtime.agentSuppressors.clear();
  });

  const globalHistory = activeHistoryStatsOf(state.doc, null);
  logToHost(
    ctx,
    `[${PLUGIN_NAME}] 已挂载：数据 ${state.path}；段 ${SECTION_NAME}；全局人设 ${
      activeIdOf(state.doc, null) ?? '（未选择）'
    }；段序 ${state.section.order}（${sectionOrderMode(state.doc, null) === 'follow' ? '追随' : '数值'}）；全局开关 ${
      SWITCH_KEYS.filter((key) => switchValueOf(state.doc, null, key) === true).join(',') || '（全关）'
    }；全局工具可复用 ${toolReusableOf(state.doc, null) ? '开' : '关'}；会话记录 ${
      Object.keys(state.doc.sessions ?? {}).length
    } 条；全局人设存下的历史对话 ${
      globalHistory.found && globalHistory.bytes > 0 ? `${globalHistory.bytes} 字节` : '（无）'
    }`,
  );
}

/**
 * 插件入口。要么全部注册成功，要么一个都不留。
 * @param {object} ctx - Host 插件上下文。
 * @param {object} [config] - 插件配置。
 * @returns {void}
 */
export function apply(ctx, config) {
  const cleanups = [];
  try {
    mount(ctx, config, cleanups);
  } catch (error) {
    const failures = [];
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch (cleanupError) {
        failures.push(cleanupError?.message ?? String(cleanupError));
      }
    }
    cleanups.length = 0;
    logToHost(
      ctx,
      `[${PLUGIN_NAME}] 挂载失败，已回滚全部注册：${error?.message ?? String(error)}` +
        (failures.length > 0 ? `；回滚中另有失败：${failures.join('; ')}` : ''),
    );
  }
}
