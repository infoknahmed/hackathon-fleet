/* Headless smoke check for VaakSetu final build (Node 24, no deps). */
const BASE = process.env.BASE_URL || "http://localhost:4173"

function fail(msg) {
  console.error("FAIL:", msg)
  process.exitCode = 1
}

async function main() {
  // 1) index.html served
  const indexRes = await fetch(`${BASE}/`)
  const html = await indexRes.text()
  if (!indexRes.ok) fail(`index.html status ${indexRes.status}`)
  if (!html.includes('id="root"')) fail("index.html missing #root mount")
  if (!html.includes("registerSW") && !html.includes("manifest.webmanifest")) {
    fail("index.html does not reference PWA assets")
  }
  console.log("PASS: app shell served,", html.length, "bytes")

  // 2) web app manifest
  const manifestRes = await fetch(`${BASE}/manifest.webmanifest`)
  const manifest = JSON.parse(await manifestRes.text())
  if (manifest.name !== "VaakSetu — Bridge of Voice") fail("manifest name mismatch")
  if (manifest.theme_color !== "#0A1929") fail("manifest theme_color mismatch")
  if (manifest.display !== "standalone") fail("manifest display mismatch")
  if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) fail("manifest icons missing")
  console.log("PASS: manifest OK —", manifest.name)

  // 3) service worker + register script
  const swRes = await fetch(`${BASE}/sw.js`)
  const sw = await swRes.text()
  if (!swRes.ok || !sw.includes("workbox")) fail("sw.js missing or invalid")
  console.log("PASS: sw.js served,", sw.length, "bytes")

  const regRes = await fetch(`${BASE}/registerSW.js`)
  if (!regRes.ok) fail("registerSW.js missing")
  console.log("PASS: registerSW.js served")

  // 4) PWA icons
  for (const icon of ["/icon-192.svg", "/icon-512.svg"]) {
    const r = await fetch(`${BASE}${icon}`)
    if (!r.ok) fail(`icon ${icon} status ${r.status}`)
  }
  console.log("PASS: icon-192.svg + icon-512.svg served")  // 5) every precached asset resolves (offline load will work)
  const precacheMatch = sw.matchAll(/\{url:"([^"]+)"/g)
  const urls = [...new Set([...precacheMatch].map((m) => `/${m[1].replace(/^\//, "")}`))]
  if (urls.length === 0) fail("no precache entries found in sw.js")
  if (urls.length < 5) fail(`only ${urls.length} precache entries — precache looks incomplete`)
  for (const url of urls) {
    const r = await fetch(`${BASE}${url}`)
    if (!r.ok) fail(`precached asset ${url} status ${r.status}`)
  }
  console.log(`PASS: ${urls.length}/${urls.length} precached assets reachable`)

  // 6) SPA fallback for client-side routes
  for (const route of ["/sign", "/conversation", "/guardian", "/admin", "/user"]) {
    const r = await fetch(`${BASE}${route}`)
    if (!r.ok) fail(`route ${route} status ${r.status}`)
  }
  console.log("PASS: SPA routes (/sign, /conversation, /guardian, /admin, /user) resolve")

  if (!process.exitCode) console.log("\nALL SMOKE CHECKS PASSED ✅")
}

main().catch((e) => {
  fail(e.message)
  process.exit(1)
})
