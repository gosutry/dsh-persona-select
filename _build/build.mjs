import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\\/]$/, '');
const SHARED = join(ROOT, 'packages', 'dsh-persona-select', 'lib', 'client', 'shared.js');

const COMPONENTS = [
  {
    id: 'dsh-persona-select-picker',
    dir: 'dsh-persona-select-picker',
    chunk: 'client.picker.js',
    impl: 'PersonaPickerImpl',
    slot: 'conversation.input.dock',
    order: 30,
    label: '人设选择',
    factory: 'pickerBundleFactory',
    extras: [
      'locale: NS,',
      'inject: (sessionId) => ({ t, sessionId: typeof sessionId === \'string\' ? sessionId : \'\' }),',
    ].join('\n                '),
  },
  {
    id: 'dsh-persona-select-settings',
    dir: 'dsh-persona-select-settings',
    chunk: 'client.settings.js',
    impl: 'PersonaManagerImpl',
    slot: 'settings.section',
    order: 31,
    label: '人设管理',
    factory: 'settingsBundleFactory',
    extras: [
      "label: () => t('nav'),",
      'locale: NS,',
      'inject: () => ({ t }),',
    ].join('\n                '),
  },
];

const TAIL = [
  '    function degradedPlugin(error) {',
  '      const cause = error !== null && error !== undefined && error.message ? String(error.message).split(String.fromCharCode(10))[0] : String(error);',
  '      try {',
  '        if (typeof console !== \'undefined\' && typeof console.error === \'function\') {',
  '          console.error(\'[@ID@] 客户端半加载失败：会以降级卡片呈现。首因：\' + cause);',
  '        }',
  '      } catch {',
  '      }',
  '      function Failure() {',
  '        return h(',
  '          \'div\',',
  '          { style: S.root, \'data-plugin\': \'@ID@\', \'data-render-state\': \'degraded\' },',
  '          h(\'h2\', { style: S.h2 }, \'@LABEL@ — load failure\'),',
  '          h(\'p\', { style: S.warn }, cause),',
  '        );',
  '      }',
  '      return {',
  '        inject: [\'slots\'],',
  '        apply(ctx) {',
  '          try {',
  '            ctx.slots.inject(\'@SLOT@\', () =>',
  '              ctx.slots.register(',
  '                { name: \'@SLOT@\', id: \'@ID@\', order: @ORDER@, label: () => \'@LABEL@\', inject: () => ({}) },',
  '                Failure,',
  '              ),',
  '            );',
  '          } catch {',
  '          }',
  '        },',
  '      };',
  '    }',
  '    function buildPlugin() {',
  '      return {',
  '        inject: [\'slots\', \'locale\'],',
  '        apply(ctx) {',
  '          const locale = ctx.locale;',
  '          const t = typeof locale?.bind === \'function\' ? locale.bind(NS) : (key) => key;',
  '          fallbackT = t;',
  '          bindSessionsService(ctx);',
  '          ctx.effect(() => {',
  '            if (typeof locale?.register !== \'function\') return undefined;',
  '            try {',
  '              return locale.register(NS, { zh, en });',
  '            } catch (error) {',
  '              try {',
  '                if (typeof console !== \'undefined\' && typeof console.warn === \'function\') {',
  '                  console.warn(\'[@ID@] 语言字典注册失败（已忽略，界面用 key 兜底）：\', error?.message ?? String(error));',
  '                }',
  '              } catch {',
  '              }',
  '              return undefined;',
  '            }',
  '          }, \'@ID@: 语言字典\');',
  '          const Component = chunkHost.registerComponentChunk(\'@CHUNK@\', \'@ID@\', (module) => {',
  '            const impl = module.create(chunkDeps()).@IMPL@;',
  '            return (props) => keyedByHostPresence(impl, props);',
  '          });',
  '          ctx.slots.inject(\'@SLOT@\', () =>',
  '            ctx.slots.register(',
  '              {',
  '                name: \'@SLOT@\',',
  '                id: \'@ID@\',',
  '                order: @ORDER@,',
  '                @EXTRAS@',
  '              },',
  '              Component,',
  '            ),',
  '          );',
  '        },',
  '      };',
  '    }',
  '    if (h === null) {',
  '      try {',
  '        if (typeof console !== \'undefined\' && typeof console.error === \'function\') {',
  '          console.error(\'[@ID@] 拿不到 react，客户端半不注册任何槽位；DSH 其余功能不受影响。\');',
  '        }',
  '      } catch {',
  '      }',
  '      return { inject: [], apply() {} };',
  '    }',
  '    try {',
  '      return buildPlugin();',
  '    } catch (error) {',
  '      return degradedPlugin(error);',
  '    }',
].join('\n');

function render(component) {
  const body = sharedSource.replace('__NS__', component.id);
  const tail = TAIL
    .replaceAll('@ID@', component.id)
    .replaceAll('@LABEL@', component.label)
    .replaceAll('@SLOT@', component.slot)
    .replaceAll('@ORDER@', String(component.order))
    .replaceAll('@CHUNK@', component.chunk)
    .replaceAll('@IMPL@', component.impl)
    .replaceAll('@EXTRAS@', component.extras);
  const head = [
    'window.__ModuleLoader__.load({',
    "  id: '" + component.id + "',",
    '  factory: function ' + component.factory + '(require) {',
    "    'use strict';",
    '',
  ].join('\n');
  return head + body + '\n' + tail + '\n  },\n});\n';
}

const sharedSource = await readFile(SHARED, 'utf8');
for (const component of COMPONENTS) {
  const output = render(component);
  await writeFile(join(ROOT, 'packages', component.dir, 'client.js'), output, 'utf8');
  console.log(component.id, '->', output.length, 'bytes');
}
