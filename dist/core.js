import { SplitText as e } from "gsap/SplitText";
// src/inview.ts
var t = "data-inview", n = "data-inview-state", r = `[${t}]`, i = "0px 0px 100% 0px", a = 6, o = 150, s = () => typeof window < "u" && typeof IntersectionObserver < "u" && typeof MutationObserver < "u", c = (e) => {
	if (!e || typeof e != "object") return !1;
	let t = e;
	return typeof t.totalTime == "function" && typeof t.kill == "function" && typeof t.revert == "function" && typeof t.pause == "function";
}, l = (e) => !!e && (typeof e == "object" || typeof e == "function") && typeof e.then == "function", u = (e) => {
	if (e === void 0) return 0;
	let t = typeof e == "number" ? e : Number.parseFloat(e);
	if (!Number.isFinite(t)) throw Error(`[inview] start invalide : "${String(e)}"`);
	return t;
}, d = (e) => {
	if (!e) return "";
	let t = Object.keys(e).sort().map((t) => [t, e[t]]);
	return JSON.stringify(t);
}, f = () => ({
	lines: [],
	words: [],
	chars: [],
	masks: []
}), p = (e) => ({
	lines: [...e.lines],
	words: [...e.words],
	chars: [...e.chars],
	masks: [...e.masks]
}), m = (e, t) => !e.scope || e.scope.contains(t), h = (e) => Math.max(0, -e.start), g = (e, t) => !e.scope || !t.scope || e.scope.contains(t.scope) || t.scope.contains(e.scope), _ = (e) => e.getAttribute(t)?.trim() ?? "", v = () => typeof document < "u" && !!document.fonts && document.fonts.status !== "loaded", y = (e) => {
	if (e === "none") return !0;
	let t = e.match(/^matrix(3d)?\((.+)\)$/);
	if (!t?.[2]) return !1;
	let n = t[2].split(",").map(Number), r = t[1] ? [
		1,
		0,
		0,
		0,
		0,
		1,
		0,
		0,
		0,
		0,
		1,
		0,
		0,
		0,
		0,
		1
	] : [
		1,
		0,
		0,
		1,
		0,
		0
	];
	return n.length === r.length && n.every((e, t) => Math.abs(e - (r[t] ?? 0)) < 1e-6);
}, b = (e) => {
	let t = [
		...e.lines,
		...e.words,
		...e.chars
	];
	for (let e of t) {
		let t = getComputedStyle(e);
		if (t.opacity !== "1" || t.visibility !== "visible" || !y(t.transform) || t.filter !== "none" || t.clipPath !== "none") return !1;
	}
	for (let t of e.masks) {
		let e = getComputedStyle(t);
		if (e.opacity !== "1" || !y(e.transform)) return !1;
	}
	return !0;
}, x = class {
	splitter = e;
	registry = /* @__PURE__ */ new Map();
	elements = /* @__PURE__ */ new Map();
	triggerObservers = /* @__PURE__ */ new Map();
	resetObservers = /* @__PURE__ */ new Map();
	nearObserver;
	resizeObserver;
	mutationObserver;
	splits = /* @__PURE__ */ new WeakMap();
	played = /* @__PURE__ */ new WeakMap();
	queue = /* @__PURE__ */ new Set();
	queueFrame = 0;
	resizeTimer;
	fontsBound = !1;
	onFontsLoaded = () => {
		this.markLinesDirty(!1), this.scheduleQueue();
	};
	on(e, n, r) {
		let i = typeof n == "function" ? {} : n, a = typeof n == "function" ? n : r;
		if (typeof a != "function") throw Error(`[inview] callback manquant pour "${e}"`);
		let o = {
			name: e,
			start: u(i.start),
			replay: i.replay ?? !1,
			split: i.split,
			splitKey: d(i.split),
			scope: i.scope ?? void 0,
			cb: a
		};
		if (!s()) return () => {};
		let c = this.registry.get(e) ?? [];
		if (c.some((e) => e.splitKey !== o.splitKey && g(e, o))) throw Error(`[inview] "${e}" a déjà une config de split différente sur les mêmes éléments. Un élément ne peut être découpé qu'une fois : utilise la même config de split, ou un autre nom.`);
		c.push(o), this.registry.set(e, c), this.startMutationObserver();
		for (let t of this.elements.values()) t.name === e && m(o, t.el) && this.attachRegistration(t, o);
		let l = `[${t}="${CSS.escape(e)}"]`, f = [...(o.scope ?? document).querySelectorAll(l)];
		o.scope instanceof HTMLElement && o.scope.matches(l) && f.unshift(o.scope);
		for (let e of f) this.elements.has(e) || this.track(e);
		return () => this.removeRegistration(o);
	}
	refresh() {
		if (s()) {
			this.mutationObserver && this.processRecords(this.mutationObserver.takeRecords());
			for (let e of [...this.elements.keys()]) e.isConnected || this.untrack(e);
			for (let e of document.querySelectorAll(r)) this.elements.has(e) || this.track(e);
		}
	}
	destroy(e) {
		if (e !== void 0) for (let t of [...this.registry.get(e) ?? []]) this.removeRegistration(t);
		else {
			for (let e of [...this.elements.keys()]) this.untrack(e);
			for (let e of this.triggerObservers.values()) e.disconnect();
			this.triggerObservers.clear();
			for (let e of this.resetObservers.values()) e.disconnect();
			this.resetObservers.clear(), this.nearObserver?.disconnect(), this.nearObserver = void 0, this.resizeObserver?.disconnect(), this.resizeObserver = void 0, this.mutationObserver?.disconnect(), this.mutationObserver = void 0, cancelAnimationFrame(this.queueFrame), this.queueFrame = 0, this.queue.clear(), clearTimeout(this.resizeTimer), this.fontsBound && document.fonts.removeEventListener("loadingdone", this.onFontsLoaded), this.fontsBound = !1, this.splits = /* @__PURE__ */ new WeakMap(), this.played = /* @__PURE__ */ new WeakMap(), this.registry.clear();
		}
	}
	attachRegistration(e, t) {
		if (e.regs.has(t)) return;
		let n = !t.replay && !!this.played.get(e.el)?.has(t);
		e.regs.set(t, {
			triggered: n,
			finished: n,
			anim: void 0,
			token: 0,
			scrollY: 0
		}), n || (this.getTriggerObserver(t.start).observe(e.el), t.replay && this.getResetObserver(h(t)).observe(e.el), t.split && !e.config && (e.config = t.split, e.hasLines = t.split.type.includes("lines")), t.split && this.getNearObserver().observe(e.el));
	}
	removeRegistration(e) {
		let t = this.registry.get(e.name);
		if (!t) return;
		let n = t.indexOf(e);
		if (n !== -1) {
			t.splice(n, 1), t.length === 0 && this.registry.delete(e.name);
			for (let t of [...this.elements.values()]) {
				let n = t.regs.get(e);
				n && (n.token++, t.regs.delete(e), this.needsObserver(t, e.start) || this.triggerObservers.get(e.start)?.unobserve(t.el), t.regs.size === 0 && !(t.split && t.hasLines) && this.untrack(t.el));
			}
		}
	}
	track(e) {
		let t = _(e), n = this.registry.get(t)?.filter((t) => m(t, e));
		if (!n || n.length === 0 || this.elements.has(e)) return;
		let r = this.splits.get(e), i = n.find((e) => e.split)?.split, a = {
			el: e,
			name: t,
			regs: /* @__PURE__ */ new Map(),
			split: r,
			config: i,
			hasLines: !!i?.type.includes("lines"),
			splitCount: +!!r,
			fragments: r ? p(r) : f(),
			width: void 0,
			dirty: !1,
			near: !1,
			splitBeforeFonts: !1,
			silent: !1
		};
		this.elements.set(e, a);
		for (let e of n) this.attachRegistration(a, e);
		r && a.hasLines && (a.dirty = !0, this.getResizeObserver().observe(e), this.getNearObserver().observe(e)), this.maybeRelease(a);
	}
	untrack(e) {
		let t = this.elements.get(e);
		if (t) {
			for (let t of this.triggerObservers.values()) t.unobserve(e);
			for (let t of this.resetObservers.values()) t.unobserve(e);
			this.nearObserver?.unobserve(e), this.resizeObserver?.unobserve(e), this.queue.delete(t);
			for (let n of t.regs.values()) n.token++, e.isConnected || n.anim?.kill();
			this.elements.delete(e);
		}
	}
	maybeRelease(e) {
		if (!(e.split || e.regs.size === 0)) {
			for (let [t, n] of e.regs) if (t.replay || !n.triggered) return;
			this.untrack(e.el);
		}
	}
	needsObserver(e, t) {
		for (let [n, r] of e.regs) if (n.start === t && (n.replay || !r.triggered)) return !0;
		return !1;
	}
	getTriggerObserver(e) {
		let t = this.triggerObservers.get(e);
		return t || (t = new IntersectionObserver((t) => this.handleTrigger(e, t), {
			rootMargin: `0px 0px ${-e}% 0px`,
			threshold: 0
		}), this.triggerObservers.set(e, t)), t;
	}
	getResetObserver(e) {
		let t = this.resetObservers.get(e);
		return t || (t = new IntersectionObserver((t) => this.handleReset(e, t), {
			rootMargin: `0px 0px ${e}% 0px`,
			threshold: 0
		}), this.resetObservers.set(e, t)), t;
	}
	getNearObserver() {
		return this.nearObserver ||= (this.bindFonts(), new IntersectionObserver((e) => {
			for (let t of e) {
				let e = this.elements.get(t.target);
				e && (e.near = t.isIntersecting, e.near && (!e.split || e.dirty) && this.enqueue(e));
			}
		}, {
			rootMargin: i,
			threshold: 0
		})), this.nearObserver;
	}
	getResizeObserver() {
		return this.resizeObserver ||= new ResizeObserver((e) => {
			let t = !1;
			for (let n of e) {
				let e = this.elements.get(n.target);
				if (!e) continue;
				let r = n.contentRect.width;
				e.width !== void 0 && r !== e.width && (e.dirty = !0, t = !0), e.width = r;
			}
			t && (clearTimeout(this.resizeTimer), this.resizeTimer = setTimeout(() => this.enqueueDirtyNear(), o));
		}), this.resizeObserver;
	}
	bindFonts() {
		!this.fontsBound && document.fonts && (this.fontsBound = !0, document.fonts.addEventListener("loadingdone", this.onFontsLoaded), document.fonts.ready.then(() => {
			this.markLinesDirty(!0), this.scheduleQueue();
		}));
	}
	markLinesDirty(e) {
		for (let t of this.elements.values()) t.split && t.hasLines && (!e || t.splitBeforeFonts) && (t.dirty = !0);
		this.enqueueDirtyNear();
	}
	enqueueDirtyNear() {
		for (let e of this.elements.values()) e.dirty && e.near && this.enqueue(e);
	}
	handleTrigger(e, t) {
		for (let n of t) {
			let t = n.target, r = this.elements.get(t);
			if (!r) continue;
			let i = n.boundingClientRect;
			if (i.width === 0 && i.height === 0) continue;
			let a = n.rootBounds?.top ?? 0, o = n.isIntersecting || i.bottom <= a;
			for (let [t, n] of r.regs) t.start === e && o && !n.triggered && this.trigger(r, t, n);
			this.elements.has(t) && (this.needsObserver(r, e) || this.triggerObservers.get(e)?.unobserve(t), this.maybeRelease(r));
		}
	}
	handleReset(e, t) {
		for (let r of t) {
			let t = this.elements.get(r.target);
			if (!t || r.isIntersecting) continue;
			let i = r.boundingClientRect;
			if (i.width === 0 && i.height === 0) continue;
			let a = r.rootBounds?.bottom ?? document.documentElement.clientHeight;
			if (i.top < a) continue;
			let o = !1;
			for (let [n, r] of t.regs) n.replay && r.triggered && h(n) === e && (window.scrollY >= r.scrollY || (r.triggered = !1, r.anim?.pause(0), o = !0));
			o && [...t.regs.values()].every((e) => !e.triggered) && t.el.setAttribute(n, "reset");
		}
	}
	trigger(e, t, r) {
		t.split && this.splitNow(e), r.anim?.kill(), r.triggered = !0, r.scrollY = window.scrollY;
		let i = this.played.get(e.el);
		i || (i = /* @__PURE__ */ new WeakSet(), this.played.set(e.el, i)), i.add(t), e.el.setAttribute(n, "triggered"), this.watch(e, t, r, this.runCallback(e, t));
	}
	runCallback(e, t) {
		try {
			return t.cb({
				el: e.el,
				...e.fragments
			});
		} catch (e) {
			console.error(`[inview] erreur dans le callback "${t.name}"`, e);
			return;
		}
	}
	watch(e, t, n, r) {
		let i = ++n.token;
		n.finished = !1, n.anim = c(r) ? r : void 0, l(r) && r.then(() => {
			n.token === i && e.regs.get(t) === n && (n.finished = !0, this.maybeRevert(e));
		}, () => {});
	}
	enqueue(e) {
		this.queue.add(e), this.scheduleQueue();
	}
	scheduleQueue() {
		this.queueFrame || this.queue.size === 0 || (this.queueFrame = requestAnimationFrame(() => {
			this.queueFrame = 0, this.processQueue();
		}));
	}
	processQueue() {
		let e = performance.now() + a, t = v();
		for (let n of [...this.queue]) {
			if (performance.now() > e) break;
			(!t || n.split) && (this.queue.delete(n), this.elements.has(n.el) && n.near && this.splitNow(n));
		}
		t || this.scheduleQueue();
	}
	splitNow(e) {
		if (this.queue.delete(e), !e.config) return;
		if (e.split) {
			if (!e.dirty) return;
			e.dirty = !1, e.splitBeforeFonts = v();
			let t = e.split;
			this.ownMutations(e.el, () => t.split());
			return;
		}
		e.splitBeforeFonts = v();
		let t = e.config, n = this.splitter;
		this.ownMutations(e.el, () => {
			n.create(e.el, {
				...t,
				onSplit: (t) => this.handleSplit(e, t)
			});
		}), e.split && e.hasLines && this.getResizeObserver().observe(e.el), e.split && !e.hasLines && this.nearObserver?.unobserve(e.el);
	}
	handleSplit(e, t) {
		if (e.split = t, this.splits.set(e.el, t), e.splitCount += 1, e.fragments = p(t), !(e.splitCount === 1 || e.silent)) for (let [t, n] of e.regs) {
			if (!n.anim) continue;
			let r = n.anim.totalTime(), i = n.finished, a = !n.triggered;
			n.anim.revert();
			let o = this.runCallback(e, t);
			this.watch(e, t, n, o), a ? n.anim?.pause(0) : n.anim?.totalTime(r), i && (n.finished = !0);
		}
	}
	maybeRevert(e) {
		let t = e.split;
		if (!t || !this.elements.has(e.el)) return;
		for (let [t, n] of e.regs) if (t.replay || !n.triggered || !n.finished) return;
		if (!b(t)) return;
		let n = e.el.offsetHeight;
		if (this.ownMutations(e.el, () => t.revert()), e.el.offsetHeight !== n) e.silent = !0, this.ownMutations(e.el, () => t.split()), e.silent = !1;
		else {
			for (let t of e.regs.values()) t.anim = void 0, t.token++;
			this.splits.delete(e.el), e.split = void 0, e.fragments = f(), this.resizeObserver?.unobserve(e.el), this.nearObserver?.unobserve(e.el), this.maybeRelease(e);
		}
	}
	startMutationObserver() {
		this.mutationObserver || (this.mutationObserver = new MutationObserver((e) => this.processRecords(e)), this.mutationObserver.observe(document.documentElement, {
			childList: !0,
			subtree: !0
		}));
	}
	ownMutations(e, t) {
		try {
			t();
		} finally {
			let t = this.mutationObserver?.takeRecords();
			t?.length && this.processRecords(t.filter((t) => !e.contains(t.target)));
		}
	}
	processRecords(e) {
		if (e.length === 0) return;
		let n = /* @__PURE__ */ new Set(), i = /* @__PURE__ */ new Set(), a = (e, n) => {
			if (e instanceof HTMLElement && (e.hasAttribute(t) && n.add(e), e.firstElementChild)) for (let t of e.querySelectorAll(r)) n.add(t);
		};
		for (let t of e) {
			for (let e of t.removedNodes) a(e, i);
			for (let e of t.addedNodes) a(e, n);
		}
		for (let e of i) e.isConnected || this.untrack(e);
		for (let e of n) e.isConnected && this.track(e);
	}
}, S = new x();
export { x as n, S as t };

//# sourceMappingURL=core.js.map