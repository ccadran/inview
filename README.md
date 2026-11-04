# @ccadran/inview

Lance une fonction quand un élément entre dans l'écran — l'alternative légère à ScrollTrigger pour les
animations **déclenchées** (reveal, fade-in, texte qui monte ligne par ligne…).

- Basée sur `IntersectionObserver` : aucun listener de scroll, aucun calcul de position à chaque frame.
- Découpage de texte optionnel (lignes, mots, caractères) avec GSAP SplitText.
- Marche avec le contenu ajouté plus tard (navigation Nuxt, `v-if`, pagination CMS) sans rien faire.
- Import compatible SSR. ~4 kB gzippé, aucune dépendance obligatoire.

Ce que la lib **ne fait pas** : le scrub (animation liée à la progression du scroll) et le pin.
Pour ça, garde ScrollTrigger ou les CSS scroll-driven animations.

## Installation

```sh
pnpm add github:ccadran/inview#v0.1.0
```

Pour découper du texte, il faut aussi GSAP (SplitText est livré dans le package `gsap`) :

```sh
pnpm add gsap
```

## Démarrage rapide

1. Marque les éléments dans le HTML avec un nom :

```html
<h2 data-inview="title">Un titre</h2>
<h2 data-inview="title">Un autre titre</h2>
```

2. Associe une fonction à ce nom :

```ts
import { inview } from '@ccadran/inview'

inview.on('title', { start: '20%' }, ({ el }) => {
  el.classList.add('is-in')
})
```

Chaque élément `data-inview="title"` de la page appelle la fonction une fois, quand il franchit la ligne.

