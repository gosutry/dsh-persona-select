/** `dsh-persona-select` — 包内分块：导出通道 + PNG 装拆（档 5 · X1）。
 *  · 文件名匹配 `client.<名字>.js`，放在与 `client.js` **同目录**（宿主 join(dirname(clientPath), fileName)）；
 *  · `id` 是**包名**，`chunk` 是**文件名**；模块表键是 `dsh-persona-select/client.io-export.js`；
 *  · 分块里不 require('react')，也不复制主包的常量 —— 由 create(deps) 注入。 */
window.__ModuleLoader__.load({
  id: 'dsh-persona-select',
  chunk: 'client.io-export.js',
  factory: function ioExportChunk(require) {
    'use strict';
    /* @build-fingerprint:begin */
    function create(deps) {
      const { call, decodeUtf8, EXPORT_FORMAT, EXPORT_VERSION } = deps;
      /**
       * 点一个 `<a href>` 去发起下载（0.3.1）。
       *
       * `download` 属性仍然给上（桌面浏览器认它），但**不再指望它** ——
       * 应用内 WebView 的下载桥看不到这个属性，真正决定文件名的是响应头。
       * @param {string} url - 下载地址。
       * @param {string} filename - 期望的文件名（提示用）。
       * @returns {void}
       */
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

      /**
       * 兜底：纯粹在浏览器里造一个 blob 下载（0.3.0 的老做法）。
       *
       * 只在交接那条路走不通时用。代价是文件名可能被系统换成 blob URL 的 UUID ——
       * 所以调用方要把「名字不保证」报给用户，而不是假装没事。
       * @param {string} filename - 期望的文件名。
       * @param {Blob} blob - 文件内容。
       * @returns {boolean} 是否成功发起下载。
       */
      function blobDownload(filename, blob) {
        try {
          if (typeof document === 'undefined') return false;
          if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
          const href = URL.createObjectURL(blob);
          clickDownload(href, filename);
          // 立刻 revoke 会打断下载：挪到一分钟后再回收这个 URL。
          setTimeout(() => {
            try {
              URL.revokeObjectURL(href);
            } catch {
              // 回收失败不影响已经发起的下载。
            }
          }, 60000);
          return true;
        } catch {
          return false;
        }
      }

      /**
       * 把一份文件交给浏览器下载（0.3.1）。
       *
       * 为什么不直接 `blob:` + `<a download>`：应用内 WebView 的下载桥拿不到
       * `<a download>` 里那个名字，只看到 `blob:…/<uuid>` 和 MIME 类型，于是文件
       * 被存成 `<uuid>.json` —— 与界面上提示的名字对不上（0.3.0 的 bug）。
       * 改成「把字节交给 Host 收着 → 浏览器去下 `/handoff/<token>`」，文件名走
       * `Content-Disposition` 响应头；这条路正是 DSH 自己的会话导出在用的。
       * @param {string} filename - 期望的文件名。
       * @param {Uint8Array} bytes - 文件内容。
       * @param {string} mime - MIME 类型。
       * @returns {Promise<{ok: boolean, exact: boolean}>} 是否发起下载、文件名是否保证。
       */
      async function downloadFile(filename, bytes, mime) {
        try {
          const query = `?filename=${encodeURIComponent(filename)}&mime=${encodeURIComponent(mime)}`;
          const result = await call(`/handoff${query}`, { method: 'PUT', body: bytes });
          const url = typeof result?.url === 'string' && result.url !== '' ? result.url : '';
          if (url !== '') {
            clickDownload(url, filename);
            // 点完不等于下到了：回头确认一下，别盲目报成功（0.3.2）。
            return { ok: true, exact: true, served: await confirmHandoffServed(url) };
          }
        } catch {
          // 交接失败不该让导出整个失败：掉到下面的 blob 兜底。
        }
        return { ok: blobDownload(filename, new Blob([bytes], { type: mime })), exact: false, served: null };
      }

      /**
       * 回头确认「那份东西到底被下载腿取走了没有」（0.3.2）。
       *
       * 网页没法旁观一次下载的成败 —— `<a>` 一点，后面全是浏览器的事，它不回话。
       * 所以换个办法：Host 在取件响应里带 `X-Handoff-Served`，**GET 拿过数据**
       * 才变成 1（HEAD 探路不算）。于是点完下载隔一会儿 HEAD 探几次，就能知道
       * 这次下载究竟有没有发生 —— 而不是像 0.3.0/0.3.1 那样无条件报成功。
       * @param {string} url - Host 给的取件 URL（绝对路径）。
       * @returns {Promise<boolean|null>} true 取走了 / false 没发生 / null 判不了。
       */
      async function confirmHandoffServed(url) {
        for (const wait of [250, 750, 1500]) {
          await new Promise((resolve) => setTimeout(resolve, wait));
          try {
            const response = await fetch(url, { method: 'HEAD', headers: { accept: 'application/json' } });
            if (!response.ok) continue; // 404/401：再等等，别急着下结论
            const flag = response.headers.get('x-handoff-served');
            if (flag === '1') return true;
            if (flag === null || flag === undefined) return null; // 老 Host 没这个头：判不了
          } catch {
            // 探测本身失败：继续等下一次。
          }
        }
        return false;
      }

      /**
       * 导出文件名（0.3.0 起）：`<人设名>.persona.<json|png>`。
       * 名字里的路径分隔符等字符换成下划线，免得某些系统不认。
       * @param {string} name - 人设名字。
       * @param {'json'|'png'} ext - 扩展名。
       * @returns {string} 文件名。
       */
      function exportFileName(name, ext) {
        const flat = String(name ?? '')
          .replace(/[\\/:*?"<>|]/g, '_')
          .replace(/[\u0000-\u001f]/g, ' ')
          .trim()
          .slice(0, 40);
        return `${flat === '' ? 'persona' : flat}.persona.${ext}`;
      }

      /* ─────────── 导出图片：PNG 的装 / 拆（0.3.1）─────────── */

      /**
       * PNG 的 8 字节签名。
       * PNG 就是一个「签名 + 一串块」的容器，块类型首字母小写 = 附属块，
       * 规范要求解码器**跳过**不认识的附属块 —— 这就是「塞数据不影响看图」的原理。
       */
      const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

      /**
       * 我们塞进图里的文本块关键字。
       * 18 字节、纯可打印 Latin-1、不含 NUL —— 符合 iTXt 对关键字的限制（1~79 字节）。
       * 读取时**精确全长比对**：撞前缀的别人的块不能当成我们的。
       */
      const PNG_KEYWORD = 'dsh-persona-select';

      /** 单次导出的字节上限（与 Host 的 HANDOFF_MAX_ENTRY_BYTES 一致）。 */
      const EXPORT_MAX_BYTES = 32 * 1024 * 1024;

      /** 标准 CRC32 查表（IEEE 802.3 多项式 0xEDB88320，init / final 都取反）。 */
      const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let index = 0; index < 256; index += 1) {
          let value = index;
          for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
          table[index] = value >>> 0;
        }
        return table;
      })();

      /**
       * 算一段字节的 CRC32。
       * @param {Uint8Array} bytes - 输入。
       * @returns {number} 无符号 32 位结果。
       */
      function crc32(bytes) {
        let crc = 0xffffffff;
        for (let index = 0; index < bytes.length; index += 1) {
          crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
      }

      /**
       * 读一个大端 32 位整数。
       * @param {Uint8Array} bytes - 输入。
       * @param {number} at - 起始偏移。
       * @returns {number} 无符号值。
       */
      function readU32(bytes, at) {
        return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
      }

      /**
       * 写一个大端 32 位整数。
       * @param {number} value - 输入。
       * @returns {Uint8Array} 4 字节。
       */
      function writeU32(value) {
        return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
      }

      /**
       * 拼若干段字节。
       * @param {Uint8Array[]} parts - 各段。
       * @returns {Uint8Array} 拼好的结果。
       */
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

      /**
       * 判断是不是 PNG。
       * @param {Uint8Array} bytes - 输入。
       * @returns {boolean} 是否带 PNG 签名。
       */
      function isPng(bytes) {
        if (bytes === null || bytes === undefined || bytes.length < PNG_SIGNATURE.length + 12) return false;
        for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
          if (bytes[index] !== PNG_SIGNATURE[index]) return false;
        }
        return true;
      }

      /**
       * 逐个走 PNG 的块：`长度(4) 类型(4) 数据(长度) CRC(4)`。
       *
       * 只做**框架层**的事，不解码像素 —— 所以图坏没坏不影响读数据。
       * @param {Uint8Array} bytes - PNG 字节。
       * @param {(info: {type: string, at: number, dataAt: number, length: number, end: number}) => boolean} visit
       *   每块调用一次；返回 `false` 表示到此为止。
       * @returns {number} 已经消费到的偏移（这之前的字节都处理过了）。
       */
      function eachChunk(bytes, visit) {
        let at = PNG_SIGNATURE.length;
        while (at + 12 <= bytes.length) {
          const length = readU32(bytes, at);
          const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
          const dataAt = at + 8;
          const end = dataAt + length + 4;
          if (end > bytes.length) return at; // 截断了：停在这里，别越界
          if (visit({ type, at, dataAt, length, end }) === false) return end;
          at = end;
          if (type === 'IEND') return at;
        }
        return at;
      }

      /**
       * 读一块 iTXt 的关键字（Latin-1，到 NUL 为止）。
       * @param {Uint8Array} bytes - PNG 字节。
       * @param {{dataAt: number, length: number}} info - 块信息。
       * @returns {string} 关键字。
       */
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

      /**
       * 读一块（未压缩的）iTXt 的正文。
       *
       * iTXt 的数据段排布：`关键字 00 压缩标志 压缩方法 [语言标签] 00 [翻译关键字] 00 正文`。
       * 我们自己写的永远是未压缩（标志 0、方法 0、两个标签都空）。
       * @param {Uint8Array} bytes - PNG 字节。
       * @param {{dataAt: number, length: number}} info - 块信息。
       * @returns {string|null} 正文；压缩过或结构不对时返回 null。
       */
      function itxtTextOf(bytes, info) {
        const end = info.dataAt + info.length;
        let at = info.dataAt;
        while (at < end && bytes[at] !== 0) at += 1; // 关键字
        if (at >= end) return null;
        at += 1;
        const flag = bytes[at] ?? 0;
        at += 2; // 压缩标志 + 压缩方法
        while (at < end && bytes[at] !== 0) at += 1; // 语言标签
        at += 1;
        while (at < end && bytes[at] !== 0) at += 1; // 翻译后关键字
        at += 1;
        if (at > end) return null;
        // 压缩的块我们不写、也不解：宁可说读不出来，也不要在这条路上解压。
        if (flag === 1) return null;
        // 统一走同层的 `decodeUtf8()`（ps2 档位 1 · A2）：没有 `TextDecoder` 的老 WebView
        // 上它退回到 `String.fromCharCode` + `decodeURIComponent(escape(...))`，
        // 现代环境两支完全等价（`decodeUtf8()` 内部就是同一句解码）。
        return decodeUtf8(bytes.subarray(at, end));
      }

      /**
       * 造一块装着人设 JSON 的 iTXt。
       * @param {string} text - JSON 原文（UTF-8，不压缩）。
       * @returns {Uint8Array} 完整的块字节（含长度与 CRC）。
       */
      function itxtChunk(text) {
        const encoder = new TextEncoder();
        const keyword = encoder.encode(PNG_KEYWORD);
        const body = encoder.encode(text);
        // 关键字 + 关键字结束 + 压缩标志 + 压缩方法 + 空语言标签结束 + 空翻译关键字结束
        const data = new Uint8Array(keyword.length + 5 + body.length);
        data.set(keyword, 0);
        data.set(body, keyword.length + 5); // 中间那 5 个字节本来就是 0
        const type = encoder.encode('iTXt');
        const out = new Uint8Array(12 + data.length);
        out.set(writeU32(data.length), 0);
        out.set(type, 4);
        out.set(data, 8);
        out.set(writeU32(crc32(concatBytes([type, data]))), 8 + data.length);
        return out;
      }

      /**
       * 把 JSON 装进一张 PNG（0.3.1）。
       *
       * 做法是**纯字节拼接**：原图所有块原样搬过去，只在 IHDR 后面插一条 iTXt，
       * 顺带把**已有的同名块丢掉**（同一张图二次导出时不叠层）。所以像素与原图
       * 逐位相同、任何块的 CRC 都不用重算 —— 画质零损失，看图工具照常显示。
       * @param {Uint8Array} image - 用户选的 PNG 原图。
       * @param {string} text - 人设 JSON 原文。
       * @returns {Uint8Array|null} 装好的新图；不是 PNG（或缺 IHDR）时返回 null。
       */
      function packPersonaPng(image, text) {
        if (!isPng(image)) return null;
        const chunk = itxtChunk(text);
        // 签名一定要带上：`eachChunk` 是从第 8 个字节开始走的，别把它落下。
        const parts = [image.slice(0, PNG_SIGNATURE.length)];
        let inserted = false;
        const stopAt = eachChunk(image, (info) => {
          if (info.type === 'iTXt' && itxtKeywordOf(image, info) === PNG_KEYWORD) return true; // 丢掉旧的
          parts.push(image.slice(info.at, info.end));
          if (info.type === 'IHDR') {
            parts.push(chunk);
            inserted = true;
          }
          return true;
        });
        if (!inserted) return null;
        // IEND 之后的尾巴（有些工具会留）原样带上，别吞掉别人的数据。
        if (stopAt < image.length) parts.push(image.slice(stopAt));
        return concatBytes(parts);
      }

      /**
       * 从一个导入文件里取出人设容器（0.3.1）。
       *
       * 认两种信封：**纯 JSON**（0.3.0 那种）和**PNG**（只认我们自己那个 iTXt 块，
       * 别的块 —— IHDR/IDAT、别人的 tEXt、EXIF —— 一律不看）。
       * @param {Uint8Array} bytes - 文件字节。
       * @returns {{ok: true, value: unknown} | {ok: false, code: string, detail?: string}} 结果。
       */
      function decodePersonaPack(bytes) {
        if (!isPng(bytes)) {
          try {
            // 与 `itxtTextOf()` 同一个解码口子（ps2 档位 1 · A2）。
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
          // 只校验我们自己那块：CRC 对不上说明文件被改过，静默导入最糟。
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
    /* @build-fingerprint:end */
  },
});
