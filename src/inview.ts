import { SplitText } from 'gsap/SplitText'
import type {
  InviewCallback,
  InviewItem,
  InviewOptions,
  SplitOptions,
  SplitTextInstance,
  SplitTextLike,
  StartValue,
} from './types'

const ATTR = 'data-inview'
const STATE_ATTR = 'data-inview-state'
const SELECTOR = `[${ATTR}]`
/** Zone « proche de l'écran » : l'écran plus un écran en dessous. On y découpe à l'avance et on y redécoupe. */
const NEAR_MARGIN = '0px 0px 100% 0px'
/** Budget de découpage par frame, pour étaler les gros lots (saut de scroll). */
const FRAME_BUDGET_MS = 6
/** Attente après la fin d'un resize avant de redécouper. */
const RESIZE_DEBOUNCE_MS = 150

interface Registration {
  name: string
  start: number
  replay: boolean
  split: SplitOptions | undefined
  splitKey: string
  scope: Element | undefined
  cb: InviewCallback
}

interface GsapAnimation {
  totalTime(): number
  totalTime(value: number): unknown
  kill(): unknown
  revert(): unknown
  pause(atTime?: number): unknown
}

interface RegState {
  triggered: boolean
  /** Le dernier retour du callback (animation ou promesse) est terminé. */
  finished: boolean
  anim: GsapAnimation | undefined
  /** Invalide les fins d'animation obsolètes (replay, redécoupage). */
  token: number
  /** Position de scroll au déclenchement : replay ne réarme que si l'on est remonté au-dessus. */
  scrollY: number
}

interface ElementState {
  el: HTMLElement
  name: string
  regs: Map<Registration, RegState>
  split: SplitTextInstance | undefined
  config: SplitOptions | undefined
  hasLines: boolean
  splitCount: number
  fragments: Omit<InviewItem, 'el'>
  /** Largeur connue (ResizeObserver), pour ne redécouper que si elle change. */
  width: number | undefined
  /** Les lignes ne correspondent plus au layout (resize, police chargée). */
  dirty: boolean
  /** Dans la zone NEAR_MARGIN. */
  near: boolean
  /** Découpé avant le chargement des polices. */
  splitBeforeFonts: boolean
  /** Redécoupage technique sans rappel des callbacks. */
  silent: boolean
}

const isBrowser = (): boolean =>
  typeof window !== 'undefined' &&
  typeof IntersectionObserver !== 'undefined' &&
  typeof MutationObserver !== 'undefined'

const isGsapAnimation = (value: unknown): value is GsapAnimation => {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.totalTime === 'function' &&
    typeof v.kill === 'function' &&
    typeof v.revert === 'function' &&
    typeof v.pause === 'function'
  )
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  !!value &&
  (typeof value === 'object' || typeof value === 'function') &&
  typeof (value as { then?: unknown }).then === 'function'

const parseStart = (value: StartValue | undefined): number => {
  if (value === undefined) return 0
  const n = typeof value === 'number' ? value : Number.parseFloat(value)
  if (!Number.isFinite(n)) throw new Error(`[inview] start invalide : "${String(value)}"`)
  return n
}

/** Clé stable d'une config de split, pour détecter deux configs contradictoires sur un même nom. */
const splitKeyOf = (split: SplitOptions | undefined): string => {
  if (!split) return ''
  const sorted = Object.keys(split)
    .sort()
    .map((k) => [k, split[k as keyof SplitOptions]])
  return JSON.stringify(sorted)
}

const emptyFragments = (): Omit<InviewItem, 'el'> => ({
  lines: [],
  words: [],
  chars: [],
  masks: [],
})

const fragmentsOf = (split: SplitTextInstance): Omit<InviewItem, 'el'> => ({
  lines: [...split.lines] as HTMLElement[],
  words: [...split.words] as HTMLElement[],
  chars: [...split.chars] as HTMLElement[],
  masks: [...split.masks] as HTMLElement[],
})

