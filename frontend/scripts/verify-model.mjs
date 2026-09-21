/* Verify deployed-model auto-load: /sign must log "model loaded successfully" and show AI badge. */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p))
if (!exe) { console.error('Chrome not found'); process.exit(1) }
const dir = mkdtempSync(join(tmpdir(), 'modelverify-'))
const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] })
let stderr = ''
proc.stderr.on('data', (d) => { stderr += d })
await sleep(1200)
const wsUrl = stderr.match(/ws:\/\/[^\s]+/)[0]
const WebSocket = (await import('ws')).default
const ws = new WebSocket(wsUrl)
let id = 0
const pend = new Map()
const consoleLogs = []
ws.on('message', (d) => {
  const m = JSON.parse(d.toString())
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) }
  else if (m.method === 'Runtime.consoleAPICalled') {
    consoleLogs.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
  }
})
await new Promise((r) => ws.on('open', r))
let sessionIdG = null
const send = (method, params = {}, sid) => new Promise((res) => {
  const i = ++id
  pend.set(i, res)
  const s = sid ?? sessionIdG
  ws.send(JSON.stringify(s ? { id: i, method, params, sessionId: s } : { id: i, method, params }))
})

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true })
sessionIdG = S
await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: BASE + '/sign' })
await sleep(9000) // model.json + weights fetch + TF lazy chunk

const probe = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const text = document.body.innerText
    return {
      aiBadge: /AI: \\d+%/.test(text),
      heuristicBadge: text.includes('Heuristic'),
      trainBtn: text.includes('Train'),
    }
  })()`,
})

const loaded = consoleLogs.some((l) => l.includes('model loaded successfully'))
const failed = consoleLogs.filter((l) => l.includes('[gestureClassifier]'))
console.log('console logs from page:')
for (const l of failed) console.log('  ', l.slice(0, 140))
console.log('model_loaded_log:', loaded ? 'PASS' : 'FAIL')
console.log('dom_probe:', JSON.stringify(probe.result?.value))
console.log(loaded && probe.result?.value?.aiBadge ? '✅ MODEL AUTO-LOAD VERIFIED' : '❌ VERIFICATION FAILED')

proc.kill()
await sleep(200)
try { rmSync(dir, { recursive: true, force: true }) } catch {}
process.exit(loaded && probe.result?.value?.aiBadge ? 0 : 1)
