import { type MaybeRefOrGetter } from 'vue';
import type { InviewCallback, InviewOptions } from './types';
export interface VueInviewOptions extends Omit<InviewOptions, 'scope'> {
    /**
     * Dans un composant : zone où chercher les éléments. Par défaut, la racine du composant.
     * `false` pour viser toute la page. Une ref ou un élément pour une zone précise.
     * Hors composant : toute la page par défaut.
     */
    scope?: MaybeRefOrGetter<Element | null | undefined> | false;
}
declare function on(name: string, cb: InviewCallback): () => void;
declare function on(name: string, options: VueInviewOptions, cb: InviewCallback): () => void;
/**
 * `inview` pour Vue / Nuxt : même API que le cœur.
 * Dans un composant, `on()` ne vise que les éléments du composant et se retire au démontage.
 */
export declare const inview: {
    on: typeof on;
    refresh: () => void;
    destroy: (name?: string) => void;
};
export default inview;
export type { InviewCallback, InviewItem, SplitOptions, StartValue, } from './types';
