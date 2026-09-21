/* FAST TRAIN + DEPLOY: synthetic 750 samples → train → export to public/gesture-model. */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p))
const dir = mkdtempSync(join(tmpdir(), 'fasttrain-'))
const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] })
let stderr = ''
proc.stderr.on('data', (d) => { stderr += d })
await sleep(1200)
const wsUrl = stderr.match(/ws:\/\/[^\s]+/)[0]
const WebSocket = (await import('ws')).default
const ws = new WebSocket(wsUrl)
let id = 0
const pend = new Map()
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) } })
await new Promise((r) => ws.on('open', r))
let sessionIdG = null
const send = (method, params = {}, sid) => new Promise((res) => { const i = ++id; pend.set(i, res); const s = sid ?? sessionIdG; ws.send(JSON.stringify(s ? { id: i, method, params, sessionId: s } : { id: i, method, params })) })

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true })
sessionIdG = S
await send('Page.enable')
await send('Runtime.enable')

// Serve from the dev server so /src imports resolve.
await send('Page.navigate', { url: 'http://localhost:5173/sign' })
await sleep(4000)

const out = await evaluate()
async function evaluate() {
  const expr = `(async () => {
    const gc = await import('/src/lib/gestureClassifier.ts')
    const tf = await import('@tensorflow/tfjs')
    // 150 samples × 5 gestures, simple jitter around per-class prototypes.
    const samples = []
    for (let label = 0; label < 5; label++) {
      for (let n = 0; n < 150; n++) {
        const f = []
        for (let i = 0; i < 63; i++) {
          const proto = 0.1 + 0.35 * Math.abs(Math.sin(i * 1.3 + label * 5.1))
          f.push(proto + (Math.sin(i * 12.9898 + n * 78.233 + label) * 0.5 + 0.5) * 0.04)
        }
        samples.push({ landmarks: f, label })
      }
    }
    // Retrain inline with patience=3 by monkey-patching is not exposed; use trainModel (patience 5, cap 30).
    const t0 = performance.now()
    const metrics = await gc.trainModel(samples, {})
    const trainMs = Math.round(performance.now() - t0)
    await gc.saveModel()
    // Export artifacts for public/ hosting.
    const artifacts = await new Promise((resolve, reject) => {
      tf.io.withSaveHandler(async (a) => { resolve(a); return { modelArtifactsInfo: { dateSaved: new Date() } } })(gc.__exportModel)
    })
    window.__ml = { trainMs, metrics, out }
    return { trainMs, metrics, loaded: gc.isModelLoaded() }
  })()`
  return expr
}

// The export needs model access — do it in one evaluate with a save handler.
const result = await send('Runtime.evaluate', {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const gc = await import('/src/lib/gestureClassifier.ts')
    // Grab TF from the classifier's own dynamic import cache.
    const tf = await (await import('/src/lib/gestureClassifier.ts')).__getTF()
    const samples = []
    for (let label = 0; label < 5; label++) {
      for (let n = 0; n < 150; n++) {
        const f = []
        for (let i = 0; i < 63; i++) {
          const proto = 0.1 + 0.35 * Math.abs(Math.sin(i * 1.3 + label * 5.1))
          f.push(proto + (Math.sin(i * 12.9898 + n * 78.233 + label) * 0.5 + 0.5) * 0.04)
        }
        samples.push({ landmarks: f, label })
      }
    }
    const t0 = performance.now()
    const metrics = await gc.trainModel(samples, {})
    const trainMs = Math.round(performance.now() - t0)
    await gc.saveModel()
    // Export: intercept save via withSaveHandler on the live model.
    const mod = await import('/src/lib/gestureClassifier.ts')
    // Rebuild an identical model + copy weights through a save handler.
    const m = gc.__getModel()
    const artifacts = await new Promise((resolve, reject) => {
      m.save(tf.io.withSaveHandler(async (a) => { resolve(a); return { modelArtifactsInfo: { dateSaved: new Date() } } }))
        .catch(reject)
    })
    const weightB64 = btoa(String.fromCharCode(...new Uint8Array(artifacts.weightData).slice(0, 4 * 1024 * 1024)))
    return {
      trainMs,
      metrics,
      modelJson: JSON.stringify({ modelTopology: artifacts.modelTopology, weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }], format: 'tfjs-graph-model', generatedBy: 'vaaksetu-fast-train' }),
      weightB64,
    }
  })()`,
})
if (result.exceptionDetails) {
  console.error('EVAL FAIL:', result.exceptionDetails.exception?.description?.slice(0, 400))
  proc.kill(); process.exit(1)
}
const r = result.result.value

// Write model files to public/gesture-model/
const outDir = 'C:/hackathon/frontend/public/gesture-model'
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'model.json'), r.modelJson)
writeFileSync(join(outDir, 'weights.bin'), Buffer.from(r.weightB64, 'base64'))
const sizeKB = Math.round((r.modelJson.length + r.weightB64.length * 0.75) / 1024)

console.log(JSON.stringify({
  trainMs: r.trainMs,
  epochsRun: r.metrics.epochsRun,
  accuracy: +(r.metrics.accuracy * 100).toFixed(1) + '%',
  valAccuracy: +(r.metrics.valAccuracy * 100).toFixed(1) + '%',
  modelSizeKB: sizeKB,
}, null, 1))

proc.kill()
await sleep(200)
try { rmSync(dir, { recursive: true, force: true }) } catch {}
