import { t as e } from "./core.js";
import { getCurrentInstance as t, onBeforeUnmount as n, onMounted as r, toValue as i } from "vue";
// src/vue.ts
var a = (e, t, n) => {
	if (n === !1) return;
	if (n !== void 0) return i(n) ?? void 0;
	let r = t.proxy?.$el;
	return r instanceof Element ? r : (console.warn(`[inview] on("${e}") : le composant a plusieurs racines, la recherche se fait dans son parent. Passe une ref avec l'option scope pour la limiter.`), r?.parentElement ?? void 0);
};
function o(o, s, c) {
	let l = typeof s == "function" ? {} : s, u = typeof s == "function" ? s : c;
	if (typeof u != "function") throw Error(`[inview] callback manquant pour "${o}"`);
	let { scope: d, ...f } = l, p = t();
	if (!p) return d !== void 0 && d !== !1 ? e.on(o, {
		...f,
		scope: i(d) ?? void 0
	}, u) : e.on(o, f, u);
	let m, h = !1, g = () => {
		h || m || (m = e.on(o, {
			...f,
			scope: a(o, p, d)
		}, u));
	};
	return p.isMounted ? g() : r(g), n(() => {
		h = !0, m?.(), m = void 0;
	}), () => {
		h = !0, m?.(), m = void 0;
	};
}
var s = {
	on: o,
	refresh: () => e.refresh(),
	destroy: (t) => e.destroy(t)
};
export { s as default, s as inview };

//# sourceMappingURL=vue.js.map