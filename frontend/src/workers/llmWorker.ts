/**
 * WebLLM worker — keeps on-device inference off the UI thread (Phase 2).
 * The library itself is loaded from a CDN at runtime (never bundled), then
 * cached by the service worker, so it keeps working offline after first use.
 */

type Handler = { onmessage: (msg: MessageEvent) => void }
let handler: Handler | null = null

self.onmessage = async (msg: MessageEvent) => {
  try {
    if (!handler) {
      const WEBLLM_URL = "https://esm.sh/@mlc-ai/web-llm@0.2.79"
      const webllm = await import(/* @vite-ignore */ WEBLLM_URL)
      handler = new webllm.WebWorkerMLCEngineHandler() as Handler
    }
    handler.onmessage(msg)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({
      kind: "error",
      message: err instanceof Error ? err.message : "llm worker init failed",
    })
  }
}
