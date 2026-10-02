// Change-only HUD writes (src/ui/hud-dom.js): the per-frame HUD must not
// touch the DOM when a value is unchanged, and must when it changes.
import { describe, it, expect } from "vitest";
import { Window } from "happy-dom";
import { setClass, setHtml, setStyle, setText } from "../src/ui/hud-dom.js";

function el() {
    return new Window().document.createElement("div");
}

function countWrites(target, prop) {
    let writes = 0;
    let proto = Object.getPrototypeOf(target);
    while (proto && !Object.getOwnPropertyDescriptor(proto, prop)) proto = Object.getPrototypeOf(proto);
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    Object.defineProperty(target, prop, {
        configurable: true,
        get() { return desc.get.call(this); },
        set(v) { writes++; desc.set.call(this, v); },
    });
    return () => writes;
}

describe("hud-dom change-only writes", () => {
    it("setText writes once per distinct value and stringifies numbers", () => {
        const node = el();
        const writes = countWrites(node, "textContent");
        setText(node, 5);
        setText(node, 5);
        setText(node, "5");
        expect(node.textContent).toBe("5");
        expect(writes()).toBe(1);
        setText(node, 6);
        expect(writes()).toBe(2);
    });

    it("setClass and setStyle skip unchanged values", () => {
        const node = el();
        const classWrites = countWrites(node, "className");
        setClass(node, "a b");
        setClass(node, "a b");
        expect(classWrites()).toBe(1);
        setStyle(node, "width", "50%");
        setStyle(node, "width", "50%");
        expect(node.style.width).toBe("50%");
        setStyle(node, "width", "60%");
        expect(node.style.width).toBe("60%");
    });

    it("setHtml skips identical markup but rewrites after an external clear", () => {
        const node = el();
        const writes = countWrites(node, "innerHTML");
        setHtml(node, "<b>x</b>");
        setHtml(node, "<b>x</b>");
        expect(writes()).toBe(1);
        node.innerHTML = "";
        setHtml(node, "<b>x</b>");
        expect(node.innerHTML).toBe("<b>x</b>");
    });

    it("tolerates a missing element", () => {
        expect(() => {
            setText(null, "x");
            setClass(null, "x");
            setStyle(null, "width", "1px");
            setHtml(null, "x");
        }).not.toThrow();
    });
});
