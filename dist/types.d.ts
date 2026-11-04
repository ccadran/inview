/** Position de la ligne de déclenchement : 0 = bas de l'écran, 20 = 20 % au-dessus du bas. Négatif = sous l'écran. */
export type StartValue = number | `${number}%`;
/** Options transmises à SplitText (onSplit et autoSplit sont gérés par inview). */
export interface SplitOptions {
    /** "lines", "words", "chars" ou une combinaison : "lines,words". */
    type: string;
    mask?: 'lines' | 'words' | 'chars';
    linesClass?: string;
    wordsClass?: string;
    charsClass?: string;
    propIndex?: boolean;
    aria?: 'auto' | 'hidden' | 'none';
    ignore?: string;
    deepSlice?: boolean;
    smartWrap?: boolean;
    tag?: string;
    reduceWhiteSpace?: boolean;
}
export interface InviewOptions {
    /** Défaut : 0 (le haut de l'élément touche le bas de l'écran). */
    start?: StartValue;
    /** Rejoue le callback quand l'élément repasse sous la ligne puis la recroise. Défaut : false. */
    replay?: boolean;
    /** Découpe le texte avec GSAP SplitText. */
    split?: SplitOptions;
    /** Limite cet enregistrement aux éléments contenus dans `scope` (par exemple la racine d'un composant). */
    scope?: Element | null;
}
/** Ce que reçoit le callback. Les tableaux sont vides si l'élément n'est pas découpé. */
export interface InviewItem {
    el: HTMLElement;
    lines: HTMLElement[];
    words: HTMLElement[];
    chars: HTMLElement[];
    masks: HTMLElement[];
}
/**
 * Retour optionnel. Si c'est une animation GSAP (tween ou timeline) sur un élément découpé,
 * inview la resynchronise après un redécoupage (resize, chargement des polices) et la kill avant un replay.
 */
export type InviewCallback = (item: InviewItem) => unknown;
/** Forme minimale d'une instance SplitText utilisée par inview. */
export interface SplitTextInstance {
    lines: Element[];
    words: Element[];
    chars: Element[];
    masks: Element[];
    /** Refait le découpage avec la même config (appelle onSplit). */
    split(): unknown;
    revert(): unknown;
    kill(): unknown;
}
/** Forme minimale de la classe SplitText (`import { SplitText } from 'gsap/SplitText'`). */
export interface SplitTextLike {
    create(target: HTMLElement, vars: Record<string, unknown>): SplitTextInstance;
}
