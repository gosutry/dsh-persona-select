window.__ModuleLoader__.load({
  id: 'dsh-persona-select',
  chunk: 'client.log-import.js',
  factory: function logImportChunk(require) {
    'use strict';
    function create(deps) {
      const { USER_OPEN, USER_CLOSE, ASSISTANT_OPEN, ASSISTANT_CLOSE, FILE_OPEN, FILE_CLOSE, HISTORY_WRAPPER_LINES, HISTORY_FRAME_LINES, HISTORY_FRAME_ESCAPE, HISTORY_LEGACY_TAGS, HISTORY_LEGACY_PREAMBLE, LEGACY_USER_MARKER, IMAGE_EXTENSIONS, ZSTD_MAGIC, decodeUtf8, historyBytesOf } = deps;
      const THINKING_OPEN = '<thinking>';
      const THINKING_CLOSE = '</thinking>';
      function attachmentFileName(block) {
        const attachment = block?.attachment;
        if (attachment === null || attachment === undefined || typeof attachment !== 'object') return '';
        if (typeof attachment.name === 'string' && attachment.name.trim() !== '') {
          return attachment.name.trim();
        }
        const extension = IMAGE_EXTENSIONS[attachment.mediaType];
        return typeof extension === 'string' ? `image.${extension}` : '';
      }
      function renderContentParts(content) {
        if (!Array.isArray(content)) return '';
        const lines = [];
        for (const block of content) {
          if (block === null || typeof block !== 'object') continue;
          if (block.type === 'text') {
            const text = typeof block.text === 'string' ? block.text.trim() : '';
            if (text !== '') lines.push(text);
            continue;
          }
          if (block.type === 'file' || block.type === 'image') {
            const name = attachmentFileName(block);
            if (name !== '') lines.push(`${FILE_OPEN}${name}${FILE_CLOSE}`);
          }
        }
        return lines.join('\n');
      }
      function looksInjected(text) {
        const source = typeof text === 'string' ? text : String(text ?? '');
        if (HISTORY_LEGACY_TAGS.some((tag) => source.includes(tag))) return true;
        const lines = source.split('\n').map((line) => line.trim());
        if (lines.includes(HISTORY_WRAPPER_LINES[0])) return true;
        return lines.includes(HISTORY_FRAME_LINES[0]) && lines.includes(HISTORY_WRAPPER_LINES[1]);
      }
      function unwrapPersonaHistory(text) {
        let out = typeof text === 'string' ? text : String(text ?? '');
        for (let round = 0; round < 8; round += 1) {
          const before = out;
          for (const tag of HISTORY_LEGACY_TAGS) out = out.split(tag).join('');
          out = out.split(HISTORY_FRAME_ESCAPE).join(HISTORY_FRAME_LINES[1]);
          out = out
            .split('\n')
            .filter((line) => {
              const trimmed = line.trim();
              if (HISTORY_WRAPPER_LINES.includes(trimmed)) return false;
              if (HISTORY_FRAME_LINES.includes(trimmed)) return false;
              return !HISTORY_LEGACY_PREAMBLE.some((marker) => line.includes(marker));
            })
            .join('\n');
          out = out.replace(/\n{3,}/g, '\n\n').trim();
          if (out === before) break;
        }
        return out.trim();
      }
      function retagLegacyUserMarkers(text) {
        const source = typeof text === 'string' ? text : String(text ?? '');
        if (!source.includes(LEGACY_USER_MARKER)) return source;
        const prefix = `${LEGACY_USER_MARKER}\n`;
        return source
          .split('\n\n')
          .map((chunk) => {
            if (!chunk.startsWith(prefix)) return chunk;
            return `${USER_OPEN}\n${chunk.slice(prefix.length)}\n${USER_CLOSE}`;
          })
          .join('\n\n');
      }
      function textOfBlocks(content, wantType) {
        if (!Array.isArray(content)) return '';
        const type = typeof wantType === 'string' ? wantType : 'text';
        const parts = [];
        for (const block of content) {
          if (block === null || typeof block !== 'object') continue;
          if (block.type !== type) continue;
          if (typeof block.text === 'string' && block.text !== '') parts.push(block.text);
        }
        return parts.join('\n');
      }
      function extractJsonObjects(text) {
        const source = typeof text === 'string' ? text : String(text);
        const out = [];
        let depth = 0;
        let start = -1;
        let inString = false;
        let escaped = false;
        for (let i = 0; i < source.length; i += 1) {
          const ch = source.charAt(i);
          if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
          }
          if (ch === '"') {
            inString = true;
            continue;
          }
          if (ch === '{') {
            if (depth === 0) start = i;
            depth += 1;
            continue;
          }
          if (ch === '}') {
            if (depth > 0) depth -= 1;
            if (depth === 0 && start >= 0) {
              out.push(source.slice(start, i + 1));
              start = -1;
            }
          }
        }
        return out;
      }
      function readSessionEvents(text) {
        const source = typeof text === 'string' ? text : String(text);
        const fromLines = [];
        let nonEmptyLines = 0;
        for (const rawLine of source.split('\n')) {
          const line = rawLine.trim();
          if (line === '') continue;
          nonEmptyLines += 1;
          try {
            const parsed = JSON.parse(line);
            if (parsed !== null && typeof parsed === 'object') fromLines.push(parsed);
          } catch {
          }
        }
        if (nonEmptyLines > 0 && fromLines.length === nonEmptyLines) return fromLines;
        const fromScan = [];
        for (const chunk of extractJsonObjects(source)) {
          try {
            const parsed = JSON.parse(chunk);
            if (parsed !== null && typeof parsed === 'object') fromScan.push(parsed);
          } catch {
          }
        }
        return fromScan.length > fromLines.length ? fromScan : fromLines;
      }
      function stripThinkingInRegion(region) {
        if (!region.includes(THINKING_OPEN) && !region.includes(THINKING_CLOSE)) return region;
        let out = '';
        let cursor = 0;
        let depth = 0;
        let at = 0;
        for (;;) {
          const open = region.indexOf(THINKING_OPEN, at);
          const close = region.indexOf(THINKING_CLOSE, at);
          if (close !== -1 && (open === -1 || close < open)) {
            if (depth > 0) {
              depth -= 1;
              at = close + THINKING_CLOSE.length;
              if (depth === 0) cursor = at;
            } else {
              out += region.slice(cursor, close);
              cursor = close + THINKING_CLOSE.length;
              at = cursor;
            }
            continue;
          }
          if (open !== -1) {
            if (depth === 0) out += region.slice(cursor, open);
            depth += 1;
            at = open + THINKING_OPEN.length;
            continue;
          }
          if (depth === 0) out += region.slice(cursor);
          break;
        }
        return out;
      }
      function stripThinkingOutsideSummaries(text) {
        const source = typeof text === 'string' ? text : '';
        if (source === '' || (!source.includes(THINKING_OPEN) && !source.includes(THINKING_CLOSE))) return source;
        const tidy = (chunk) => chunk.replace(/\n{3,}/g, '\n\n');
        const found = scanSummarySpans(source);
        if (found.length === 0) return tidy(stripThinkingInRegion(source));
        let out = '';
        let cursor = 0;
        for (const entry of found) {
          out += tidy(stripThinkingInRegion(source.slice(cursor, entry.start)));
          out += source.slice(entry.start, entry.end);
          cursor = entry.end;
        }
        return out + tidy(stripThinkingInRegion(source.slice(cursor)));
      }
      function renderSessionEvents(events, includeThinking) {
        const wantThinking = includeThinking === true;
        const blocks = [];
        for (const event of events) {
          if (event === null || typeof event !== 'object') continue;
          const type = event.type;
          if (type === 'user/message') {
            const content = event.data?.content;
            const plain = textOfBlocks(content).trim();
            const isInjected = event.data?.source?.kind === 'persona-history'
              || looksInjected(plain);
            if (isInjected) {
              const inner = retagLegacyUserMarkers(unwrapPersonaHistory(plain));
              if (inner !== '') blocks.push({ role: 'raw', body: inner, thinking: '' });
              continue;
            }
            const said = renderContentParts(content);
            if (said !== '') blocks.push({ role: 'user', body: said, thinking: '' });
            continue;
          }
          if (type === 'assistant/message') {
            const content = event.data?.message?.content;
            const body = renderContentParts(content);
            const thinking = wantThinking ? textOfBlocks(content, 'reasoning').trim() : '';
            if (body === '' && thinking === '') continue;
            blocks.push({ role: 'assistant', body, thinking });
          }
        }
        const rendered = blocks
          .map((block) => {
            if (block.role === 'user') {
              return `${USER_OPEN}\n${block.body}\n${USER_CLOSE}`;
            }
            if (block.role === 'assistant') {
              const parts = [];
              if (block.thinking !== '') parts.push(THINKING_OPEN, block.thinking, THINKING_CLOSE);
              if (block.body !== '') parts.push(`${ASSISTANT_OPEN}\n${block.body}\n${ASSISTANT_CLOSE}`);
              return parts.join('\n');
            }
            return block.body;
          })
          .join('\n\n');
        return wantThinking
          ? rendered
          : stripThinkingOutsideSummaries(rendered).replace(/^\s+/, '').replace(/\s+$/, '');
      }
      const WRAPPER_TAGS = ['user_message', 'assistant_message', 'thinking', 'file', 'system-reminder'];
      function stripTailHead(tail) {
        const source = typeof tail === 'string' ? tail : '';
        if (source === '') return '';
        const closer = new RegExp(`^\\s*(?:</(?:${WRAPPER_TAGS.join('|')})>)\\s*`, 'g');
        const frameLine = /^\s*(?:CONTEXT_ROAD:|CONTINUE_CONTEXT\.)\s*$/;
        let out = source;
        for (let guard = 0; guard < 8; guard += 1) {
          const before = out;
          out = out.replace(closer, '');
          out = out
            .split('\n')
            .filter((line, index) => index > 0 || !frameLine.test(line))
            .join('\n');
          if (out === before) break;
        }
        return out.replace(/^\s+/, '').replace(/\s+$/, '');
      }
      function scanSummarySpans(source) {
        const pattern = /<compacted-summary>[\s\S]*?<\/compacted-summary>/g;
        const found = [];
        let match = pattern.exec(source);
        while (match !== null) {
          found.push({ block: match[0], start: match.index, end: match.index + match[0].length });
          match = pattern.exec(source);
        }
        return found;
      }
      function scanCompactedSummaries(text) {
        const source = typeof text === 'string' ? text : '';
        if (source === '') return { blocks: [], spans: [], count: 0, tail: '' };
        const found = scanSummarySpans(source);
        if (found.length === 0) return { blocks: [], spans: [], count: 0, tail: '' };
        const last = found[found.length - 1];
        return {
          blocks: found.map((entry) => entry.block),
          spans: found.map((entry) => ({ start: entry.start, end: entry.end })),
          count: found.length,
          tail: stripTailHead(source.slice(last.end)),
        };
      }
      function compactedViewOf(text, scan) {
        const source = typeof text === 'string' ? text : '';
        const hit = scan ?? scanCompactedSummaries(source);
        if (hit.count === 0) return source;
        const head = hit.blocks.join('\n\n');
        return hit.tail === '' ? head : `${head}\n\n${hit.tail}`;
      }
      function uncompactedViewOf(text, scan) {
        const source = typeof text === 'string' ? text : '';
        if (source === '') return '';
        const spans = (scan ?? scanCompactedSummaries(source)).spans;
        let out = '';
        let cursor = 0;
        for (const span of spans) {
          let start = span.start;
          let end = span.end;
          for (const tag of WRAPPER_TAGS) {
            const open = `<${tag}>`;
            const close = `</${tag}>`;
            const before = source.slice(0, start).replace(/\s+$/, '');
            const after = source.slice(end);
            const trimmedAfter = after.replace(/^\s+/, '');
            if (before.endsWith(open) && trimmedAfter.startsWith(close)) {
              start = before.length - open.length;
              end += (after.length - trimmedAfter.length) + close.length;
              break;
            }
          }
          out += source.slice(cursor, start);
          cursor = end;
        }
        out += source.slice(cursor);
        return out.replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '').replace(/\s+$/, '');
      }
      function importViewOf(text, expand) {
        const source = typeof text === 'string' ? text : '';
        const scan = scanCompactedSummaries(source);
        return {
          text: expand ? uncompactedViewOf(source, scan) : compactedViewOf(source, scan),
          count: scan.count,
        };
      }
      async function inflateRaw(bytes) {
        try {
          if (typeof DecompressionStream !== 'function') return null;
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Uint8Array(await new Response(stream).arrayBuffer());
        } catch {
          return null;
        }
      }
      async function readSessionJsonlFromZip(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const limit = Math.max(0, bytes.length - 66000);
        let eocd = -1;
        for (let i = bytes.length - 22; i >= limit; i -= 1) {
          if (view.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
          }
        }
        if (eocd < 0) return null;
        const entryCount = view.getUint16(eocd + 10, true);
        let offset = view.getUint32(eocd + 16, true);
        const entries = [];
        for (let n = 0; n < entryCount; n += 1) {
          if (offset + 46 > bytes.length) break;
          if (view.getUint32(offset, true) !== 0x02014b50) break;
          const method = view.getUint16(offset + 10, true);
          const packed = view.getUint32(offset + 20, true);
          const nameLength = view.getUint16(offset + 28, true);
          const extraLength = view.getUint16(offset + 30, true);
          const commentLength = view.getUint16(offset + 32, true);
          const localOffset = view.getUint32(offset + 42, true);
          const name = decodeUtf8(bytes.subarray(offset + 46, offset + 46 + nameLength));
          entries.push({ name, method, packed, at: localOffset });
          offset += 46 + nameLength + extraLength + commentLength;
        }
        const hit = entries.find((entry) => /(^|\/)session[^/]*\.jsonl$/i.test(entry.name));
        if (hit === undefined) return null;
        const at = hit.at;
        if (at + 30 > bytes.length || view.getUint32(at, true) !== 0x04034b50) return null;
        const localNameLength = view.getUint16(at + 26, true);
        const localExtraLength = view.getUint16(at + 28, true);
        const start = at + 30 + localNameLength + localExtraLength;
        const raw = bytes.subarray(start, start + hit.packed);
        if (hit.method === 0) return decodeUtf8(raw);
        if (hit.method === 8) {
          const inflated = await inflateRaw(raw);
          return inflated === null ? null : decodeUtf8(inflated);
        }
        return null;
      }
      async function readSessionFile(file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const lower = String(file.name ?? '').toLowerCase();
        const isZip = lower.endsWith('.zip') || (bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b);
        if (isZip) {
          const inner = await readSessionJsonlFromZip(bytes);
          if (inner === null) throw new Error('压缩包里没有 session*.jsonl（或者它不是 /export 导出的那种 zip）');
          return inner;
        }
        const zstdMagic = bytes.length > 3 && ZSTD_MAGIC.every((byte, index) => bytes[index] === byte);
        const looksZstd = zstdMagic || /\.zst(u?d)?$/.test(lower);
        if (looksZstd) {
          if (zstdMagic === false) throw new Error('这个文件不是 zstd 帧，也不是能直接读的 jsonl');
          let zstdSupported = false;
          try {
            if (typeof DecompressionStream === 'function') {
              new DecompressionStream('zstd');
              zstdSupported = true;
            }
          } catch {
            zstdSupported = false;
          }
          if (!zstdSupported) {
            throw new Error('这个浏览器不支持 zstd 解压；请改用「/export」或「下载 Session 日志」导出的 zip 再导入');
          }
          const frames = [];
          let cursor = 0;
          const nextMagic = (from) => {
            for (let i = from; i + 4 <= bytes.length; i += 1) {
              if (ZSTD_MAGIC.every((byte, index) => bytes[i + index] === byte)) return i;
            }
            return -1;
          };
          const isMagic = (at) => at + 4 <= bytes.length
            && ZSTD_MAGIC.every((byte, index) => bytes[at + index] === byte);
          const decodeFrame = async (from, to) => {
            try {
              const stream = new Blob([bytes.subarray(from, to)]).stream().pipeThrough(new DecompressionStream('zstd'));
              return decodeUtf8(new Uint8Array(await new Response(stream).arrayBuffer()));
            } catch {
              return null;
            }
          };
          const frameLengthAt = (start) => {
            if (start + 5 > bytes.length || !isMagic(start)) return null;
            const descriptor = bytes[start + 4];
            const contentSizeFlag = descriptor >> 6;
            const singleSegment = (descriptor >> 5) & 1;
            const checksum = (descriptor >> 2) & 1;
            const dictIdFlag = descriptor & 3;
            let pos = start + 5;
            if (singleSegment === 0) pos += 1;
            if (dictIdFlag === 3) pos += 4;
            else if (dictIdFlag === 2) pos += 2;
            else if (dictIdFlag === 1) pos += 1;
            if (contentSizeFlag !== 0 || singleSegment === 1) {
              pos += [1, 2, 4, 8][contentSizeFlag];
            }
            for (;;) {
              if (pos + 3 > bytes.length) return null;
              const size = (bytes[pos] >> 3) | (bytes[pos + 1] << 5) | (bytes[pos + 2] << 13);
              const blockType = (bytes[pos] >> 1) & 3;
              const lastBlock = bytes[pos] & 1;
              pos += 3;
              if (blockType === 3) return null;
              pos += blockType === 1 ? 1 : size;
              if (lastBlock === 1) break;
            }
            if (checksum === 1) pos += 4;
            if (pos > bytes.length) return null;
            return pos - start;
          };
          const byFrameHeader = async () => {
            const out = [];
            let at = 0;
            let guard = 0;
            while (at < bytes.length && guard < 100000) {
              guard += 1;
              const length = frameLengthAt(at);
              if (length === null) return null;
              const text = await decodeFrame(at, at + length);
              if (text === null) return null;
              out.push(text);
              at += length;
            }
            return at === bytes.length && out.length > 0 ? out : null;
          };
          const structured = await byFrameHeader();
          if (structured !== null) return structured.join('');
          while (isMagic(cursor)) {
            let candidate = cursor + 4;
            let decoded = null;
            let end = cursor + 4;
            for (;;) {
              const next = nextMagic(candidate);
              end = next === -1 ? bytes.length : next;
              decoded = await decodeFrame(cursor, end);
              if (decoded !== null) break;
              if (next === -1) break;
              candidate = next + 4;
            }
            if (decoded === null) break;
            frames.push(decoded);
            cursor = end;
          }
          if (frames.length === 0) {
            const whole = await decodeFrame(0, bytes.length);
            if (whole !== null) return whole;
            throw new Error('zstd 解压失败，请改用 /export 导出的 zip');
          }
          return frames.join('');
        }
        return decodeUtf8(bytes);
      }
      return { readSessionEvents, renderSessionEvents, importViewOf, readSessionFile };
    }
    return { create };
  },
});
