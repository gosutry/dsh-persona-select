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
const PLUGIN_NAME = 'dsh-persona-select';
const PLUGIN_VERSION = '0.3.32';
const ROUTE_PREFIX = '/persona-select';
const SECTION_NAME = 'plugin:persona-select';
const HISTORY_PROJECTION_KEY = 'personaSelectHistory';
const PRESET_PROJECTION_KEY = 'agentPreset';
const MAX_BODY_BYTES = 256 * 1024;
const EXPORT_MIMES = new Set(['application/json', 'image/png']);
const MAX_HISTORY_BODY_BYTES = 16 * 1024 * 1024;
const MAX_RECORDED_SECTIONS = 64;
const DEFERRED_WRITE_MS = 250;
const STRIPPED_SOURCE_KINDS = ['agent-instructions', 'time-context'];
const RUNTIME_BLOCK_FORMS = new Map([
  ['runtime-context', 'snapshot'],
  ['skill-catalog', 'catalog'],
]);
function isRuntimeBlockSource(source) {
  if (source === null || source === undefined || typeof source !== 'object') return false;
  const form = RUNTIME_BLOCK_FORMS.get(source.kind);
  return form !== undefined && source.form === form;
}
export const inject = ['webServer', 'connection', 'systemPrompt'];
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}
function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405;
  res.setHeader('allow', allow);
  res.end();
}
function rejected(ctx, req, res) {
  const connection = Reflect.get(ctx, 'connection');
  const rejection = connection.requestRejection(req);
  if (rejection === undefined) return false;
  res.statusCode = rejection;
  res.end();
  return true;
}
function requestUrl(req) {
  return new URL(String(req.url ?? '/'), 'http://localhost');
}
function badRequestBody(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'bad-request-body';
  return error;
}
function bodyTooLarge(maxBytes) {
  const error = new Error(`请求体超过 ${maxBytes} 字节上限：请拆成几次再发`);
  error.status = 413;
  error.code = 'body-too-large';
  return error;
}
function declaredLengthOf(req) {
  const headers = req === null || req === undefined ? undefined : req.headers;
  if (headers === null || headers === undefined || typeof headers !== 'object') return null;
  const raw = headers['content-length'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const size = Number(value);
  return Number.isFinite(size) && size >= 0 ? size : null;
}
function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
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
function safeExportName(raw, mime = '') {
  const flat = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '_')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, 80)
    .replace(/^\.\.?$/, '');
  if (flat !== '') return flat;
  return mime === 'image/png' ? 'persona.png' : 'persona.json';
}
function contentDispositionFor(filename) {
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '') : '';
  return `attachment; filename="dsh-persona${ext === '' ? '' : `.${ext}`}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
const HANDOFF_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const HANDOFF_MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const HANDOFF_MAX_ENTRIES = 4;
const HANDOFF_TTL_MS = 120000;
function pruneHandoffs(table, now) {
  for (const [token, entry] of table) {
    if (entry.expiresAt <= now) table.delete(token);
  }
}
function stashHandoff(table, item) {
  const now = Date.now();
  pruneHandoffs(table, now);
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
  return { token, url: `${ROUTE_PREFIX}/handoff/${token}/${encodeURIComponent(item.filename)}` };
}
function readHandoff(table, token) {
  pruneHandoffs(table, Date.now());
  const entry = table.get(token);
  return entry === undefined ? null : entry;
}
function requestHeader(req, name) {
  const headers = req === null || req === undefined ? undefined : req.headers;
  if (headers === null || headers === undefined) return undefined;
  const value = headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}
const RANGE_UNSATISFIABLE = Symbol('range-unsatisfiable');
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
  if (start >= size) return RANGE_UNSATISFIABLE;
  if (end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}
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
    res.statusCode = 416;
    res.setHeader('content-type', entry.mime);
    res.setHeader('content-disposition', contentDispositionFor(entry.filename));
    res.setHeader('cache-control', 'no-store');
    res.setHeader('accept-ranges', 'bytes');
    res.setHeader('content-range', `bytes */${size}`);
    res.setHeader('x-handoff-served', entry.servedAt === null ? '0' : '1');
    res.setHeader('content-length', '0');
    res.end();
    return;
  }
  const range = parsed;
  if (!head) entry.servedAt = Date.now();
  res.statusCode = range === null ? 200 : 206;
  res.setHeader('content-type', entry.mime);
  res.setHeader('content-disposition', contentDispositionFor(entry.filename));
  res.setHeader('cache-control', 'no-store');
  res.setHeader('accept-ranges', 'bytes');
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
function logToHost(ctx, message) {
  try {
    const logger = ctx === null || ctx === undefined ? undefined : ctx.logger;
    if (logger !== null && logger !== undefined && typeof logger.error === 'function') {
      logger.error(message);
      return;
    }
  } catch {
  }
  try {
    console.error(message);
  } catch {
  }
}
function beginStat(state, owner = null) {
  const scope = owner ?? null;
  if (scope !== null && state.statOwner === scope) return;
  state.statOwner = scope;
  state.statCache = STAT_UNKNOWN;
}
const STAT_UNKNOWN = Symbol('persona-select:stat-unknown');
function statSignature(state) {
  if (state.statCache === STAT_UNKNOWN) state.statCache = fileSignatureOf(state.path);
  return state.statCache;
}
function reload(state, knownSig) {
  try {
    const read = readStoreFile(state.path);
    const warnings = [...read.warnings];
    const doc = read.doc;
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
    state.failedSig = knownSig === undefined ? statSignature(state) : knownSig;
    state.statCache = state.failedSig;
  }
}
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
async function settlePendingMigration(state) {
  const pending = state.migrationPromise;
  if (pending === null || pending === undefined) return;
  try {
    await pending;
  } catch {
  }
}
function refresh(state) {
  const sig = statSignature(state);
  if (state.loaded && sig === state.fileSig) return;
  if (state.failedSig !== null && sig === state.failedSig) return;
  reload(state, sig);
}
const sessionLogCache = new WeakMap();
const HEADER_HISTORY_KEEP = 64;
const toolFingerprints = new WeakMap();
function toolFingerprint(tool) {
  if (tool === null || typeof tool !== 'object') return JSON.stringify(tool) ?? 'undefined';
  const cached = toolFingerprints.get(tool);
  if (cached !== undefined) return cached;
  const next = JSON.stringify(tool) ?? 'undefined';
  toolFingerprints.set(tool, next);
  return next;
}
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
  let headers = canResume ? cached.headers : new Map();
  let historyFound = canResume ? cached.historyFound : false;
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
      headers.set(event.seq, headerTools);
      while (headers.size > HEADER_HISTORY_KEEP) {
        const oldest = headers.keys().next();
        if (oldest.done === true) break;
        headers.delete(oldest.value);
      }
      const redeclared = headerTools.some((tool) => {
        const before = declared.get(tool?.name);
        if (before === undefined) return false;
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
      const data = event?.data ?? {};
      const content = Array.isArray(data.message?.content) ? data.message.content : [];
      if (content.length === 0) continue;
      const definitions = data.headerSeq === undefined ? undefined : headers.get(data.headerSeq);
      for (const block of content) {
        if (block?.type !== 'tool-addition') continue;
        const tool = definitions === undefined
          ? undefined
          : definitions.find((entry) => entry?.name === block.toolName);
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
function baselineToolsOf(session) {
  const state = scanSessionLog(session);
  return state === null ? null : state.tools;
}
function sessionIdOf(agentOrSession) {
  try {
    const session = agentOrSession?.session ?? agentOrSession;
    const id = session?.id ?? session?.header?.id;
    return typeof id === 'string' && id !== '' ? id : null;
  } catch {
    return null;
  }
}
function sessionById(ctx, id) {
  if (typeof id !== 'string' || id === '') return undefined;
  try {
    const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
    const hit = sessions !== undefined && sessions !== null && typeof sessions.get === 'function' ? sessions.get(id) : undefined;
    if (hit !== undefined && hit !== null) return hit;
  } catch {
  }
  try {
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined;
    const agent = agents !== undefined && agents !== null && typeof agents.get === 'function' ? agents.get(id) : undefined;
    const session = agent?.session;
    if (session !== undefined && session !== null) return session;
  } catch {
  }
  return undefined;
}
function importListOf(body) {
  if (body === null || typeof body !== 'object') return null;
  if (Array.isArray(body.personas)) return body.personas.map((raw, index) => ({ index, raw }));
  if (typeof body.name === 'string' || typeof body.text === 'string') return [{ index: 0, raw: body }];
  return null;
}
function emptyFieldOf(name, text) {
  if (name === '') return 'empty-name';
  if (text === '') return 'empty-text';
  return null;
}
const EMPTY_FIELD_MESSAGES = Object.freeze({
  'empty-name': '人设名字不能为空',
  'empty-text': '人设正文不能为空',
});
function personaLimitReached(count) {
  return Number.isFinite(count) && count >= MAX_PERSONAS;
}
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
function layerFor(state, rawSession) {
  const id = normalizeSessionId(rawSession);
  if (id !== null && sessionRecordOf(state.doc, id) !== null) return { kind: 'session', id };
  return { kind: 'global', id: null };
}
async function writeLayer(state, layer, now, mutate) {
  const derive = () => {
    if (layer.kind === 'global') {
      const next = { ...state.doc };
      mutate(next);
      return next;
    }
    const base = sessionRecordOf(state.doc, layer.id) ?? sampledRecord(state.doc, now);
    const record = { ...base, updatedAt: now };
    mutate(record);
    return withSessionRecord(state.doc, layer.id, record);
  };
  await saveWithRetry(state, () => commit(state, derive()));
}
function parentSessionIdOf(ctx, sessionId, body) {
  const fromBody = normalizeSessionId(body?.parent);
  if (fromBody !== null) return fromBody;
  try {
    return normalizeSessionId(sessionById(ctx, sessionId)?.header?.parentSession);
  } catch {
    return null;
  }
}
function bodyKnowsParent(body) {
  return body !== null && typeof body === 'object' && Object.hasOwn(body, 'parent');
}
function ensureSessionRecord(state, sessionId, options = {}) {
  const { afterAssembly = true, parentId = null } = options;
  try {
    refresh(state);
    const id = normalizeSessionId(sessionId);
    if (id === null) return false;
    if (sessionRecordOf(state.doc, id) !== null) return false;
    const now = Date.now();
    const record = sampledRecordFrom(state.doc, parentId, now);
    if (!afterAssembly) delete record.promptPersonaId;
    deferSessionRecord(state, id, record);
    return true;
  } catch {
    return false;
  }
}
function sessionHasContent(ctx, sessionId) {
  try {
    const session = sessionById(ctx, sessionId);
    const state = scanSessionLog(session);
    if (state === null) return false;
    return state.hadConversation || state.hasUserContent;
  } catch {
    return false;
  }
}
function archivedSessionIdsOf(ctx) {
  try {
    const registry = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : undefined;
    const ids = registry?.archivedSessionIds;
    return new Set(Array.isArray(ids) ? ids.map((id) => String(id)) : []);
  } catch {
    return new Set();
  }
}
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
const lastSurfaceGeneration = new WeakMap();
const personaInRequest = new WeakMap();
const personaRendered = new WeakMap();
function noteRenderedPersona(state, agent, sessionId) {
  try {
    if (agent === null || typeof agent !== 'object') return;
    if (typeof sessionId !== 'string' || sessionId === '') return;
    personaRendered.set(agent, activeIdOf(state.doc, sessionId));
  } catch {
  }
}
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
function rememberPromptPersona(state, sessionId, id) {
  try {
    if (typeof sessionId !== 'string' || sessionId === '') return;
    const record = sessionRecordOf(state.doc, sessionId);
    if (record === null) return;
    if (record.promptPersonaId === id) return;
    deferSessionRecord(state, sessionId, { ...record, promptPersonaId: id });
  } catch {
  }
}
function convergeOnPersonaSwitch(state, agent, sessionId, outgoing) {
  try {
    if (agent === null || typeof agent !== 'object') return false;
    const rendered = personaRendered.get(agent);
    if (rendered === undefined) return false;
    const record = typeof sessionId === 'string' && sessionId !== '' ? sessionRecordOf(state.doc, sessionId) : null;
    const durable = record === null ? undefined : record.promptPersonaId;
    const before = durable !== undefined ? durable : personaInRequest.get(agent);
    if (outgoing > 0) {
      personaInRequest.set(agent, rendered);
      if (durable !== rendered) rememberPromptPersona(state, sessionId, rendered);
    }
    const switched = before !== undefined && before !== rendered;
    if (switched && outgoing > 0) rememberPersonaSwitched(state, sessionId);
    return switched;
  } catch {
    return false;
  }
}
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
function recordFinalOrder(state, assembly) {
  const sections = Array.isArray(assembly?.sections) ? assembly.sections : [];
  state.assembly.lastOrder = sections
    .slice(0, MAX_RECORDED_SECTIONS)
    .map((section) => String(section?.name ?? ''));
  state.assembly.lastOrderCount = sections.length;
}
function totalChars(sections) {
  let total = 0;
  for (const section of sections) total += String(section?.text ?? '').length;
  return total;
}
function currentText(state, sessionId = null) {
  try {
    refresh(state);
    return activeTextOf(state.doc, sessionId);
  } catch {
    return '';
  }
}
function enqueueWrite(state, task) {
  const run = state.writeQueue.then(task, task);
  state.writeQueue = run.then(() => {}, () => {});
  return run;
}
async function saveWithRetry(state, attempt) {
  try {
    return await attempt();
  } catch (error) {
    if (error?.code !== 'stale-baseline') throw error;
    refresh(state);
    return attempt();
  }
}
async function commit(state, nextDoc, baseDoc = state.doc) {
  const previousPersonaCount = Array.isArray(baseDoc?.personas)
    ? baseDoc.personas.length
    : null;
  await enqueueWrite(state, async () => {
    if (state.doc !== baseDoc) {
      const error = new Error('这次保存依据的是旧的内存快照，已放弃，请重试');
      error.code = 'stale-baseline';
      error.status = 409;
      throw error;
    }
    const written = await writeStoreFile(state.path, nextDoc, previousPersonaCount);
    state.doc = written.doc;
    state.error = null;
    state.loaded = true;
    if (written.fileChangedByOther) {
      state.fileSig = null;
      state.statCache = STAT_UNKNOWN;
      state.failedSig = null;
      reload(state);
      return;
    }
    state.fileSig = fileSignatureOf(state.path);
    state.statCache = state.fileSig;
    state.failedSig = null;
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
function deferSessionRecord(state, sessionId, record) {
  const id = normalizeSessionId(sessionId);
  if (id === null) return false;
  state.doc = withSessionRecord(state.doc, id, record);
  state.deferredRecords.set(id, record);
  if (state.deferredTimer === null) {
    state.deferredTimer = setTimeout(() => {
      state.deferredTimer = null;
      flushDeferredRecords(state).catch(() => {});
    }, DEFERRED_WRITE_MS);
    if (typeof state.deferredTimer.unref === 'function') state.deferredTimer.unref();
  }
  return true;
}
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
      refresh(state);
      let next = state.doc;
      for (const [id, record] of pending) next = withSessionRecord(next, id, record);
      return commit(state, next);
    });
  } catch {
  }
}
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
      }
    }
    const disposer = ctx.effect(
      () =>
        ctx.systemPrompt.section({
          name: SECTION_NAME,
          order,
          interpolate: false,
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
      }
    }
    const scoped = agent.ctx;
    if (scoped === undefined || scoped === null || scoped.systemPrompt === undefined) return;
    const register = (order) =>
      scoped.systemPrompt.section({
        name: SECTION_NAME,
        order,
        interpolate: false,
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
    logToHost(ctx, `[${PLUGIN_NAME}] per-agent 段序注册失败：${error?.message ?? String(error)}`);
    rememberNotice('这个对话的人设段没有排到正确位置（段序注册失败）。');
  }
}
function releaseAgentSection(state, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return;
  const current = state.agentSections.get(sessionId);
  if (current === undefined) return;
  state.agentSections.delete(sessionId);
  try {
    current.disposer();
  } catch {
  }
}
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
function indicatorOf(findings) {
  const first = Array.isArray(findings) ? findings[0] : undefined;
  if (first === undefined) return { color: 'green', reason: 'ok' };
  return { color: first.color, reason: first.code };
}
const COLLAPSING_PRESET_IDS = new Set(['minimal']);
const PRESET_PROBE_TTL_MS = 5 * 60 * 1000;
function rememberPresetId(state, sessionId, presetId) {
  boundedRemember(state.presetBySession, sessionId, presetId);
}
function presetIdOfSession(state, ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return null;
  try {
    const live = projectedPresetOf(ctx, sessionById(ctx, sessionId));
    if (live !== null) {
      rememberPresetId(state, sessionId, live);
      return live;
    }
  } catch {
  }
  return state.presetBySession.get(sessionId) ?? null;
}
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
        value = false;
      }
      state.presetProbe.delete(presetId);
      boundedRemember(state.presetCollapse, presetId, { value, at: Date.now() });
    })();
  }
  return cached !== undefined && cached.value === true;
}
const MAX_REMEMBERED_SESSIONS = 200;
function boundedRemember(map, key, value, limit = MAX_REMEMBERED_SESSIONS) {
  map.delete(key);
  if (typeof map.set === 'function') map.set(key, value);
  else map.add(key);
  while (map.size > limit) map.delete(map.keys().next().value);
}
function rememberBaseline(state, id, baseline) {
  if (typeof id !== 'string' || id === '') return;
  boundedRemember(state.observed, id, baseline);
}
function rememberPersonaDropped(state, id) {
  if (typeof id !== 'string' || id === '') return;
  boundedRemember(state.personaDropped, id, id);
}
function forgetPersonaDropped(state, id) {
  if (typeof id !== 'string' || id === '') return;
  state.personaDropped.delete(id);
}
function personaDroppedOf(state, id) {
  if (typeof id !== 'string' || id === '') return false;
  return state.personaDropped.has(id);
}
function rememberPersonaSwitched(state, id) {
  if (typeof id !== 'string' || id === '') return;
  boundedRemember(state.personaSwitched, id, id);
}
function personaSwitchedOf(state, id) {
  if (typeof id !== 'string' || id === '') return false;
  return state.personaSwitched.has(id);
}
function countStripped(state, id, kind) {
  if (typeof id !== 'string' || id === '') return;
  const record = state.stripStats.get(id) ?? {};
  record[kind] = (record[kind] ?? 0) + 1;
  boundedRemember(state.stripStats, id, record);
}
function stripStatsOf(state, id) {
  if (typeof id !== 'string' || id === '') return {};
  return { ...(state.stripStats.get(id) ?? {}) };
}
function strippedMessagesOf(state, id) {
  if (typeof id !== 'string' || id === '') return null;
  const count = state.strippedMessagesBySession.get(id);
  return typeof count === 'number' ? count : 0;
}
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
function rememberAssembly(state, sessionId, patch) {
  const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : '';
  boundedRemember(state.assemblyBySession, key, {
    ...NO_ASSEMBLY_READINGS,
    ...(state.assemblyBySession.get(key) ?? {}),
    ...patch,
  });
  Object.assign(state.assembly, patch);
}
const NO_ASSEMBLY_READINGS = Object.freeze({
  appliedAt: null,
  droppedAt: null,
  assembledAt: null,
  before: null,
  after: null,
  toolBaseline: null,
  toolStripHeld: false,
  toolStripHeldReason: null,
});
function assemblyForSession(state, wantSession) {
  if (typeof wantSession !== 'string' || wantSession === '') {
    return {
      appliedAt: state.assembly.appliedAt,
      droppedAt: state.assembly.droppedAt,
      assembledAt: state.assembly.assembledAt,
      before: state.assembly.before,
      after: state.assembly.after,
      toolBaseline: state.assembly.toolBaseline,
      toolStripHeld: state.assembly.toolStripHeld,
      toolStripHeldReason: state.assembly.toolStripHeldReason,
    };
  }
  return state.assemblyBySession.get(wantSession) ?? NO_ASSEMBLY_READINGS;
}
const hostNotices = new Map();
const HOST_NOTICE_CAP = 50;
let hostNoticeEvicted = false;
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
const HOST_NOTICE_OVERFLOW_NOTE = `需要注意的情况太多了：这里只保留最近 ${HOST_NOTICE_CAP} 条，更早的已被新提醒顶掉。`;
function hostNoticesOf() {
  const out = [...hostNotices.keys()];
  if (hostNoticeEvicted) out.push(HOST_NOTICE_OVERFLOW_NOTE);
  return out;
}
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
const REPLACEMENT_CHAR = '\uFFFD';
function hasReplacementChars(text) {
  return typeof text === 'string' && text.indexOf(REPLACEMENT_CHAR) !== -1;
}
function viewOf(state, ctx, sessionId) {
  try {
    syncSection(state, ctx);
  } catch (error) {
    logToHost(ctx, `[${PLUGIN_NAME}] 段序同步失败：${error?.message ?? String(error)}`);
    rememberNotice('界面报的段序可能与实际注册的不一致（同步失败）。');
  }
  const wantSession = typeof sessionId === 'string' && sessionId !== '' ? sessionId : null;
  const { personas } = mergeView(state.doc);
  const activeId = activeIdOf(state.doc, wantSession);
  const activeFound = activeFoundOf(state.doc, wantSession);
  const historyAudit = [];
  auditHistoryFileOf(state.doc, activeId, historyAudit);
  const pendingRecords = state.deferredRecords.size;
  if (pendingRecords > 0) {
    logToHost(ctx, `[${PLUGIN_NAME}] 还有 ${pendingRecords} 条会话记账没落盘`);
  }
  const seen = baselineForSession(state, ctx, typeof sessionId === 'string' ? sessionId : '');
  const mismatch = historyMismatchOf(state, ctx, seen.sessionId);
  const dropped = personaDroppedOf(state, wantSession);
  const own = assemblyForSession(state, typeof sessionId === 'string' ? sessionId : '');
  const minimalMode = presetCollapses(state, ctx, presetIdOfSession(state, ctx, wantSession));
  const notCarried = historyNotCarriedOf(
    state, ctx, seen.sessionId, personaSwitchedOf(state, seen.sessionId),
  );
  const findings = findingsOf(state, seen.baseline, wantSession, mismatch, dropped, minimalMode, notCarried);
  return {
    ok: true,
    plugin: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    path: state.path,
    session: { hasRecord: sessionInfoOf(state.doc, wantSession).hasRecord },
    pendingRecords,
    global: {
      activeId: activeIdOf(state.doc, null),
      found: activeFoundOf(state.doc, null),
      switches: Object.fromEntries(SWITCH_KEYS.map((key) => [key, switchValueOf(state.doc, null, key)])),
      [TOOL_REUSABLE_KEY]: toolReusableOf(state.doc, null),
    },
    section: {
      name: SECTION_NAME,
      orderConfigured: state.configuredOrder,
      orderDefault: DEFAULT_SECTION_ORDER,
      orderFollow: FOLLOW_SECTION_ORDER,
      appliedAt: own.appliedAt,
      droppedAt: own.droppedAt,
      assembledAt: own.assembledAt,
      assemblies: state.assembly.count,
      lastOrder: state.assembly.lastOrder,
      lastOrderCount: state.assembly.lastOrderCount,
      before: own.before,
      after: own.after,
      toolBaseline: own.toolBaseline,
      sessionBaseline: seen.baseline,
      sessionId: seen.sessionId,
      indicator: indicatorOf(findings),
      indicators: findings,
      minimalMode,
      toolStripHeld: own.toolStripHeld,
      toolStripHeldReason: own.toolStripHeldReason,
      historyInjections: state.historyInjections,
    },
    switches: Object.fromEntries(SWITCH_KEYS.map((key) => [key, switchValueOf(state.doc, wantSession, key)])),
    [TOOL_REUSABLE_KEY]: toolReusableOf(state.doc, wantSession),
    strippedMessages: strippedMessagesOf(state, wantSession),
    strippedMessagesTotal: state.strippedMessages,
    stripStats: stripStatsOf(state, wantSession),
    activeId,
    activeFound,
    personas: personas.map((entry) => ({
      id: entry.id,
      name: entry.name,
      builtin: entry.builtin,
      ...textStatsOf(state, entry),
      order: entry.sectionOrder ?? null,
      historyLockedAt: entry.history?.lockedAt ?? null,
    })),
    limits: { maxName: MAX_NAME_LENGTH, maxText: MAX_TEXT_LENGTH },
    error: state.error,
    warnings: uniqueWarnings([
      ...state.warnings,
      ...textLimitWarnings(state.doc),
      ...storeNoticesOf(),
      ...hostNoticesOf(),
      ...historyAudit,
    ]),
  };
}
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
      historyBytes: historySizeOf(history).bytes,
      historyChars: historySizeOf(history).chars,
    };
    cache.set(entry.id, stats);
  }
  return stats;
}
const HISTORY_OPEN = 'CONTEXT_ROAD:';
const HISTORY_CLOSE = 'CONTINUE_CONTEXT.';
const HISTORY_FRAME_OPEN = '<system-reminder>';
const HISTORY_FRAME_CLOSE = '</system-reminder>';
const HISTORY_FRAME_ESCAPE = '<\\/system-reminder>';
function renderHistoryBlock(text) {
  const body = typeof text === 'string' ? text.split(HISTORY_FRAME_CLOSE).join(HISTORY_FRAME_ESCAPE) : '';
  return `${HISTORY_FRAME_OPEN}\n${HISTORY_OPEN}\n\n${body}\n\n${HISTORY_CLOSE}\n${HISTORY_FRAME_CLOSE}`;
}
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
function isPersonaHistorySource(source) {
  return source?.kind === PERSONA_HISTORY_SOURCE_KIND;
}
function createHistoryMessage(text) {
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: renderHistoryBlock(text) }],
    source: { kind: PERSONA_HISTORY_SOURCE_KIND, form: 'snapshot', version: 1 },
  });
}
function historyProjectionDefinition() {
  return {
    key: HISTORY_PROJECTION_KEY,
    stateVersion: 1,
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
        return state.hadConversation ? state : { ...state, hadConversation: true };
      }
      return state;
    },
  };
}
function scanHistoryFlags(session) {
  const state = scanSessionLog(session);
  if (state === null) return null;
  return { injected: state.historyFound, hadConversation: state.hadConversation };
}
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
  }
  return scanHistoryFlags(agent?.session);
}
const LEGACY_HISTORY_TAGS = ['<persona-history>', '</persona-history>'];
const LEGACY_HISTORY_PREAMBLE = [
  '以下是本会话开始之前，你与用户之间已经发生过的对话记录。',
  '把它当作已经发生的事实延续下去；不要复述本段说明，也不要向用户确认收到。',
];
function canonicalHistoryText(text) {
  let out = typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
  out = out.split(HISTORY_FRAME_ESCAPE).join(HISTORY_FRAME_CLOSE);
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
function injectedHistoryOf(session) {
  const state = scanSessionLog(session);
  return state === null ? null : state.historyText;
}
function canonicalHistoryCached(state, sessionId, text) {
  const size = activeHistoryStatsOf(state.doc, sessionId);
  const key = `${sessionId}\u0000${size.lockedAt ?? ''}\u0000${size.chars}\u0000${size.bytes}\u0000${text.length}`;
  const hit = state.canonicalCache.get(key);
  if (hit !== undefined) return hit;
  const value = canonicalHistoryText(text);
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
function historyNotCarriedOf(state, ctx, sessionId, switched) {
  try {
    if (switched !== true) return false;
    if (typeof sessionId !== 'string' || sessionId === '') return false;
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
function mount(ctx, config, cleanups) {
  const configuredOrder = Number(config?.sectionOrder);
  const state = {
    path: storePath(),
    doc: emptyStore(),
    fileSig: null,
    statCache: STAT_UNKNOWN,
    statOwner: null,
    failedSig: null,
    loaded: false,
    error: null,
    warnings: [],
    stats: null,
    canonicalCache: new Map(),
    configuredOrder: Number.isFinite(configuredOrder) ? configuredOrder : DEFAULT_SECTION_ORDER,
    section: { order: null, disposer: null },
    assembly: {
      appliedAt: null,
      droppedAt: null,
      assembledAt: null,
      count: 0,
      lastOrder: [],
      lastOrderCount: 0,
      before: null,
      after: null,
      toolBaseline: null,
      sessionId: null,
      toolStripHeld: false,
      toolStripHeldReason: null,
    },
    assemblyBySession: new Map(),
    deferredRecords: new Map(),
    deferredTimer: null,
    writeQueue: Promise.resolve(),
    migrationScheduled: false,
    migrationPromise: null,
    observed: new Map(),
    presetBySession: new Map(),
    presetCollapse: new Map(),
    presetProbe: new Set(),
    strippedMessages: 0,
    strippedMessagesBySession: new Map(),
    personaDropped: new Set(),
    personaSwitched: new Set(),
    stripStats: new Map(),
    historyInjections: 0,
    agentSections: new Map(),
    handoffs: new Map(),
  };
  reload(state);
  const runtime = { agents: new Map(), agentSuppressors: new Map() };
  const effect = (label, factory) => {
    const disposer = ctx.effect(factory, label);
    if (typeof disposer !== 'function') {
      throw new TypeError(`ctx.effect(${JSON.stringify(label)}) 没有返回 disposer`);
    }
    cleanups.push(disposer);
  };
  function syncAgentSuppressor(state, agent) {
    try {
      if (agent === null || typeof agent !== 'object') return;
      const sessionId = sessionIdOf(agent);
      if (sessionId === null) return;
      if (runtime.agents.get(sessionId) !== agent) runtime.agents.set(sessionId, agent);
      if (runtime.agents.size > MAX_REMEMBERED_SESSIONS) pruneDeadAgents(state, ctx);
      const wanted = switchValueOf(state.doc, sessionId, 'stripRuntime') === true;
      let held = runtime.agentSuppressors.get(sessionId);
      if (held !== undefined && held.agent !== agent) {
        runtime.agentSuppressors.delete(sessionId);
        if (held.disposer !== null) {
          try {
            held.disposer();
          } catch {
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
    }
  }
  function pruneDeadAgents(state, ctx) {
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined;
    if (agents === undefined || agents === null || typeof agents.get !== 'function') return 0;
    let removed = 0;
    for (const sessionId of [...runtime.agents.keys()]) {
      if (agents.get(sessionId) !== undefined) continue;
      runtime.agents.delete(sessionId);
      releaseAgentSection(state, sessionId);
      removed += 1;
    }
    return removed;
  }
  function syncAllSuppressors(state) {
    for (const agent of [...runtime.agents.values()]) syncAgentSuppressor(state, agent);
  }
  function releaseAgentSuppressor(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') return;
    const held = runtime.agentSuppressors.get(sessionId);
    runtime.agentSuppressors.delete(sessionId);
    if (held === undefined || held.disposer === null) return;
    try {
      held.disposer();
    } catch {
    }
  }
  effect(`${PLUGIN_NAME}: 取件表定时清理`, () => {
    const timer = setInterval(() => {
      try {
        pruneHandoffs(state.handoffs, Date.now());
      } catch {
      }
    }, HANDOFF_TTL_MS);
    if (typeof timer.unref === 'function') timer.unref();
    return () => clearInterval(timer);
  });
  const ROUTES = new Map([
    [`${ROUTE_PREFIX}/state`, ['GET']],
    [`${ROUTE_PREFIX}/persona`, ['GET']],
    [`${ROUTE_PREFIX}/save`, ['PUT']],
    [`${ROUTE_PREFIX}/resident`, ['PUT']],
    [`${ROUTE_PREFIX}/gc`, ['PUT']],
    [`${ROUTE_PREFIX}/import`, ['PUT']],
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
        if (
          (req.method === 'GET' || req.method === 'HEAD')
          && url.pathname.startsWith(`${ROUTE_PREFIX}/handoff/`)
        ) {
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
          beginStat(state);
          refresh(state);
          await settlePendingMigration(state);
          const askedSession = url.searchParams.get('session') ?? '';
          if (url.pathname === `${ROUTE_PREFIX}/state`) {
            const payload = JSON.stringify(viewOf(state, ctx, askedSession));
            const etag = `"${createHash('sha1').update(payload).digest('hex')}"`;
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            res.setHeader('etag', etag);
            const ifNoneMatch = req !== null && typeof req === 'object' && req.headers !== null
              && typeof req.headers === 'object'
              ? req.headers['if-none-match']
              : undefined;
            if (ifNoneMatch === etag) {
              res.statusCode = 304;
              res.end();
              return;
            }
            res.end(payload);
            return;
          }
          if (url.pathname === `${ROUTE_PREFIX}/persona`) {
            const id = url.searchParams.get('id') ?? '';
            const text = personaTextOf(state.doc, id);
            const history = personaHistoryOf(state.doc, id);
            const historyAudit = [];
            auditHistoryFileOf(state.doc, id, historyAudit);
            for (const note of historyAudit) rememberNotice(note);
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
            let orderValue = null;
            if (hasOrder) {
              const verdict = acceptSectionOrder(body.sectionOrder);
              if (!verdict.ok) {
                sendJson(res, 400, { ok: false, code: verdict.code, message: verdict.message });
                return;
              }
              orderValue = verdict.value;
            }
            let historyValue = null;
            let historyClear = false;
            if (hasHistory) {
              if (body.historyClear === true || typeof body.history !== 'string' || body.history.trim() === '') {
                historyClear = true;
              } else {
                historyValue = normalizeHistory({ text: body.history, lockedAt: now });
              }
            }
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
            const plan = (base) => {
              const next = { ...base };
              const saved = [];
              const personas = [...next.personas];
              let index = rawId === '' ? -1 : personas.findIndex((entry) => entry.id === rawId);
              if (index === -1 && !hasPersona) {
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
              if (hasOrder || hasHistory) {
                const entry = { ...personas[index], updatedAt: now };
                if (hasOrder) {
                  entry.sectionOrder = orderValue;
                  saved.push('order');
                }
                if (hasHistory) {
                  entry.history = historyClear || historyValue === null
                    ? null
                    : { text: historyValue.text, lockedAt: historyValue.lockedAt };
                  saved.push('history');
                }
                personas[index] = entry;
              }
              next.personas = personas;
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
                const error = new Error(planned.error.message);
                error.code = planned.error.code;
                error.status = planned.error.status;
                throw error;
              }
              await commit(state, planned.next);
              outcome = planned;
            });
            const { saved, id, layer, activating } = outcome;
            try {
              syncSection(state, ctx);
            } catch (error) {
              logToHost(ctx, `[${PLUGIN_NAME}] 保存后同步段序失败：${error?.message ?? String(error)}`);
            }
            sendJson(res, 200, {
              ok: true,
              saved,
              id,
              layer: activating ? layer.kind : null,
              warnings: textLimitWarnings(state.doc),
            });
            return;
          }
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
          if (url.pathname === `${ROUTE_PREFIX}/import`) {
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
            const plan = (base) => {
              const personas = [...base.personas];
              const ids = [];
              const skipped = [];
              incoming.forEach(({ index, raw }) => {
                if (personaLimitReached(personas.length)) {
                  skipped.push({ index, code: 'limit' });
                  return;
                }
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
            if (id.trim() === '') {
              sendJson(res, 400, {
                ok: false,
                code: 'empty-request',
                message: '没有带人设编号：这条路由只认查询串，例如 delete?id=p-xxxx',
              });
              return;
            }
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
            const touched = [];
            for (const key of SWITCH_KEYS) if (Object.hasOwn(body, key)) touched.push(key);
            if (Object.hasOwn(body, TOOL_REUSABLE_KEY)) touched.push(TOOL_REUSABLE_KEY);
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
            await writeLayer(state, layer, now, (target) => {
              for (const key of SWITCH_KEYS) {
                if (Object.hasOwn(body, key)) target[key] = body[key] === true;
              }
              if (Object.hasOwn(body, TOOL_REUSABLE_KEY)) {
                target[TOOL_REUSABLE_KEY] = body[TOOL_REUSABLE_KEY] !== false;
              }
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
          if (url.pathname === `${ROUTE_PREFIX}/active`) {
            const body = await readJsonBody(req);
            const rawId = typeof body.id === 'string' ? body.id : '';
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
            await writeLayer(state, layer, now, (target) => {
              target.activeId = isOff ? null : rawId;
            });
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
          logToHost(ctx, `[${PLUGIN_NAME}] 路由声明了但没有处理分支：${req.method} ${url.pathname}`);
          sendJson(res, 500, {
            ok: false,
            code: 'route-not-wired',
            message: `这条路由没有接线：${url.pathname}`,
          });
        } catch (error) {
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
  effect(`${PLUGIN_NAME}: system-prompt/assemble 观察 + 仅加载人设`, () =>
    ctx.on(
      'system-prompt/assemble',
      async (assembly, context, next) => {
        const downstream = await next();
        let rewritten = downstream;
        try {
          beginStat(state, context?.signal);
          const sections = Array.isArray(downstream?.sections)
            ? downstream.sections
            : Array.isArray(assembly?.sections)
              ? assembly.sections
              : [];
          const agentForSession = context?.agent;
          const sessionId = sessionIdOf(agentForSession);
          const text = currentText(state, sessionId);
          try {
            syncSection(state, ctx);
            ensureAgentSection(state, ctx, agentForSession);
            syncAgentSuppressor(state, agentForSession);
          } catch {
          }
          const wanted = text !== '';
          state.assembly.count += 1;
          const assembledAt = Date.now();
          if (wanted) {
            const present = sections.some(
              (section) => section?.name === SECTION_NAME && String(section.text ?? '').trim() !== '',
            );
            if (present) {
              rememberAssembly(state, sessionId, { assembledAt, appliedAt: assembledAt, droppedAt: null });
              forgetPersonaDropped(state, sessionId);
            } else {
              rememberAssembly(state, sessionId, { assembledAt, droppedAt: assembledAt });
              rememberPersonaDropped(state, sessionId);
            }
          } else {
            rememberAssembly(state, sessionId, { assembledAt, appliedAt: null, droppedAt: null });
            forgetPersonaDropped(state, sessionId);
          }
          const baselineState = toolBaselineState(agentForSession);
          state.assembly.sessionId = sessionId;
          rememberAssembly(state, sessionId, { toolBaseline: baselineState });
          rememberBaseline(state, sessionId, baselineState);
          if (switchValueOf(state.doc, sessionId, 'stripTools') === true) {
            const reusable = toolReusableOf(state.doc, sessionId);
            const restart = reusable ? seriesRestartRisk(agentForSession) : false;
            if (reusable && (baselineState === 'none' || restart)) {
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
              rememberAssembly(state, sessionId, { before, after });
              rewritten = { ...rewritten, sections: solo };
            } else {
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
          rewritten = downstream;
        }
        return rewritten;
      },
    ),
  );
  syncSection(state, ctx);
  cleanups.push(() => {
    if (state.section.disposer !== null) {
      try {
        state.section.disposer();
      } catch {
      }
      state.section.disposer = null;
    }
  });
  effect(`${PLUGIN_NAME}: agent/created 建立 scoped 段与 runtime 抑制器`, () =>
    ctx.on('agent/created', ({ agent }) => {
      try {
        beginStat(state);
        refresh(state);
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
      }
    }),
  );
  effect(`${PLUGIN_NAME}: agent/disposed 回收 scoped 覆盖`, () =>
    ctx.on('agent/disposed', ({ agent }) => {
      const sessionId = sessionIdOf(agent);
      releaseAgentSection(state, sessionId);
      releaseAgentSuppressor(sessionId);
      if (typeof sessionId === 'string' && sessionId !== '') {
        state.assemblyBySession.delete(sessionId);
        runtime.agents.delete(sessionId);
        state.personaDropped.delete(sessionId);
      }
    }),
  );
  void reconcileSessionRecords(state, ctx).catch(() => {});
  effect(`${PLUGIN_NAME}: 追随模式保持段在末尾 + 记录最终段序`, () =>
    ctx.on(
      'system-prompt/assemble',
      async (assembly, context, next) => {
        const downstream = await next();
        try {
          beginStat(state, context?.signal);
          refresh(state);
          const sessionId = sessionIdOf(context?.agent);
          const final = sectionOrderMode(state.doc, sessionId) === 'follow' ? moveOwnSectionLast(downstream) : downstream;
          recordFinalOrder(state, final);
          return final;
        } catch {
          return downstream;
        }
      },
      { prepend: true },
    ),
  );
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
  const stripByKind = (current, sessionId, shouldStrip) => {
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
  const stripInjectedSource = (source) => {
    const kind = source?.kind;
    return typeof kind === 'string' && STRIPPED_SOURCE_KINDS.includes(kind);
  };
  const lockedHistoryText = (current, sessionId) => {
    try {
      refresh(current);
      return activeHistoryOf(current.doc, sessionId);
    } catch {
      return '';
    }
  };
  effect(`${PLUGIN_NAME}: agent/pre-step 历史注入过滤 + 人设历史对话注入 + 人设切换收敛`, () =>
    ctx.on(
      'agent/pre-step',
      async ({ agent, signal }, next) => {
        beginStat(state, signal);
        const decision = await next();
        if (decision === null || typeof decision !== 'object') return decision;
        if (decision.kind === 'reject') return decision;
        if (signal !== undefined && signal !== null && signal.aborted === true) return decision;
        if (!Array.isArray(decision.messages)) return decision;
        let messages = decision.messages;
        const sessionId = sessionIdOf(agent);
        try {
          if (sessionRecordOf(state.doc, sessionId) === null) {
            ensureSessionRecord(state, sessionId, {
              parentId: normalizeSessionId(agent?.session?.header?.parentSession),
            });
          }
        } catch {
        }
        if (switchValueOf(state.doc, sessionId, 'stripInjected') === true) {
          try {
            messages = stripByKind(messages, sessionId, stripInjectedSource);
          } catch {
          }
        }
        if (switchValueOf(state.doc, sessionId, 'stripRuntime') === true) {
          try {
            messages = stripByKind(messages, sessionId, isRuntimeBlockSource);
          } catch {
          }
        }
        try {
          const isSubagentChild = agent?.session?.header?.origin === 'subagent';
          const flags = historyFlagsOf(ctx, agent);
          if (flags !== null && !flags.injected && !flags.hadConversation && !isSubagentChild) {
            const text = lockedHistoryText(state, sessionId);
            if (text.trim() !== '') {
              state.historyInjections += 1;
              messages = [createHistoryMessage(text), ...messages];
            }
          }
        } catch (error) {
          logToHost(ctx, `[${PLUGIN_NAME}] 历史对话注入失败，已跳过：${error?.message ?? String(error)}`);
        }
        const converge = convergeOnPersonaSwitch(state, agent, sessionId, messages.length);
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
  effect(`${PLUGIN_NAME}: api-session/removed 核查会话记录`, () =>
    ctx.on('api-session/removed', (sessionId) => {
      try {
        beginStat(state);
        const id = normalizeSessionId(sessionId);
        if (id === null) return;
        if (sessionRecordOf(state.doc, id) === null) return;
        void reconcileSessionRecords(state, ctx, [id]).catch(() => {});
      } catch {
      }
    }),
  );
  cleanups.push(() => {
    runtime.agents.clear();
  });
  cleanups.push(() => {
    flushDeferredRecords(state);
  });
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
