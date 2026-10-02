// Zero-dependency static file server for local play and the Playwright
// suite. The game is plain static files (GitHub Pages serves them as-is), so
// this only has to map URLs to files with the right Content-Type — but ES
// modules refuse to load from file://, which is why a server is needed at all.
//
//   npm run serve            → http://localhost:4173
//   PORT=8080 npm run serve
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "127.0.0.1";

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".gif": "image/gif",
    ".mp3": "audio/mpeg",
    ".ico": "image/x-icon",
};

async function resolveFile(urlPath) {
    let rel;
    try {
        rel = decodeURIComponent(urlPath.split("?")[0]);
    } catch {
        return null;
    }
    const full = normalize(join(ROOT, rel));
    // Refuse anything that escapes the repo root (../ traversal).
    if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
    try {
        const info = await stat(full);
        return info.isDirectory() ? join(full, "index.html") : full;
    } catch {
        return null;
    }
}

const server = createServer(async (req, res) => {
    const file = await resolveFile(req.url || "/");
    if (!file) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
        return;
    }
    try {
        const body = await readFile(file);
        res.writeHead(200, {
            "Content-Type": TYPES[extname(file)] || "application/octet-stream",
            "Cache-Control": "no-cache",
        });
        res.end(req.method === "HEAD" ? undefined : body);
    } catch {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Server Survival → http://${HOST}:${PORT}/`);
});
