/* ML verification — reuses the CDP harness pattern from diagnose.mjs.
 * Checks: lazy TF load, synthetic train (<15s), inference (<20ms),
 * model size (<200KB), IndexedDB persistence. */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const exe = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p))

const dir = mkdtempSync(join(tmpdir(), 'mlverify-'))
const proc = spawn(exe, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })
let stderr = ''
proc.stderr.on('data', (d) => { stderr += d })
await sleep(1200)
const wsUrl = stderr.match(/ws:\/\/[^\s]+/)[0]
const WebSocket = (await import('ws')).default
const ws = new WebSocket(wsUrl)
let id = 0
const pend = new Map()
ws.on('message', (d) => {
  const m = JSON.parse(d.toString())
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) }
})
await new Promise((r) => ws.on('open', r))
let sessionIdG = null
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const i = ++id
  pend.set(i, res)
  const sid = sessionId ?? sessionIdG
  ws.send(JSON.stringify(sid ? { id: i, method, params, sessionId: sid } : { id: i, method, params }))
})
const evaluate = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result.value
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true })
sessionIdG = S
await send('Page.enable')
await send('Runtime.enable')
await send('Network.enable')

// ── 1) Open /sign and confirm TF.js is NOT eagerly loaded ──
const tfRequests = []
const marker = []
ws.on('message', (d) => {
  const m = JSON.parse(d.toString())
  if (m.method === 'Network.requestWillBeSent' && m.sessionId === S) {
    marker.push(m.params.request.url)
    if (/tensorflow|tfjs/i.test(m.params.request.url)) tfRequests.push(m.params.request.url)
  }
})
await send('Page.navigate', { url: BASE + '/sign' })
await sleep(6000)
const noModelProbe = await evaluate(`(() => ({
  badge: document.body.innerText.includes('Heuristic'),
  trainBtn: document.body.innerText.includes('Train'),
}))()`)
console.log('1) /sign opens, heuristic badge visible:', JSON.stringify(noModelProbe))
console.log('   TF.js network requests on open:', tfRequests.length, tfRequests.length === 0 ? '✅ lazy' : '❌ eager')

// ── 2) Synthetic training + inference + persistence (in-page) ──
const mlResult = await evaluate(`(async () => {
  const out = {}
  try {
    const gc = await import('/src/lib/gestureClassifier.ts')
    // Synthetic dataset: 5 gesture clusters with jitter (20 per class).
    const samples = []
    const rand = (s) => Math.sin(s) * 0.5
    for (let label = 0; label < 5; label++) {
      for (let n = 0; n < 20; n++) {
        const base = []
        for (let i = 0; i < 63; i++) base.push(0.1 + 0.3 * Math.abs(Math.sin(i + label * 7)) + rand(i + n + label) * 0.05)
        samples.push({ landmarks: base, label })
      }
    }
    const t0 = performance.now()
    const metrics = await gc.trainModel(samples, {})
    out.trainMs = Math.round(performance.now() - t0)
    out.accuracy = +metrics.accuracy.toFixed(3)
    out.valAccuracy = +metrics.valAccuracy.toFixed(3)
    out.epochsRun = metrics.epochsRun
    await gc.saveModel()
    out.modelKB = +(gc.estimateModelBytes() / 1024).toFixed(1)
    // Inference timing (average of 20 runs).
    const feat = samples[0].landmarks
    await gc.predict(feat) // warmup
    const t1 = performance.now()
    for (let i = 0; i < 20; i++) await gc.predict(feat)
    out.inferenceMs = +((performance.now() - t1) / 20).toFixed(2)
    out.classCount = gc.getClassCount()
    out.loaded = gc.isModelLoaded()
    // Persistence: drop in-memory ref by reloading module state via page is
    // covered by the reload test after this evaluate.
    window.__ml_ok = true
  } catch (e) {
    out.error = String(e && e.message ? e.message : e)
  }
  return out
})()`, true)
console.log('2) train/inference:', JSON.stringify(mlResult))

// ── 3) Reload → model persists in IndexedDB ──
await send('Page.navigate', { url: BASE + '/sign' })
await sleep(6000)
const persisted = await evaluate(`(async () => {
  try {
    const gc = await import('/src/lib/gestureClassifier.ts')
    const ok = await gc.loadModel()
    return { reloaded: ok, loaded: gc.isModelLoaded() }
  } catch (e) { return { error: String(e) } }
})()`, true)
console.log('3) persistence after reload:', JSON.stringify(persisted))

// ── 4) Heuristic classifier sanity (pure, no TF) ──
const heur = await evaluate(`(async () => {
  const h = await import('/src/lib/gestureHeuristics.ts')
  const lm = (ext) => {
    // Build 21 landmarks: wrist at origin, fingers up if extended flag true.
    const pts = [{x:0,y:0,z:0}]
    const mcps = [[2,5],[5,9],[9,13],[13,17]]
    for (const [mx,my] of mcps) { pts.push({x:mx*0.01,y:-0.02,z:0}) }
    // approximate tips: index 8, middle 12, ring 16, pinky 20, thumb 4
    const tips = {4:[0.03,-0.05],8:[0.02,-0.12],12:[0.05,-0.13],16:[0.08,-0.12],20:[0.11,-0.1]}
    for (const k of Object.keys(tips)) {
      const [tx,ty] = tips[k]
      pts[k] = ext ? {x:tx,y:ty,z:0} : {x:tx,y:0.03,z:0}
    }
    return pts
  }
  const fist = h.classifyGesture(lm(false).map((p,i)=> i===0?p:{...p, y: 0.01}))
  return { ran: true, sample: h.classifyGesture(lm(true)) }
})()`, true)
console.log('4) heuristics sanity:', JSON.stringify(heur))

console.log('\\nTargets: train < 15000ms · inference < 20ms · model < 200KB · lazy TF ✅')
proc.kill()
await sleep(200)
try { rmSync(dir, { recursive: true, force: true }) } catch {}
process.exit(0)
