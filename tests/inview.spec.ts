import { expect, type Page, test } from '@playwright/test'

const logs = (page: Page) => page.evaluate(() => window.__log)
const count = async (page: Page, message: string) =>
  (await logs(page)).filter((m) => m.startsWith(message)).length

/** Scrolle pour que le haut de `selector` soit à `percent` % au-dessus du bas de l'écran. */
const placeTop = (page: Page, selector: string, percent: number) =>
  page.evaluate(
    ([sel, pct]) => {
      const el = document.querySelector(sel as string) as HTMLElement
      const vh = document.documentElement.clientHeight
      const top = el.getBoundingClientRect().top + window.scrollY
      window.scrollTo(0, top - vh * (1 - (pct as number) / 100))
    },
    [selector, percent],
  )

test.describe('basic', () => {
  test('déclenche un élément visible au chargement, pas les autres', async ({ page }) => {
    await page.goto('/basic.html')
    await expect.poll(() => count(page, 'trigger visible')).toBe(1)
    expect(await count(page, 'trigger start0')).toBe(0)
    await expect(page.locator('#visible')).toHaveAttribute('data-inview-state', 'triggered')
    await expect(page.locator('#start0')).not.toHaveAttribute('data-inview-state', /.*/)
  })

  test('respecte start 0 et start 30 %', async ({ page }) => {
    await page.goto('/basic.html')
    await placeTop(page, '#start30', 15)
    await expect.poll(() => count(page, 'trigger start30')).toBe(0)
    await page.waitForTimeout(200)
    expect(await count(page, 'trigger start30')).toBe(0)
    await placeTop(page, '#start30', 35)
    await expect.poll(() => count(page, 'trigger start30')).toBe(1)
  })

  test('start négatif déclenche avant l’entrée dans l’écran', async ({ page }) => {
    await page.goto('/basic.html')
    await placeTop(page, '#startNeg', -10)
    await expect.poll(() => count(page, 'trigger startNeg')).toBe(1)
  })

  test('déclenche les éléments déjà dépassés (scroll restauré), ignore ceux sans callback', async ({
    page,
  }) => {
    await page.goto('/basic.html?bottom')
    for (const id of ['visible', 'start0', 'start30', 'startNeg']) {
      await expect.poll(() => count(page, `trigger ${id}`)).toBe(1)
    }
    expect(await count(page, 'trigger orphan')).toBe(0)
    await expect(page.locator('#orphan')).not.toHaveAttribute('data-inview-state', /.*/)
  })
})

test('replay : redéclenche en remontant puis redescendant, une seule fois sinon', async ({
  page,
}) => {
  await page.goto('/replay.html')
  await placeTop(page, '#once', 50)
  await expect.poll(() => count(page, 'trigger replay')).toBe(1)
  await expect.poll(() => count(page, 'trigger once')).toBe(1)

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(150)
  await placeTop(page, '#once', 50)
  await expect.poll(() => count(page, 'trigger replay')).toBe(2)
  await page.waitForTimeout(150)
  expect(await count(page, 'trigger once')).toBe(1)
})

test.describe('dynamic', () => {
  test('suit le contenu injecté et oublie le contenu retiré', async ({ page }) => {
    await page.goto('/dynamic.html')
    await page.click('#add')
    await expect.poll(() => count(page, 'trigger card')).toBe(3)
    const tracked = () =>
      page.evaluate(
        () =>
          (window as unknown as { inview: { elements: Map<unknown, unknown> } }).inview.elements
            .size,
      )
    // Déclenchés sans replay ni split : libérés aussitôt.
    await expect.poll(tracked).toBe(0)
    // Un élément pas encore déclenché est suivi, puis oublié quand il est retiré.
    await page.evaluate(() => {
      const far = document.createElement('div')
      far.dataset.inview = 'card'
      far.id = 'far'
      far.style.marginTop = '300vh'
      document.querySelector('#list')?.append(far)
    })
    await expect.poll(tracked).toBe(1)
    await page.click('#clear')
    await expect.poll(tracked).toBe(0)
  })

  test('on() appelé après l’insertion de l’élément le prend en compte', async ({ page }) => {
    await page.goto('/dynamic.html')
    await page.waitForTimeout(200)
    expect(await count(page, 'trigger late-el')).toBe(0)
    await page.click('#late')
    await expect.poll(() => count(page, 'trigger late-el')).toBe(1)
  })
})