const inScope = (reg: Registration, el: Element): boolean => !reg.scope || reg.scope.contains(el)

/** Marge de détection de sortie : l'écran, prolongé jusqu'à la ligne si elle est sous l'écran. */
const resetMarginOf = (reg: Registration): number => Math.max(0, -reg.start)

const scopesOverlap = (a: Registration, b: Registration): boolean =>
  !a.scope || !b.scope || a.scope.contains(b.scope) || b.scope.contains(a.scope)

const nameOf = (el: Element): string => el.getAttribute(ATTR)?.trim() ?? ''

const fontsLoading = (): boolean =>
  typeof document !== 'undefined' && !!document.fonts && document.fonts.status !== 'loaded'

const isIdentityTransform = (value: string): boolean => {
  if (value === 'none') return true
  const match = value.match(/^matrix(3d)?\((.+)\)$/)
  if (!match?.[2]) return false
  const n = match[2].split(',').map(Number)
  const identity = match[1] ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] : [1, 0, 0, 1, 0, 0]
  return n.length === identity.length && n.every((v, i) => Math.abs(v - (identity[i] ?? 0)) < 1e-6)
}

/** Vrai si les fragments sont visuellement à leur état naturel : annuler le split ne changera rien. */
const isNeutral = (split: SplitTextInstance): boolean => {
  const fragments = [...split.lines, ...split.words, ...split.chars]
  for (const el of fragments) {
    const s = getComputedStyle(el)
    if (
      s.opacity !== '1' ||
      s.visibility !== 'visible' ||
      !isIdentityTransform(s.transform) ||
      s.filter !== 'none' ||
      s.clipPath !== 'none'
    ) {
      return false
    }
  }
  for (const el of split.masks) {
    const s = getComputedStyle(el)
    if (s.opacity !== '1' || !isIdentityTransform(s.transform)) return false
  }
  return true
}

export class Inview {
  /** SplitText est importé par la lib : `gsap` est une peer dependency. */
  private readonly splitter = SplitText as unknown as SplitTextLike
  private readonly registry = new Map<string, Registration[]>()
  private readonly elements = new Map<HTMLElement, ElementState>()
  private readonly triggerObservers = new Map<number, IntersectionObserver>()
  /** Détection de la sortie par le bas (replay), par marge basse en %. */
  private readonly resetObservers = new Map<number, IntersectionObserver>()
  private nearObserver: IntersectionObserver | undefined
  private resizeObserver: ResizeObserver | undefined
  private mutationObserver: MutationObserver | undefined
  /** Instances SplitText par élément : retrouvées si l'élément est retiré puis réinséré. */
  private splits = new WeakMap<HTMLElement, SplitTextInstance>()
  /** Enregistrements déjà joués par élément : pas de redéclenchement après une réinsertion (KeepAlive…). */
  private played = new WeakMap<HTMLElement, WeakSet<Registration>>()
  private readonly queue = new Set<ElementState>()
  private queueFrame = 0
  private resizeTimer: ReturnType<typeof setTimeout> | undefined
  private fontsBound = false
  private readonly onFontsLoaded = () => {
    this.markLinesDirty(false)
    // Les découpages anticipés mis en attente pendant le chargement peuvent reprendre.
    this.scheduleQueue()
  }

