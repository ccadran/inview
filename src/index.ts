import { Inview } from './inview'

export { Inview } from './inview'
export type {
  InviewCallback,
  InviewItem,
  InviewOptions,
  SplitOptions,
  SplitTextInstance,
  SplitTextLike,
  StartValue,
} from './types'

/** Instance partagée. Import sans effet de bord : rien ne touche au navigateur avant le premier `on()`. */
export const inview = new Inview()
export default inview
