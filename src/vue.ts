import { getCurrentInstance, type MaybeRefOrGetter, onBeforeUnmount, onMounted, toValue } from 'vue'
import { inview as core } from './index'
import type { InviewCallback, InviewOptions } from './types'

export interface VueInviewOptions extends Omit<InviewOptions, 'scope'> {
  /**
   * Dans un composant : zone où chercher les éléments. Par défaut, la racine du composant.
   * `false` pour viser toute la page. Une ref ou un élément pour une zone précise.
   * Hors composant : toute la page par défaut.
   */
  scope?: MaybeRefOrGetter<Element | null | undefined> | false
}

type ComponentInstance = NonNullable<ReturnType<typeof getCurrentInstance>>

const resolveScope = (
  name: string,
  instance: ComponentInstance,
  option: VueInviewOptions['scope'],
): Element | undefined => {
  if (option === false) return undefined
  if (option !== undefined) return toValue(option) ?? undefined
  const root = instance.proxy?.$el as Node | null | undefined
  if (root instanceof Element) return root
  // Composant à plusieurs racines : $el n'est pas un élément.
  console.warn(
    `[inview] on("${name}") : le composant a plusieurs racines, la recherche se fait dans son parent. Passe une ref avec l'option scope pour la limiter.`,
  )
  return root?.parentElement ?? undefined
}

function on(name: string, cb: InviewCallback): () => void
function on(name: string, options: VueInviewOptions, cb: InviewCallback): () => void
function on(
  name: string,
  optionsOrCb: VueInviewOptions | InviewCallback,
  maybeCb?: InviewCallback,
): () => void {
  const options = typeof optionsOrCb === 'function' ? {} : optionsOrCb
  const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb
  if (typeof cb !== 'function') throw new Error(`[inview] callback manquant pour "${name}"`)
  const { scope, ...rest } = options

  const instance = getCurrentInstance()
  // Hors composant (plugin, script) : comportement global du cœur.
  if (!instance) {
    if (scope !== undefined && scope !== false) {
      return core.on(name, { ...rest, scope: toValue(scope) ?? undefined }, cb)
    }
    return core.on(name, rest, cb)
  }

  // Dans un composant : enregistré au montage (le DOM existe), retiré au démontage.
  let off: (() => void) | undefined
  let cancelled = false
  const register = () => {
    if (cancelled || off) return
    off = core.on(name, { ...rest, scope: resolveScope(name, instance, scope) }, cb)
  }
  if (instance.isMounted) register()
  else onMounted(register)
  onBeforeUnmount(() => {
    cancelled = true
    off?.()
    off = undefined
  })

  return () => {
    cancelled = true
    off?.()
    off = undefined
  }
}

/**
 * `inview` pour Vue / Nuxt : même API que le cœur.
 * Dans un composant, `on()` ne vise que les éléments du composant et se retire au démontage.
 */
export const inview = {
  on,
  refresh: (): void => core.refresh(),
  destroy: (name?: string): void => core.destroy(name),
}

export default inview
export type {
  InviewCallback,
  InviewItem,
  SplitOptions,
  StartValue,
} from './types'
