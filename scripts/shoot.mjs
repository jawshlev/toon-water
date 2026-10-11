// Usage: node scripts/shoot.mjs <out.png> "<query>" [<out2.png> "<query2>" ...]
// Renders the dev server (https://localhost:$PORT, default 5173; self-signed cert) at 1440x1080 to match the cropped reference.
import { chromium } from 'playwright'

const pairs = process.argv.slice(2)
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=d3d11', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, ignoreHTTPSErrors: true })
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text().slice(0, 400)) })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
for (let i = 0; i < pairs.length; i += 2) {
  await page.goto(`https://localhost:${process.env.PORT ?? 5173}/?ui=0&${pairs[i + 1] ?? ''}`)
  await page.waitForSelector('canvas')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: pairs[i] })
  console.log('saved', pairs[i])
}
const backend = await page.evaluate(() => ('gpu' in navigator ? 'webgpu-api-present' : 'no-webgpu'))
console.log('navigator:', backend)
await browser.close()
