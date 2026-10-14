window.__ModuleLoader__.load({
  id: 'dsh-persona-select',
  chunk: 'client.settings.js',
  factory: function settingsChunk(require) {
    'use strict';
    function create(deps) {
      const {
        React, h, S, fallbackT,
        AssemblyLine, Hint, ScrollBar, layerIndicators,
        EXPORT_FORMAT, EXPORT_VERSION, EXPORT_MAX_BYTES,
        STRIP_KIND_FIELDS, SWITCH_FIELDS, RESIDENT_RETRY_MS,
        allSwitchesOn, byColorRank, call, checkOrderInput, ensureScrollCss,
        historyBytesOf, indicatorFor, indicatorsOf,
        ioExport, logImport, logImportSync,
        notifyPersonaChanged, summarizeIndicators,
        useMainSessionRow, usePersonaState, useSettledTick,
      } = deps;
    function confirmWithFocusRestore(ask, lastField, message) {
      const active = typeof document === 'undefined' ? null : document.activeElement;
      const restore = active !== null && active !== undefined
        && typeof active.focus === 'function'
        && typeof active.matches === 'function'
        && active.matches('input, textarea, [contenteditable="true"]')
        ? active
        : null;
      const remembered = lastField !== null && lastField !== undefined
        && lastField.isConnected !== false
        && typeof lastField.focus === 'function'
        ? lastField
        : null;
      const verdict = typeof ask !== 'function' ? true : ask(message);
      const target = remembered !== null ? remembered : restore;
      if (target !== null) {
        const refocus = () => {
          try {
            if (target.isConnected !== false && typeof target.focus === 'function') target.focus({ preventScroll: true });
          } catch {
          }
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(refocus);
        else setTimeout(refocus, 0);
      }
      return verdict;
    }
    function PersonaManagerImpl(props) {
      const t = props !== null && props !== undefined && typeof props.t === 'function' ? props.t : fallbackT;
      const focusedRef = React.useRef(null);
      const rememberFocused = (event) => {
        const target = event?.target ?? null;
        if (target === null || typeof target.matches !== 'function') return;
        if (target.matches('input, textarea, [contenteditable="true"]')) focusedRef.current = target;
      };
      const mainSession = useMainSessionRow(props?.useSessions);
      const currentSessionId = mainSession.sessionId;
      const currentSessionTitle = mainSession.title;
      const currentBlank = mainSession.blank;
      const currentParent = mainSession.parent;
      const { status, data, error, reload } = usePersonaState(currentSessionId);
      const [tab, setTab] = React.useState('current');
      const tabPickedRef = React.useRef(false);
      const autoPreviewRef = React.useRef(null);
      const previewKeyRef = React.useRef('');
      const [selectedId, setSelectedId] = React.useState(null);
      const [draft, setDraft] = React.useState({ id: '', name: '', text: '' });
      const [draftBaseline, setDraftBaseline] = React.useState({ id: '', name: '', text: '' });
      const [creating, setCreating] = React.useState(false);
      const [noPreview, setNoPreview] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [notice, setNotice] = React.useState(null);
      const [editorNotice, setEditorNotice] = React.useState(null);
      const [failure, setFailure] = React.useState(null);
      const [saveFeedback, setSaveFeedback] = React.useState(null);
      const [showSaving, setShowSaving] = React.useState(false);
      const savingTimerRef = React.useRef(0);
      React.useEffect(() => () => clearTimeout(savingTimerRef.current), []);
      const [orderDraft, setOrderDraft] = React.useState({ mode: 'number', value: '-1' });
      const [orderBaseline, setOrderBaseline] = React.useState({ mode: 'number', value: '-1' });
      const dataRef = React.useRef(data);
      dataRef.current = data;
      React.useEffect(() => {
        ensureScrollCss();
        return undefined;
      }, []);
      const syncAskedRef = React.useRef('');
      React.useEffect(() => {
        const key = currentSessionId;
        if (syncAskedRef.current === key) return undefined;
        syncAskedRef.current = key;
        let cancelled = false;
        (async () => {
          try {
            if (currentSessionId !== '') {
              const asked = { session: currentSessionId };
              if (currentBlank !== undefined) asked.blank = currentBlank;
              if (currentParent !== undefined) asked.parent = currentParent;
              await call('/resident', { method: 'PUT', body: JSON.stringify(asked) });
            }
            await call('/gc', {
              method: 'PUT',
              body: JSON.stringify(currentSessionId === '' ? {} : { session: currentSessionId }),
            });
          } catch {
          }
          if (!cancelled) reload();
        })();
        return () => {
          cancelled = true;
        };
      }, [currentSessionId, currentBlank, currentParent, reload]);
      const tabTouchedRef = React.useRef(false);
      React.useEffect(() => {
        if (data === null) return;
        const has = data.session?.hasRecord === true;
        if (!tabPickedRef.current) {
          tabPickedRef.current = true;
          setTab(has ? 'current' : 'global');
          return;
        }
        if (has && !tabTouchedRef.current) setTab('current');
      }, [data]);
      const [historyText, setHistoryText] = React.useState('');
      const [historyTab, setHistoryTab] = React.useState('edit');
      const [historyBaseline, setHistoryBaseline] = React.useState('');
      const [historyLocked, setHistoryLocked] = React.useState(null);
      const [historyBusy, setHistoryBusy] = React.useState(false);
      const [historyNotice, setHistoryNotice] = React.useState(null);
      const historyFileRef = React.useRef(null);
      const [importing, setImporting] = React.useState(false);
      const writeBusy = busy || historyBusy || importing;
      const writeBusyRef = React.useRef(false);
      writeBusyRef.current = writeBusy;
      const [importNotice, setImportNotice] = React.useState(null);
      const importFileRef = React.useRef(null);
      const [exportNotice, setExportNotice] = React.useState(null);
      const [exportMenu, setExportMenu] = React.useState(false);
      const exportPngRef = React.useRef(null);
      const [includeThinking, setIncludeThinking] = React.useState(false);
      const [expandOriginal, setExpandOriginal] = React.useState(false);
      const [historyVariants, setHistoryVariants] = React.useState(null);
      const [historyCleared, setHistoryCleared] = React.useState(false);
      const [showWarnings, setShowWarnings] = React.useState(false);
      const personaBoxRef = React.useRef(null);
      const historyBoxRef = React.useRef(null);
      const [draftEpoch, setDraftEpoch] = React.useState(0);
      const [historyEpoch, setHistoryEpoch] = React.useState(0);
      const draftTick = useSettledTick(draft.text, draftEpoch);
      const historyTick = useSettledTick(historyText, historyEpoch);
      const [historyBytes, setHistoryBytes] = React.useState(0);
      React.useEffect(() => {
        setHistoryBytes(historyBytesOf(historyText));
      }, [historyTick]);
      const configuredOrder = data?.section?.orderConfigured;
      const orderDefaultValue = String(Number.isFinite(configuredOrder) ? configuredOrder : (data?.section?.orderDefault ?? -1));
      const orderFollowValue = String(data?.section?.orderFollow ?? 1000000);
      const orderDraftOf = (stored) =>
        stored === 'follow' || stored === '1000000'
          ? { mode: 'follow', value: orderFollowValue }
          : { mode: 'number', value: String(stored ?? orderDefaultValue) };
      const normalizeNameLocal = (value) =>
        String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, data?.limits?.maxName ?? 40);
      const normalizeTextLocal = (value) =>
        String(value ?? '').replace(/\r\n?/g, '\n').trim();
      const clearExportUi = React.useCallback(() => {
        setExportNotice(null);
        setExportMenu(false);
      }, []);
      const loadPersona = React.useCallback((id) => {
        autoPreviewRef.current = previewKeyRef.current;
        setSelectedId(id);
        setCreating(false);
        setNoPreview(false);
        setSaveFeedback(null);
        setHistoryNotice(null);
        setHistoryVariants(null);
        setHistoryCleared(false);
        clearExportUi();
      }, []);
      React.useEffect(() => {
        if (selectedId === null) return undefined;
        let cancelled = false;
        (async () => {
          try {
            const hit = await call(`/persona?id=${encodeURIComponent(selectedId)}`);
            if (cancelled) return;
            if (hit.found !== true) return;
            const persona = (dataRef.current?.personas ?? []).find((entry) => entry.id === selectedId);
            const nextDraft = persona !== undefined && persona.builtin
              ? { id: '', name: `${hit.name} 副本`, text: hit.text }
              : { id: selectedId, name: hit.name, text: hit.text };
            setDraft(nextDraft);
            setDraftBaseline(nextDraft);
            setDraftEpoch((n) => n + 1);
            const nextOrder = orderDraftOf(hit.order ?? persona?.order ?? null);
            setOrderDraft(nextOrder);
            setOrderBaseline(nextOrder);
            const stored = typeof hit.historyText === 'string' ? hit.historyText : '';
            setHistoryText(stored);
            setHistoryBaseline(stored);
            setHistoryEpoch((n) => n + 1);
            setHistoryLocked({
              id: selectedId,
              at: typeof hit.historyLockedAt === 'number' ? hit.historyLockedAt : null,
              missing: hit.historyMissing === true,
            });
            setHistoryNotice(null);
            setHistoryVariants(null);
            setHistoryCleared(false);
          } catch (problem) {
            if (!cancelled) setFailure(problem?.message ?? String(problem));
          }
        })();
        return () => {
          cancelled = true;
        };
      }, [selectedId]);
      const run = React.useCallback(
        async (work) => {
          if (writeBusyRef.current) return;
          setBusy(true);
          setFailure(null);
          setNotice(null);
          setEditorNotice(null);
          try {
            await work();
          } catch (problem) {
            setFailure(problem?.message ?? String(problem));
          } finally {
            setBusy(false);
          }
        },
        [],
      );
      const personas = data?.personas ?? [];
      const hasRecord = data?.session?.hasRecord === true;
      const activeTab = hasRecord ? tab : 'global';
      const layer = activeTab === 'current'
        ? {
            activeId: data?.activeId ?? null,
            found: data?.activeFound !== false,
            switches: data?.switches ?? {},
            toolReusable: data?.toolReusable !== false,
          }
        : {
            activeId: data?.global?.activeId ?? null,
            found: data?.global?.found !== false,
            switches: data?.global?.switches ?? {},
            toolReusable: data?.global?.toolReusable !== false,
          };
      const switches = layer.switches;
      const everySwitchOn = allSwitchesOn(switches);
      const toolReusable = layer.toolReusable;
      const pureChat = everySwitchOn && layer.activeId === null;
      const writeSession = activeTab === 'current' && currentSessionId !== '' ? currentSessionId : '';
      const withSession = (payload) => (writeSession === '' ? payload : { ...payload, session: writeSession });
      const personaDirty = draft.name !== draftBaseline.name || draft.text !== draftBaseline.text;
      const orderDirty =
        orderDraft.mode !== orderBaseline.mode ||
        (orderDraft.mode === 'number' && orderDraft.value.trim() !== orderBaseline.value.trim());
      const historyDirty = historyText !== historyBaseline;
      const dirtyParts = [
        personaDirty ? t('unsavedPersona') : null,
        orderDirty ? t('unsavedOrder') : null,
        historyDirty ? t('unsavedHistory') : null,
      ].filter((part) => part !== null);
      const canSave = !writeBusy && (dirtyParts.length > 0 || draft.id === '');
      const canExport = !busy && !creating && draft.id !== '' && draft.id === selectedId;
      const canClickExport = busy ? false : (canExport || draft.id === '');
      const mustSavePersona = personaDirty || draft.id === '';
      const orderProblemText = (code, raw) => {
        if (code === 'empty') return t('orderProblemEmpty');
        if (code === 'range') return t('orderProblemRange');
        return `${t('orderProblemInteger')}「${String(raw ?? '').trim().slice(0, 32)}」。`;
      };
      const onOrderFollow = () => {
        setSaveFeedback(null);
        setOrderDraft((previous) => ({
          mode: 'follow',
          value: previous.value.trim() === '' ? orderBaseline.value : previous.value,
        }));
      };
      const onOrderDefault = () => {
        setSaveFeedback(null);
        setOrderDraft({ mode: 'number', value: orderDefaultValue });
      };
      const onOrderFollowBoxClick = () => {
        setSaveFeedback(null);
        setOrderDraft({ mode: 'number', value: orderBaseline.value });
      };
      const onPreview = (id) => {
        if (id === selectedId && !creating) return;
        if (dirtyParts.length > 0) {
          const message =
            `${t('switchConfirm')}\n${dirtyParts.map((part) => `· ${part}`).join('\n')}\n\n${t('switchConfirmTail')}`;
          if (
            typeof window === 'undefined' ||
            typeof window.confirm !== 'function' ||
            !confirmWithFocusRestore(window.confirm, focusedRef.current, message)
          ) {
            return;
          }
        }
        setEditorNotice(null);
        loadPersona(id);
      };
      const onNewPersona = () => {
        setCreating(true);
        setEditorNotice(null);
        setNoPreview(false);
        setSelectedId(null);
        setSaveFeedback(null);
        setHistoryNotice(null);
        setHistoryVariants(null);
        setHistoryCleared(false);
        clearExportUi();
        setDraft({ id: '', name: t('unnamed'), text: '' });
        setDraftBaseline({ id: '', name: t('unnamed'), text: '' });
        setDraftEpoch((n) => n + 1);
        const next = { mode: 'number', value: orderDefaultValue };
        setOrderDraft(next);
        setOrderBaseline(next);
        setHistoryText('');
        setHistoryEpoch((n) => n + 1);
        setHistoryBaseline('');
        setHistoryLocked(null);
      };
      const onDiscardNew = React.useCallback(() => {
        setCreating(false);
        setSaveFeedback(null);
        setHistoryNotice(null);
        setHistoryVariants(null);
        setHistoryCleared(false);
        clearExportUi();
        setSelectedId(null);
        setDraft({ id: '', name: '', text: '' });
        setDraftBaseline({ id: '', name: '', text: '' });
        setDraftEpoch((n) => n + 1);
        setHistoryText('');
        setHistoryBaseline('');
        setHistoryEpoch((n) => n + 1);
        setHistoryLocked(null);
      }, [clearExportUi]);
      React.useEffect(() => {
        if (data === null) return;
        const key = previewKeyRef.current;
        if (autoPreviewRef.current === key) return;
        if (creating || dirtyParts.length > 0) return;
        autoPreviewRef.current = key;
        if (layer.activeId === null) {
          onDiscardNew();
          return;
        }
        loadPersona(layer.activeId);
      }, [data, activeTab, layer.activeId, creating, dirtyParts.length, loadPersona, onDiscardNew]);
      const onImportClick = () => {
        if (writeBusyRef.current) return;
        if (
          historyText.trim() !== '' &&
          typeof window !== 'undefined' &&
          typeof window.confirm === 'function' &&
          !confirmWithFocusRestore(window.confirm, focusedRef.current, t('historyImportConfirm'))
        ) {
          return;
        }
        const node = historyFileRef.current;
        if (node === null || node === undefined) return;
        try {
          node.value = '';
        } catch {
        }
        if (typeof node.click === 'function') node.click();
      };
      const onImportFile = async (file) => {
        if (file === null || file === undefined) return;
        setHistoryBusy(true);
        setHistoryNotice(null);
        try {
          const log = await logImport();
          const source = await log.readSessionFile(file);
          const events = log.readSessionEvents(source);
          const withThinking = log.renderSessionEvents(events, true);
          const withoutThinking = log.renderSessionEvents(events, false);
          if (withThinking.trim() === '' && withoutThinking.trim() === '') {
            setHistoryNotice({ kind: 'error', text: t('historyImportEmpty') });
            return;
          }
          const chosen = log.importViewOf(includeThinking ? withThinking : withoutThinking, expandOriginal);
          setHistoryVariants({ withThinking, withoutThinking });
          setHistoryText(chosen.text);
          setHistoryEpoch((n) => n + 1);
          setHistoryTab('import');
          setHistoryCleared(false);
          setHistoryNotice(importViewNotice(chosen));
        } catch (problem) {
          setHistoryNotice({
            kind: 'error',
            text: `${t('historyImportFailed')}：${problem?.message ?? String(problem)}`,
          });
        } finally {
          setHistoryBusy(false);
        }
      };
      const importView = (expand, thinking) => {
        if (historyVariants === null) return null;
        return logImportSync().importViewOf(thinking ? historyVariants.withThinking : historyVariants.withoutThinking, expand);
      };
      const importViewNotice = (view) => {
        if (view !== null && view.count > 0) return null;
        return { kind: 'warn', text: t('historyCompactNone') };
      };
      const onToggleThinking = (on) => {
        setIncludeThinking(on);
        setHistoryNotice(null);
        const view = importView(expandOriginal, on);
        if (view === null) return;
        setHistoryText(view.text);
        setHistoryNotice(importViewNotice(view));
        setHistoryEpoch((n) => n + 1);
      };
      const onToggleExpandOriginal = (on) => {
        setExpandOriginal(on);
        setHistoryNotice(null);
        const view = importView(on, includeThinking);
        if (view === null) {
          if (on) setHistoryNotice({ kind: 'warn', text: t('historyCompactNoImport') });
          return;
        }
        setHistoryText(view.text);
        setHistoryNotice(importViewNotice(view));
        setHistoryEpoch((n) => n + 1);
      };
      const onClearHistory = () => {
        if (historyBusy) return;
        setHistoryText('');
        setHistoryEpoch((n) => n + 1);
        setHistoryCleared(true);
        setHistoryNotice(null);
      };
      const onUndoClearHistory = () => {
        if (historyBusy) return;
        setHistoryText(historyBaseline);
        setHistoryEpoch((n) => n + 1);
        setHistoryCleared(false);
        setHistoryNotice(null);
      };
      const onSave = async () => {
        if (writeBusyRef.current) return;
        setSaveFeedback(null);
        let orderValue = null;
        if (orderDirty) {
          const verdict = orderDraft.mode === 'follow' ? { ok: true, value: 'follow' } : checkOrderInput(orderDraft.value);
          if (!verdict.ok) {
            setSaveFeedback({ kind: 'error', text: `${t('saveFailed')}${orderProblemText(verdict.code, orderDraft.value)}` });
            return;
          }
          orderValue = verdict.value;
        }
        if (draft.id === '' && normalizeNameLocal(draft.name) === '' && normalizeTextLocal(draft.text) === '') {
          setSaveFeedback({ kind: 'ok', text: t('nothingToSave') });
          return;
        }
        if (mustSavePersona && normalizeNameLocal(draft.name) === '') {
          setSaveFeedback({ kind: 'error', text: `${t('saveFailed')}${t('emptyPersonaName')}` });
          return;
        }
        if (mustSavePersona && normalizeTextLocal(draft.text) === '') {
          setSaveFeedback({ kind: 'error', text: t('blankSaveRefused') });
          return;
        }
        if (dirtyParts.length === 0 && draft.id !== '') {
          setSaveFeedback({ kind: 'ok', text: t('nothingToSave') });
          return;
        }
        const body = {};
        const settledDraft = { id: draft.id, name: normalizeNameLocal(draft.name), text: normalizeTextLocal(draft.text) };
        if (mustSavePersona) {
          body.id = draft.id;
          body.name = settledDraft.name;
          body.text = settledDraft.text;
        } else if (draft.id !== '') {
          body.id = draft.id;
        }
        if (orderDirty) body.sectionOrder = orderValue;
        if (historyDirty) {
          if (historyText.trim() === '') body.historyClear = true;
          else body.history = historyText;
        }
        setBusy(true);
        setFailure(null);
        setNotice(null);
        savingTimerRef.current = setTimeout(() => setShowSaving(true), 120);
        try {
          const result = await call('/save', { method: 'PUT', body: JSON.stringify(body) });
          const saved = Array.isArray(result.saved) ? result.saved : [];
          const nextId = typeof result.id === 'string' && result.id !== '' ? result.id : settledDraft.id;
          const nextDraft = { id: nextId, name: settledDraft.name, text: settledDraft.text };
          setDraft(nextDraft);
          setDraftBaseline(nextDraft);
          setDraftEpoch((n) => n + 1);
          setOrderBaseline({ ...orderDraft });
          if (saved.includes('history')) {
            const settled = historyText.trim() === '' ? '' : historyText.replace(/\r\n?/g, '\n').trim();
            setHistoryText(settled);
            setHistoryBaseline(settled);
            setHistoryEpoch((n) => n + 1);
            setHistoryLocked({ id: nextId, at: settled === '' ? null : Date.now(), missing: false });
            setHistoryCleared(false);
          }
          setCreating(false);
          setSelectedId(nextId === '' ? null : nextId);
          const parts = [];
          if (saved.includes('persona')) parts.push(t('personaSaved'));
          if (saved.includes('order')) {
            parts.push(`${t('orderSaved')}：${orderValue === 'follow' ? t('orderFollowText') : orderValue}`);
          }
          if (saved.includes('history')) {
            parts.push(historyText.trim() === '' ? t('historyCleared') : t('historySaved'));
          }
          setSaveFeedback({ kind: 'ok', text: parts.length > 0 ? parts.join(' · ') : t('nothingToSave') });
          if (!notifyPersonaChanged()) await reload();
        } catch (problem) {
          setSaveFeedback({ kind: 'error', text: `${t('saveFailed')}${problem?.message ?? String(problem)}` });
        } finally {
          clearTimeout(savingTimerRef.current);
          setShowSaving(false);
          setBusy(false);
        }
      };
      const onDelete = () =>
        run(async () => {
          if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !confirmWithFocusRestore(window.confirm, focusedRef.current, t('confirmDelete'))) {
            return;
          }
          await call(`/delete?id=${encodeURIComponent(draft.id)}`, { method: 'DELETE' });
          setSelectedId(null);
          setNoPreview(true);
          setDraft({ id: '', name: '', text: '' });
          setDraftBaseline({ id: '', name: '', text: '' });
          setDraftEpoch((n) => n + 1);
          setCreating(false);
          setSaveFeedback(null);
          setHistoryText('');
          setHistoryBaseline('');
          setHistoryEpoch((n) => n + 1);
          setHistoryLocked(null);
          clearExportUi();
          setEditorNotice(t('deleted'));
          if (!notifyPersonaChanged()) await reload();
        });
      const onActivate = (id) =>
        run(async () => {
          await call('/active', { method: 'PUT', body: JSON.stringify(withSession({ id })) });
          const activatedName = (dataRef.current?.personas ?? []).find((entry) => entry.id === id)?.name;
          const named = typeof activatedName === 'string' && activatedName !== '';
          const template = String(t('activatedNamed'));
          setEditorNotice(
            id === '' || id === 'builtin:off'
              ? t('deactivated')
              : named
                ? template.includes('%s')
                  ? template.replace('%s', activatedName)
                  : `${t('activated')}：${activatedName}`
                : t('activated'),
          );
          if (!notifyPersonaChanged()) await reload();
        });
      const onToggleSwitch = (key, on) =>
        run(async () => {
          await call('/switches', {
            method: 'PUT',
            body: JSON.stringify(withSession({ [key]: on })),
          });
          setNotice(t('switchesSaved'));
          if (!notifyPersonaChanged()) await reload();
        });
      const onToggleToolReusable = (on) =>
        run(async () => {
          await call('/switches', {
            method: 'PUT',
            body: JSON.stringify(withSession({ toolReusable: on })),
          });
          setNotice(t('switchesSaved'));
          if (!notifyPersonaChanged()) await reload();
        });
      const onPrimaryAction = () =>
        run(async () => {
          if (everySwitchOn) {
            await call('/switches', {
              method: 'PUT',
              body: JSON.stringify(
                withSession({
                  soloOnly: false,
                  stripRuntime: false,
                  stripTools: false,
                  stripInjected: false,
                }),
              ),
            });
            setNotice(t('restoreDone'));
          } else {
            await call('/switches', { method: 'PUT', body: JSON.stringify(withSession({ pureChat: true })) });
            setNotice(t('pureChatOn'));
          }
          if (!notifyPersonaChanged()) await reload();
        });
      const onImportPersonaClick = () => {
        if (writeBusyRef.current) return;
        const node = importFileRef.current;
        if (node === null || node === undefined) return;
        try {
          node.value = '';
        } catch {
        }
        if (typeof node.click === 'function') node.click();
      };
      const onImportPersonaFile = async (file) => {
        if (file === null || file === undefined) return;
        setImporting(true);
        setImportNotice(null);
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const { decodePersonaPack } = await ioExport();
          const decoded = decodePersonaPack(bytes);
          if (decoded.ok !== true) {
            if (decoded.code === 'png-no-data') throw new Error(t('importPngNoData'));
            if (decoded.code === 'png-bad-crc') throw new Error(t('importPngBadCrc'));
            throw new Error(`不是合法的 JSON（${decoded.detail ?? ''}）`);
          }
          const parsed = decoded.value;
          const list = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.personas)
              ? parsed.personas
              : (parsed !== null && typeof parsed === 'object' ? [parsed] : []);
          if (list.length === 0) throw new Error(t('importEmpty'));
          const result = await call('/import', {
            method: 'PUT',
            body: JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, personas: list }),
          });
          const imported = Array.isArray(result.ids) ? result.ids : [];
          const skipped = Array.isArray(result.skipped) ? result.skipped : [];
          const parts = [`${t('importDone')} ${imported.length}`];
          if (skipped.length > 0) parts.push(`${t('importSkipped')} ${skipped.length}`);
          parts.push(file.name);
          setImportNotice({ kind: skipped.length > 0 ? 'warn' : 'ok', text: parts.join(' · ') });
          if (imported.length > 0) loadPersona(imported[0]);
          if (!notifyPersonaChanged()) await reload();
        } catch (problem) {
          setImportNotice({ kind: 'error', text: `${t('importFailed')}：${problem?.message ?? String(problem)}` });
        } finally {
          setImporting(false);
        }
      };
      const exportPayload = () => {
        const source = exportSource();
        const verdict = source.order.mode === 'follow'
          ? { ok: true, value: 'follow' }
          : checkOrderInput(source.order.value);
        const container = {
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          exportedAt: new Date().toISOString(),
          plugin: 'dsh-persona-select',
          count: 1,
          personas: [
            {
              name: source.name,
              text: source.text,
              sectionOrder: verdict.ok ? verdict.value : null,
              history: source.history.trim() === '' ? null : { text: source.history, lockedAt: historyLockedAt },
            },
          ],
        };
        return JSON.stringify(container, null, 2);
      };
      const exportSource = () => ({
        name: personaDirty ? draftBaseline.name : draft.name,
        text: personaDirty ? draftBaseline.text : draft.text,
        order: orderDirty ? orderBaseline : orderDraft,
        history: historyDirty ? historyBaseline : historyText,
      });
      const reportExport = (filename, outcome) => {
        if (!outcome.ok) {
          setExportNotice({ kind: 'warn', text: t('exportNoBrowser') });
          return;
        }
        if (outcome.served === false) {
          setExportNotice({ kind: 'warn', text: `${t('exportNotTaken')} · ${filename}` });
          return;
        }
        setExportNotice({
          kind: outcome.exact ? 'ok' : 'warn',
          text: `${t('exportDone')} · ${filename}${outcome.exact ? '' : ` ${t('exportNameMayDiffer')}`}`,
        });
      };
      const onExportClick = () => {
        if (busy) return;
        if (exportMenu) {
          setExportMenu(false);
          return;
        }
        if (creating || draft.id === '') {
          setExportNotice({ kind: 'warn', text: t('exportRefusedNew') });
          return;
        }
        if (!canExport) return;
        if (dirtyParts.length > 0) {
          const message = t('exportConfirmDirty');
          if (
            typeof window === 'undefined' ||
            typeof window.confirm !== 'function' ||
            !confirmWithFocusRestore(window.confirm, focusedRef.current, message)
          ) {
            return;
          }
        }
        setExportNotice(null);
        setExportMenu(true);
      };
      const onExportJson = async () => {
        setExportNotice(null);
        try {
          const { exportFileName, downloadFile } = await ioExport();
          const filename = exportFileName(exportSource().name, 'json');
          const outcome = await downloadFile(filename, new TextEncoder().encode(exportPayload()), 'application/json');
          reportExport(filename, outcome);
        } catch (problem) {
          setExportNotice({ kind: 'error', text: `${t('exportFailed')}：${problem?.message ?? String(problem)}` });
        }
      };
      const onExportPngClick = () => {
        setExportNotice(null);
        const node = exportPngRef.current;
        if (node === null || node === undefined) return;
        try {
          node.value = '';
        } catch {
        }
        if (typeof node.click === 'function') node.click();
      };
      const onExportPngFile = async (file) => {
        if (file === null || file === undefined) return;
        setExportNotice(null);
        try {
          const { isPng, packPersonaPng, exportFileName, downloadFile } = await ioExport();
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!isPng(bytes)) {
            setExportNotice({ kind: 'error', text: `${t('exportFailed')}：${t('exportPngBad')}` });
            return;
          }
          const packed = packPersonaPng(bytes, exportPayload());
          if (packed === null) {
            setExportNotice({ kind: 'error', text: `${t('exportFailed')}：${t('exportPngBroken')}` });
            return;
          }
          if (packed.length > EXPORT_MAX_BYTES) {
            setExportNotice({ kind: 'error', text: `${t('exportFailed')}：${t('exportTooBig')}` });
            return;
          }
          const filename = exportFileName(exportSource().name, 'png');
          const outcome = await downloadFile(filename, packed, 'image/png');
          reportExport(filename, outcome);
        } catch (problem) {
          setExportNotice({ kind: 'error', text: `${t('exportFailed')}：${problem?.message ?? String(problem)}` });
        }
      };
      if (status === 'loading' && data === null) {
        return h('div', { style: S.root, 'data-plugin': 'dsh-persona-select' }, h('h2', { style: S.h2 }, t('title')), h('p', { style: S.sub }, t('loading')));
      }
      if (data === null) {
        return h(
          'div',
          { style: S.root, 'data-plugin': 'dsh-persona-select', 'data-render-state': 'error' },
          h('h2', { style: S.h2 }, t('title')),
          h('p', { style: S.warn }, `${t('storeError')}: ${error ?? ''}`),
          h('button', { type: 'button', style: S.button, onClick: reload }, t('retry')),
        );
      }
      const activeId = layer.activeId;
      previewKeyRef.current = `${activeTab}:${layer.activeId ?? ''}`;
      const sessionIndicators = indicatorsOf(data, t);
      const modeIndicators = data?.section?.minimalMode === true ? [indicatorFor('minimal-mode', t)] : [];
      const pageIndicators = activeTab === 'current'
        ? sessionIndicators
        : [...layerIndicators(layer, t), ...modeIndicators].sort(byColorRank);
      const warnings = (Array.isArray(data?.warnings) ? data.warnings : []).filter(
        (message) => typeof message === 'string' && message.trim() !== '',
      );
      const indicator = summarizeIndicators(pageIndicators, t);
      const stripPairs = STRIP_KIND_FIELDS
        .map((row) => ({ ...row, count: Number(data.stripStats?.[row.kind] ?? 0) }))
        .filter((row) => Number.isFinite(row.count) && row.count > 0);
      const activateTarget = draft.id !== '' ? draft.id : (selectedId ?? '');
      const showActivate = !creating && (activateTarget !== '' || selectedId !== null);
      const historyPersonaId = draft.id !== '' ? draft.id : (selectedId ?? '');
      const historyPersona = (data.personas ?? []).find((entry) => entry.id === historyPersonaId);
      const historyStoredBytes = typeof historyPersona?.historyBytes === 'number' ? historyPersona.historyBytes : 0;
      const panelLockedAt = typeof historyPersona?.historyLockedAt === 'number' ? historyPersona.historyLockedAt : null;
      const historyLockedAt = historyLocked !== null && historyLocked.id === historyPersonaId
        ? historyLocked.at
        : panelLockedAt;
      const historyMissingNow = historyLocked !== null && historyLocked.id === historyPersonaId
        && historyLocked.missing === true;
      const historyStored = historyLockedAt !== null;
      const historyLost = historyMissingNow;
      return h(
        'div',
        {
          style: S.root,
          'data-plugin': 'dsh-persona-select',
          'data-render-state': 'ready',
          onFocusCapture: rememberFocused,
          'data-active-id': activeId ?? '',
          'data-creating': creating ? '1' : '0',
          'data-scope': activeTab,
          'data-has-record': hasRecord ? '1' : '0',
          'data-session-id': currentSessionId,
          'data-indicators': pageIndicators.map((entry) => entry.reason).join(','),
          'data-minimal-mode': data?.section?.minimalMode === true ? '1' : '0',
        },
        h('h2', { style: S.h2 }, t('title')),
        warnings.length > 0
          ? h(
              'div',
              {
                style: S.warnBox,
                'data-warnings': String(warnings.length),
                'data-warnings-open': showWarnings ? '1' : '0',
              },
              h(
                'button',
                {
                  type: 'button',
                  style: S.warnToggle,
                  onClick: () => setShowWarnings((open) => !open),
                  'aria-expanded': showWarnings ? 'true' : 'false',
                  'data-warnings-toggle': '1',
                },
                `${t('warningsSummary')}（${warnings.length}）`,
                h('span', { style: S.warnToggleHint }, showWarnings ? t('warningsHide') : t('warningsShow')),
              ),
              showWarnings
                ? h(
                    'ul',
                    { style: S.warnList, 'data-warnings-list': '1' },
                    warnings.map((message, index) => h('li', { key: `${index}`, style: S.warnItem }, String(message))),
                  )
                : null,
            )
          : null,
        h(
          'div',
          { style: S.tabRow, 'data-scope-tabs': '1' },
          hasRecord
            ? h(
                'button',
                {
                  type: 'button',
                  style: { ...S.scopeTab, ...(activeTab === 'current' ? S.scopeTabActive : {}) },
                  onClick: () => {
                    tabTouchedRef.current = true;
                    setTab('current');
                  },
                  'data-scope-tab': 'current',
                  'aria-pressed': activeTab === 'current' ? 'true' : 'false',
                },
                t('scopeTabCurrent'),
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              style: { ...S.scopeTab, ...(activeTab === 'global' ? S.scopeTabActive : {}) },
              onClick: () => {
                tabTouchedRef.current = true;
                setTab('global');
              },
              'data-scope-tab': 'global',
              'aria-pressed': activeTab === 'global' ? 'true' : 'false',
            },
            t('scopeTabGlobal'),
          ),
        ),
        activeTab === 'current' && currentSessionId !== ''
          ? h(
              'p',
              {
                style: S.mono,
                'data-scope-session': '1',
                'data-scope-session-title': currentSessionTitle === '' ? 'id' : 'title',
                title: currentSessionId,
              },
              `${t('scopeSession')} ${currentSessionTitle === '' ? currentSessionId : currentSessionTitle}`,
            )
          : null,
        h(
          'div',
          { style: S.card, 'data-card': 'status' },
          h(AssemblyLine, { data, t, indicators: pageIndicators, scope: activeTab }),
          h('span', { style: S.divider }),
          h(
            'label',
            {
              style: { ...S.row, gap: 8, cursor: 'pointer', alignItems: 'flex-start' },
              'data-tool-reusable': '1',
            },
            h('input', {
              type: 'checkbox',
              checked: toolReusable,
              disabled: writeBusy,
              onChange: (event) => onToggleToolReusable(event.target.checked),
              style: { marginTop: 3, flex: 'none' },
            }),
            h(
              'span',
              { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
              h(
                'span',
                { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                h('span', { style: { fontSize: 13, lineHeight: '20px' } }, t('toolReusableLabel')),
                h(Hint, { text: t('toolReusableHint'), label: t('hintLabel') }),
              ),
            ),
          ),
          activeTab === 'current' && switches.stripTools === true && toolReusable && data.section?.toolStripHeld === true
            ? h(
                'p',
                {
                  style: S.sub,
                  'data-tool-strip-held': '1',
                  'data-tool-strip-held-reason': data.section?.toolStripHeldReason ?? 'unknown',
                },
                t(
                  data.section?.toolStripHeldReason === 'series-restart'
                    ? 'toolStripHeldRestart'
                    : 'toolStripHeldFirst',
                ),
              )
            : null,
          activeTab === 'current' && (data.section?.sessionBaseline === 'empty' || data.section?.toolBaseline === 'empty')
            ? h('p', { style: S.warn, 'data-tool-baseline': 'empty' }, t('toolBaselineEmpty'))
            : null,
          data.error !== null && data.error !== undefined
            ? h('p', { style: S.warn }, `${t('storeError')}: ${data.error}`)
            : null,
          h('p', { style: S.mono }, `${t('path')}: ${data.path}`),
        ),
        h(
          'div',
          { style: S.card, 'data-card': 'list' },
          h('p', { style: { ...S.sub, fontWeight: 600 } }, t('listTitle')),
          h(
            'ul',
            { style: S.list, 'data-persona-list': '1' },
            personas.map((persona) => {
              const isActive = persona.id === 'builtin:off' ? activeId === null : activeId === persona.id;
              const previewId =
                selectedId !== null
                  ? selectedId
                  : noPreview
                    ? null
                    : activeId === null
                      ? 'builtin:off'
                      : activeId;
              const isPreview = !creating && previewId !== null && persona.id === previewId;
              return h(
                'li',
                { key: persona.id },
                h(
                  'button',
                  {
                    type: 'button',
                    'data-persona-id': persona.id,
                    'data-preview': isPreview ? '1' : '0',
                    style: {
                      ...S.item,
                      ...(isPreview ? S.itemPreview : {}),
                    },
                    onClick: () => onPreview(persona.id),
                  },
                  h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, persona.name),
                  persona.builtin && persona.id !== 'builtin:off' ? h('span', { style: S.badge }, t('builtin')) : null,
                  isActive
                    ? h('span', {
                        style: S.dot(indicator.color),
                        'data-dot': indicator.color,
                        'data-indicator': indicator.reason,
                        title: indicator.text,
                      })
                    : null,
                ),
              );
            }),
          ),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }, 'data-list-actions': '1' },
            h(
              'button',
              {
                type: 'button',
                style: S.button,
                onClick: onNewPersona,
                disabled: writeBusy || creating,
                'data-new-button': '1',
              },
              t('newPersona'),
            ),
            h(
              'button',
              {
                type: 'button',
                style: S.button,
                onClick: onImportPersonaClick,
                disabled: writeBusy,
                'data-import-button': '1',
                title: t('importHint'),
              },
              t('importButton'),
            ),
            h('input', {
              ref: importFileRef,
              type: 'file',
              accept: '.json,.png,application/json,image/png',
              style: { display: 'none' },
              'data-import-file': '1',
              onChange: (event) => {
                const file = event?.target?.files?.[0];
                onImportPersonaFile(file);
              },
            }),
          ),
          importNotice !== null
            ? h(
                'p',
                {
                  style: importNotice.kind === 'error' ? S.warn : S.notice,
                  'data-import-notice': importNotice.kind,
                },
                importNotice.text,
              )
            : null,
        ),
        h(
          'div',
          { style: S.card, 'data-card': 'editor' },
          h(
            'p',
            { style: S.sub },
            draft.id === '' ? t('createHint') : t('editHint'),
            draft.id !== '' && (personas.find((p) => p.id === draft.id)?.builtin ?? false)
              ? ` · ${t('builtinReadonly')}`
              : '',
          ),
          h('label', { style: S.sub, htmlFor: 'persona-select-name' }, t('name')),
          h('input', {
            id: 'persona-select-name',
            style: S.input,
            value: draft.name,
            maxLength: data.limits?.maxName ?? 40,
            onChange: (event) => {
              setSaveFeedback(null);
              setDraft((previous) => ({ ...previous, name: event.target.value }));
            },
            disabled: writeBusy,
          }),
          h(
            'p',
            { style: S.sub },
            `${t('text')} · ${draft.text.length} ${t('chars')}`,
            draft.text.trim() === '' ? ` · ${t('blankText')}` : '',
          ),
          h(
            'div',
            { style: S.scrollWrap, 'data-persona-wrap': '1' },
            h('textarea', {
              ref: personaBoxRef,
              style: S.textarea,
              value: draft.text,
              onChange: (event) => {
                setSaveFeedback(null);
                setDraft((previous) => ({ ...previous, text: event.target.value }));
              },
              disabled: writeBusy,
              spellCheck: false,
              'data-persona-text': '1',
            }),
            h(ScrollBar, {
              targetRef: personaBoxRef,
              deps: [draftTick, draft.id],
              trackAttr: 'data-persona-track',
              thumbAttr: 'data-persona-thumb',
            }),
          ),
          h(
            'label',
            { style: S.sub, htmlFor: 'persona-select-order' },
            h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
              h('span', null, t('orderLabel')),
              h(Hint, { text: t('orderHint'), label: t('hintLabel') }),
            ),
          ),
          h(
            'div',
            { style: { ...S.row, gap: 6, flexWrap: 'wrap' }, 'data-order-row': '1' },
            orderDraft.mode === 'follow'
              ? h('input', {
                  id: 'persona-select-order',
                  readOnly: true,
                  value: t('orderFollowText'),
                  title: t('orderFollowHint'),
                  'data-order-follow': '1',
                  onClick: onOrderFollowBoxClick,
                  onFocus: onOrderFollowBoxClick,
                  style: {
                    ...S.input,
                    flex: '1 1 180px',
                    width: 'auto',
                    fontSize: 12,
                    opacity: 0.85,
                    cursor: 'pointer',
                  },
                })
              : h('input', {
                  id: 'persona-select-order',
                  inputMode: 'numeric',
                  value: orderDraft.value,
                  'data-order-input': '1',
                  disabled: writeBusy,
                  onChange: (event) => {
                    setSaveFeedback(null);
                    const next = event.target.value;
                    setOrderDraft((previous) => ({ ...previous, mode: 'number', value: next }));
                  },
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') onSave();
                  },
                  style: { ...S.input, flex: '1 1 180px', width: 'auto', fontSize: 13 },
                }),
            h(
              'button',
              {
                type: 'button',
                style: S.button,
                disabled: writeBusy,
                onClick: onOrderFollow,
                'data-order-follow-button': '1',
                title: t('orderFollowHint'),
              },
              t('orderFollowButton'),
            ),
            h(
              'button',
              {
                type: 'button',
                style: S.button,
                disabled: writeBusy,
                onClick: onOrderDefault,
                'data-order-default-button': '1',
              },
              t('orderDefaultButton'),
            ),
          ),
          h('span', { style: S.divider }),
          h(
            'p',
            { style: { ...S.sub, fontWeight: 600 }, 'data-history-title': '1' },
            h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
              h('span', null, t('historyTitle')),
              h(Hint, { text: t('historySubtitle'), label: t('hintLabel') }),
              h(Hint, { text: t('historyFormatHint'), label: t('hintLabel') }),
            ),
          ),
          h(
            'div',
            { style: S.tabRow, 'data-history-tabs': '1' },
            h(
              'button',
              {
                type: 'button',
                style: { ...S.tab, ...(historyTab === 'edit' ? S.tabActive : {}) },
                onClick: () => setHistoryTab('edit'),
                'data-history-tab': 'edit',
                'aria-pressed': historyTab === 'edit' ? 'true' : 'false',
              },
              t('historyTabEdit'),
              h('span', { style: S.tabNote }, `${historyText.length} ${t('historyChars')}`),
            ),
            h(
              'button',
              {
                type: 'button',
                style: { ...S.tab, ...(historyTab === 'import' ? S.tabActive : {}) },
                onClick: () => setHistoryTab('import'),
                'data-history-tab': 'import',
                'aria-pressed': historyTab === 'import' ? 'true' : 'false',
              },
              t('historyTabImport'),
              h('span', { style: S.tabNote }, t('historyImportHint')),
            ),
          ),
          historyTab === 'import'
            ? h(
                'div',
                { style: S.row, 'data-history-import-row': '1' },
                h(
                  'button',
                  {
                    type: 'button',
                    style: S.button,
                    disabled: writeBusy,
                    onClick: onImportClick,
                    'data-history-import-button': '1',
                  },
                  t('historyImportButton'),
                ),
                h(
                  'label',
                  {
                    style: { ...S.row, gap: 6, cursor: 'pointer' },
                    'data-history-thinking': '1',
                    title: t('historyThinkingLabel'),
                  },
                  h('input', {
                    type: 'checkbox',
                    checked: includeThinking,
                    disabled: writeBusy,
                    onChange: (event) => onToggleThinking(event.target.checked),
                    'data-history-thinking-checkbox': '1',
                  }),
                  h('span', { style: { fontSize: 13, lineHeight: '20px' } }, t('historyThinkingLabel')),
                ),
                h(
                  'label',
                  {
                    style: { ...S.row, gap: 6, cursor: 'pointer' },
                    'data-history-compact': '1',
                    title: t('historyCompactHint'),
                  },
                  h('input', {
                    type: 'checkbox',
                    checked: expandOriginal,
                    disabled: writeBusy,
                    onChange: (event) => onToggleExpandOriginal(event.target.checked),
                    'data-history-compact-checkbox': '1',
                  }),
                  h('span', { style: { fontSize: 13, lineHeight: '20px' } }, t('historyCompactLabel')),
                ),
                h('input', {
                  ref: historyFileRef,
                  type: 'file',
                  accept: '.jsonl,.jsonl.zstd,.zst,.zip,.txt,application/json,application/zip',
                  style: { display: 'none' },
                  'data-history-file': '1',
                  onChange: (event) => {
                    const picked = event.target.files !== null && event.target.files !== undefined
                      ? event.target.files[0]
                      : undefined;
                    onImportFile(picked ?? null);
                  },
                }),
              )
            : null,
          h(
            'p',
            { style: S.sub, 'data-history-meta': '1' },
            `${t('historyChars')} · ${historyText.length}`,
            ` · ${t('historyTokenCost')} ${Math.round(historyBytes / 4 + 32)} tok`,
            historyDirty ? ` · ${t('historyDirtyHint')}` : '',
          ),
          h(
            'div',
            { style: S.scrollWrap, 'data-history-wrap': '1' },
            h('textarea', {
              ref: historyBoxRef,
              style: { ...S.textarea, minHeight: 320 },
              value: historyText,
              onChange: (event) => {
                setHistoryNotice(null);
                setHistoryCleared(false);
                setHistoryText(event.target.value);
              },
              disabled: writeBusy,
              spellCheck: false,
              placeholder: t('historyPlaceholder'),
              'data-persona-history-text': '1',
            }),
            h(ScrollBar, {
              targetRef: historyBoxRef,
              deps: [historyTick, historyTab],
              trackAttr: 'data-history-track',
              thumbAttr: 'data-history-thumb',
            }),
          ),
          h(
            'div',
            { style: S.row, 'data-history-actions': '1' },
            historyCleared
              ? h(
                  'button',
                  {
                    type: 'button',
                    style: S.button,
                    disabled: writeBusy,
                    onClick: onUndoClearHistory,
                    'data-history-undo': '1',
                  },
                  t('historyUndoButton'),
                )
              : h(
                  'button',
                  {
                    type: 'button',
                    style: S.button,
                    disabled: writeBusy,
                    onClick: onClearHistory,
                    'data-history-clear': '1',
                  },
                  t('historyClearButton'),
                ),
            h(
              'span',
              {
                style: S.mono,
                'data-history-state': historyLost ? 'missing' : historyStored ? 'saved' : 'empty',
              },
              historyLost
                ? t('historyMissing')
                : historyStored
                ? `${t('historyStored')} · ${historyStoredBytes} ${t('historyBytes')}` +
                  (historyLockedAt === null ? '' : ` · ${new Date(historyLockedAt).toLocaleString()}`)
                : t('historyNotStored'),
            ),
          ),
          historyNotice !== null
            ? h(
                'p',
                {
                  style: historyNotice.kind === 'error' ? S.warn : S.notice,
                  'data-history-notice': historyNotice.kind,
                },
                historyNotice.text,
              )
            : null,
          h(
            'p',
            { style: S.mono, 'data-history-stats': '1' },
            `${t('historyInjectedCount')}: ${data.section?.historyInjections ?? 0}`,
          ),
          h('span', { style: S.divider }),
          showSaving
            ? h('p', { style: S.notice, 'data-save-feedback': 'saving' }, t('saving'))
            : saveFeedback !== null
            ? h(
                'p',
                {
                  style: saveFeedback.kind === 'error' ? S.warn : S.notice,
                  'data-save-feedback': saveFeedback.kind,
                },
                saveFeedback.text,
              )
            : null,
          dirtyParts.length > 0
            ? h(
                'p',
                { style: S.warn, 'data-unsaved': '1' },
                `${t('unsavedTitle')}${dirtyParts.join(' · ')}`,
              )
            : null,
          exportNotice !== null
            ? h(
                'p',
                {
                  style: exportNotice.kind === 'error' ? S.warn : S.notice,
                  'data-export-notice': exportNotice.kind,
                },
                exportNotice.text,
              )
            : null,
          editorNotice !== null
            ? h('p', { style: S.notice, 'data-editor-notice': '1' }, editorNotice)
            : null,
          h(
            'div',
            { style: S.row, 'data-editor-actions': '1' },
            h(
              'button',
              {
                type: 'button',
                style: S.buttonPrimary,
                onClick: onSave,
                disabled: !canSave,
                'data-save-button': '1',
              },
              t('save'),
            ),
            creating
              ? h(
                  'button',
                  {
                    type: 'button',
                    style: S.button,
                    onClick: onDiscardNew,
                    disabled: writeBusy,
                    'data-discard-button': '1',
                  },
                  t('clearDraft'),
                )
              : null,
            showActivate
              ? h(
                  'button',
                  {
                    type: 'button',
                    style: S.button,
                    onClick: () => onActivate(activateTarget),
                    disabled: writeBusy,
                    'data-activate-button': '1',
                  },
                  t('activate'),
                )
              : null,
            !creating && draft.id !== ''
              ? h(
                  'button',
                  { type: 'button', style: S.button, onClick: onDelete, disabled: writeBusy, 'data-delete-button': '1' },
                  t('del'),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                style: S.button,
                onClick: onExportClick,
                disabled: !canClickExport,
                'data-export-button': '1',
                'aria-expanded': exportMenu ? 'true' : 'false',
                title: t('exportHint'),
              },
              t('exportButton'),
            ),
          ),
          exportMenu
            ? h(
                'div',
                { style: S.exportMenu, 'data-export-menu': '1' },
                h(
                  'button',
                  {
                    type: 'button',
                    style: { ...S.button, textAlign: 'left' },
                    onClick: () => {
                      setExportMenu(false);
                      onExportJson();
                    },
                    'data-export-json': '1',
                    title: t('exportJsonHint'),
                  },
                  t('exportJson'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    style: { ...S.button, textAlign: 'left' },
                    onClick: () => {
                      setExportMenu(false);
                      onExportPngClick();
                    },
                    'data-export-png': '1',
                    title: t('exportPngHint'),
                  },
                  t('exportPng'),
                ),
              )
            : null,
          h('input', {
            ref: exportPngRef,
            type: 'file',
            accept: 'image/png,.png',
            style: { display: 'none' },
            'data-export-png-file': '1',
            onChange: (event) => onExportPngFile(event?.target?.files?.[0]),
          }),
        ),
        h(
          'div',
          { style: S.card, 'data-switches-card': '1' },
          h(
            'p',
            { style: { ...S.sub, fontWeight: 600 } },
            h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
              h('span', null, t('switchesTitle')),
              h(Hint, { text: t('switchesHint'), label: t('hintLabel') }),
            ),
          ),
          h(
            'div',
            { style: S.row },
            h(
              'button',
              {
                type: 'button',
                style: everySwitchOn ? S.button : S.buttonPrimary,
                disabled: writeBusy,
                onClick: onPrimaryAction,
                'data-pure-chat': everySwitchOn ? 'restore' : '1',
              },
              everySwitchOn ? t('restoreButton') : t('pureChatButton'),
            ),
          ),
          h('p', { style: S.sub, 'data-pure-chat-hint': '1' }, t('pureChatHint')),
          pureChat
            ? h('p', { style: S.sub, 'data-pure-chat-state': '1' }, t('pureChatState'))
            : null,
          switches.soloOnly === true && activeId === null
            ? h('p', { style: S.warn }, t('soloNoPersona'))
            : null,
          activeTab === 'current' && switches.soloOnly === true && data.section?.before !== null && data.section?.before !== undefined
            ? h(
                'p',
                { style: S.mono, 'data-solo-savings': '1' },
                `${t('soloSavings')}: ${data.section.before.sections} ${t('sectionsUnit')} / ${data.section.before.chars} ${t('chars')}` +
                  ` → ${data.section.after.sections} ${t('sectionsUnit')} / ${data.section.after.chars} ${t('chars')}`,
              )
            : null,
          activeTab === 'current'
            ? h(
                'div',
                {
                  style: { display: 'flex', flexDirection: 'column', gap: 2 },
                  'data-strip-status': stripPairs.length > 0 ? 'some' : 'none',
                  'data-strip-total': String(stripPairs.reduce((sum, row) => sum + row.count, 0)),
                },
                stripPairs.length === 0
                  ? null
                  : h(
                      'span',
                      { style: S.sub, 'data-strip-breakdown': '1' },
                      `${t('stripStatusTitle')}: ${stripPairs
                        .map((row) => `${t(row.label)} ×${row.count}`)
                        .join(' · ')}`,
                    ),
                h('span', { style: S.sub }, `${t('strippedMessages')}: ${data.strippedMessages ?? 0}`),
              )
            : null,
          SWITCH_FIELDS.map((field) =>
            h(
              'label',
              {
                key: field.key,
                style: { ...S.row, gap: 8, cursor: 'pointer', alignItems: 'flex-start' },
                'data-switch': field.key,
              },
              h('input', {
                type: 'checkbox',
                checked: switches[field.key] === true,
                disabled: writeBusy,
                onChange: (event) => onToggleSwitch(field.key, event.target.checked),
                style: { marginTop: 3, flex: 'none' },
              }),
              h(
                'span',
                { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
                h(
                  'span',
                  { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                  h('span', { style: { fontSize: 13, lineHeight: '20px' } }, t(field.label)),
                  h(Hint, { text: t(field.hint), label: t('hintLabel') }),
                ),
              ),
            ),
          ),
          notice !== null ? h('p', { style: S.notice, 'data-notice': '1' }, notice) : null,
          failure !== null ? h('p', { style: S.warn }, failure) : null,
          error !== null && error !== undefined ? h('p', { style: S.warn }, error) : null,
        ),
      );
    }
      return { PersonaManagerImpl: PersonaManagerImpl };
    }
    return { create };
  },
});