test.describe('split', () => {
  test('découpe, anime, puis resynchronise après un resize', async ({ page }) => {
    await page.goto('/split.html')
    // Découpage anticipé : l'élément est découpé alors qu'il est encore sous l'écran.
    await placeTop(page, '#title', -50)
    await expect.poll(() => page.locator('#title > div').count()).toBeGreaterThan(0)
    expect(await count(page, 'trigger title')).toBe(0)

    await placeTop(page, '#title', 50)
    await expect.poll(() => count(page, 'trigger title')).toBe(1)

    // Resize pendant l'animation : le callback GSAP est rappelé avec les nouvelles lignes.
    await page.setViewportSize({ width: 600, height: 800 })
    await expect.poll(() => count(page, 'trigger title'), { timeout: 3000 }).toBe(2)
    // Les lignes correspondent au nouveau layout : aucune ligne ne revient à la ligne à l'intérieur.
    const heights = await page.$$eval('#title > div', (els) => {
      const lineHeight = Number.parseFloat(
        getComputedStyle(els[0]?.parentElement as Element).lineHeight,
      )
      return els.map((el) => el.getBoundingClientRect().height / lineHeight)
    })
    for (const h of heights) expect(h).toBeLessThan(1.5)

    // À la fin de l'animation, le split est annulé : texte d'origine, rendu identique.
    const text = await page
      .locator('#title')
      .evaluate((el) => el.textContent?.replace(/\s+/g, ' ').trim())
    await expect.poll(() => page.locator('#title div').count(), { timeout: 4000 }).toBe(0)
    expect(
      await page.locator('#title').evaluate((el) => el.textContent?.replace(/\s+/g, ' ').trim()),
    ).toBe(text)
    expect(await page.locator('#title').getAttribute('aria-label')).toBeNull()
  })

  test('avec replay, le split est conservé après l’animation', async ({ page }) => {
    await page.goto('/split.html')
    await placeTop(page, '#again', 50)
    await expect.poll(() => count(page, 'trigger again')).toBe(1)
    await page.waitForTimeout(1200)
    expect(await page.locator('#again > div').count()).toBeGreaterThan(0)
  })

  test('sans animation renvoyée : pas de rappel au resize, mots dans leur état final', async ({
    page,
  }) => {
    await page.goto('/split.html')
    await placeTop(page, '#css', 50)
    await expect.poll(() => count(page, 'trigger css')).toBe(1)
    await page.waitForTimeout(1500)
    await page.setViewportSize({ width: 600, height: 800 })
    await page.waitForTimeout(800)
    expect(await count(page, 'trigger css')).toBe(1)
    const opacities = await page.$$eval('#css .word', (els) =>
      els.map((el) => getComputedStyle(el).opacity),
    )
    expect(opacities.length).toBeGreaterThan(0)
    for (const o of opacities) expect(o).toBe('1')
  })
})

test.describe('lines', () => {
  type Priv = { inview: { elements: Map<HTMLElement, { dirty: boolean; split?: unknown }> } }
  const dirtyOf = (page: Page, id: string) =>
    page.evaluate(
      (id) =>
        (window as unknown as Priv).inview.elements.get(document.getElementById(id) as HTMLElement)
          ?.dirty,
      id,
    )
  const scrollThrough = (page: Page) =>
    page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y)
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      }
      window.scrollTo(0, 0)
      await new Promise((r) => setTimeout(r, 300))
    })

  test('au resize, ne redécoupe que près de l’écran, le reste quand il revient', async ({
    page,
  }) => {
    await page.goto('/lines.html')
    await scrollThrough(page)
    await expect.poll(() => count(page, 'trigger p-39')).toBe(1)
    await page.setViewportSize({ width: 700, height: 800 })
    await expect.poll(() => dirtyOf(page, 'p-0')).toBe(false)
    await page.waitForTimeout(400)
    expect(await dirtyOf(page, 'p-39')).toBe(true)
    await placeTop(page, '#p-39', 50)
    await expect.poll(() => dirtyOf(page, 'p-39')).toBe(false)
  })

  test('après off(), les lignes restent justes au resize', async ({ page }) => {
    await page.goto('/lines.html')
    await expect.poll(() => count(page, 'trigger p-0')).toBe(1)
    await page.evaluate(() => (window as unknown as { off: () => void }).off())
    await page.setViewportSize({ width: 700, height: 800 })
    await page.waitForTimeout(500)
    expect(await dirtyOf(page, 'p-0')).toBe(false)
    const heights = await page.$$eval('#p-0 > div', (els) => {
      const lh = Number.parseFloat(getComputedStyle(els[0]?.parentElement as Element).lineHeight)
      return els.map((el) => el.getBoundingClientRect().height / lh)
    })
    expect(heights.length).toBeGreaterThan(0)
    for (const h of heights) expect(h).toBeLessThan(1.5)
  })
})

