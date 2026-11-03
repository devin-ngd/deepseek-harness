/** Browser fixture transport around the shipped factory and official question component. */
import React from 'react'
import * as jsx from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import * as zod from 'zod'
import { Context } from '../../../../vendor/cordis/lib/index.js'
import { bindSnapshotSelector } from '../../../../packages/client/ui-renderer/src/client/bind.ts'
import { QuestionComposer } from '../../../../packages/client/ui-user-questions/src/client/QuestionComposer.tsx'
import { PendingQuestion, createWaterfallRequest } from '../../../../packages/client/ui-user-questions/src/client/contract/slots.ts'
import { createQuestionDraftStore } from '../../../../packages/client/ui-user-questions/src/client/draft-store.ts'
import { zh, en } from '../../../../packages/client/ui-user-questions/src/client/locales.ts'
import { zh as commonZh } from '../../../../packages/client/locale/src/locales/zh.ts'
import { en as commonEn } from '../../../../packages/client/locale/src/locales/en.ts'
import { closeTopModal } from '../../../../packages/client/ui-primitives/src/useModalLayer.ts'
import { Modal } from '../../../../packages/client/ui-primitives/src/Modal.tsx'

window.__ModuleLoader__ = { load: value => { window.panelFactory = value } }
window.startPanelFixture = async () => {
  const Plugin = window.panelFactory.factory(name => {
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return jsx
    if (name === 'zod') return zod
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { closeTopModal }
    throw new Error('Unreviewed browser import: ' + name)
  })
  const ctx = new Context(), rows = new Map(), dictionaries = new Map(), scopes = new Map(), records = new Map(), hooks = new Map(), questions = new Map(), root = createRoot(document.getElementById('fixture'))
  let selected = null, lang = 'zh', mounted = true, settingsOpen = false
  for (const id of ['panel-empty', 'panel-second']) { const scope = ctx.plugin({ name: id, apply() {} }); await scope; scopes.set(id, scope.ctx); records.set(scope.ctx, { sessionId: id }) }
  ctx.reflect.provide('sessions', { scope: id => scopes.get(id), sessionOf: scope => records.get(scope) })
  ctx.reflect.provide('commandUi', {})
  ctx.reflect.provide('locale', { register: (name, value) => { dictionaries.set(name, value); return () => dictionaries.delete(name) }, bind: name => key => dictionaries.get(name)?.[lang][key] ?? key })
  ctx.reflect.provide('slots', { inject: (_name, callback) => ctx.effect(callback), register: (entry, component) => { const key = entry.id ?? entry.name; rows.set(key, { entry, component }); return () => rows.delete(key) } })
  const commands = { execute: (sessionId, line, attachments) => { if (attachments.length) throw new Error('Unexpected attachments'); return window.fixtureExecute(sessionId, line) } }
  ctx.reflect.provide('remote', { commands }); ctx.reflect.provide('remote.commands', commands)
  const plugin = ctx.plugin(Plugin); await plugin
  const tQuestion = key => ({ ...(lang === 'zh' ? commonZh : commonEn), ...(lang === 'zh' ? zh : en) })[key] ?? key
  const render = () => {
    const settings = rows.get('harmony-phone'), row = rows.get('harmony.controls'), face = selected === null || !mounted || row === undefined ? undefined : row.entry.inject(selected)
    if (face !== undefined && !hooks.has(face)) hooks.set(face, bindSnapshotSelector(face.hooks.control))
    const question = questions.get(selected)
    root.render(React.createElement(React.Fragment, null,
      React.createElement('button', { onClick: () => { settingsOpen = !settingsOpen; render() }, 'data-testid': 'open-plugin-settings' }, '插件设置'),
      React.createElement('textarea', { 'aria-label': '聊天输入框' }),
      !mounted || settings === undefined ? null : React.createElement(Modal, { open: settingsOpen, onClose: () => { settingsOpen = false; render() }, title: '插件设置', closeLabel: '关闭', shortcutModal: 'settings' }, React.createElement('div', { 'data-testid': 'plugin-settings' },
        React.createElement('div', { role: 'tablist' }, React.createElement('button', { role: 'tab', 'aria-selected': true }, settings.entry.label())),
        React.createElement(settings.component, {
          SessionProvider: ({ children, empty }) => selected === null ? empty() : children,
          renderSlot: () => face === undefined ? null : React.createElement(row.component, { key: selected, useControl: hooks.get(face), run: face.run, t: key => dictionaries.get('harmony-controls')?.[lang][key] ?? key }),
          t: key => dictionaries.get('harmony-controls')?.[lang][key] ?? key,
        }))),
      question === undefined ? null : React.createElement(QuestionComposer, { key: question.pending.key, matched: question.pending, useStore: question.useStore, useQuestionCard: (_key, selector) => question.useCard(selector), actions: question.store.actions, t: tQuestion, renderSlot: () => null })))
  }
  window.panelFixture = {
    select: id => { selected = id; render() },
    language: next => { lang = next; render() },
    remount: () => { mounted = !mounted; render() },
    snapshot: id => rows.get('harmony.controls').entry.inject(id).hooks.control.getSnapshot(),
    run: (id, command) => rows.get('harmony.controls').entry.inject(id).run(command),
    ask: async (id, items) => {
      const pending = new PendingQuestion(id, items), store = createQuestionDraftStore().create(id), lifetime = new AbortController()
      const request = createWaterfallRequest(undefined, lifetime.signal, channel => pending.detachWaterfall(channel))
      pending.attachWaterfall(request.channel)
      questions.set(id, { pending, store, lifetime, useStore: bindSnapshotSelector(store), useCard: bindSnapshotSelector(pending) }); render()
      try { return { ok: true, answer: await request.result } }
      catch (error) { return { ok: false, code: error.code, name: error.name } }
      finally { pending.close(); questions.delete(id); render() }
    },
    unload: async () => { for (const value of questions.values()) value.lifetime.abort(); await plugin.dispose(); render() },
    close: async () => { for (const value of questions.values()) value.lifetime.abort(); root.unmount(); await ctx.fiber.dispose() },
  }
  render()
}