3. Cache-les tant qu'ils n'ont pas été déclenchés (voir [Éviter le flash](#éviter-le-flash)) :

```css
[data-inview]:not([data-inview-state]) {
  visibility: hidden;
}
```

## L'option `start`

`start` place la ligne de déclenchement, en pourcentage de la hauteur de l'écran, **en partant du bas**.
Le callback part quand le **haut de l'élément** franchit cette ligne.

```
┌──────────── écran ────────────┐
│                               │
│                               │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │ ← start: '20%'
│                               │
└───────────────────────────────┘ ← start: 0   (défaut)
   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    ← start: '-20%' (sous l'écran : part juste avant d'apparaître)
```

`start: 20` et `start: '20%'` sont équivalents.

## Options

| Option   | Type                | Défaut  | Rôle |
| -------- | ------------------- | ------- | ---- |
| `start`  | `number \| '20%'`   | `0`     | Position de la ligne de déclenchement (voir ci-dessus). |
| `replay` | `boolean`           | `false` | Rejoue le callback à chaque passage : quand l'élément redescend sous la ligne (tu remontes la page), il est réarmé. |
| `split`  | `SplitOptions`      | —       | Découpe le texte avant l'animation (voir [Découper du texte](#découper-du-texte)). |

Les options sont facultatives : `inview.on('title', callback)` suffit.

Tu peux appeler `on()` plusieurs fois sur le même nom, par exemple avec deux `start` différents.
Seule contrainte : la config `split` doit être la même pour tous les `on()` d'un nom (un élément n'est
découpé qu'une fois), sinon `on()` lève une erreur.

## Le callback

Il reçoit un objet :

| Propriété | Contenu |
| --------- | ------- |
| `el`      | L'élément déclenché. |
| `lines`, `words`, `chars`, `masks` | Les morceaux du texte découpé. Tableaux vides sans `split`. |

Tu y fais ce que tu veux : ajouter une classe, lancer une animation GSAP, WAAPI, jouer une vidéo…
**Renvoyer quelque chose est facultatif**, mais ça débloque des comportements en plus quand le texte est découpé :

| Le callback renvoie… | Ce que fait inview |
| -------------------- | ------------------ |
| rien                 | Rien de plus. Le texte reste découpé. |
| une animation GSAP (tween ou timeline) | Au resize, les lignes sont refaites : inview rappelle ton callback avec les nouvelles lignes et remet l'animation au même avancement. À la fin de l'animation, le texte d'origine est restauré (sauf avec `replay`). |
| une promesse         | À sa résolution, le texte d'origine est restauré (sauf avec `replay`). |

Comme le callback peut être rappelé après un resize, il ne doit faire **que** créer l'animation
(pas de compteur, pas d'appel réseau…).

Avec `replay`, si le callback avait renvoyé une animation GSAP, elle est arrêtée avant d'être rejouée :
deux animations ne se battent jamais sur les mêmes éléments.

## Découper du texte

Enregistre SplitText **une fois**, avant les `on()` qui utilisent `split` :

```ts
import { inview } from '@ccadran/inview'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'

inview.use(SplitText)

inview.on('title', { start: 20, split: { type: 'lines', mask: 'lines' } }, ({ lines }) =>
  gsap.fromTo(lines, { yPercent: 100 }, { yPercent: 0, stagger: 0.1 }),
)
```

`split` accepte les options de SplitText : `type` (`'lines'`, `'words'`, `'chars'` ou une combinaison comme
`'lines,words'`), `mask`, `linesClass`, `wordsClass`, `charsClass`, `propIndex`, `aria`, `ignore`…

Ce que la lib gère pour toi :

- **Le découpage est fait à l'avance**, environ un écran avant que l'élément arrive, après le chargement
  des polices, et réparti sur plusieurs frames pour ne pas faire ramer le scroll.
- **Les lignes restent justes.** Au resize ou au chargement d'une police, inview refait les lignes des
  éléments proches de l'écran ; les autres sont refaits quand tu y reviens. Un resize coûte donc la même
  chose sur une page courte ou sur un long article.
- **Le texte d'origine est restauré après l'animation**, si le callback a renvoyé une animation GSAP ou une
  promesse et que `replay` est désactivé. La page redevient légère. inview ne le fait que si ça ne change
  rien à l'écran : morceaux revenus à leur état normal (opacité 1, sans déplacement, filtre ni découpe) et
  même hauteur de bloc. Sinon, le texte reste découpé.

À savoir :

- Avec `mask`, les masques disparaissent avec le découpage : le bas des lettres comme « p » ou « g », que
  le masque pouvait couper, redevient visible. C'est le rendu normal du texte.
- Si le callback ne renvoie rien et que les lignes sont refaites (resize), les nouvelles lignes apparaissent
  dans leur état normal. Ne cache donc jamais les morceaux eux-mêmes en CSS : cache l'élément parent
  (voir [Éviter le flash](#éviter-le-flash)).
- Découpe les textes longs en `lines`. Garde `words` et `chars` pour les titres : ils créent beaucoup
  d'éléments.
- Évite `text-wrap: balance` sur un texte découpé.

## Éviter le flash

Juste avant d'appeler ton callback, inview ajoute `data-inview-state="triggered"` sur l'élément.
L'attribut reste en place ensuite, même avec `replay`.

Tant qu'il est absent, cache l'élément :

```css
[data-inview]:not([data-inview-state]) {
  visibility: hidden;
}
```

Ton animation (par exemple un `gsap.fromTo`) applique son état de départ dans la même frame : rien ne
s'affiche avant l'animation.

## Avec Nuxt

Enregistre SplitText dans un plugin côté client :

```ts
// plugins/inview.client.ts
import { inview } from '@ccadran/inview'
import { SplitText } from 'gsap/SplitText'

export default defineNuxtPlugin(() => {
  inview.use(SplitText)
})
```

Dans un composant, appelle `on()` au montage et la fonction qu'il renvoie au démontage :

```vue
<script setup lang="ts">
import { inview } from '@ccadran/inview'
import gsap from 'gsap'

let off: (() => void) | undefined

onMounted(() => {
  off = inview.on('card', ({ el }) => gsap.fromTo(el, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0 }))
})
onUnmounted(() => off?.())
</script>
```

Pour une animation utilisée sur tout le site (tous les paragraphes, par exemple), un seul `on()` dans le
plugin suffit : les éléments des nouvelles pages sont pris en compte automatiquement.

## Bon à savoir

- Un élément déjà visible, ou déjà dépassé (page rechargée au milieu, retour arrière), est déclenché tout de suite.
- Un élément dont le nom n'a aucun `on()` n'est pas observé. Si tu appelles `on()` plus tard, les éléments
  déjà présents sont pris en compte.
- Sans `replay`, un élément est déclenché une seule fois, même s'il est retiré puis remis dans la page
  (`<KeepAlive>`, déplacement par Vue).
- Limite connue : un saut de scroll instantané qui fait passer un élément directement de sous la ligne à
  au-dessus de l'écran (clic sur une ancre, `scrollTo` sans animation) ne le déclenche pas.
- Côté serveur, `on()` enregistre le callback sans rien exécuter : tu peux importer la lib n'importe où.

## API

| Méthode | Rôle |
| ------- | ---- |
| `inview.on(name, options?, callback)` | Associe un callback aux éléments `data-inview="name"`. Renvoie une fonction qui annule cet `on()`. |
| `inview.use(SplitText)` | Enregistre SplitText. Obligatoire avant un `on()` avec `split`. |
| `inview.refresh()` | Rescanne la page. Normalement inutile : les ajouts et retraits sont détectés automatiquement. |
| `inview.destroy(name?)` | Avec un nom : annule tous les `on()` de ce nom. Sans argument : arrête complètement la lib. |

`inview` est une instance partagée. Pour une instance séparée : `import { Inview } from '@ccadran/inview'`
puis `new Inview()`.

## Développement

```sh
pnpm install
pnpm dev     # playground sur http://localhost:5173 (une page par cas)
pnpm test    # tests Playwright, dans le Chrome installé sur la machine
pnpm bench   # mesures de performance dans Chrome
pnpm check   # types + lint (Biome)
pnpm build   # génère dist/, qui est commité
```

Pour publier une version : `pnpm build`, commit, puis `git tag vX.Y.Z && git push --tags`.
