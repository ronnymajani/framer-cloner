#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const dir = process.argv[2];
if (!dir) {
  // Find the first directory inside out/
  const outDir = path.join(__dirname, "out");
  if (!fs.existsSync(outDir)) {
    console.error("No out/ directory found. Run `npm run clone` first.");
    process.exit(1);
  }
  const entries = fs.readdirSync(outDir, { withFileTypes: true });
  const firstDir = entries.find((e) => e.isDirectory());
  if (!firstDir) {
    console.error("No cloned site found in out/. Run `npm run clone` first.");
    process.exit(1);
  }
  var ROOT = path.join(outDir, firstDir.name);
} else {
  var ROOT = path.resolve(dir);
}

let PORT = parseInt(process.env.PORT || "3000", 10);

function handler(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  if (!path.extname(urlPath)) urlPath += ".html";

  const filePath = path.join(ROOT, urlPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      const rawPath = path.join(
        ROOT,
        decodeURIComponent(req.url.split("?")[0]),
      );
      fs.readFile(rawPath, (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }
        const ext = path.extname(rawPath).toLowerCase();
        res.writeHead(200, {
          "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    });
    res.end(data);
  });
}

function tryListen(port) {
  const s = http.createServer(handler);
  s.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      tryListen(port + 1);
    } else {
      throw err;
    }
  });
  s.listen(port, () => {
    console.log(`Serving ${ROOT}`);
    console.log(`Open http://localhost:${port}`);
  });
}

tryListen(PORT);
