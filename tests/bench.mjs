// Bench de performance : `pnpm bench`. Lance le playground, mesure dans Chrome via CDP.
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const server = await createServer({ configFile: 'vite.playground.config.ts', logLevel: 'silent' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome' })

const run = async (label, setup, action) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.goto('http://localhost:5173/bench.html')
  await page.waitForFunction(() => window.ready)
  const metrics = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics')
    const get = (name) => metrics.find((m) => m.name === name).value * 1000
    return { script: get('ScriptDuration'), layout: get('LayoutDuration') }
  }
  await setup(page)
  await page.evaluate(() => {
    window.__long.length = 0
  })
  const before = await metrics()
  await action(page)
  await page.waitForTimeout(300)
  const after = await metrics()
  const long = await page.evaluate(() => window.__long)
  const script = (after.script - before.script).toFixed(0)
  const layout = (after.layout - before.layout).toFixed(0)
  console.log(
    `${label.padEnd(50)} script ${script.padStart(5)} ms · layout ${layout.padStart(5)} ms · tâches longues ${long.length} (max ${Math.max(0, ...long)} ms)`,
  )
  await page.close()
}

const scrollThrough = (page) =>
  page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    }
    await new Promise((r) => setTimeout(r, 800))
  })

const linesWithGsap = (page) =>
  page.evaluate(() => {
    inview.use(SplitText)
    makeParagraphs(200, 's', 60)
    inview.on('s', { split: { type: 'lines' } }, ({ lines }) =>
      gsap.fromTo(lines, { yPercent: 100 }, { yPercent: 0, duration: 0.2 }),
    )
  })

const linesNoReturn = (page) =>
  page.evaluate(() => {
    inview.use(SplitText)
    makeParagraphs(200, 's', 60)
    inview.on('s', { split: { type: 'lines' } }, ({ el }) => {
      el.classList.add('is-in')
    })
  })

await run(
  'on() sur 2000 éléments',
  (page) => page.evaluate(() => makeParagraphs(2000, 'p', 12)),
  (page) =>
    page.evaluate(async () => {
      inview.on('p', () => {})
      await new Promise((r) => setTimeout(r, 300))
    }),
)

await run(
  'saut de scroll au milieu, 200 § lines',
  async (page) => {
    await linesWithGsap(page)
    await page.waitForTimeout(400)
  },
  (page) =>
    page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight / 2)
      await new Promise((r) => setTimeout(r, 600))
    }),
)

await run('scroll complet, 200 § lines + GSAP', linesWithGsap, scrollThrough)

for (const [label, setup] of [
  ['resize, 200 § lines + GSAP (split annulé)', linesWithGsap],
  ['resize, 200 § lines sans retour (split conservé)', linesNoReturn],
]) {
  await run(
    label,
    async (page) => {
      await setup(page)
      await scrollThrough(page)
    },
    async (page) => {
      await page.setViewportSize({ width: 900, height: 800 })
      await page.waitForTimeout(900)
    },
  )
}

await run(
  'bruit DOM : 50 nœuds par frame pendant 2 s',
  (page) => page.evaluate(() => inview.on('x', () => {})),
  (page) =>
    page.evaluate(async () => {
      const box = document.createElement('div')
      document.body.append(box)
      const end = performance.now() + 2000
      while (performance.now() < end) {
        box.replaceChildren(...Array.from({ length: 50 }, () => document.createElement('span')))
        await new Promise((r) => requestAnimationFrame(r))
      }
    }),
)

await browser.close()
await server.close()