test('un élément retiré puis réinséré ne se redéclenche pas', async ({ page }) => {
  await page.goto('/dynamic.html')
  await page.click('#add')
  await expect.poll(() => count(page, 'trigger card-1')).toBe(1)
  await page.evaluate(async () => {
    const card = document.getElementById('card-1') as HTMLElement
    const parent = card.parentElement as HTMLElement
    card.remove()
    await new Promise((r) => setTimeout(r, 100))
    parent.prepend(card)
  })
  await page.waitForTimeout(300)
  expect(await count(page, 'trigger card-1')).toBe(1)
})

test.describe('replay sans boucle', () => {
  test('rester sur la ligne ne redéclenche pas en boucle (élément animé en y)', async ({
    page,
  }) => {
    await page.goto('/replay.html')
    await placeTop(page, '#replay', 21)
    await expect.poll(() => count(page, 'trigger replay')).toBe(1)
    await page.waitForTimeout(1500)
    expect(await count(page, 'trigger replay')).toBe(1)
  })

  test('split + replay : rejoue en remontant, garde le split, sans boucle', async ({ page }) => {
    await page.goto('/split.html')
    await placeTop(page, '#again', 21)
    await expect.poll(() => count(page, 'trigger again')).toBe(1)
    await page.waitForTimeout(1500)
    expect(await count(page, 'trigger again')).toBe(1)

    // Remonter sans faire sortir l'élément de l'écran ne réarme pas.
    await placeTop(page, '#again', 5)
    await page.waitForTimeout(300)
    await placeTop(page, '#again', 50)
    await page.waitForTimeout(300)
    expect(await count(page, 'trigger again')).toBe(1)

    // Sorti par le bas : réarmé et remis à l'état de départ de l'animation.
    await placeTop(page, '#again', -10)
    await expect(page.locator('#again')).toHaveAttribute('data-inview-state', 'reset')
    const opacities = await page.$$eval('#again > div', (els) =>
      els.map((el) => getComputedStyle(el).opacity),
    )
    for (const o of opacities) expect(o).toBe('0')
    await placeTop(page, '#again', 50)
    await expect.poll(() => count(page, 'trigger again')).toBe(2)
    await page.waitForTimeout(1500)
    expect(await page.locator('#again > div').count()).toBeGreaterThan(0)
  })
})

test('vue : inview.on dans un composant vise ses éléments, même nom réutilisable, retiré au démontage', async ({
  page,
}) => {
  type Priv = { inview: { registry: Map<string, unknown[]> } }
  const regs = () =>
    page.evaluate(() => (window as unknown as Priv).inview.registry.get('title')?.length ?? 0)
  const ids = ['a', 'b', 'c', 'hero']
  await page.goto('/vue.html')
  for (const id of ids) await expect.poll(() => count(page, `trigger ${id}`)).toBe(1)
  await page.waitForTimeout(300)
  for (const id of ids) expect(await count(page, `trigger ${id}`)).toBe(1)
  expect(await regs()).toBe(4)

  await page.click('#toggle')
  await expect.poll(regs).toBe(0)
  await page.click('#toggle')
  for (const id of ids) await expect.poll(() => count(page, `trigger ${id}`)).toBe(2)
})

test('replay : remis à l’état de départ une fois sorti de l’écran, pas avant', async ({ page }) => {
  await page.goto('/replay.html')
  await placeTop(page, '#replay', 50)
  await expect.poll(() => count(page, 'trigger replay')).toBe(1)
  await page.waitForTimeout(900)
  const opacity = () => page.locator('#replay').evaluate((el) => getComputedStyle(el).opacity)

  await placeTop(page, '#replay', 5)
  await page.waitForTimeout(300)
  expect(await opacity()).toBe('1')

  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(page.locator('#replay')).toHaveAttribute('data-inview-state', 'reset')
  expect(await opacity()).toBe('0')

  await placeTop(page, '#replay', 50)
  await expect.poll(() => count(page, 'trigger replay')).toBe(2)
})
