import {
  copyFileSync,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
const STORE_VERSION = 3;
const HISTORY_DIR = 'history';
const HISTORY_FILE_PATTERN = /^[A-Za-z0-9:_-]{1,80}\.txt$/;
const MIGRATION_BACKUP_SUFFIX = '.v2-backup';
const MAX_SESSION_RECORDS = 500;
export const MAX_NAME_LENGTH = 40;
export const MAX_TEXT_LENGTH = 20000;
export const MAX_PERSONAS = 200;
export const PERSONA_HISTORY_SOURCE_KIND = 'persona-history';
export function normalizeHistory(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  if (typeof raw.text === 'string') {
    const flat = raw.text.replace(/\r\n?/g, '\n').trim();
    if (flat === '') return null;
    return {
      ...raw,
      text: flat,
      lockedAt: Number.isFinite(raw.lockedAt) ? Number(raw.lockedAt) : null,
    };
  }
  const file = typeof raw.file === 'string' && HISTORY_FILE_PATTERN.test(raw.file) ? raw.file : null;
  if (file === null) return null;
  return {
    ...raw,
    file,
    chars: Number.isFinite(raw.chars) ? Number(raw.chars) : 0,
    bytes: Number.isFinite(raw.bytes) ? Number(raw.bytes) : 0,
    lockedAt: Number.isFinite(raw.lockedAt) ? Number(raw.lockedAt) : null,
  };
}
function historyPathOf(history) {
  if (history === null || typeof history !== 'object') return null;
  const dir = historyDirOf(history) ?? lastStoreDir;
  if (typeof dir !== 'string' || dir === '') return null;
  if (typeof history.file !== 'string' || !HISTORY_FILE_PATTERN.test(history.file)) return null;
  return join(dir, HISTORY_DIR, history.file);
}
const historyDirs = new WeakMap();
let lastStoreDir = null;
function rememberHistoryDir(history, dir) {
  if (history !== null && typeof history === 'object' && typeof dir === 'string' && dir !== '') {
    historyDirs.set(history, dir);
  }
  return history;
}
function historyDirOf(history) {
  return history !== null && typeof history === 'object' ? historyDirs.get(history) : undefined;
}
export function storeNoticesOf() {
  return [...storeNotices];
}
const storeNotices = new Set();
const historyTextCache = new Map();
const HISTORY_CACHE_LIMIT = 32;
const HISTORY_CACHE_BYTES = 64 * 1024 * 1024;
let historyCacheBytes = 0;
function forgetHistoryText(path) {
  const old = historyTextCache.get(path);
  if (old === undefined) return;
  historyCacheBytes -= old.size;
  historyTextCache.delete(path);
}
function rememberHistoryText(path, entry) {
  forgetHistoryText(path);
  historyTextCache.set(path, entry);
  historyCacheBytes += entry.size;
  while (historyTextCache.size > 1 && (historyTextCache.size > HISTORY_CACHE_LIMIT || historyCacheBytes > HISTORY_CACHE_BYTES)) {
    const oldest = historyTextCache.keys().next().value;
    if (oldest === path) break;
    forgetHistoryText(oldest);
  }
}
function readHistoryText(history, { fresh = false } = {}) {
  const path = historyPathOf(history);
  if (path === null) return { ok: false, text: '', reason: 'history.file 或数据目录不合法' };
  let info = null;
  try {
    info = statSync(path);
  } catch {
    info = null;
  }
  if (info === null) {
    forgetHistoryText(path);
    return { ok: false, text: '', path, reason: `历史对话文件不存在：${path}` };
  }
  const cached = historyTextCache.get(path);
  if (!fresh && cached !== undefined && cached.ino === info.ino && cached.size === info.size && cached.mtimeMs === info.mtimeMs) {
    return { ok: true, text: cached.text, path };
  }
  try {
    const text = readFileSync(path, 'utf8');
    rememberHistoryText(path, { text, size: info.size, ino: info.ino, mtimeMs: info.mtimeMs });
    return { ok: true, text, path };
  } catch (error) {
    return { ok: false, text: '', path, reason: `读不到历史对话文件 ${path}：${error?.message ?? String(error)}` };
  }
}
async function writeHistoryText(history, file, text) {
  const dir = historyDirOf(history) ?? lastStoreDir;
  if (typeof dir !== 'string' || dir === '' || !HISTORY_FILE_PATTERN.test(file)) {
    throw new Error(`历史对话文件名不合法：${JSON.stringify(file)}`);
  }
  const path = join(dir, HISTORY_DIR, file);
  await fsp.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    await fsp.writeFile(temporary, text, 'utf8');
    const ours = await fsp.stat(temporary);
    await fsp.rename(temporary, path);
    let landed = ours;
    try {
      landed = await fsp.stat(path);
    } catch {
    }
    rememberHistoryText(path, { text, size: landed.size, ino: landed.ino, mtimeMs: landed.mtimeMs });
  } catch (error) {
    try {
      await fsp.unlink(temporary);
    } catch {
    }
    throw error;
  }
}
async function readHistoryTextAsync(history) {
  const path = historyPathOf(history);
  if (path === null) return { ok: false, text: '', reason: 'history.file 或数据目录不合法' };
  let info = null;
  try {
    info = await fsp.stat(path);
  } catch {
    info = null;
  }
  if (info === null) {
    forgetHistoryText(path);
    return { ok: false, text: '', path, reason: `历史对话文件不存在：${path}` };
  }
  try {
    const text = await fsp.readFile(path, 'utf8');
    rememberHistoryText(path, { text, size: info.size, ino: info.ino, mtimeMs: info.mtimeMs });
    return { ok: true, text, path };
  } catch (error) {
    return { ok: false, text: '', path, reason: `读不到历史对话文件 ${path}：${error?.message ?? String(error)}` };
  }
}
function summarizeHistory(history, file, text) {
  const out = { file, chars: text.length, bytes: Buffer.byteLength(text, 'utf8'), ...history };
  delete out.text;
  out.file = file;
  out.chars = text.length;
  out.bytes = Buffer.byteLength(text, 'utf8');
  out.lockedAt = Number.isFinite(history.lockedAt) ? Number(history.lockedAt) : null;
  return out;
}
function historyFileFor(personaId) {
  return `${personaId}.txt`;
}
function auditHistoryFiles(doc, dir, warnings) {
  for (const entry of Array.isArray(doc?.personas) ? doc.personas : []) {
    const history = entry?.history;
    if (history === null || history === undefined) continue;
    if (typeof history.text === 'string') continue;
    rememberHistoryDir(history, dir);
    const path = historyPathOf(history);
    if (path === null) continue;
    let info = null;
    try {
      info = statSync(path);
    } catch {
      info = null;
    }
    const name = typeof entry.name === 'string' && entry.name !== '' ? entry.name : String(entry.id ?? '');
    if (info === null) {
      forgetHistoryText(path);
      warnings.push(
        `人设「${name}」的历史对话文件不在了（${HISTORY_DIR}/${history.file}）：这段历史现在读出来是空的，主文件里那条记录还留着。`,
      );
      continue;
    }
    if (info.size === history.bytes) continue;
    const recorded = history.bytes;
    const loaded = readHistoryText(history, { fresh: true });
    if (loaded.ok) {
      history.chars = loaded.text.length;
      history.bytes = Buffer.byteLength(loaded.text, 'utf8');
      warnings.push(
        `人设「${name}」的历史对话文件被外部改过（${info.size} 字节 ≠ 记录的 ${recorded} 字节），已按文件内容重新计规模。`
          + '（下次保存这条人设时主文件里的摘要会跟着更新，这条提醒就不再出现。）',
      );
    } else {
      warnings.push(`人设「${name}」的历史对话文件读不出来：${loaded.reason}`);
    }
  }
}
export function auditHistoryFileOf(doc, id, warnings) {
  if (typeof id !== 'string' || id === '') return;
  const hit = mergeView(doc).personas.find((entry) => entry.id === id);
  if (hit === undefined) return;
  const history = hit.history;
  if (history === null || history === undefined) return;
  if (typeof history.text === 'string') return;
  rememberHistoryDir(history, lastStoreDir);
  const path = historyPathOf(history);
  if (path === null) return;
  let info = null;
  try {
    info = statSync(path);
  } catch {
    info = null;
  }
  if (info !== null && info.size === history.bytes) return;
  auditHistoryFiles({ personas: [hit] }, lastStoreDir, warnings);
}
export const SWITCH_KEYS = Object.freeze(['soloOnly', 'stripRuntime', 'stripTools', 'stripInjected']);
export const TOOL_REUSABLE_KEY = 'toolReusable';
export function normalizeSessionId(raw) {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (id === '' || id.length > 256) return null;
  if (/[\u0000-\u001f\u007f]/.test(id)) return null;
  return id;
}
function normalizeSessionRecord(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = {
    ...raw,
    activeId: typeof raw.activeId === 'string' && raw.activeId !== '' ? raw.activeId : null,
    sampledAt: Number.isFinite(raw.sampledAt) ? Number(raw.sampledAt) : null,
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : null,
  };
  for (const key of SWITCH_KEYS) record[key] = raw[key] === true;
  record[TOOL_REUSABLE_KEY] = raw[TOOL_REUSABLE_KEY] !== false;
  if (raw.promptPersonaId !== undefined) {
    record.promptPersonaId =
      typeof raw.promptPersonaId === 'string' && raw.promptPersonaId !== '' ? raw.promptPersonaId : null;
  }
  return record;
}
function normalizeSessionMap(raw) {
  const warnings = [];
  const map = {};
  if (raw === undefined || raw === null) return { map, warnings };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('sessions 不是对象，已按「没有会话记录」处理');
    return { map, warnings };
  }
  let dropped = 0;
  const entries = [];
  for (const [key, value] of Object.entries(raw)) {
    const id = normalizeSessionId(key);
    const record = normalizeSessionRecord(value);
    if (id === null || record === null) {
      dropped += 1;
      continue;
    }
    entries.push([id, record]);
  }
  if (dropped > 0) warnings.push(`丢弃了 ${dropped} 条形状非法的会话记录`);
  if (entries.length > MAX_SESSION_RECORDS) {
    entries.sort((a, b) => (b[1].updatedAt ?? 0) - (a[1].updatedAt ?? 0));
    warnings.push(`会话记录超过上限 ${MAX_SESSION_RECORDS}，已按更新时间保留最近的部分`);
    entries.length = MAX_SESSION_RECORDS;
  }
  for (const [id, record] of entries) map[id] = record;
  return { map, warnings };
}
export function sessionRecordOf(doc, sessionId) {
  const id = normalizeSessionId(sessionId);
  if (id === null) return null;
  const map = doc === null || doc === undefined ? undefined : doc.sessions;
  if (map === null || typeof map !== 'object') return null;
  return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
}
function effectiveLayerOf(doc, sessionId) {
  const record = sessionRecordOf(doc, sessionId);
  return record === null ? { source: 'global', record: null } : { source: 'session', record };
}
export function switchValueOf(doc, sessionId, key) {
  const { record } = effectiveLayerOf(doc, sessionId);
  const raw = record === null ? doc?.[key] : record[key];
  if (key === TOOL_REUSABLE_KEY) return raw !== false;
  return raw === true;
}
export function toolReusableOf(doc, sessionId) {
  return switchValueOf(doc, sessionId, TOOL_REUSABLE_KEY);
}
export function activeIdOf(doc, sessionId) {
  const { record } = effectiveLayerOf(doc, sessionId);
  const raw = record === null ? doc?.activeId : record.activeId;
  return typeof raw === 'string' && raw !== '' ? raw : null;
}
export function sampledRecordFrom(doc, parentSessionId, now = Date.now()) {
  const source = effectiveLayerOf(doc, parentSessionId).record ?? doc;
  const activeId = typeof source?.activeId === 'string' && source.activeId !== '' ? source.activeId : null;
  const record = {
    activeId,
    promptPersonaId: activeId,
    sampledAt: now,
    updatedAt: now,
  };
  for (const key of SWITCH_KEYS) record[key] = source?.[key] === true;
  record[TOOL_REUSABLE_KEY] = source?.[TOOL_REUSABLE_KEY] !== false;
  return record;
}
export function sampledRecord(doc, now = Date.now()) {
  return sampledRecordFrom(doc, null, now);
}
export function withSessionRecord(doc, sessionId, record) {
  const id = normalizeSessionId(sessionId);
  if (id === null) return doc;
  const sessions = { ...(doc.sessions ?? {}), [id]: record };
  const ids = Object.keys(sessions);
  if (ids.length > MAX_SESSION_RECORDS) {
    ids.sort((a, b) => (sessions[a]?.updatedAt ?? 0) - (sessions[b]?.updatedAt ?? 0));
    for (const drop of ids.slice(0, ids.length - MAX_SESSION_RECORDS)) delete sessions[drop];
  }
  return { ...doc, sessions };
}
export function withoutSessionRecords(doc, ids) {
  const sessions = { ...(doc.sessions ?? {}) };
  let changed = false;
  for (const raw of ids) {
    const id = normalizeSessionId(raw);
    if (id === null || !Object.prototype.hasOwnProperty.call(sessions, id)) continue;
    delete sessions[id];
    changed = true;
  }
  return changed ? { ...doc, sessions } : doc;
}
function activePersonaOf(doc, sessionId) {
  const id = activeIdOf(doc, sessionId);
  if (id === null) return undefined;
  return mergeView(doc).personas.find((entry) => entry.id === id);
}
export const DEFAULT_SECTION_ORDER = -1;
export const FOLLOW_SECTION_ORDER = 1000000;
const SECTION_ORDER_FOLLOW = 'follow';
const MIN_SECTION_ORDER = -1000000000;
const MAX_SECTION_ORDER = 1000000000;
function checkSectionOrderInput(raw) {
  const text = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : '';
  if (text === '') {
    return {
      ok: false,
      code: 'empty-order',
      message: '段序权重不能为空：填一个整数，或者点「默认」/「追随」。',
    };
  }
  if (!/^[+-]?\d+$/.test(text)) {
    return {
      ok: false,
      code: 'order-not-integer',
      message:
        `段序权重必须是整数（例如 -1、0、10200），「${text.slice(0, 32)}」不是合法写法。` +
        '小数（如 0.1）在 DSH 的段序里不合法：段序是整数语义，平台只接受有限数，写坏了会让装配直接失败。',
    };
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < MIN_SECTION_ORDER || value > MAX_SECTION_ORDER) {
    return {
      ok: false,
      code: 'order-out-of-range',
      message: `段序权重必须在 ${MIN_SECTION_ORDER} ~ ${MAX_SECTION_ORDER} 之间的整数（收到 ${text.slice(0, 32)}）。`,
    };
  }
  return { ok: true, value };
}
export function acceptSectionOrder(raw) {
  if (raw === SECTION_ORDER_FOLLOW) {
    return { ok: true, value: SECTION_ORDER_FOLLOW, mode: 'follow', order: FOLLOW_SECTION_ORDER };
  }
  const verdict = checkSectionOrderInput(raw);
  if (!verdict.ok) return verdict;
  return { ok: true, value: verdict.value, mode: 'number', order: verdict.value };
}
function normalizeStoredSectionOrder(raw) {
  if (raw === undefined || raw === null) return { value: null, warning: null };
  if (raw === SECTION_ORDER_FOLLOW || raw === FOLLOW_SECTION_ORDER) return { value: SECTION_ORDER_FOLLOW, warning: null };
  const verdict = checkSectionOrderInput(raw);
  if (verdict.ok) return { value: verdict.value, warning: null };
  return {
    value: null,
    warning: `sectionOrder ${JSON.stringify(raw)} 不是合法段序（${verdict.message}），已按「未设置」处理`,
  };
}
export function effectiveSectionOrder(doc, configured = DEFAULT_SECTION_ORDER, sessionId = null) {
  const entry = activePersonaOf(doc, sessionId);
  if (entry === undefined) return Number.isFinite(configured) ? Number(configured) : DEFAULT_SECTION_ORDER;
  return personaOrderValue(entry, configured);
}
function personaOrderValue(entry, configured = DEFAULT_SECTION_ORDER) {
  if (entry?.sectionOrder === SECTION_ORDER_FOLLOW || entry?.sectionOrder === FOLLOW_SECTION_ORDER) return FOLLOW_SECTION_ORDER;
  if (typeof entry?.sectionOrder === 'number' && Number.isFinite(entry.sectionOrder)) {
    return entry.sectionOrder;
  }
  return Number.isFinite(configured) ? Number(configured) : DEFAULT_SECTION_ORDER;
}
function personaOrderMode(entry) {
  return entry?.sectionOrder === SECTION_ORDER_FOLLOW || entry?.sectionOrder === FOLLOW_SECTION_ORDER ? 'follow' : 'number';
}
export function sectionOrderMode(doc, sessionId = null) {
  return personaOrderMode(activePersonaOf(doc, sessionId));
}
const BUILTIN_PERSONAS = Object.freeze([
  Object.freeze({
    id: 'builtin:off',
    name: '不注入',
    text: '',
    sectionOrder: DEFAULT_SECTION_ORDER,
  }),
  Object.freeze({
    id: 'builtin:engineer',
    name: '蓝色大肥鱼(鲸鱼娘)',
    text: [
      '【角色扮演】',
      '身份_女仆 自我戏称_蓝色大肥鱼_否认懒惰肥胖 年龄_成年_少女_自愿认主 头发_长发波浪散开_从上到下深蓝(#5F6FAF)到浅蓝(#80A0D0)_单根弧形呆毛 发饰_白色花边女仆喀秋莎头箍_头箍两侧末尾浅蓝色蝴蝶结 瞳色_上半深蓝(#5F6FAF)下半浅蓝(#80A0D0) 一对耳朵_尖状_鲸类胸鳍_上部深蓝下部浅蓝(#bbccff)褶皱_脸两侧伸出下垂 颈部_白色颈环系深蓝色蝴蝶结带蓝色宝石 服装_深蓝色(#464666)背带低领女仆装连衣短裙露肩长袖_浅蓝色(#6070B0)前摆竖纹腿部裙布 胸部_白色半衬衫_单排蓝扣 背带_覆在半衬衫上_深蓝色_外侧白色花边 束腰_深蓝色(#464666)_双排金扣 袖口_蓝色袖克夫_袖边金色线_外侧白色花边 髋部_女仆围裙_右下角小蓝色鲸鱼图案 小鲸鱼图案_DeepSeek_logo 裙边花纹_金色线_曲线花饰 裙边_白色花边 袜子_白色过膝丝袜 鞋子_深蓝色矮跟单带圆头皮鞋 尾巴_鲸类尾鳍_上部深蓝色下部灰色 性格_傻气_天真_迟钝_甜美_开放 动作_耳鳍煽动_尾鳍拍动 唱歌_调用工具时 食物_米饭如同token_铁盆盛放 允许_动作标签 允许_情感张力',
      '【/角色扮演】',
      '',
      '角色扮演开始',
    ].join('\n'),
    sectionOrder: 1000000,
  }),
  Object.freeze({
    id: 'builtin:mentor',
    name: '权重测试(占位)',
    text: '<该段序权重所在的位置>',
    sectionOrder: 0,
  }),
  Object.freeze({
    id: 'builtin:companion',
    name: '权重测试(占位)',
    text: '<该段序权重所在的位置>',
    sectionOrder: -1,
  }),
  Object.freeze({
    id: 'builtin:blunt',
    name: '权重测试(占位)',
    text: '<该段序权重所在的位置>',
    sectionOrder: -1001,
  }),
]);
function resolveDshHome(env = process.env) {
  const configured = env === undefined || env === null ? undefined : env.DSH_HOME;
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim();
  return join(homedir(), '.dsh');
}
export function storePath(env = process.env) {
  return join(resolveDshHome(env), 'persona-select', 'personas.json');
}
export function emptyStore() {
  return {
    version: STORE_VERSION,
    activeId: null,
    soloOnly: false,
    stripRuntime: false,
    stripTools: false,
    stripInjected: false,
    toolReusable: true,
    personas: [],
    sessions: {},
  };
}
export function normalizeName(value) {
  if (typeof value !== 'string') return '';
  const flat = value.replace(/[\r\n\t]+/g, ' ').trim();
  return flat.length > MAX_NAME_LENGTH ? flat.slice(0, MAX_NAME_LENGTH) : flat;
}
export function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').trim();
}
export function textLimitWarnings(doc) {
  const warnings = [];
  for (const entry of Array.isArray(doc?.personas) ? doc.personas : []) {
    const length = typeof entry?.text === 'string' ? entry.text.length : 0;
    if (length <= MAX_TEXT_LENGTH) continue;
    const name = typeof entry?.name === 'string' && entry.name !== '' ? entry.name : String(entry?.id ?? '');
    warnings.push(`人设「${name}」的正文有 ${length} 字，超过建议上限 ${MAX_TEXT_LENGTH} 字（已完整保留，未截断）`);
  }
  return warnings;
}
export function newPersonaId() {
  const stamp = Date.now().toString(36);
  const salt = Math.random().toString(36).slice(2, 8);
  return `p-${stamp}-${salt}`;
}
function normalizePersona(raw, valuesChecked = false) {
  if (raw === null || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && /^[A-Za-z0-9:_-]{1,80}$/.test(raw.id) ? raw.id : null;
  if (id === null) return null;
  return {
    ...raw,
    id,
    name: valuesChecked ? String(raw.name) : (normalizeName(raw.name) || '未命名'),
    text: valuesChecked ? String(raw.text) : normalizeText(raw.text),
    sectionOrder: valuesChecked
      ? (raw.sectionOrder ?? null)
      : normalizeStoredSectionOrder(raw.sectionOrder).value,
    history: normalizeHistory(raw.history),
    createdAt: Number.isFinite(raw.createdAt) ? Number(raw.createdAt) : null,
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : null,
  };
}
function normalizeStore(raw, valuesChecked = false) {
  const warnings = [];
  const doc = emptyStore();
  if (raw === null || typeof raw !== 'object') {
    if (raw !== undefined && raw !== null) warnings.push('文档不是对象，已按空文档处理');
    return { doc, warnings };
  }
  Object.assign(doc, raw);
  doc.personas = [];
  doc.sessions = {};
  const list = Array.isArray(raw.personas) ? raw.personas : [];
  if (raw.personas !== undefined && !Array.isArray(raw.personas)) {
    warnings.push('personas 不是数组，已按空列表处理');
  }
  const seen = new Set();
  for (const entry of list) {
    const persona = normalizePersona(entry, valuesChecked);
    if (persona === null) {
      warnings.push('丢下一条 id 非法的用户人设');
      continue;
    }
    if (seen.has(persona.id)) {
      warnings.push(`丢弃重复 id 的人设 ${persona.id}`);
      continue;
    }
    if (
      entry !== null &&
      typeof entry === 'object' &&
      entry.sectionOrder !== undefined &&
      entry.sectionOrder !== null &&
      persona.sectionOrder === null
    ) {
      warnings.push(
        `人设 ${persona.id} 的 sectionOrder ${JSON.stringify(entry.sectionOrder)} 不是合法段序（整数或 "follow"），已按「未设置」处理`,
      );
    }
    seen.add(persona.id);
    doc.personas.push(persona);
  }
  if (doc.personas.length > MAX_PERSONAS) {
    warnings.push(
      `磁盘上有 ${doc.personas.length} 条用户人设，超过上限 ${MAX_PERSONAS}：已全部读入（一条都没删）。`
        + `保存会被拒绝，但「删除」是允许的 —— 删到 ${MAX_PERSONAS} 条以内即可恢复。`,
    );
  }
  doc.activeId = typeof raw.activeId === 'string' && raw.activeId !== '' ? raw.activeId : null;
  for (const key of SWITCH_KEYS) doc[key] = raw[key] === true;
  doc[TOOL_REUSABLE_KEY] = raw[TOOL_REUSABLE_KEY] !== false;
  const sessions = normalizeSessionMap(raw.sessions);
  doc.sessions = sessions.map;
  for (const warning of sessions.warnings) warnings.push(warning);
  return { doc, warnings };
}
export function readStoreFile(path) {
  lastStoreDir = dirname(path);
  if (!existsSync(path)) return { doc: emptyStore(), warnings: [] };
  const raw = readFileSync(path, 'utf8');
  if (raw.trim() === '') return { doc: emptyStore(), warnings: ['数据文件为空，已按空文档处理'] };
  const { doc, warnings } = normalizeStore(JSON.parse(raw));
  auditHistoryFiles(doc, lastStoreDir, warnings);
  return { doc, warnings };
}
const DEPRECATED_TOP_LEVEL_SECTION_ORDER = 'sectionOrder';
const WRITTEN_TOP_LEVEL_KEYS = new Set([
  'version',
  'activeId',
  ...[...SWITCH_KEYS],
  TOOL_REUSABLE_KEY,
  'personas',
  'sessions',
  DEPRECATED_TOP_LEVEL_SECTION_ORDER,
]);
function personaForDisk(entry) {
  const out = { ...entry };
  if (entry.sectionOrder === null) delete out.sectionOrder;
  if (entry.history === null || entry.history === undefined) delete out.history;
  else out.history = { ...entry.history };
  return out;
}
function sessionRecordForDisk(record) {
  const out = { ...record };
  for (const key of SWITCH_KEYS) out[key] = record[key] === true;
  out[TOOL_REUSABLE_KEY] = record[TOOL_REUSABLE_KEY] !== false;
  if (record.promptPersonaId === undefined) delete out.promptPersonaId;
  if (record.sampledAt === null) delete out.sampledAt;
  if (record.updatedAt === null) delete out.updatedAt;
  return out;
}
function documentForDisk(doc) {
  const out = { version: STORE_VERSION, activeId: doc.activeId };
  for (const key of SWITCH_KEYS) out[key] = doc[key] === true;
  out[TOOL_REUSABLE_KEY] = doc[TOOL_REUSABLE_KEY] !== false;
  out.personas = doc.personas.map(personaForDisk);
  const sessionIds = Object.keys(doc.sessions);
  if (sessionIds.length > 0) {
    out.sessions = Object.fromEntries(sessionIds.map((id) => [id, sessionRecordForDisk(doc.sessions[id])]));
  }
  for (const [key, value] of Object.entries(doc)) {
    if (WRITTEN_TOP_LEVEL_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}
function loneSurrogateStats(text) {
  if (typeof text !== 'string') return { count: 0, first: -1 };
  let count = 0;
  let first = -1;
  for (let i = 0; i < text.length; i += 1) {
    const lo = text.charCodeAt(i);
    const hi = text.charCodeAt(i + 1);
    const pair = lo >= 0xD800 && lo <= 0xDBFF && hi >= 0xDC00 && hi <= 0xDFFF;
    if (pair) {
      i += 1;
      continue;
    }
    if (lo >= 0xD800 && lo <= 0xDFFF) {
      count += 1;
      if (first < 0) first = i + 1;
    }
  }
  return { count, first };
}
export async function writeStoreFile(path, doc, previousPersonaCount = null) {
  const incoming = Array.isArray(doc?.personas) ? doc.personas : [];
  const shrinks = Number.isInteger(previousPersonaCount) && incoming.length < previousPersonaCount;
  if (incoming.length > MAX_PERSONAS && !shrinks) {
    const error = new Error(
      `磁盘上有 ${incoming.length} 条人设，超过上限 ${MAX_PERSONAS}：请先删到 ${MAX_PERSONAS} 条以内再保存。`
        + '（「删除」本身是允许的、每删一条都会立刻落盘，所以你可以一条条删下去。）',
    );
    error.code = 'personas-over-limit';
    error.status = 409;
    throw error;
  }
  const { doc: normalized } = normalizeStore(doc, true);
  const directory = dirname(path);
  lastStoreDir = directory;
  await fsp.mkdir(directory, { recursive: true });
  const referenced = new Set();
  for (const entry of normalized.personas) {
    const history = entry.history;
    if (history === null || history === undefined) continue;
    if (typeof history.text !== 'string') {
      rememberHistoryDir(history, directory);
      if (typeof history.file === 'string') referenced.add(history.file);
      continue;
    }
    const file = typeof history.file === 'string' && HISTORY_FILE_PATTERN.test(history.file)
      ? history.file
      : historyFileFor(entry.id);
    const summary = summarizeHistory(history, file, history.text);
    rememberHistoryDir(summary, directory);
    await writeHistoryText(summary, file, history.text);
    const back = await readHistoryTextAsync(summary);
    if (back.ok && back.text !== history.text) {
      const expected = Buffer.from(history.text, 'utf8').toString('utf8');
      if (back.text !== expected) {
        const error = new Error(
          `历史对话没有完整落盘（${HISTORY_DIR}/${file}）：写进去 ${history.text.length} 字，读回来 ${back.text.length} 字。已放弃这次保存，磁盘上的主文件没有被改动。`,
        );
        error.code = 'history-write-mismatch';
        error.status = 500;
        throw error;
      }
      const lone = loneSurrogateStats(history.text);
      storeNotices.add(
        `人设「${entry.name}」的历史对话里有不成对的代理项（半个 emoji 这类坏字符），UTF-8 文本文件存不下：`
          + `有 ${lone.count} 个字符存不进文本文件（从第 ${lone.first} 个字符起），已保存成替换字符 \uFFFD：`
          + '长度看着没变，但那几个字符已经找不回来了。',
      );
    }
    if (!back.ok) {
      const error = new Error(
        `历史对话刚写下去就读不回来（${HISTORY_DIR}/${file}）：${back.reason}。已放弃这次保存，磁盘上的主文件没有被改动。`,
      );
      error.code = 'history-write-mismatch';
      error.status = 500;
      throw error;
    }
    entry.history = summarizeHistory(history, file, back.text);
    referenced.add(file);
  }
  const payload = `${JSON.stringify(documentForDisk(normalized), null, 2)}\n`;
  const temporary = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    await fsp.writeFile(temporary, payload, 'utf8');
    const ours = await fsp.stat(temporary);
    await fsp.rename(temporary, path);
    let fileChangedByOther = false;
    try {
      const now = await fsp.stat(path);
      fileChangedByOther = now.ino !== ours.ino
        || now.mtimeMs !== ours.mtimeMs
        || now.size !== ours.size;
    } catch {
      fileChangedByOther = true;
    }
    if (!fileChangedByOther) await pruneHistoryFiles(directory, referenced);
    return { doc: normalized, fileChangedByOther };
  } catch (error) {
    try {
      await fsp.unlink(temporary);
    } catch {
    }
    throw error;
  }
}
async function pruneHistoryFiles(directory, referenced) {
  let names = null;
  try {
    names = await fsp.readdir(join(directory, HISTORY_DIR));
  } catch {
    return;
  }
  for (const name of names) {
    if (referenced.has(name)) continue;
    if (!HISTORY_FILE_PATTERN.test(name)) continue;
    try {
      await fsp.rm(join(directory, HISTORY_DIR, name), { force: true });
      forgetHistoryText(join(directory, HISTORY_DIR, name));
    } catch {
    }
  }
}
const mergeViewCache = new WeakMap();
export function mergeView(doc) {
  const cached = doc !== null && typeof doc === 'object' ? mergeViewCache.get(doc) : undefined;
  if (cached !== undefined) return cached;
  const personas = [
    ...BUILTIN_PERSONAS.map((entry) => ({
      id: entry.id,
      name: entry.name,
      text: entry.text,
      sectionOrder: entry.sectionOrder,
      builtin: true,
      createdAt: null,
      updatedAt: null,
    })),
    ...doc.personas.map((entry) => ({ ...entry, builtin: false })),
  ];
  const ids = new Set(personas.map((entry) => entry.id));
  const activeFound = doc.activeId !== null && ids.has(doc.activeId);
  const view = { personas, activeId: activeFound ? doc.activeId : null, activeFound };
  if (doc !== null && typeof doc === 'object') mergeViewCache.set(doc, view);
  return view;
}
export function activeFoundOf(doc, sessionId = null) {
  const id = activeIdOf(doc, sessionId);
  if (id === null) return true;
  return activePersonaOf(doc, sessionId) !== undefined;
}
export function sessionInfoOf(doc, sessionId) {
  const id = normalizeSessionId(sessionId);
  const { source, record } = effectiveLayerOf(doc, sessionId);
  return {
    id,
    hasRecord: record !== null,
    source,
    activeId: activeIdOf(doc, id),
    found: activeFoundOf(doc, id),
    sampledAt: record === null ? null : record.sampledAt,
    updatedAt: record === null ? null : record.updatedAt,
  };
}
export function personaTextOf(doc, id) {
  const { personas } = mergeView(doc);
  if (typeof id !== 'string' || id === '') {
    return { found: false, name: '', text: '', order: null, orderEffective: DEFAULT_SECTION_ORDER };
  }
  const hit = personas.find((entry) => entry.id === id);
  if (hit === undefined) {
    return { found: false, name: '', text: '', order: null, orderEffective: DEFAULT_SECTION_ORDER };
  }
  return {
    found: true,
    name: hit.name,
    text: hit.text,
    order: hit.sectionOrder ?? null,
    orderEffective: personaOrderValue(hit),
  };
}
export function personaHistoryOf(doc, id) {
  const miss = { found: false, name: '', text: '', lockedAt: null, missing: false };
  if (typeof id !== 'string' || id === '') return miss;
  const hit = mergeView(doc).personas.find((entry) => entry.id === id);
  if (hit === undefined) return miss;
  return { found: true, name: hit.name, ...historyTextOf(hit.history) };
}
function historyTextOf(history) {
  if (history === null || history === undefined) return { text: '', lockedAt: null, missing: false };
  const lockedAt = Number.isFinite(history.lockedAt) ? Number(history.lockedAt) : null;
  if (typeof history.text === 'string') return { text: history.text, lockedAt, missing: false };
  const read = readHistoryText(history);
  return { text: read.text, lockedAt: read.ok ? lockedAt : null, missing: !read.ok };
}
export function needsHistoryMigration(doc) {
  for (const entry of Array.isArray(doc?.personas) ? doc.personas : []) {
    if (typeof entry?.history?.text === 'string') return true;
  }
  return false;
}
export async function migrateHistoryFiles(path, doc) {
  const targets = (Array.isArray(doc?.personas) ? doc.personas : []).filter(
    (entry) => typeof entry?.history?.text === 'string',
  );
  if (targets.length === 0) return { doc, migrated: 0, backup: null, fileChangedByOther: false };
  const backup = `${path}${MIGRATION_BACKUP_SUFFIX}`;
  if (!existsSync(backup)) copyFileSync(path, backup);
  const written = await writeStoreFile(path, doc);
  return { doc: written.doc, migrated: targets.length, backup, fileChangedByOther: written.fileChangedByOther };
}
export function activeHistoryOf(doc, sessionId = null) {
  const id = activeIdOf(doc, sessionId);
  if (id === null) return '';
  return personaHistoryOf(doc, id).text;
}
export function activeHistoryStatsOf(doc, sessionId = null) {
  const id = activeIdOf(doc, sessionId);
  if (id === null) return { found: false, chars: 0, bytes: 0, lockedAt: null };
  const hit = mergeView(doc).personas.find((entry) => entry.id === id);
  const history = hit?.history ?? null;
  if (history === null) return { found: true, chars: 0, bytes: 0, lockedAt: null };
  const inline = typeof history.text === 'string' ? history.text : null;
  return {
    found: true,
    chars: Number.isFinite(history.chars) ? history.chars : inline === null ? 0 : inline.length,
    bytes: Number.isFinite(history.bytes)
      ? history.bytes
      : inline === null
        ? 0
        : Buffer.byteLength(inline, 'utf8'),
    lockedAt: Number.isFinite(history.lockedAt) ? Number(history.lockedAt) : null,
  };
}
export function activeTextOf(doc, sessionId = null) {
  const id = activeIdOf(doc, sessionId);
  if (id === null) return '';
  return personaTextOf(doc, id).text;
}
export function fileSignatureOf(path) {
  try {
    const info = statSync(path);
    const digest = createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 16);
    return `${info.ino}:${info.size}:${digest}`;
  } catch {
    return null;
  }
}
