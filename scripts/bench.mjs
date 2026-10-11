// Usage: node scripts/bench.mjs [frames=300] [query]   (env: DPR=2, WARMUP=3000 ms)
// Rough GPU cost: GPU-synced frame time of the live (animating) page at 1440x1080 x DPR
// (R3F caps DPR at 2). Reading one pixel back each frame makes the frame wait for the GPU.
import { chromium } from 'playwright'

const frames = Number(process.argv[2] ?? 300)
const query = process.argv[3] ?? ''
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: Number(process.env.DPR ?? 2), ignoreHTTPSErrors: true })
await page.goto(`https://localhost:${process.env.PORT ?? 5173}/?ui=0&${query}`)
await page.waitForSelector('canvas')
await page.waitForTimeout(Number(process.env.WARMUP ?? 3000)) // shader compile + warm-up
const r = await page.evaluate(
  (n) =>
    new Promise((resolve) => {
      const SKIP = 10 // the first syncs drain frames queued during warm-up
      const gl = document.querySelector('canvas').getContext('webgl2')
      const px = new Uint8Array(4)
      const times = []
      let count = 0
      let last = performance.now()
      const tick = () => {
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        const now = performance.now()
        if (count++ >= SKIP) times.push(now - last)
        last = now
        if (times.length < n) return requestAnimationFrame(tick)
        times.sort((a, b) => a - b)
        resolve({ mean: times.reduce((a, b) => a + b, 0) / n, median: times[n >> 1], p95: times[Math.floor(n * 0.95)], max: times[n - 1] })
      }
      requestAnimationFrame(tick)
    }),
  frames,
)
console.log(`frames=${frames} mean=${r.mean.toFixed(2)}ms median=${r.median.toFixed(2)}ms p95=${r.p95.toFixed(1)}ms max=${r.max.toFixed(0)}ms`)
await browser.close()
