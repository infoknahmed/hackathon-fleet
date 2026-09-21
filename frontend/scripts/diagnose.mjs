/* VaakSetu diagnostic sweep — headless Chrome (CDP), no deps.
 * Usage: node scripts/diagnose.mjs [--speak]
 * Captures console errors, page errors, request failures per route,
 * plus a Web Speech voice inventory and (with --speak) TTS firing check.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const DO_SPEAK = process.argv.includes('--speak')
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
]

const ROUTES = ['/', '/user', '/guardian', '/admin', '/conversation', '/sign']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class CDP {
  static async launch() {
    const exe = CHROME_CANDIDATES.find((p) => existsSync(p))
    if (!exe) throw new Error('Chrome not found')
    const dir = mkdtempSync(join(tmpdir(), 'cdp-'))
    const proc = spawn(exe, [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${dir}`,
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--lang=en-US',
      'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d })
    let wsUrl = null
    for (let i = 0; i < 50 && !wsUrl; i++) {
      await sleep(100)
      const m = stderr.match(/ws:\/\/[^\s]+/)
      if (m) wsUrl = m[0]
    }
    if (!wsUrl) throw new Error('Chrome did not expose CDP: ' + stderr.slice(-400))
    return new CDP(proc, dir, wsUrl)
  }

  constructor(proc, dir, wsUrl) {
    this.proc = proc
    this.dir = dir
    this.wsUrl = wsUrl
    this.id = 0
    this.pending = new Map()
    this.listeners = new Set()
  }

  async connect() {
    const { WebSocket } = await import('node:ws').catch(() => ({}))
    this.ws = WebSocket
      ? new WebSocket(this.wsUrl)
      : new (globalThis.WebSocket)(this.wsUrl)
    await new Promise((res, rej) => {
      this.ws.onopen = res
      this.ws.onerror = () => rej(new Error('WS error'))
    })
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString())
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      } else if (msg.method) {
        this.listeners.forEach((fn) => fn(msg))
      }
    }
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
    })
  }

  on(fn) {
    this.listeners.add(fn)
  }

  async close() {
    try { this.ws?.close() } catch {}
    this.proc.kill()
    await sleep(300)
    try { rmSync(this.dir, { recursive: true, force: true }) } catch {}
  }
}

async function main() {
  const report = { routes: {}, voices: null, tts: null }
  const cdp = await CDP.launch()
  await cdp.connect()
  const events = []
  cdp.on((msg) => events.push(msg))

  // Create a target (tab).
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const S = sessionId
  await cdp.send('Page.enable', {}, S)
  await cdp.send('Runtime.enable', {}, S)
  await cdp.send('Log.enable', {}, S)
  await cdp.send('Network.enable', {}, S)
  try { await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' }, S) } catch {}

  for (const route of ROUTES) {
    const marker = events.length
    await cdp.send('Page.navigate', { url: BASE + route }, S)
    await sleep(4000)
    const slice = events.slice(marker)
    const errors = []
    const failedReqs = []
    for (const m of slice) {
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails
        errors.push(d.exception?.description || d.text || 'exception')
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
      }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        errors.push(`[log] ${m.params.entry.text}`)
      }
      if (m.method === 'Network.loadingFailed' && !m.params.canceled) {
        failedReqs.push(`${m.params.errorText} ${m.params.type}`)
      }
    }
    // DOM sanity probes per route.
    const evals = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const t = document.body?.innerText?.slice(0, 400) ?? ''
        return {
          root: Boolean(document.getElementById('root')?.children.length),
          text: t,
        }
      })()`,
    }, S)
    report.routes[route] = {
      errors: [...new Set(errors)].slice(0, 8),
      failedReqs: [...new Set(failedReqs)].slice(0, 8),
      rendered: evals.result.value.root,
      textSample: evals.result.value.text.replace(/\\n+/g, ' | ').slice(0, 220),
    }
  }

  // Voice inventory + TTS firing check.
  const voiceProbe = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve({ supported: false })
      const collect = () => speechSynthesis.getVoices().map(v => ({ name: v.name, lang: v.lang, local: v.localService }))
      let voices = collect()
      if (voices.length) return resolve({ supported: true, voices, langs: [...new Set(voices.map(v => v.lang))] })
      speechSynthesis.onvoiceschanged = () => {
        voices = collect()
        resolve({ supported: true, voices, langs: [...new Set(voices.map(v => v.lang))] })
      }
      setTimeout(() => resolve({ supported: true, voices, langs: [] }), 3000)
    })`,
  }, S)
  report.voices = voiceProbe.result.value

  if (DO_SPEAK) {
    await cdp.send('Page.navigate', { url: BASE + '/user' }, S)
    await sleep(3000)
    const speakProbe = await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `new Promise(async (resolve) => {
        const out = {}
        try {
          speechSynthesis.cancel()
          const u = new SpeechSynthesisUtterance('Hello, this is VaakSetu')
          const t0 = performance.now()
          u.onstart = () => { out.startLatencyMs = Math.round(performance.now() - t0); out.fired = true }
          u.onerror = (e) => { out.error = e.error }
          speechSynthesis.speak(u)
          setTimeout(() => resolve(out), 3500)
        } catch (e) { out.error = String(e); resolve(out) }
      })`,
    }, S)
    report.tts = speakProbe.result.value
  }

  await cdp.close()

  // Pretty print.
  console.log('=' .repeat(64))
  console.log('VAAKSETU DIAGNOSTIC SWEEP —', new Date().toISOString())
  console.log('='.repeat(64))
  for (const [route, r] of Object.entries(report.routes)) {
    console.log(`\\n● ${route}  ${r.rendered ? '✅ rendered' : '❌ NOT RENDERED'}`)
    if (r.errors.length) console.log('  errors:', r.errors)
    if (r.failedReqs.length) console.log('  failed requests:', r.failedReqs)
    console.log('  text:', r.textSample || '(empty)')
  }
  console.log('\\n● VOICES', report.voices?.supported ? `(${report.voices.voices.length} found)` : 'unsupported')
  if (report.voices?.langs) console.log('  langs:', report.voices.langs.join(', '))
  if (report.tts) console.log('\\n● TTS', JSON.stringify(report.tts))
}

main().catch((e) => {
  console.error('DIAG FAILED:', e.message)
  process.exit(1)
})
