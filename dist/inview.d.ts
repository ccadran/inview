import type { InviewCallback, InviewOptions } from './types';
export declare class Inview {
    /** SplitText est importé par la lib : `gsap` est une peer dependency. */
    private readonly splitter;
    private readonly registry;
    private readonly elements;
    private readonly triggerObservers;
    /** Détection de la sortie par le bas (replay), par marge basse en %. */
    private readonly resetObservers;
    private nearObserver;
    private resizeObserver;
    private mutationObserver;
    /** Instances SplitText par élément : retrouvées si l'élément est retiré puis réinséré. */
    private splits;
    /** Enregistrements déjà joués par élément : pas de redéclenchement après une réinsertion (KeepAlive…). */
    private played;
    private readonly queue;
    private queueFrame;
    private resizeTimer;
    private fontsBound;
    private readonly onFontsLoaded;
    /**
     * Associe un callback aux éléments `[data-inview="name"]`, présents et futurs.
     * Renvoie une fonction qui retire cet enregistrement.
     */
    on(name: string, cb: InviewCallback): () => void;
    on(name: string, options: InviewOptions, cb: InviewCallback): () => void;
    /** Rescanne le DOM : suit les nouveaux éléments, oublie ceux retirés. Normalement inutile (MutationObserver). */
    refresh(): void;
    /**
     * Sans argument : arrête tout et nettoie. Avec un nom : retire tous les enregistrements de ce nom.
     * Les éléments encore dans la page restent dans leur état actuel.
     */
    destroy(name?: string): void;
    private attachRegistration;
    private removeRegistration;
    private track;
    private untrack;
    /** Libère un élément qui n'a plus rien à faire : tout joué, sans replay, plus découpé. */
    private maybeRelease;
    private needsObserver;
    private getTriggerObserver;
    private getResetObserver;
    private getNearObserver;
    private getResizeObserver;
    private bindFonts;
    private markLinesDirty;
    private enqueueDirtyNear;
    private handleTrigger;
    /**
     * Replay : quand l'élément est entièrement sorti par le bas (ou repassé sous une ligne située sous l'écran),
     * il est réarmé et son animation remise à son état de départ, sans que ce soit visible.
     */
    private handleReset;
    private trigger;
    private runCallback;
    /** Mémorise le retour du callback et attend sa fin pour, éventuellement, annuler le split. */
    private watch;
    private enqueue;
    private scheduleQueue;
    /** Découpe les éléments en attente, frame par frame, dans la limite du budget. */
    private processQueue;
    /** Découpe l'élément, ou refait ses lignes si elles sont obsolètes. */
    private splitNow;
    private handleSplit;
    /**
     * Remet le texte d'origine quand tout est joué, sans replay, et que le rendu est identique :
     * fragments à leur état naturel et même hauteur une fois le texte restauré.
     */
    private maybeRevert;
    private startMutationObserver;
    /** Exécute une écriture DOM d'inview et ignore les mutations qu'elle produit dans `el`. */
    private ownMutations;
    private processRecords;
}