  /**
   * Associe un callback aux éléments `[data-inview="name"]`, présents et futurs.
   * Renvoie une fonction qui retire cet enregistrement.
   */
  on(name: string, cb: InviewCallback): () => void
  on(name: string, options: InviewOptions, cb: InviewCallback): () => void
  on(
    name: string,
    optionsOrCb: InviewOptions | InviewCallback,
    maybeCb?: InviewCallback,
  ): () => void {
    const options = typeof optionsOrCb === 'function' ? {} : optionsOrCb
    const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb
    if (typeof cb !== 'function') throw new Error(`[inview] callback manquant pour "${name}"`)

    const reg: Registration = {
      name,
      start: parseStart(options.start),
      replay: options.replay ?? false,
      split: options.split,
      splitKey: splitKeyOf(options.split),
      scope: options.scope ?? undefined,
      cb,
    }

    // Côté serveur (SSR) : rien n'est enregistré, l'instance est partagée entre les requêtes.
    if (!isBrowser()) return () => {}

    const existing = this.registry.get(name) ?? []
    // Deux configs de split différentes ne posent problème que si elles visent les mêmes éléments.
    if (existing.some((r) => r.splitKey !== reg.splitKey && scopesOverlap(r, reg))) {
      throw new Error(
        `[inview] "${name}" a déjà une config de split différente sur les mêmes éléments. Un élément ne peut être découpé qu'une fois : utilise la même config de split, ou un autre nom.`,
      )
    }
    existing.push(reg)
    this.registry.set(name, existing)

    this.startMutationObserver()
    for (const state of this.elements.values()) {
      if (state.name === name && inScope(reg, state.el)) this.attachRegistration(state, reg)
    }
    const selector = `[${ATTR}="${CSS.escape(name)}"]`
    const root = reg.scope ?? document
    const found = [...root.querySelectorAll<HTMLElement>(selector)]
    if (reg.scope instanceof HTMLElement && reg.scope.matches(selector)) found.unshift(reg.scope)
    for (const el of found) {
      if (!this.elements.has(el)) this.track(el)
    }

    return () => this.removeRegistration(reg)
  }

