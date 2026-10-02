// Tailwind build for the shipped UI (replaces the cdn.tailwindcss.com Play
// CDN, which Tailwind documents as development-only).
//
// The game has no build step at serve time: the compiled stylesheet is
// committed at vendor/tailwind/tailwind.css and GitHub Pages serves it as-is.
// Regenerate it with `npm run build:css` after changing classes; CI fails if
// the committed file is stale (`npm run check:css`).
//
// Every class must appear as a complete literal somewhere in `content` —
// Tailwind cannot see a class assembled at runtime (`"text-" + tone`).
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./index.html", "./game.js", "./src/**/*.js"],
    theme: { extend: {} },
    plugins: [],
};
