/** `dsh-persona-select` — 包内分块：会话日志导入 / 注入壳 / ZIP·zstd·utf8（档 5 · X1）。
 *  · 名字与位置同 `client.io-export.js`；
 *  · 四个函数被主包用（`log.readSessionFile` / `log.readSessionEvents` /
 *    `log.renderSessionEvents` / `log.importViewOf`），其余只在本块内部互相调用；
 *  · 与主包共用的常量/函数一律由 create(deps) 注入，本文件里不留第二份定义。 */
window.__ModuleLoader__.load({
  id: 'dsh-persona-select',
  chunk: 'client.log-import.js',
  factory: function logImportChunk(require) {
    'use strict';
    /* @build-fingerprint:begin */
    function create(deps) {
      const { USER_OPEN, USER_CLOSE, ASSISTANT_OPEN, ASSISTANT_CLOSE, FILE_OPEN, FILE_CLOSE, HISTORY_WRAPPER_LINES, HISTORY_FRAME_LINES, HISTORY_FRAME_ESCAPE, HISTORY_LEGACY_TAGS, HISTORY_LEGACY_PREAMBLE, LEGACY_USER_MARKER, IMAGE_EXTENSIONS, ZSTD_MAGIC, decodeUtf8, historyBytesOf } = deps;

      /**
       * 思考的包裹标签（0.3.24 收成常量）。
       *
       * 与主包共用的两对标签（`USER_*` / `ASSISTANT_*`）由 `create(deps)` 注入，
       * 而 `<thinking>` 一直是本块自己的字面量。0.3.24 起「渲染时包上去」与
       * 「不勾时剥下来」必须是**同一份写法**（剥错了就是思考留在输入框里），
       * 所以这里收成一对常量，本文件里只此一处定义。
       */
      const THINKING_OPEN = '<thinking>';
      const THINKING_CLOSE = '</thinking>';

      /* ── 渲染常量（0.1.7 起的「导入格式」）──────────────────────── */

      /**
       * 取一个 `file` / `image` 块的**全文件名**。
       *
       * - `file` 块的 `attachment.name` 是必填的，直接用它（`报告.pdf`）。
       * - `image` 块的 `name` 是**可选**的：用户从相册选图时常常没有名字。
       *   这时按 mediaType 合成 `image.png` 这样的占位名 —— 至少格式是对的，
       *   比丢一个 `[image]` 给模型强。
       * @param {object} block - 内容块。
       * @returns {string} 文件名；拿不到时为空串。
       */
      function attachmentFileName(block) {
        const attachment = block?.attachment;
        if (attachment === null || attachment === undefined || typeof attachment !== 'object') return '';
        if (typeof attachment.name === 'string' && attachment.name.trim() !== '') {
          return attachment.name.trim();
        }
        const extension = IMAGE_EXTENSIONS[attachment.mediaType];
        return typeof extension === 'string' ? `image.${extension}` : '';
      }

      /**
       * 把一条消息的 content 渲染成「正文 + 文件标记」，**保持原始顺序**。
       *
       * 用户方与模型方**共用这一个函数**：两边的 `content` 用的是同一套块类型
       * （`text` / `reasoning` / `image` / `file` / `tool-call`），而需求要求两边
       * 的文件写法完全一致（`<file>名字.扩展名</file>`）。共用一份实现才不会
       * 出现「用户方换个名字、模型方没跟上」那种漂移。
       *
       * - `text`     → 正文
       * - `file` / `image` → `<file>全文件名</file>`
       * - `reasoning` → **跳过**：模型方的思考由调用方单独渲染成 `<thinking>`，
       *                 它不进 `<assistant_message>`（需求要的就是「非思考内容」）
       * - `tool-call` 等 → 跳过（需求明确不要工具调用写法）
       *
       * 为什么保序：用户常常「先说一句 → 再附图」，或者「先附图 → 再说一句」，
       * 顺序反了这句话就指不明白。
       * @param {unknown} content - 消息的 content 数组。
       * @returns {string} 渲染结果；没有任何可用块时为空串。
       */
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

      /**
       * 这段用户文本是不是**本插件注入过的历史**。
       *
       * 三个版本的壳都要认：
       *   - 0.2.5 起（含 0.3.6）都有 `CONTEXT_ROAD:` / `CONTINUE_CONTEXT.` 两行
       *     定位符 —— 整行匹配，免得用户正文里恰好提到就被误判；
       *   - 0.3.6 起外面还多一层 `<system-reminder>` 外框：万一定位符那颗锚点
       *     被别的做法动过，只要「外框整行 + 收尾定位符整行」同时成立也算；
       *   - 0.2.4 及更早是两句开场说明 + `<persona-history>` 标签。
       * @param {string} text - 用户消息的纯文本。
       * @returns {boolean} 是注入壳时为 true。
       */
      function looksInjected(text) {
        const source = typeof text === 'string' ? text : String(text ?? '');
        if (HISTORY_LEGACY_TAGS.some((tag) => source.includes(tag))) return true;
        const lines = source.split('\n').map((line) => line.trim());
        if (lines.includes(HISTORY_WRAPPER_LINES[0])) return true;
        return lines.includes(HISTORY_FRAME_LINES[0]) && lines.includes(HISTORY_WRAPPER_LINES[1]);
      }

      /**
       * 剥掉注入壳：0.3.6 的 `<system-reminder>` 外框、头尾定位符、旧版开场说明与
       * `<persona-history>` 标签，**循环到稳定**；顺带把注入时对正文做的转义
       * （`<\/system-reminder>`）还原回原样。
       *
       * 为什么不是一条 `<persona-history>([\s\S]*?)<\/persona-history>` 就完事：
       * 那个正则在「内容本身也含标签」时会**错配** —— 它从最外层开标签一路匹配到
       * 内容里的第一个闭标签，把中间一大段当成壳丢掉、后半段留下。而这恰恰是
       * 反复导入时的常态（上一版留下的壳就在内容里）。
       *
       * 所以这里改成**只剔除标签符号本身**，不配对、不限层数：不管套了几层、
       * 标签出现在哪，剥完之后剩下的都是纯内容。配上「去掉开场说明 + 压缩连续空行」，
       * 一层和多层得到同一个结果 —— 这就是「修复嵌套」。
       * @param {string} text - 原始文本。
       * @returns {string} 剥壳后的文本。
       */
      function unwrapPersonaHistory(text) {
        let out = typeof text === 'string' ? text : String(text ?? '');
        for (let round = 0; round < 8; round += 1) {
          const before = out;
          for (const tag of HISTORY_LEGACY_TAGS) out = out.split(tag).join('');
          // 0.3.6：正文里被转义的收尾标签还原回原样（注入时那一步的逆操作）。
          out = out.split(HISTORY_FRAME_ESCAPE).join(HISTORY_FRAME_LINES[1]);
          // 外框、头尾标记与旧版开场说明都是**壳的一部分**，跟着一起丢。
          out = out
            .split('\n')
            .filter((line) => {
              const trimmed = line.trim();
              if (HISTORY_WRAPPER_LINES.includes(trimmed)) return false;
              if (HISTORY_FRAME_LINES.includes(trimmed)) return false;
              return !HISTORY_LEGACY_PREAMBLE.some((marker) => line.includes(marker));
            })
            .join('\n');
          // 剥完之后容易出现三个以上连续换行，压回两行，避免越剥越松。
          out = out.replace(/\n{3,}/g, '\n\n').trim();
          if (out === before) break;
        }
        return out.trim();
      }

      /**
       * 把 0.1.6 首版留下的 `【用户】` **前缀**回贴成 `<user_message>` **成对标签**。
       *
       * 只作用在「剥过壳的历史」上：那段文本是上一版渲染出来的，块与块之间正是
       * 我当年用 `\n\n` 拼起来的，所以按 `\n\n` 切分就能还原出块边界。
       *
       * **已知不精确**：用户正文里如果本来就有空行，那一块的第二段会被当成
       * 独立块而漏掉标签。代价只是标记错位，正文一个字都不会丢 —— 而且这段
       * 历史本来就是一次性产物，重新从原始会话导入即可得到完全干净的版本。
       * @param {string} text - 已经剥过壳的历史文本。
       * @returns {string} 回贴后的文本。
       */
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

      /**
       * 从一个字符串里取所有文本块拼起来。
       * 事件里的 `content` 可能是 `[{type:'text',text}]`，也可能有 `reasoning` / `image`。
       * @param {unknown} content - 事件里的 content 字段。
       * @param {string} [wantType] - 只要这一种块；省略则取 text。
       * @returns {string} 拼接结果。
       */
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

      /**
       * 从任意文本里抠出所有**顶层** JSON 对象。
       *
       * 用途是给「一行一个 JSON」之外的形态兜底：缩进美化过的 JSON、被数组包起来的
       * 事件列表、以及混杂了别的文字片段的导出结果。做法是按花括号深度扫一遍，
       * 并且**正确地跳过字符串里的括号**（`"{"` 这种转义内容不会把深度带偏）。
       *
       * 只收 depth 归零的那一层：嵌套的 `data` / `message` 不会被单独抠出来，
       * 所以结果就是「事件」这一级。
       * @param {string} text - 任意文本。
       * @returns {string[]} 顶层 JSON 对象的原文片段。
       */
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

      /**
       * 把一段文本读成事件列表，两条路取认得更多的那条。
       *
       *   1. **快路径**：逐行 `JSON.parse`。真正的 session JSONL（磁盘上的
       *      `session.vN.jsonl` 与 `/export` 的产物）就是一行一个事件，
       *      每一行都能解析 —— 这条路上不做任何多余的事。
       *   2. **兜底路径**：只要有任意一行解析不了，就改用
       *      {@link extractJsonObjects} 按花括号深度抠顶层对象。
       *      缩进美化过的 JSON、被 `[...]` 包起来的列表、以及用户手写的片段
       *      都在这条路上被认出来。
       *
       * 「认得更多」而不是「快路径优先」：美化的 JSON 在快路径上会得到 0 个事件，
       * 那时必须切过去；反过来，真日志里混进一行坏数据时兜底路径也可能多认出几个，
       * 用计数比较两条路都能覆盖。
       * @param {string} text - 文本。
       * @returns {object[]} 解析出来的事件对象（坏片段已跳过）。
       */
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
            // 这一行不是完整 JSON —— 记下来，交给下面判断要不要走兜底。
          }
        }
        if (nonEmptyLines > 0 && fromLines.length === nonEmptyLines) return fromLines;
        const fromScan = [];
        for (const chunk of extractJsonObjects(source)) {
          try {
            const parsed = JSON.parse(chunk);
            if (parsed !== null && typeof parsed === 'object') fromScan.push(parsed);
          } catch {
            // 抠出来的片段仍然不是合法 JSON（例如片段本身被截断）：跳过。
          }
        }
        return fromScan.length > fromLines.length ? fromScan : fromLines;
      }

      /**
       * 把一段文本里的 `<thinking>…</thinking>` **整段**删掉（0.3.24）。
       *
       * 为什么是「整段」而不是只删那对标签：留下来的正是思考内容本身，只删标签
       * 等于没删。
       *
       * 为什么按**层数**数，而不是「遇到第一个收尾标签就收工」：模型完全可能在
       * 思考正文里顺手写出这个标签的字面量，渲染出来就是嵌套的一对。只认第一个
       * 收尾会把内层的收尾当成整段的结束，于是外层剩下的半截思考漏到外面。
       *
       * 为什么没有收尾标签时也吃到底（日志被截断、或用户手打了这个标签）：留着
       * 的那半截既不是正文、也不是合法标记，而「不勾『导入思考过程』就一个字的
       * 思考都不许进输入框」是这一版明确的需求 —— 两害相权，宁严勿松。
       *
       * 孤立的**收尾**标签只丢它自己（不连坐后面的正文）：那种情况更像是正文里
       * 提了一嘴这个标签，而不是一段思考的开头。
       *
       * ⚠ 0.3.26：这个早退原来只认 `<thinking>`，于是「整份文本里一个开头标签都
       * 没有、只有一个孤立收尾标签」时整段原样返回 —— 上面那条「只丢它自己」其实
       * 不成立（用户导入的正文里会留下一个 `</thinking>`）。现在任一标签出现过就
       * 进入剥离，早退只留给「两个标签都没有」的文本。
       * @param {string} region - 一段不含压缩摘要的文本。
       * @returns {string} 去掉思考后的文本。
       */
      function stripThinkingInRegion(region) {
        if (!region.includes(THINKING_OPEN) && !region.includes(THINKING_CLOSE)) return region;
        let out = '';
        /** 尚未输出的正文起点。 */
        let cursor = 0;
        /** 当前嵌在第几层 `<thinking>` 里。 */
        let depth = 0;
        let at = 0;
        for (;;) {
          const open = region.indexOf(THINKING_OPEN, at);
          const close = region.indexOf(THINKING_CLOSE, at);
          if (close !== -1 && (open === -1 || close < open)) {
            if (depth > 0) {
              depth -= 1;
              at = close + THINKING_CLOSE.length;
              // 最外层那个收尾：整段思考到此结束。
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

      /**
       * 不勾「导入思考过程」时，把**压缩摘要之外**的全部思考删掉（0.3.24 的修复本体）。
       *
       * 改前只有模型方那条分支看勾选框，而「这份日志里已经带着本插件注入过的
       * 人设历史」走的是**原文照发**那条分支 —— 于是上一次勾着导入、存进人设、
       * 又被注入回来的 `<thinking>` 会跟着壳一起回到输入框，**取消勾选也清不掉**。
       * 用户看到的正是那个不对称：上次的思考洗不掉、本次的洗得掉。
       *
       * 现在改成在渲染的最后一步按区段剥：不管思考是从模型方来的、还是从注入壳的
       * 原文里来的，不勾就一个都不留；两个勾选框的四种组合也就都跟着干净了。
       *
       * **压缩摘要里的一律保留**：`<compacted-summary>` 包住的那一段按 0.3.14 的
       * 约定是原文照搬 —— 它里面写着什么就带什么，包括思考标签。
       *
       * ⚠ 0.3.26：这个早退原来也只认 `<thinking>`，于是「整份文本只有一个孤立
       * `</thinking>`」时连 `tidy()` 都不会跑、标签原样留下。现在按两个标签任一
       * 出现即进入剥离（与 `stripThinkingInRegion()` 的早退判据一致）。
       * @param {string} text - 渲染好的整份导入文本。
       * @returns {string} 去掉了压缩摘要之外全部思考的文本。
       */
      function stripThinkingOutsideSummaries(text) {
        const source = typeof text === 'string' ? text : '';
        if (source === '' || (!source.includes(THINKING_OPEN) && !source.includes(THINKING_CLOSE))) return source;
        /** 剥掉一段之后常留下三行以上空行，压回两行，别越剥越松。 */
        const tidy = (chunk) => chunk.replace(/\n{3,}/g, '\n\n');
        const found = scanSummarySpans(source);
        if (found.length === 0) return tidy(stripThinkingInRegion(source));
        let out = '';
        let cursor = 0;
        for (const entry of found) {
          out += tidy(stripThinkingInRegion(source.slice(cursor, entry.start)));
          // 摘要那一段**原文照搬**，一个字符都不动。
          out += source.slice(entry.start, entry.end);
          cursor = entry.end;
        }
        return out + tidy(stripThinkingInRegion(source.slice(cursor)));
      }

      /**
       * 把**已经解析好**的会话事件渲染成导入文本。
       *
       * 只读两类事件：
       *   - `user/message`      用户说过的话（`data.content`），用
       *                         `<user_message>…</user_message>` 包起来；里面
       *                         的 `file` / `image` 块渲染成 `<file>名字.扩展名</file>`
       *   - `assistant/message` 模型说过的话（`data.message.content`，
       *                         `type:'reasoning'` 是**思考**、`type:'text'` 是正文）
       * 其余（工具、系统提示词、标题生成、审批、日志投递…）一律忽略 ——
       * 需求里明确不要工具调用那一套写法。
       *
       * 两种特殊用户消息：
       *   - 本插件自己注入的 `<persona-history>` 壳：**剥掉重发**，不再包一层
       *     （这就是「修复嵌套」）。
       *   - 0.1.6 首版留下的 `【用户】` 前缀：回贴成新的成对标签。
       *
       * 坏片段**跳过而不是整体失败**：一份真实的日志里混着几十种事件类型，
       * 让一行不认识的东西把整个导入弄失败是最差的行为。
       *
       * 刻意分成「解析一次 -> 各渲染一遍」两步：导入日志那一处先
       * `readSessionEvents()` 解析一次，带 / 不带思考各渲染一遍即可 —— 大日志下
       * 解析才是大头（实测 2.9MB 日志，解析两遍比一遍多约 27ms）。
       * @param {Array<object>} events - `readSessionEvents` 的结果。
       * @param {boolean} includeThinking - 是否把 `reasoning` 包成 `<thinking>`。
       *   为 false 时（默认）**整份结果里都不会剩思考**：模型方那条分支不渲染它，
       *   「原文照发」的注入壳与别处残留的思考由
       *   {@link stripThinkingOutsideSummaries} 在最后一步剥掉，只有
       *   `<compacted-summary>` 包住的压缩摘要例外（那段按约定原文照搬）。
       * @returns {string} 导入文本。
       */
      function renderSessionEvents(events, includeThinking) {
        const wantThinking = includeThinking === true;
        /** @type {Array<{role: string, body: string, thinking: string}>} */
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
              // 已经带壳的历史：剥壳 + 回贴旧标记，然后**原样**发出去 —— 不能
              // 再包 <user_message>，那正是「套娃」的来源。
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
            // 正文走和用户方同一个渲染器：`text` 与 `file` / `image` 保序输出，
            // `reasoning` 被它跳过（思考由下面单独包成 <thinking>）。
            const body = renderContentParts(content);
            const thinking = wantThinking ? textOfBlocks(content, 'reasoning').trim() : '';
            if (body === '' && thinking === '') continue;
            blocks.push({ role: 'assistant', body, thinking });
          }
        }
        const rendered = blocks
          .map((block) => {
            // 用户方、模型方各自包起来；「剥过壳的历史」原样发。
            if (block.role === 'user') {
              return `${USER_OPEN}\n${block.body}\n${USER_CLOSE}`;
            }
            if (block.role === 'assistant') {
              // 思考**不进** <assistant_message>：需求要的是「非思考内容」。
              const parts = [];
              if (block.thinking !== '') parts.push(THINKING_OPEN, block.thinking, THINKING_CLOSE);
              if (block.body !== '') parts.push(`${ASSISTANT_OPEN}\n${block.body}\n${ASSISTANT_CLOSE}`);
              return parts.join('\n');
            }
            return block.body;
          })
          .join('\n\n');
        // 不勾时最后再按区段剥一遍：上面那条模型方分支只管得住它自己渲染出来的
        // 思考，管不住「原文照发」的注入壳里本来就带着的思考（0.3.24 的修复）。
        return wantThinking
          ? rendered
          : stripThinkingOutsideSummaries(rendered).replace(/^\s+/, '').replace(/\s+$/, '');
      }

      /**
       * 导出文本里的**包裹标签**：一段压缩摘要自己就裹在 `<user_message>…</user_message>`
       * 这类标签里，拆/留的时候都要认它们。
       */
      const WRAPPER_TAGS = ['user_message', 'assistant_message', 'thinking', 'file', 'system-reminder'];

      /**
       * 剥掉一段「尾巴」开头的**框架残留**。
       *
       * 尾巴指的是「最后一段 `</compacted-summary>` 之后」那截原文。它开头往往还剩
       * 半截框：压缩摘要自己那个包裹的收尾标签（`</user_message>`）、注入壳的两行
       * 定位符（`CONTEXT_ROAD:` / `CONTINUE_CONTEXT.`）与 `</system-reminder>` 外框。
       * 这些不是对话，接在摘要后面只会留下一个孤零零的收尾标签。
       * @param {string} tail - 尾巴原文。
       * @returns {string} 剥掉开头框架残留、并去掉首尾空白后的文本。
       */
      function stripTailHead(tail) {
        const source = typeof tail === 'string' ? tail : '';
        if (source === '') return '';
        const closer = new RegExp(`^\\s*(?:</(?:${WRAPPER_TAGS.join('|')})>)\\s*`, 'g');
        const frameLine = /^\s*(?:CONTEXT_ROAD:|CONTINUE_CONTEXT\.)\s*$/;
        let out = source;
        // 反复剥：`</user_message>` 之后可能还跟着定位行、再跟一个外框收尾。
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

      /**
       * 一趟扫出所有**压缩摘要**的原文与 `[start, end)`。
       *
       * 0.3.24 起单独抽出来，是因为「剥思考」也要用它：摘要包住的那一段是
       * **保护区**，里面的 `<thinking>` 必须原样留着。两处各写一遍同一个正则
       * 就是两份定义，哪天标签改了必漏一处 —— 所以只留这一个扫描，
       * {@link scanCompactedSummaries} 与 {@link stripThinkingOutsideSummaries}
       * 都走它。
       * @param {string} source - 要扫的文本。
       * @returns {Array<{block: string, start: number, end: number}>} 每段的原文与位置。
       */
      function scanSummarySpans(source) {
        // 非贪婪 + 全局：一趟扫完。
        const pattern = /<compacted-summary>[\s\S]*?<\/compacted-summary>/g;
        const found = [];
        let match = pattern.exec(source);
        while (match !== null) {
          found.push({ block: match[0], start: match.index, end: match.index + match[0].length });
          match = pattern.exec(source);
        }
        return found;
      }

      /**
       * 一趟扫出**全部**压缩摘要（0.3.14；0.3.8–0.3.13 只取最后一段）。
       *
       * 取的是 `match[0]`，也就是**原文照搬**：标签、里面的换行与缩进一个字符都不动，
       * 也不带任何外层包裹（`<user_message>` / `<thinking>` 一律不要）。
       *
       * 扫描是**纯函数**，不碰状态：调用方每渲染一次就重算一次，于是「勾上 → 取消 →
       * 再勾上」永远回到同一份文本，两个勾选框怎么组合都不会漂。
       *
       * 结果里连**每一段的位置**一起给出去：压缩视图与展开原文是同一份文本上的
       * 两种取法，共用这一次扫描就够了，不必各扫一遍（`importViewOf` 就是这么用的）。
       * @param {string} text - 渲染好的导入文本（带 / 不带思考都行）。
       * @returns {{blocks: string[], spans: Array<{start: number, end: number}>, count: number, tail: string}}
       *   `blocks` = 每一段的原文（按出现顺序）；`spans` = 每段在原文里的
       *   `[start, end)`；`count` = 段数；`tail` = 最后一段之后那截（已剥掉开头
       *   的框架残留，见 {@link stripTailHead}）；一段都没有时 `blocks` / `spans`
       *   是空数组、`tail` 是空串。
       */
      function scanCompactedSummaries(text) {
        const source = typeof text === 'string' ? text : '';
        if (source === '') return { blocks: [], spans: [], count: 0, tail: '' };
        const found = scanSummarySpans(source);
        if (found.length === 0) return { blocks: [], spans: [], count: 0, tail: '' };
        const last = found[found.length - 1];
        return {
          blocks: found.map((entry) => entry.block),
          /** 每段的 `[start, end)`，给「展开原文」直接用。 */
          spans: found.map((entry) => ({ start: entry.start, end: entry.end })),
          count: found.length,
          tail: stripTailHead(source.slice(last.end)),
        };
      }

      /**
       * 「压缩视图」（0.3.14 起导入的**默认**内容）：只留全部压缩摘要的原文，
       * 再接上最后一段之后的那截对话。
       *
       * 摘要之前、以及两段摘要之间的普通内容不导入 —— 那些内容本来就被后一段摘要
       * 覆盖过（压缩就是把它们换成了一段摘要）。
       *
       * 一份摘要都没有时**原样返回整份文本**：没有可压缩的东西，不该凭空少东西。
       * @param {string} text - 渲染好的导入文本。
       * @param {{count: number, blocks: string[], tail: string}} [scan] - 已经算好的
       *   扫描结果（同一个调用点要同时产出压缩视图与展开原文时省一遍扫描）。
       * @returns {string} 压缩视图。
       */
      function compactedViewOf(text, scan) {
        const source = typeof text === 'string' ? text : '';
        const hit = scan ?? scanCompactedSummaries(source);
        if (hit.count === 0) return source;
        const head = hit.blocks.join('\n\n');
        return hit.tail === '' ? head : `${head}\n\n${hit.tail}`;
      }

      /**
       * 「展开原文」（0.3.14 起「展开原文压缩」勾上后的内容）：整份文本**去掉**
       * 所有压缩摘要，其余一个字符都不动。
       *
       * 摘要是**独占一层包裹**时（导出格式里它自己就是一条 `<user_message>` 消息），
       * 连那层包裹一起删 —— 否则会剩下一个空的 `<user_message></user_message>` 壳。
       * @param {string} text - 渲染好的导入文本。
       * @param {{spans: Array<{start: number, end: number}>}} [scan] - 已经算好的
       *   扫描结果（见 {@link scanCompactedSummaries}）。
       * @returns {string} 展开后的文本。
       */
      function uncompactedViewOf(text, scan) {
        const source = typeof text === 'string' ? text : '';
        if (source === '') return '';
        const spans = (scan ?? scanCompactedSummaries(source)).spans;
        let out = '';
        let cursor = 0;
        for (const span of spans) {
          let start = span.start;
          let end = span.end;
          // 这一段是不是某个包裹标签里**唯一**的内容？是就把那层壳一起删掉。
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
        // 拆掉一段之后常留下三个以上换行，压回两行，别越删越松。
        return out.replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '').replace(/\s+$/, '');
      }

      /**
       * 「这一份导入文本在某个勾选组合下应该填什么」——两个勾选框的全部组合都从这里走。
       *
       * - `expand === false`（默认）：{@link compactedViewOf} 的压缩视图
       *   （没有摘要时就是整份文本）；
       * - `expand === true`：「展开原文压缩」勾上，{@link uncompactedViewOf}
       *   去掉所有摘要。
       *
       * 「导入思考过程」不在这里选：调用方把**对应那一份渲染结果**递进来即可
       * （带思考 / 不带思考各算一次），于是两个勾选框各管一件事、又都实时生效。
       *
       * 段数、压缩视图、展开原文**共用同一次扫描**：它们在同一个函数里同时要，
       * 各扫一遍就是同一段文字从头翻三遍（大日志下那一步正是可感知的卡顿）。
       * @param {string} text - 某一份渲染结果（带 / 不带思考）。
       * @param {boolean} expand - 「展开原文压缩」勾没勾。
       * @returns {{text: string, count: number}} `text` = 要填进输入框的文本；
       *   `count` = 这份文本里共有几段压缩摘要（0 表示这条勾选框没东西可处理）。
       */
      function importViewOf(text, expand) {
        const source = typeof text === 'string' ? text : '';
        const scan = scanCompactedSummaries(source);
        return {
          text: expand ? uncompactedViewOf(source, scan) : compactedViewOf(source, scan),
          count: scan.count,
        };
      }

      /**
       * 用浏览器的 DecompressionStream 解 deflate-raw。不支持时返回 null。
       * @param {Uint8Array} bytes - 压缩后的字节。
       * @returns {Promise<Uint8Array|null>} 解压结果，或 null（环境不支持）。
       */
      async function inflateRaw(bytes) {
        try {
          if (typeof DecompressionStream !== 'function') return null;
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Uint8Array(await new Response(stream).arrayBuffer());
        } catch {
          return null;
        }
      }

      /**
       * 从一个 ZIP 里取出第一个 `session*.jsonl` 条目。
       *
       * 手写一个**只读**的最小 ZIP 解析器：走中央目录（而不是顺序扫本地头），
       * 支持 stored(0) 与 deflate(8) 两种压缩方式 —— `/export` 导出的 ZIP
       * 就是这两种。加密条目、ZIP64、其他压缩方式一律跳过。
       * @param {Uint8Array} bytes - 整个 zip 的字节。
       * @returns {Promise<string|null>} 条目的文本，或 null（没找到 / 解不开）。
       */
      async function readSessionJsonlFromZip(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        // 中央目录结束记录：签名 0x06054b50，从尾部往前找（注释最多 64 KiB）。
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
        /** @type {Array<{name: string, method: number, packed: number, at: number}>} */
        const entries = [];
        for (let n = 0; n < entryCount; n += 1) {
          if (offset + 46 > bytes.length) break;
          if (view.getUint32(offset, true) !== 0x02014b50) break;
          const method = view.getUint16(offset + 10, true);
          // 中央目录里有两个「大小」，**必须分清**：
          //   +20 = 压缩后大小（切数据时要用的就是它）
          //   +24 = 解压后大小（本插件用不到：切数据只认 +20）
          // 拿 +24 去切压缩数据会多带一截尾巴，`deflate-raw` 会直接以
          // 「Trailing junk found after the end of the compressed stream」失败。
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
        // 本地文件头：签名 0x04034b50，长度不固定，所以要用头里的两个长度字段算数据起点。
        const at = hit.at;
        if (at + 30 > bytes.length || view.getUint32(at, true) !== 0x04034b50) return null;
        const localNameLength = view.getUint16(at + 26, true);
        const localExtraLength = view.getUint16(at + 28, true);
        const start = at + 30 + localNameLength + localExtraLength;
        // 本地头里的压缩大小可能是 0（当 flag bit 3 置位、大小写在数据描述符里时），
        // 所以以中央目录的 `packed` 为准 —— 它总是准确的。
        const raw = bytes.subarray(start, start + hit.packed);
        if (hit.method === 0) return decodeUtf8(raw);
        if (hit.method === 8) {
          const inflated = await inflateRaw(raw);
          return inflated === null ? null : decodeUtf8(inflated);
        }
        return null;
      }

      /**
       * 读用户挑的那个文件，返回**原始 JSONL 文本**（已解压 / 已解 zip）。
       *
       * 0.2.0 起这一层只负责「拿到字节流里那段文本」，渲染交给调用方 ——
       * 因为「导入思考过程」勾选框需要在**同一份原始日志**上渲染两次
       * （带思考 / 不带思考），才能实时在输入框里增删思考内容。
       *
       * 认三种形态：
       *   - `.zip`（`/export` 的产物）→ 取内部的 `session.vN.jsonl`；
       *   - `.jsonl` / `.txt`           → 直接按 JSONL 解析；
       *   - `.jsonl.zstd` / `.zst`      → 用 DecompressionStream('zstd') 解，
       *                                   环境不支持时给一条可读的错误。
       * 任何一种情况都**只读**，绝不写回原文件。
       * @param {File} file - `<input type="file">` 拿到的文件。
       * @returns {Promise<string>} 原始日志文本。
       * @throws {Error} 读不了 / 解不开时。
       */
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
          // 先探一次：`DecompressionStream` 存在不等于它认 `'zstd'`
          // （Chrome 133+ 才支持，Node 到现在都不支持）。探出来给一句人话，
          // 而不是让用户看着「解压失败」猜。
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
          /** 从 `from` 起找下一个 zstd magic 的位置；找不到返回 -1。 */
          const nextMagic = (from) => {
            for (let i = from; i + 4 <= bytes.length; i += 1) {
              if (ZSTD_MAGIC.every((byte, index) => bytes[i + index] === byte)) return i;
            }
            return -1;
          };
          /** `at` 处是不是一个 zstd magic。 */
          const isMagic = (at) => at + 4 <= bytes.length
            && ZSTD_MAGIC.every((byte, index) => bytes[at + index] === byte);
          /** 解一帧；解不开返回 null（不抛）。 */
          const decodeFrame = async (from, to) => {
            try {
              const stream = new Blob([bytes.subarray(from, to)]).stream().pipeThrough(new DecompressionStream('zstd'));
              return decodeUtf8(new Uint8Array(await new Response(stream).arrayBuffer()));
            } catch {
              return null;
            }
          };
          // ── 路 ①（0.3.23 新增 · 审计 §四.4）：**按帧头算长度**，不再猜。 ──
          //
          // 逐帧切以前靠「下一个 magic」当切点，而那四字节**也可能只是压缩数据里
          // 恰好出现**的。踩中的后果不是报错而是**静默读到一半**：切短了的那一帧
          // 解码器会**宽容地**解出半截内容（Node 的 `zstdDecompressSync` 实测如此，
          // 浏览器同理），于是那一帧的内容被截断、后面的帧整段丢掉。
          //
          // zstd 的每一帧都自带长度：帧头之后是一串 block header，每个都写着这一块
          // 的**压缩长度**（raw / compressed 用 Block_Size，RLE 固定 1 字节）。
          // 把 block 一个个跳过去就能精确算出帧尾，完全不需要猜。
          //
          // 这条路只在「整份文件都被它干净地吃完、且每一帧都解得开」时才采用；
          // 任何一步对不上（遇到 skippable frame、块类型非法、尾部被截断）就返回
          // null，交给下面的启发式路 —— 两条路的结论一致时不会有差别。
          const frameLengthAt = (start) => {
            if (start + 5 > bytes.length || !isMagic(start)) return null;
            const descriptor = bytes[start + 4];
            const contentSizeFlag = descriptor >> 6;
            const singleSegment = (descriptor >> 5) & 1;
            const checksum = (descriptor >> 2) & 1;
            const dictIdFlag = descriptor & 3;
            let pos = start + 5;
            if (singleSegment === 0) pos += 1;                 // Window_Descriptor
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
              if (blockType === 3) return null;                  // 保留类型：这份文件不是我们能切的
              // RLE 块：Block_Size 是**解压后**的大小，真实的负载只有 1 字节。
              // raw / compressed：Block_Size 就是负载字节数。
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
            // 必须**干净地吃完**：还剩字节说明后面不是普通 zstd 帧（skippable 之类）。
            return at === bytes.length && out.length > 0 ? out : null;
          };
          const structured = await byFrameHeader();
          if (structured !== null) return structured.join('');
          // ── 路 ②（兜底）：按 magic 逐帧切。 ──
          //
          // 那条精确的路对不上时（旧格式、尾部截断、夹着别的帧型）仍然按老办法切：
          // 切点解不开就**跳过这个候选、继续往后找下一个**（0.3.23 起，改前是就地
          // 放弃 —— 「第一帧内部恰好出现 magic」会让整份文件直接报 `zstd 解压失败`）。
          while (isMagic(cursor)) {
            let candidate = cursor + 4;
            let decoded = null;
            let end = cursor + 4;
            for (;;) {
              const next = nextMagic(candidate);
              end = next === -1 ? bytes.length : next;
              decoded = await decodeFrame(cursor, end);
              if (decoded !== null) break;
              if (next === -1) break;   // 一直到文件末尾都解不开：这一帧真的坏了
              candidate = next + 4;     // 假 magic：跳过它，继续往后找候选切点
            }
            if (decoded === null) break;
            frames.push(decoded);
            cursor = end;
          }
          if (frames.length === 0) {
            // 逐帧切一帧都没解出来时，再把**整份**交给解压器试一次：按 zstd 规范，
            // 一个解码器要能连着解多个帧（浏览器的实现走参考解码器的流式接口，
            // 会跨帧继续）。这一路只在逐帧切完全失败时才走，**不会**替掉那条
            // 已经验证过的逐帧路。
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
    /* @build-fingerprint:end */
  },
});