  /** Rescanne le DOM : suit les nouveaux éléments, oublie ceux retirés. Normalement inutile (MutationObserver). */
  refresh(): void {
    if (!isBrowser()) return
    if (this.mutationObserver) this.processRecords(this.mutationObserver.takeRecords())
    for (const el of [...this.elements.keys()]) {
      if (!el.isConnected) this.untrack(el)
    }
    for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
      if (!this.elements.has(el)) this.track(el)
    }
  }

  /**
   * Sans argument : arrête tout et nettoie. Avec un nom : retire tous les enregistrements de ce nom.
   * Les éléments encore dans la page restent dans leur état actuel.
   */
  destroy(name?: string): void {
    if (name !== undefined) {
      for (const reg of [...(this.registry.get(name) ?? [])]) this.removeRegistration(reg)
      return
    }
    for (const el of [...this.elements.keys()]) this.untrack(el)
    for (const io of this.triggerObservers.values()) io.disconnect()
    this.triggerObservers.clear()
    for (const io of this.resetObservers.values()) io.disconnect()
    this.resetObservers.clear()
    this.nearObserver?.disconnect()
    this.nearObserver = undefined
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.mutationObserver?.disconnect()
    this.mutationObserver = undefined
    cancelAnimationFrame(this.queueFrame)
    this.queueFrame = 0
    this.queue.clear()
    clearTimeout(this.resizeTimer)
    if (this.fontsBound) document.fonts.removeEventListener('loadingdone', this.onFontsLoaded)
    this.fontsBound = false
    this.splits = new WeakMap()
    this.played = new WeakMap()
    this.registry.clear()
  }

  // ─── Enregistrements ────────────────────────────────────────────────

  private attachRegistration(state: ElementState, reg: Registration): void {
    if (state.regs.has(reg)) return
    const alreadyPlayed = !reg.replay && !!this.played.get(state.el)?.has(reg)
    state.regs.set(reg, {
      triggered: alreadyPlayed,
      finished: alreadyPlayed,
      anim: undefined,
      token: 0,
      scrollY: 0,
    })
    if (alreadyPlayed) return
    this.getTriggerObserver(reg.start).observe(state.el)
    if (reg.replay) this.getResetObserver(resetMarginOf(reg)).observe(state.el)
    if (reg.split && !state.config) {
      state.config = reg.split
      state.hasLines = reg.split.type.includes('lines')
    }
    if (reg.split) this.getNearObserver().observe(state.el)
  }

  private removeRegistration(reg: Registration): void {
    const regs = this.registry.get(reg.name)
    if (!regs) return
    const index = regs.indexOf(reg)
    if (index === -1) return
    regs.splice(index, 1)
    if (regs.length === 0) this.registry.delete(reg.name)

    for (const state of [...this.elements.values()]) {
      const rs = state.regs.get(reg)
      if (!rs) continue
      rs.token++
      state.regs.delete(reg)
      if (!this.needsObserver(state, reg.start)) {
        this.triggerObservers.get(reg.start)?.unobserve(state.el)
      }
      // Un élément découpé en lignes reste suivi : ses lignes doivent rester justes au resize.
      if (state.regs.size === 0 && !(state.split && state.hasLines)) this.untrack(state.el)
    }
  }

  // ─── Suivi des éléments ─────────────────────────────────────────────

  private track(el: HTMLElement): void {
    const name = nameOf(el)
    const regs = this.registry.get(name)?.filter((reg) => inScope(reg, el))
    // Un élément sans callback enregistré n'est pas observé.
    if (!regs || regs.length === 0 || this.elements.has(el)) return
    const split = this.splits.get(el)
    const config = regs.find((r) => r.split)?.split
    const state: ElementState = {
      el,
      name,
      regs: new Map(),
      split,
      config,
      hasLines: !!config?.type.includes('lines'),
      splitCount: split ? 1 : 0,
      fragments: split ? fragmentsOf(split) : emptyFragments(),
      width: undefined,
      dirty: false,
      near: false,
      splitBeforeFonts: false,
      silent: false,
    }
    this.elements.set(el, state)
    for (const reg of regs) this.attachRegistration(state, reg)
    if (split && state.hasLines) {
      // Réinséré déjà découpé : la largeur a pu changer pendant son absence.
      state.dirty = true
      this.getResizeObserver().observe(el)
      this.getNearObserver().observe(el)
    }
    this.maybeRelease(state)
  }

  private untrack(el: HTMLElement): void {
    const state = this.elements.get(el)
    if (!state) return
    for (const io of this.triggerObservers.values()) io.unobserve(el)
    for (const io of this.resetObservers.values()) io.unobserve(el)
    this.nearObserver?.unobserve(el)
    this.resizeObserver?.unobserve(el)
    this.queue.delete(state)
    for (const rs of state.regs.values()) {
      rs.token++
      // Élément retiré de la page : on stoppe ses animations.
      if (!el.isConnected) rs.anim?.kill()
    }
    this.elements.delete(el)
  }

  /** Libère un élément qui n'a plus rien à faire : tout joué, sans replay, plus découpé. */
  private maybeRelease(state: ElementState): void {
    if (state.split || state.regs.size === 0) return
    for (const [reg, rs] of state.regs) if (reg.replay || !rs.triggered) return
    this.untrack(state.el)
  }

  private needsObserver(state: ElementState, start: number): boolean {
    for (const [reg, rs] of state.regs) {
      if (reg.start === start && (reg.replay || !rs.triggered)) return true
    }
    return false
  }

  // ─── Observers ──────────────────────────────────────────────────────

  private getTriggerObserver(start: number): IntersectionObserver {
    let io = this.triggerObservers.get(start)
    if (!io) {
      // La marge basse négative remonte la ligne de déclenchement de `start` % de la hauteur de l'écran.
      io = new IntersectionObserver((entries) => this.handleTrigger(start, entries), {
        rootMargin: `0px 0px ${-start}% 0px`,
        threshold: 0,
      })
      this.triggerObservers.set(start, io)
    }
    return io
  }

  private getResetObserver(margin: number): IntersectionObserver {
    let io = this.resetObservers.get(margin)
    if (!io) {
      io = new IntersectionObserver((entries) => this.handleReset(margin, entries), {
        rootMargin: `0px 0px ${margin}% 0px`,
        threshold: 0,
      })
      this.resetObservers.set(margin, io)
    }
    return io
  }

  private getNearObserver(): IntersectionObserver {
    if (!this.nearObserver) {
      this.bindFonts()
      this.nearObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const state = this.elements.get(entry.target as HTMLElement)
            if (!state) continue
            state.near = entry.isIntersecting
            if (state.near && (!state.split || state.dirty)) this.enqueue(state)
          }
        },
        { rootMargin: NEAR_MARGIN, threshold: 0 },
      )
    }
    return this.nearObserver
  }

  private getResizeObserver(): ResizeObserver {
    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver((entries) => {
        let changed = false
        for (const entry of entries) {
          const state = this.elements.get(entry.target as HTMLElement)
          if (!state) continue
          const width = entry.contentRect.width
          if (state.width !== undefined && width !== state.width) {
            state.dirty = true
            changed = true
          }
          state.width = width
        }
        if (!changed) return
        clearTimeout(this.resizeTimer)
        this.resizeTimer = setTimeout(() => this.enqueueDirtyNear(), RESIZE_DEBOUNCE_MS)
      })
    }
    return this.resizeObserver
  }

  private bindFonts(): void {
    if (this.fontsBound || !document.fonts) return
    this.fontsBound = true
    // Une police chargée change la largeur des mots : les lignes sont à refaire.
    document.fonts.addEventListener('loadingdone', this.onFontsLoaded)
    void document.fonts.ready.then(() => {
      this.markLinesDirty(true)
      this.scheduleQueue()
    })
  }

  private markLinesDirty(onlySplitBeforeFonts: boolean): void {
    for (const state of this.elements.values()) {
      if (!state.split || !state.hasLines) continue
      if (onlySplitBeforeFonts && !state.splitBeforeFonts) continue
      state.dirty = true
    }
    this.enqueueDirtyNear()
  }

  private enqueueDirtyNear(): void {
    for (const state of this.elements.values()) {
      if (state.dirty && state.near) this.enqueue(state)
    }
  }

  // ─── Déclenchement ──────────────────────────────────────────────────

  private handleTrigger(start: number, entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const el = entry.target as HTMLElement
      const state = this.elements.get(el)
      if (!state) continue

      const rect = entry.boundingClientRect
      // Élément caché (display: none…) : ni déclenchement ni réarmement.
      if (rect.width === 0 && rect.height === 0) continue

      const lineTop = entry.rootBounds?.top ?? 0
      // Atteint = a franchi la ligne, ou se trouve déjà entièrement au-dessus de l'écran (scroll restauré).
      const reached = entry.isIntersecting || rect.bottom <= lineTop

      for (const [reg, rs] of state.regs) {
        if (reg.start === start && reached && !rs.triggered) this.trigger(state, reg, rs)
      }

      // L'élément a peut-être été retiré par le callback lui-même.
      if (!this.elements.has(el)) continue
      if (!this.needsObserver(state, start)) this.triggerObservers.get(start)?.unobserve(el)
      this.maybeRelease(state)
    }
  }

  /**
   * Replay : quand l'élément est entièrement sorti par le bas (ou repassé sous une ligne située sous l'écran),
   * il est réarmé et son animation remise à son état de départ, sans que ce soit visible.
   */
  private handleReset(margin: number, entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const state = this.elements.get(entry.target as HTMLElement)
      if (!state || entry.isIntersecting) continue
      const rect = entry.boundingClientRect
      if (rect.width === 0 && rect.height === 0) continue
      const bottom = entry.rootBounds?.bottom ?? document.documentElement.clientHeight
      if (rect.top < bottom) continue

      let reset = false
      for (const [reg, rs] of state.regs) {
        if (!reg.replay || !rs.triggered || resetMarginOf(reg) !== margin) continue
        // Seulement si l'utilisateur est remonté : une animation qui déplace elle-même l'élément
        // vers le bas ne doit pas le réarmer.
        if (window.scrollY >= rs.scrollY) continue
        rs.triggered = false
        rs.anim?.pause(0)
        reset = true
      }
      if (reset && [...state.regs.values()].every((rs) => !rs.triggered)) {
        state.el.setAttribute(STATE_ATTR, 'reset')
      }
    }
  }

  private trigger(state: ElementState, reg: Registration, rs: RegState): void {
    // Pas encore découpé (ou lignes à refaire) au moment du déclenchement : on le fait tout de suite.
    if (reg.split) this.splitNow(state)
    // Replay : on coupe l'animation précédente pour éviter deux tweens sur les mêmes cibles.
    rs.anim?.kill()
    rs.triggered = true
    rs.scrollY = window.scrollY
    let set = this.played.get(state.el)
    if (!set) {
      set = new WeakSet()
      this.played.set(state.el, set)
    }
    set.add(reg)
    state.el.setAttribute(STATE_ATTR, 'triggered')
    this.watch(state, reg, rs, this.runCallback(state, reg))
  }

  private runCallback(state: ElementState, reg: Registration): unknown {
    try {
      return reg.cb({ el: state.el, ...state.fragments })
    } catch (error) {
      console.error(`[inview] erreur dans le callback "${reg.name}"`, error)
      return undefined
    }
  }

  /** Mémorise le retour du callback et attend sa fin pour, éventuellement, annuler le split. */
  private watch(state: ElementState, reg: Registration, rs: RegState, result: unknown): void {
    const token = ++rs.token
    rs.finished = false
    rs.anim = isGsapAnimation(result) ? result : undefined
    if (!isThenable(result)) return
    result.then(
      () => {
        if (rs.token !== token || state.regs.get(reg) !== rs) return
        rs.finished = true
        this.maybeRevert(state)
      },
      () => {},
    )
  }

  // ─── Split ──────────────────────────────────────────────────────────

  private enqueue(state: ElementState): void {
    this.queue.add(state)
    this.scheduleQueue()
  }

  private scheduleQueue(): void {
    if (this.queueFrame || this.queue.size === 0) return
    this.queueFrame = requestAnimationFrame(() => {
      this.queueFrame = 0
      this.processQueue()
    })
  }

  /** Découpe les éléments en attente, frame par frame, dans la limite du budget. */
  private processQueue(): void {
    const deadline = performance.now() + FRAME_BUDGET_MS
    const waitingFonts = fontsLoading()
    for (const state of [...this.queue]) {
      if (performance.now() > deadline) break
      // Le découpage anticipé attend les polices (sinon les lignes seraient à refaire tout de suite).
      if (waitingFonts && !state.split) continue
      this.queue.delete(state)
      if (!this.elements.has(state.el) || !state.near) continue
      this.splitNow(state)
    }
    if (!waitingFonts) this.scheduleQueue()
  }

  /** Découpe l'élément, ou refait ses lignes si elles sont obsolètes. */
  private splitNow(state: ElementState): void {
    this.queue.delete(state)
    if (!state.config) return
    if (state.split) {
      if (!state.dirty) return
      state.dirty = false
      state.splitBeforeFonts = fontsLoading()
      const split = state.split
      this.ownMutations(state.el, () => split.split())
      return
    }
    state.splitBeforeFonts = fontsLoading()
    const config = state.config
    const splitter = this.splitter
    this.ownMutations(state.el, () => {
      // onSplit est appelé dans le constructeur de SplitText, puis à chaque split() (redécoupage).
      // Pas d'autoSplit : inview gère lui-même le redécoupage, uniquement près de l'écran.
      splitter.create(state.el, {
        ...config,
        onSplit: (self: SplitTextInstance) => this.handleSplit(state, self),
      })
    })
    if (state.split && state.hasLines) this.getResizeObserver().observe(state.el)
    if (state.split && !state.hasLines) this.nearObserver?.unobserve(state.el)
  }

  private handleSplit(state: ElementState, self: SplitTextInstance): void {
    state.split = self
    this.splits.set(state.el, self)
    state.splitCount += 1
    state.fragments = fragmentsOf(self)
    if (state.splitCount === 1 || state.silent) return

    // Redécoupage : seuls les callbacks qui ont renvoyé une animation GSAP sont rappelés, avec les
    // nouveaux fragments, puis remis à la même progression (ou à leur départ s'ils ont été réarmés).
    for (const [reg, rs] of state.regs) {
      if (!rs.anim) continue
      const time = rs.anim.totalTime()
      const wasFinished = rs.finished
      const armed = !rs.triggered
      rs.anim.revert()
      const result = this.runCallback(state, reg)
      this.watch(state, reg, rs, result)
      if (armed) rs.anim?.pause(0)
      else rs.anim?.totalTime(time)
      if (wasFinished) rs.finished = true
    }
  }

  /**
   * Remet le texte d'origine quand tout est joué, sans replay, et que le rendu est identique :
   * fragments à leur état naturel et même hauteur une fois le texte restauré.
   */
  private maybeRevert(state: ElementState): void {
    const split = state.split
    if (!split || !this.elements.has(state.el)) return
    for (const [reg, rs] of state.regs) {
      if (reg.replay || !rs.triggered || !rs.finished) return
    }
    if (!isNeutral(split)) return

    const height = state.el.offsetHeight
    this.ownMutations(state.el, () => split.revert())
    if (state.el.offsetHeight !== height) {
      // Le texte d'origine ne se coupe pas pareil : on remet le split, sans rappeler les callbacks.
      state.silent = true
      this.ownMutations(state.el, () => split.split())
      state.silent = false
      return
    }

    for (const rs of state.regs.values()) {
      rs.anim = undefined
      rs.token++
    }
    this.splits.delete(state.el)
    state.split = undefined
    state.fragments = emptyFragments()
    this.resizeObserver?.unobserve(state.el)
    this.nearObserver?.unobserve(state.el)
    this.maybeRelease(state)
  }

  // ─── MutationObserver ───────────────────────────────────────────────

  private startMutationObserver(): void {
    if (this.mutationObserver) return
    this.mutationObserver = new MutationObserver((records) => this.processRecords(records))
    this.mutationObserver.observe(document.documentElement, { childList: true, subtree: true })
  }

  /** Exécute une écriture DOM d'inview et ignore les mutations qu'elle produit dans `el`. */
  private ownMutations(el: HTMLElement, fn: () => void): void {
    try {
      fn()
    } finally {
      const records = this.mutationObserver?.takeRecords()
      if (records?.length) this.processRecords(records.filter((r) => !el.contains(r.target)))
    }
  }

  private processRecords(records: MutationRecord[]): void {
    if (records.length === 0) return
    const added = new Set<HTMLElement>()
    const removed = new Set<HTMLElement>()
    const collect = (node: Node, into: Set<HTMLElement>) => {
      if (!(node instanceof HTMLElement)) return
      if (node.hasAttribute(ATTR)) into.add(node)
      if (node.firstElementChild) {
        for (const el of node.querySelectorAll<HTMLElement>(SELECTOR)) into.add(el)
      }
    }
    for (const record of records) {
      for (const node of record.removedNodes) collect(node, removed)
      for (const node of record.addedNodes) collect(node, added)
    }
    // Un nœud déplacé (retiré puis réinséré dans la même tâche) est encore connecté : rien à faire.
    for (const el of removed) if (!el.isConnected) this.untrack(el)
    for (const el of added) if (el.isConnected) this.track(el)
  }
}
