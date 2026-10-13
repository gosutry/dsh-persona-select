window.__ModuleLoader__.load({
  id: 'dsh-persona-select',
  chunk: 'client.picker.js',
  factory: function pickerChunk(require) {
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
        popupPanelLayout, popupPanelLayoutStyle, supportsPopover,
      } = deps;
    function usePopupGeometry(triggerRef, open) {
      const [layout, setLayout] = React.useState({ place: 'above', maxHeight: 320, positioned: false, left: 0, top: 0 });
      const panelElRef = React.useRef(null);
      const measuredRef = React.useRef(0);
      const [panelState, setPanelState] = React.useState('unmeasured');
      const [canPopover] = React.useState(() => supportsPopover());
      const measure = React.useCallback(() => {
        const trigger = triggerRef.current;
        const triggerNode = trigger !== null && trigger !== undefined && typeof trigger.getBoundingClientRect === 'function'
          ? trigger
          : null;
        if (triggerNode === null) return;
        let rect = null;
        try {
          rect = triggerNode.getBoundingClientRect();
        } catch {
          return;
        }
        if (rect === null || rect === undefined) return;
        const panel = panelElRef.current;
        let width = 0;
        if (panel !== null && panel !== undefined && typeof panel.getBoundingClientRect === 'function') {
          try {
            const panelRect = panel.getBoundingClientRect();
            if (panelRect.width > rect.width) width = panelRect.width;
          } catch {
            width = 0;
          }
        } else {
          width = Math.max(rect.width, 220);
        }
        const next = popupPanelLayout({ rect, width, measured: measuredRef.current });
        setLayout((previous) => (
          previous.place === next.place
          && previous.maxHeight === next.maxHeight
          && previous.positioned === next.positioned
          && Math.round(previous.left) === Math.round(next.left)
          && Math.round(previous.top) === Math.round(next.top)
            ? previous
            : next
        ));
        setPanelState(next.positioned ? 'measured' : 'unmeasured');
      }, [triggerRef]);
      const panelRef = React.useCallback((node) => {
        panelElRef.current = node;
        if (node === null || node === undefined) {
          measuredRef.current = 0;
          return;
        }
        let rect = null;
        try {
          rect = node.getBoundingClientRect();
        } catch {
          rect = null;
        }
        if (rect !== null && rect !== undefined && rect.height > 0) {
          const overset = typeof node.scrollHeight === 'number' && node.scrollHeight > rect.height + 1;
          if (!overset) measuredRef.current = rect.height;
        }
        measure();
      }, [measure]);
      const useIsomorphicLayoutEffect = typeof React.useLayoutEffect === 'function'
        ? React.useLayoutEffect
        : React.useEffect;
      useIsomorphicLayoutEffect(() => {
        if (!open) {
          measuredRef.current = 0;
          return undefined;
        }
        measure();
        return undefined;
      }, [open, measure]);
      useIsomorphicLayoutEffect(() => {
        const panel = panelElRef.current;
        if (panel === null || panel === undefined) return;
        if (!canPopover) return;
        try {
          if (open) {
            if (panel.matches !== undefined && typeof panel.matches === 'function' && panel.matches(':popover-open') === true) return;
            panel.showPopover();
          } else if (typeof panel.hidePopover === 'function') {
            panel.hidePopover();
          }
        } catch {
        }
      }, [open, canPopover]);
      React.useEffect(() => {
        if (!open) return undefined;
        try {
          if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
          const onViewportChange = () => measure();
          window.addEventListener('resize', onViewportChange);
          window.addEventListener('scroll', onViewportChange, true);
          return () => {
            window.removeEventListener('resize', onViewportChange);
            window.removeEventListener('scroll', onViewportChange, true);
          };
        } catch {
          return undefined;
        }
      }, [open, measure]);
      React.useEffect(() => {
        if (!open) return undefined;
        const trigger = triggerRef.current;
        if (trigger === null || trigger === undefined) return undefined;
        try {
          if (typeof ResizeObserver !== 'function') return undefined;
          const observer = new ResizeObserver(() => measure());
          observer.observe(trigger);
          return () => observer.disconnect();
        } catch {
          return undefined;
        }
      }, [open, measure, triggerRef]);
      return { layout, panelRef, panelState };
    }
    function PersonaPickerImpl(props) {
      const t = props !== null && props !== undefined && typeof props.t === 'function' ? props.t : fallbackT;
      const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : '';
      const running = props?.session?.running === true;
      const { data, reload } = usePersonaState(sessionId);
      const [open, setOpen] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [failure, setFailure] = React.useState(null);
      const wrapRef = React.useRef(null);
      const listRef = React.useRef(null);
      const triggerRef = React.useRef(null);
      const lastSeenRef = React.useRef(null);
      const residentAskedRef = React.useRef('');
      const blank = typeof props?.session?.blank === 'boolean' ? props.session.blank : undefined;
      const parent = typeof props?.session?.subagent?.address?.parentSessionId === 'string'
        && props.session.subagent.address.parentSessionId !== ''
        ? props.session.subagent.address.parentSessionId
        : undefined;
      const { layout: panelLayout, panelRef: setPanelNode, panelState } = usePopupGeometry(triggerRef, open);
      React.useEffect(() => {
        const key = `${sessionId}:${running ? '1' : '0'}`;
        const previous = lastSeenRef.current;
        lastSeenRef.current = key;
        if (previous === null || previous === key) return;
        reload();
      }, [sessionId, running, reload]);
      const lastResidentRef = React.useRef(0);
      const [residentRetryTick, setResidentRetryTick] = React.useState(0);
      React.useEffect(() => {
        if (sessionId === '') return undefined;
        if (data?.session?.hasRecord === true) return undefined;
        if (blank !== false) return undefined;
        const timer = setInterval(() => setResidentRetryTick((n) => n + 1), RESIDENT_RETRY_MS);
        if (typeof timer?.unref === 'function') timer.unref();
        return () => clearInterval(timer);
      }, [sessionId, data?.session?.hasRecord, blank]);
      React.useEffect(() => {
        if (sessionId === '') return undefined;
        const hasRecord = data?.session?.hasRecord === true;
        if (hasRecord) {
          residentAskedRef.current = sessionId;
          return undefined;
        }
        if (blank === true) return undefined;
        const now = Date.now();
        if (residentAskedRef.current !== sessionId) {
          residentAskedRef.current = sessionId;
          lastResidentRef.current = now;
        } else if (blank !== false || now - lastResidentRef.current < RESIDENT_RETRY_MS) {
          return undefined;
        } else {
          lastResidentRef.current = now;
        }
        let cancelled = false;
        (async () => {
          try {
            const asked = { session: sessionId };
            if (blank !== undefined) asked.blank = blank;
            if (parent !== undefined) asked.parent = parent;
            await call('/resident', { method: 'PUT', body: JSON.stringify(asked) });
            if (!cancelled) reload();
          } catch {
          }
        })();
        return () => {
          cancelled = true;
        };
      }, [sessionId, data?.session?.hasRecord, blank, parent, reload, residentRetryTick]);
      React.useEffect(() => {
        if (!open) return undefined;
        reload();
        return undefined;
      }, [open, reload]);
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
      React.useEffect(() => {
        if (!open) return undefined;
        ensureScrollCss();
        return undefined;
      }, [open]);
      const run = React.useCallback(
        async (work) => {
          setBusy(true);
          setFailure(null);
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
      const onPickPersona = (id) =>
        run(async () => {
          setOpen(false);
          await call('/active', { method: 'PUT', body: JSON.stringify({ id, session: sessionId }) });
          if (!notifyPersonaChanged()) await reload();
        });
      const onSpecialAction = () =>
        run(async () => {
          setOpen(false);
          if (allSwitchesOn(data?.switches)) {
            await call('/switches', {
              method: 'PUT',
              body: JSON.stringify({
                soloOnly: false,
                stripRuntime: false,
                stripTools: false,
                stripInjected: false,
                session: sessionId,
              }),
            });
          } else {
            await call('/switches', {
              method: 'PUT',
              body: JSON.stringify({ pureChat: true, session: sessionId }),
            });
          }
          if (!notifyPersonaChanged()) await reload();
        });
      if (data === null) {
        return h(
          'div',
          { style: { ...S.row, opacity: 0.6 }, 'data-plugin': 'dsh-persona-select', 'data-render-state': 'loading' },
          h('span', { style: S.sub }, t('pickerLabel')),
        );
      }
      const assembly = data.section;
      const dropped = assembly !== undefined && assembly !== null && typeof assembly.droppedAt === 'number';
      const activeId = data.activeId ?? null;
      const hasRecord = data.session?.hasRecord === true;
      const selected = (data.personas ?? []).find((persona) => persona.id === activeId);
      const everySwitchOn = allSwitchesOn(data.switches);
      const currentLabel = selected === undefined ? t('off') : selected.name;
      const options = (data.personas ?? []).filter((persona) => persona.id !== 'builtin:off');
      const indicators = indicatorsOf(data, t);
      const indicator = summarizeIndicators(indicators, t);
      const dotNode = h('span', {
        style: S.dot(indicator.color),
        'data-dot': indicator.color,
        'data-indicator': indicator.reason,
        title: indicator.text,
      });
      return h(
        'div',
        {
          style: { ...S.row, position: 'relative' },
          'data-plugin': 'dsh-persona-select',
          'data-render-state': 'ready',
          'data-picker-open': open ? '1' : '0',
          'data-session-id': sessionId,
          'data-scope': hasRecord ? 'session' : 'global',
          'data-indicators': indicators.map((entry) => entry.reason).join(','),
          title: failure ?? (dropped ? t('droppedHint') : ''),
          ref: wrapRef,
        },
        h('span', { style: S.sub }, t('pickerLabel')),
        h(
          'button',
          {
            type: 'button',
            style: S.pickerTrigger,
            disabled: busy,
            onClick: () => setOpen((previous) => !previous),
            'data-persona-picker': '1',
            ref: triggerRef,
          },
          h('span', null, currentLabel),
          h(
            'span',
            {
              style: S.pickerArrow,
              'data-picker-arrow': open ? (panelLayout.place === 'above' ? 'up' : 'down') : 'up',
            },
            open ? (panelLayout.place === 'above' ? '▲' : '▼') : '▲',
          ),
        ),
        dotNode,
        h(
          'span',
          { style: S.badge, 'data-picker-scope-badge': hasRecord ? 'session' : 'global', title: t('pickerLayerHint') },
          hasRecord ? t('scopeLayerCurrent') : t('scopeLayerGlobal'),
        ),
        open
          ? h(
              'div',
              {
                style: { ...S.pickerPanel, ...popupPanelLayoutStyle(panelLayout) },
                popover: 'manual',
                'data-picker-panel': '1',
                'data-picker-place': panelLayout.place,
                'data-picker-panel-state': panelState,
                'data-picker-panel-left': Math.round(panelLayout.left ?? 0),
                'data-picker-panel-top': Math.round(panelLayout.top ?? 0),
                ref: setPanelNode,
              },
              h(
                'button',
                {
                  type: 'button',
                  style: { ...S.pickerOption, ...S.pickerEmphasis },
                  'data-pure-chat-option': everySwitchOn ? 'restore' : '1',
                  'data-pure-chat-position': 'top',
                  onClick: onSpecialAction,
                },
                h('span', { style: { flex: 1 } }, everySwitchOn ? t('restoreButton') : t('pureChatButton')),
              ),
              h('span', { style: S.pickerDivider }),
              h(
                'div',
                { style: S.scrollWrap, 'data-picker-scroll': '1' },
                h(
                  'div',
                  {
                    ref: listRef,
                    style: S.pickerList,
                    'data-persona-picker-list': '1',
                  },
                  h(
                    'button',
                    {
                      type: 'button',
                      style: { ...S.pickerOption },
                      'data-persona-option': 'off',
                      onClick: () => onPickPersona('builtin:off'),
                    },
                    h('span', { style: { flex: 1 } }, t('off')),
                    activeId === null ? dotNode : null,
                  ),
                  options.map((persona) =>
                    h(
                      'button',
                      {
                        type: 'button',
                        key: persona.id,
                        style: { ...S.pickerOption },
                        'data-persona-option': persona.id,
                        onClick: () => onPickPersona(persona.id),
                      },
                      h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, persona.name),
                      persona.builtin ? h('span', { style: S.badge }, t('builtin')) : null,
                      activeId === persona.id ? dotNode : null,
                    ),
                  ),
                ),
                h(ScrollBar, {
                  targetRef: listRef,
                  deps: [open, data],
                  trackAttr: 'data-picker-track',
                  thumbAttr: 'data-picker-thumb',
                }),
              ),
            )
          : null,
        failure !== null ? h('span', { style: S.warn }, failure) : null,
      );
    }
      return { PersonaPickerImpl: PersonaPickerImpl };
    }
    return { create };
  },
});
