# @ccadran/inview

Lance une fonction quand un élément entre dans l'écran — l'alternative légère à ScrollTrigger pour les
animations **déclenchées** (reveal, fade-in, texte qui monte ligne par ligne…).

- Basée sur `IntersectionObserver` : aucun listener de scroll, aucun calcul de position à chaque frame.
- Découpage de texte intégré (lignes, mots, caractères) avec GSAP SplitText, sans configuration.
- Marche avec le contenu ajouté plus tard (navigation Nuxt, `v-if`, pagination CMS) sans rien faire.
- Version Vue / Nuxt : dans un composant, `inview.on` ne vise que ses éléments et se retire au démontage.
- Import compatible SSR. ~4 kB gzippé (plus SplitText, ~4 kB, chargé depuis ton `gsap`).

Ce que la lib **ne fait pas** : le scrub (animation liée à la progression du scroll) et le pin.
Pour ça, garde ScrollTrigger ou les CSS scroll-driven animations.

## Installation

```sh
pnpm add github:ccadran/inview#v0.3.0 gsap
```

`gsap` est une dépendance « peer » : inview utilise le SplitText de ton projet, il n'est pas copié dans la
lib. Vue n'est nécessaire que si tu utilises `@ccadran/inview/vue`.

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

| Option   | Type              | Défaut  | Rôle                                                                                                         |
| -------- | ----------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `start`  | `number \| '20%'` | `0`     | Position de la ligne de déclenchement (voir ci-dessus).                                                      |
| `replay` | `boolean`         | `false` | Rejoue le callback à chaque passage (voir [Rejouer avec `replay`](#rejouer-avec-replay)).                    |
| `split`  | `SplitOptions`    | —       | Découpe le texte avant l'animation (voir [Découper du texte](#découper-du-texte)).                           |
| `scope`  | `Element`         | page    | Ne vise que les éléments contenus dans cet élément. Avec Vue, automatique dans un composant (voir plus bas). |

Les options sont facultatives : `inview.on('title', callback)` suffit.

Tu peux appeler `on()` plusieurs fois sur le même nom, par exemple avec deux `start` différents.
Seule contrainte : la config `split` doit être la même pour tous les `on()` d'un nom (un élément n'est
découpé qu'une fois), sinon `on()` lève une erreur.

## Le callback

Il reçoit un objet :

| Propriété                          | Contenu                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| `el`                               | L'élément déclenché.                                        |
| `lines`, `words`, `chars`, `masks` | Les morceaux du texte découpé. Tableaux vides sans `split`. |

Tu y fais ce que tu veux : ajouter une classe, lancer une animation GSAP, WAAPI, jouer une vidéo…
**Renvoyer quelque chose est facultatif**, mais ça débloque des comportements en plus quand le texte est découpé :

| Le callback renvoie…                   | Ce que fait inview                                                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rien                                   | Rien de plus. Le texte reste découpé.                                                                                                                                                                                |
| une animation GSAP (tween ou timeline) | Au resize, les lignes sont refaites : inview rappelle ton callback avec les nouvelles lignes et remet l'animation au même avancement. À la fin de l'animation, le texte d'origine est restauré (sauf avec `replay`). |
| une promesse                           | À sa résolution, le texte d'origine est restauré (sauf avec `replay`).                                                                                                                                               |

Comme le callback peut être rappelé après un resize, il ne doit faire **que** créer l'animation
(pas de compteur, pas d'appel réseau…).

## Rejouer avec `replay`

Avec `replay: true`, voici ce qui se passe à chaque aller-retour :

1. **En descendant**, l'élément franchit la ligne : le callback est appelé.
2. **En remontant**, quand l'élément est **entièrement sorti de l'écran par le bas**, il est réarmé et
   remis à l'état de départ. Tant qu'il est encore visible, rien ne bouge : la remise à zéro ne se voit jamais.
3. **En redescendant**, il recroise la ligne : le callback est rappelé et l'animation repart.

La remise à l'état de départ dépend de ce que renvoie ton callback :

| Le callback renvoie… | Remise à zéro                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| une animation GSAP   | Automatique : l'animation est ramenée à son début (l'état `from` d'un `fromTo` ou d'un `from`). Avec un texte découpé, ça marche aussi après un resize. |
| autre chose ou rien  | À toi de la faire en CSS : `data-inview-state` passe à `"reset"` (voir ci-dessous).                                                                     |

Exemple sans GSAP, piloté uniquement par l'attribut :

```css
[data-inview="fade"] {
  opacity: 0;
  transition: opacity 0.6s;
}
[data-inview="fade"][data-inview-state="triggered"] {
  opacity: 1;
}
```

Trois garanties :

- L'élément n'est réarmé que si **tu as remonté la page**. Une animation qui déplace elle-même l'élément
  (`y: 60`, `yPercent: 100`…) ne le relance jamais en boucle.
- L'ancienne animation est arrêtée avant d'être rejouée : deux animations ne se battent jamais sur les
  mêmes éléments.
- Avec `replay`, le texte découpé n'est jamais restauré : il est gardé pour les passages suivants.

Si la ligne est sous l'écran (`start` négatif), la remise à zéro a lieu quand l'élément repasse sous la ligne.

## Découper du texte

Ajoute l'option `split`, rien d'autre à configurer :

```ts
import { inview } from '@ccadran/inview'
import gsap from 'gsap'

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

inview pose un attribut `data-inview-state` sur l'élément :

| Valeur      | Quand                                                                         |
| ----------- | ----------------------------------------------------------------------------- |
| absent      | Pas encore déclenché.                                                         |
| `triggered` | Posé juste avant l'appel du callback.                                         |
| `reset`     | Avec `replay` : l'élément est sorti par le bas et attend le prochain passage. |

Tant qu'il est absent, cache l'élément :

```css
[data-inview]:not([data-inview-state]) {
  visibility: hidden;
}
```

Ton animation (par exemple un `gsap.fromTo`) applique son état de départ dans la même frame : rien ne
s'affiche avant l'animation.

## Avec Vue / Nuxt

Dans un projet Vue ou Nuxt, importe `inview` depuis **`@ccadran/inview/vue`**. C'est la même API
(`on`, `refresh`, `destroy`), avec deux comportements en plus quand `on()` est appelé dans un composant :

- **Retrait automatique** : l'enregistrement se fait au montage et s'annule au démontage. Aucune variable
  à garder, rien qui traîne d'une page à l'autre.
- **Limité au composant** : seuls les éléments `data-inview` du composant sont visés.

```vue
<script setup lang="ts">
import { inview } from '@ccadran/inview/vue'
import gsap from 'gsap'

inview.on('title', { start: 20, split: { type: 'lines', mask: 'lines' } }, ({ lines }) =>
  gsap.fromTo(lines, { yPercent: 100 }, { yPercent: 0, stagger: 0.1 }),
)

inview.on('card', ({ el }) => gsap.fromTo(el, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0 }))
</script>

<template>
  <section>
    <h2 data-inview="title">Un titre</h2>
    <div data-inview="card">…</div>
  </section>
</template>
```

### Pourquoi limiter au composant ?

Un composant affiché plusieurs fois exécute son `setup` à chaque fois. Si `Card.vue` est affiché dix fois
et que chaque `on('card')` visait toute la page, chaque carte aurait dix callbacks : elle serait animée
dix fois en même temps. Rien ne casserait visiblement, mais le travail serait multiplié par dix.
Limité au composant, chaque carte n'a que son propre callback.

Conséquence pratique : **tu peux réutiliser le même nom dans des composants différents**, même avec des
configs de split différentes. Chaque composant ne voit que ses éléments.

### Les cas particuliers

| Situation                                              | Que faire                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Le composant a plusieurs racines dans son `<template>` | Mets une ref sur un conteneur et passe `scope: maRef`. Sinon, la recherche se fait dans le parent, avec un avertissement en console. |
| Un composant doit viser toute la page                  | `scope: false`. Il reste retiré au démontage.                                                                                        |
| Un parent et un de ses enfants utilisent le même nom   | Donne-leur des noms différents : la zone du parent contient celle de l'enfant, l'élément serait visé deux fois.                      |
| Annuler avant le démontage                             | `on()` renvoie une fonction d'annulation, comme dans le cœur.                                                                        |

### Les animations communes à tout le site

Pour une animation utilisée partout (tous les paragraphes, par exemple), appelle `inview.on()` une seule
fois dans un plugin. Hors composant, il vise toute la page et reste actif : les éléments des nouvelles
pages sont pris en compte automatiquement.

```ts
// plugins/inview.client.ts
import { inview } from '@ccadran/inview/vue'
import gsap from 'gsap'

export default defineNuxtPlugin(() => {
  inview.on('paragraph', { start: 15, split: { type: 'lines' } }, ({ lines }) =>
    gsap.fromTo(lines, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, stagger: 0.06 }),
  )
})
```

## Bon à savoir

- Un élément déjà visible, ou déjà dépassé (page rechargée au milieu, retour arrière), est déclenché tout de suite.
- Un élément dont le nom n'a aucun `on()` n'est pas observé. Si tu appelles `on()` plus tard, les éléments
  déjà présents sont pris en compte.
- Sans `replay`, un élément est déclenché une seule fois, même s'il est retiré puis remis dans la page
  (`<KeepAlive>`, déplacement par Vue).
- Limite connue : un saut de scroll instantané qui fait passer un élément directement de sous la ligne à
  au-dessus de l'écran (clic sur une ancre, `scrollTo` sans animation) ne le déclenche pas.
- Côté serveur, `on()` ne fait rien : tu peux importer la lib n'importe où.

## API

| Méthode                               | Rôle                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `inview.on(name, options?, callback)` | Associe un callback aux éléments `data-inview="name"`. Renvoie une fonction qui annule cet `on()`. |
| `inview.refresh()`                    | Rescanne la page. Normalement inutile : les ajouts et retraits sont détectés automatiquement.      |
| `inview.destroy(name?)`               | Avec un nom : annule tous les `on()` de ce nom. Sans argument : arrête complètement la lib.        |

Deux points d'entrée, une seule instance partagée :

- `@ccadran/inview` : le cœur, sans framework (Webflow, site statique…).
- `@ccadran/inview/vue` : la même API, avec le retrait au démontage et la limite au composant quand `on()`
  est appelé dans un composant Vue.

Pour une instance séparée du cœur : `import { Inview } from '@ccadran/inview'` puis `new Inview()`.

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
