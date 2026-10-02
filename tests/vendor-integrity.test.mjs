// The page ships its own copies of three.js and the compiled Tailwind CSS
// (vendor/). These checks keep that promise honest: index.html pulls no
// script or stylesheet from a third-party origin, the three.js integrity
// hash matches the committed bytes, and the vendored build is the r128 the
// whole codebase (and the THREE test stub) is written against.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const html = readFileSync(join(ROOT, "index.html"), "utf8");

describe("vendored front-end dependencies", () => {
    it("index.html loads no script or stylesheet from another origin", () => {
        const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
        const sheets = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
        const external = [...scripts, ...sheets].filter((url) => /^(https?:)?\/\//.test(url));
        expect(external).toEqual([]);
        expect(html).not.toContain("cdn.tailwindcss.com");
        expect(html).not.toContain("cdnjs.cloudflare.com");
    });

    it("every local script and stylesheet index.html references exists", () => {
        const refs = [
            ...[...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]),
            ...[...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]),
        ].filter((url) => !/^(https?:)?\/\//.test(url));
        expect(refs.length).toBeGreaterThan(0);
        for (const ref of refs) expect(existsSync(join(ROOT, ref)), ref).toBe(true);
    });

    it("the three.js integrity attribute matches the vendored file", () => {
        const tag = html.match(/<script[^>]*src="vendor\/three\/three\.min\.js"[^>]*>/s);
        expect(tag, "three.js script tag").not.toBeNull();
        const integrity = tag[0].match(/integrity="(sha384-[^"]+)"/)?.[1];
        const bytes = readFileSync(join(ROOT, "vendor/three/three.min.js"));
        const actual = "sha384-" + createHash("sha384").update(bytes).digest("base64");
        expect(integrity).toBe(actual);
    });

    it("the vendored three.js is r128 and ships with its licence", () => {
        const src = readFileSync(join(ROOT, "vendor/three/three.min.js"), "utf8");
        expect(src).toMatch(/="128"/);
        expect(readFileSync(join(ROOT, "vendor/three/LICENSE"), "utf8")).toMatch(/MIT/i);
    });

    it("the compiled Tailwind stylesheet is present and carries the utilities the HUD uses", () => {
        const css = readFileSync(join(ROOT, "vendor/tailwind/tailwind.css"), "utf8");
        for (const cls of ["pointer-events-auto", "text-green-400", "rounded-xl", "hidden"]) {
            expect(css, cls).toContain(`.${cls}`);
        }
    });
});
