window.__ModuleLoader__.load({
  id: 'dsh-persona-select',
  chunk: 'client.io-export.js',
  factory: function ioExportChunk(require) {
    'use strict';
    function create(deps) {
      const { call, decodeUtf8, EXPORT_FORMAT, EXPORT_VERSION } = deps;
      function clickDownload(url, filename) {
        const anchor = document.createElement('a');
        anchor.href = url;
        if (typeof filename === 'string' && filename !== '') anchor.download = filename;
        anchor.style.display = 'none';
        const body = document.body;
        if (body !== null && body !== undefined && typeof body.appendChild === 'function') body.appendChild(anchor);
        anchor.click();
        if (anchor.parentNode !== null && anchor.parentNode !== undefined) anchor.parentNode.removeChild(anchor);
      }
      function blobDownload(filename, blob) {
        try {
          if (typeof document === 'undefined') return false;
          if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
          const href = URL.createObjectURL(blob);
          clickDownload(href, filename);
          setTimeout(() => {
            try {
              URL.revokeObjectURL(href);
            } catch {
            }
          }, 60000);
          return true;
        } catch {
          return false;
        }
      }
      async function downloadFile(filename, bytes, mime) {
        try {
          const query = `?filename=${encodeURIComponent(filename)}&mime=${encodeURIComponent(mime)}`;
          const result = await call(`/handoff${query}`, { method: 'PUT', body: bytes });
          const url = typeof result?.url === 'string' && result.url !== '' ? result.url : '';
          if (url !== '') {
            clickDownload(url, filename);
            return { ok: true, exact: true, served: await confirmHandoffServed(url) };
          }
        } catch {
        }
        return { ok: blobDownload(filename, new Blob([bytes], { type: mime })), exact: false, served: null };
      }
      async function confirmHandoffServed(url) {
        for (const wait of [250, 750, 1500]) {
          await new Promise((resolve) => setTimeout(resolve, wait));
          try {
            const response = await fetch(url, { method: 'HEAD', headers: { accept: 'application/json' } });
            if (!response.ok) continue;
            const flag = response.headers.get('x-handoff-served');
            if (flag === '1') return true;
            if (flag === null || flag === undefined) return null;
          } catch {
          }
        }
        return false;
      }
      function exportFileName(name, ext) {
        const flat = String(name ?? '')
          .replace(/[\\/:*?"<>|]/g, '_')
          .replace(/[\u0000-\u001f]/g, ' ')
          .trim()
          .slice(0, 40);
        return `${flat === '' ? 'persona' : flat}.persona.${ext}`;
      }
      const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      const PNG_KEYWORD = 'dsh-persona-select';
      const EXPORT_MAX_BYTES = 32 * 1024 * 1024;
      const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let index = 0; index < 256; index += 1) {
          let value = index;
          for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
          table[index] = value >>> 0;
        }
        return table;
      })();
      function crc32(bytes) {
        let crc = 0xffffffff;
        for (let index = 0; index < bytes.length; index += 1) {
          crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
      }
      function readU32(bytes, at) {
        return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
      }
      function writeU32(value) {
        return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
      }
      function concatBytes(parts) {
        let total = 0;
        for (const part of parts) total += part.length;
        const out = new Uint8Array(total);
        let at = 0;
        for (const part of parts) {
          out.set(part, at);
          at += part.length;
        }
        return out;
      }
      function isPng(bytes) {
        if (bytes === null || bytes === undefined || bytes.length < PNG_SIGNATURE.length + 12) return false;
        for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
          if (bytes[index] !== PNG_SIGNATURE[index]) return false;
        }
        return true;
      }
      function eachChunk(bytes, visit) {
        let at = PNG_SIGNATURE.length;
        while (at + 12 <= bytes.length) {
          const length = readU32(bytes, at);
          const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
          const dataAt = at + 8;
          const end = dataAt + length + 4;
          if (end > bytes.length) return at;
          if (visit({ type, at, dataAt, length, end }) === false) return end;
          at = end;
          if (type === 'IEND') return at;
        }
        return at;
      }
      function itxtKeywordOf(bytes, info) {
        const limit = Math.min(info.length, 79);
        let keyword = '';
        for (let offset = 0; offset < limit; offset += 1) {
          const byte = bytes[info.dataAt + offset];
          if (byte === 0) break;
          keyword += String.fromCharCode(byte);
        }
        return keyword;
      }
      function itxtTextOf(bytes, info) {
        const end = info.dataAt + info.length;
        let at = info.dataAt;
        while (at < end && bytes[at] !== 0) at += 1;
        if (at >= end) return null;
        at += 1;
        const flag = bytes[at] ?? 0;
        at += 2;
        while (at < end && bytes[at] !== 0) at += 1;
        at += 1;
        while (at < end && bytes[at] !== 0) at += 1;
        at += 1;
        if (at > end) return null;
        if (flag === 1) return null;
        return decodeUtf8(bytes.subarray(at, end));
      }
      function itxtChunk(text) {
        const encoder = new TextEncoder();
        const keyword = encoder.encode(PNG_KEYWORD);
        const body = encoder.encode(text);
        const data = new Uint8Array(keyword.length + 5 + body.length);
        data.set(keyword, 0);
        data.set(body, keyword.length + 5);
        const type = encoder.encode('iTXt');
        const out = new Uint8Array(12 + data.length);
        out.set(writeU32(data.length), 0);
        out.set(type, 4);
        out.set(data, 8);
        out.set(writeU32(crc32(concatBytes([type, data]))), 8 + data.length);
        return out;
      }
      function packPersonaPng(image, text) {
        if (!isPng(image)) return null;
        const chunk = itxtChunk(text);
        const parts = [image.slice(0, PNG_SIGNATURE.length)];
        let inserted = false;
        const stopAt = eachChunk(image, (info) => {
          if (info.type === 'iTXt' && itxtKeywordOf(image, info) === PNG_KEYWORD) return true;
          parts.push(image.slice(info.at, info.end));
          if (info.type === 'IHDR') {
            parts.push(chunk);
            inserted = true;
          }
          return true;
        });
        if (!inserted) return null;
        if (stopAt < image.length) parts.push(image.slice(stopAt));
        return concatBytes(parts);
      }
      function decodePersonaPack(bytes) {
        if (!isPng(bytes)) {
          try {
            return { ok: true, value: JSON.parse(decodeUtf8(bytes)) };
          } catch (error) {
            return { ok: false, code: 'bad-json', detail: error?.message ?? String(error) };
          }
        }
        let found = null;
        let badCrc = false;
        eachChunk(bytes, (info) => {
          if (info.type !== 'iTXt') return true;
          if (itxtKeywordOf(bytes, info) !== PNG_KEYWORD) return true;
          const stored = readU32(bytes, info.end - 4);
          if (stored !== crc32(bytes.subarray(info.at + 4, info.end - 4))) {
            badCrc = true;
            return false;
          }
          const text = itxtTextOf(bytes, info);
          if (text === null) return true;
          found = text;
          return false;
        });
        if (badCrc) return { ok: false, code: 'png-bad-crc' };
        if (found === null) return { ok: false, code: 'png-no-data' };
        try {
          return { ok: true, value: JSON.parse(found) };
        } catch (error) {
          return { ok: false, code: 'bad-json', detail: error?.message ?? String(error) };
        }
      }
      return { clickDownload, blobDownload, downloadFile, exportFileName, packPersonaPng, decodePersonaPack, isPng };
    }
    return { create };
  },
});
