// Change-only DOM writes for the per-frame HUD.
//
// animate() refreshes ~40 HUD values every frame. Most of them are unchanged
// from the previous frame, yet each assignment still dirties the element and
// costs the browser a style/layout pass. These helpers compare first and only
// write on a real change. They read textContent/className/style, never
// innerText, because reading innerText forces a synchronous layout.

export function setText(el, text) {
    if (!el) return;
    const value = String(text);
    if (el.textContent !== value) el.textContent = value;
}

export function setClass(el, className) {
    if (el && el.className !== className) el.className = className;
}

export function setStyle(el, prop, value) {
    if (el && el.style[prop] !== value) el.style[prop] = value;
}

const lastHtml = new WeakMap();

// innerHTML cannot be compared by reading it back (the browser normalises the
// markup), so remember what was last written per element instead.
export function setHtml(el, html) {
    if (!el) return;
    if (lastHtml.get(el) === html && el.innerHTML !== "") return;
    lastHtml.set(el, html);
    el.innerHTML = html;
}
