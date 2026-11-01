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

window.__ModuleLoader__ = { load: value => { window.panelFactory = value } }
window.startPanelFixture = async () => {
  const Plugin = window.panelFactory.factory(name => {
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return jsx
    if (name === 'zod') return zod
    throw new Error('Unreviewed browser import: ' + name)
  })
  const ctx = new Context(), rows = new Map(), dictionaries = new Map(), scopes = new Map(), records = new Map(), hooks = new Map(), questions = new Map(), root = createRoot(document.getElementById('fixture'))
  let selected = null, lang = 'zh', mounted = true
  for (const id of ['panel-empty', 'panel-second']) { const scope = ctx.plugin({ name: id, apply() {} }); await scope; scopes.set(id, scope.ctx); records.set(scope.ctx, { sessionId: id }) }
  ctx.reflect.provide('sessions', { scope: id => scopes.get(id), sessionOf: scope => records.get(scope) })
  ctx.reflect.provide('commandUi', {})
  ctx.reflect.provide('locale', { register: (name, value) => { dictionaries.set(name, value); return () => dictionaries.delete(name) }, bind: name => key => dictionaries.get(name)?.[lang][key] ?? key })
  ctx.reflect.provide('slots', { inject: (_name, callback) => ctx.effect(callback), register: (entry, component) => { rows.set(entry.id, { entry, component }); return () => rows.delete(entry.id) } })
  const commands = { execute: (sessionId, line, attachments) => { if (attachments.length) throw new Error('Unexpected attachments'); return window.fixtureExecute(sessionId, line) } }
  ctx.reflect.provide('remote', { commands }); ctx.reflect.provide('remote.commands', commands)
  const plugin = ctx.plugin(Plugin); await plugin
  const tQuestion = key => ({ ...(lang === 'zh' ? commonZh : commonEn), ...(lang === 'zh' ? zh : en) })[key] ?? key
  const render = () => {
    const row = rows.get('harmony-controls'), face = selected === null || !mounted || row === undefined ? undefined : row.entry.inject(selected)
    if (face !== undefined && !hooks.has(face)) hooks.set(face, bindSnapshotSelector(face.hooks.control))
    const question = questions.get(selected)
    root.render(React.createElement(React.Fragment, null,
      face === undefined ? null : React.createElement(row.component, { key: selected, useControl: hooks.get(face), run: face.run, t: key => dictionaries.get('harmony-controls')?.[lang][key] ?? key }),
      question === undefined ? null : React.createElement(QuestionComposer, { key: question.pending.key, matched: question.pending, useStore: question.useStore, useQuestionCard: (_key, selector) => question.useCard(selector), actions: question.store.actions, t: tQuestion, renderSlot: () => null })))
  }
  window.panelFixture = {
    select: id => { selected = id; render() },
    language: next => { lang = next; render() },
    remount: () => { mounted = !mounted; render() },
    snapshot: id => rows.get('harmony-controls').entry.inject(id).hooks.control.getSnapshot(),
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
