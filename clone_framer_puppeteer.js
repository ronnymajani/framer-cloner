#!/usr/bin/env node

// Framer Cloner — Clone any Framer website into a fully static, self-contained site.
//
// Uses the raw server-rendered HTML (not a headless browser). Framer fully SSR-renders
// all content including CMS data, so the HTML is complete. By preserving the SSR HTML,
// React hydration works correctly and Framer Motion animations are retained.
//
// Usage: node clone_framer_puppeteer.js <url>

const fs = require("fs").promises;
const path = require("path");
const https = require("https");
const http = require("http");

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------
const siteUrl = process.argv[2];

if (!siteUrl) {
  console.error("Usage: node clone_framer_puppeteer.js <url>");
  console.error(
    'Example: node clone_framer_puppeteer.js "https://extractom.com.tr"',
  );
  process.exit(1);
}

const parsed = new URL(siteUrl);
const BASE_URL = parsed.origin;
const escapedBaseUrl = BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Derive output directory: out/<host_with_underscores> (append _2, _3, etc. if it exists)
const sanitizedHost = parsed.host.replace(/[^a-zA-Z0-9]/g, "_");
let OUTPUT_DIR = path.join("out", sanitizedHost);
try {
  require("fs").accessSync(OUTPUT_DIR);
  let n = 2;
  while (true) {
    const candidate = path.join("out", `${sanitizedHost}_${n}`);
    try {
      require("fs").accessSync(candidate);
      n++;
    } catch {
      OUTPUT_DIR = candidate;
      break;
    }
  }
} catch {
  // directory doesn't exist yet, use as-is
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const downloadedAssets = new Map(); // framer url -> local relative path
const clonedPages = new Set();
const pageQueue = [];

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return fetchUrl(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function downloadFile(url, filepath) {
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          return downloadFile(response.headers.location, filepath)
            .then(resolve)
            .catch(reject);
        }
        if (response.statusCode === 200) {
          const fileStream = require("fs").createWriteStream(filepath);
          response.pipe(fileStream);
          fileStream.on("finish", () => {
            fileStream.close();
            resolve();
          });
        } else {
          reject(
            new Error(`Failed to download (${response.statusCode}): ${url}`),
          );
        }
      })
      .on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Asset helpers
// ---------------------------------------------------------------------------

function getLocalAssetPath(framerUrl) {
  const u = new URL(framerUrl);
  const pathname = u.pathname;

  if (u.search) {
    const ext = path.extname(pathname);
    const base = pathname.replace(/^\//, "").replace(ext, "");
    const paramSuffix = u.search.replace("?", "_").replace(/[=&]/g, "_");
    return path.join("assets", base + paramSuffix + ext);
  }

  return path.join("assets", pathname.replace(/^\//, ""));
}

async function downloadAsset(url) {
  if (downloadedAssets.has(url)) {
    return downloadedAssets.get(url);
  }

  const localPath = getLocalAssetPath(url);
  downloadedAssets.set(url, localPath);

  try {
    await downloadFile(url, path.join(OUTPUT_DIR, localPath));
  } catch (err) {
    console.error(`    Failed: ${url} — ${err.message}`);
  }

  return localPath;
}

function findFramerUrls(text) {
  const re = /https:\/\/framerusercontent\.com\/[^"'\s)}\]>]+/g;
  const matches = text.match(re) || [];
  return [...new Set(matches)].filter((u) => !u.endsWith("/"));
}

// ---------------------------------------------------------------------------
// Page path helpers
// ---------------------------------------------------------------------------

function pagePathToFile(pagePath) {
  if (pagePath === "/") return "index.html";
  return pagePath.replace(/^\//, "") + ".html";
}

function getPageDepth(pagePath) {
  if (pagePath === "/") return 0;
  return pagePath.replace(/^\//, "").split("/").length - 1;
}

function discoverLinks(html) {
  const paths = new Set();
  let m;

  const relRe = /href="\.\/([^"#]*?)"/g;
  while ((m = relRe.exec(html)) !== null) {
    const p = m[1];
    if (!p || p.startsWith("assets/") || p.includes("://")) continue;
    paths.add("/" + p);
  }

  const absRe = new RegExp(`href="${escapedBaseUrl}(/[^"#]*?)"`, "g");
  while ((m = absRe.exec(html)) !== null) {
    const p = m[1];
    if (p && p !== "/") paths.add(p);
  }

  const rootRe = new RegExp(`href="${escapedBaseUrl}/?"`, "g");
  while ((m = rootRe.exec(html)) !== null) {
    paths.add("/");
  }

  return [...paths];
}

function enqueue(pagePath) {
  if (clonedPages.has(pagePath)) return;
  if (pageQueue.includes(pagePath)) return;
  pageQueue.push(pagePath);
}

// ---------------------------------------------------------------------------
// HTML rewriting
// ---------------------------------------------------------------------------

function rewriteHtml(html, assetUrlMap, allPagePaths, depth) {
  const prefix = depth > 0 ? "../".repeat(depth) : "./";
  let result = html;

  // 1. Framer asset URLs → local (longest first)
  const sorted = [...assetUrlMap.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [original, local] of sorted) {
    result = result.split(original).join(prefix + local);
  }

  // 2. Internal page links → .html (longest path first)
  const sortedPaths = [...allPagePaths].sort((a, b) => b.length - a.length);
  for (const pagePath of sortedPaths) {
    const clean = pagePath.replace(/^\//, "");
    if (!clean) continue;

    result = result
      .split(`href="./${clean}"`)
      .join(`href="${prefix}${clean}.html"`);

    result = result
      .split(`href="${BASE_URL}/${clean}"`)
      .join(`href="${prefix}${clean}.html"`);
  }

  // 3. Root links
  result = result.replace(/href="\.\/"/g, `href="${prefix}index.html"`);
  const rootRe = new RegExp(`href="${escapedBaseUrl}/?"`, "g");
  result = result.replace(rootRe, `href="${prefix}index.html"`);

  // 4. Anchor links on root
  result = result.replace(
    /href="\.\/(#[^"]+)"/g,
    `href="${prefix}index.html$1"`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Patch Framer scripts — keep JS for animations, disable SPA router
// ---------------------------------------------------------------------------

function patchFramerScripts(html) {
  let result = html;

  // Remove Framer analytics
  result = result.replace(
    /<script[^>]*src="https:\/\/events\.framer\.com\/[^"]*"[^>]*><\/script>/g,
    "",
  );

  // 1. Fetch interceptor for CMS data files (.framercms). Returns a never-resolving
  //    promise so React Suspense keeps the SSR DOM intact (treats it as "still loading").
  //    This preserves all pre-rendered CMS content AND Framer Motion animations.
  // 2. Capture-phase click interceptor forces full page loads for cross-page links,
  //    running BEFORE the Framer SPA router can intercept and try client-side navigation.
  // 3. pushState override as fallback for programmatic navigation.
  const routerPatch = `<script>(function(){` +
    // Fetch interceptor — never-resolving promise for CMS data
    `var _f=window.fetch;window.fetch=function(u,o){` +
    `var s=typeof u==="string"?u:(u&&u.url||"");` +
    `if(s.indexOf(".framercms")!==-1)return new Promise(function(){});` +
    `return _f.call(this,u,o)};` +
    // Capture-phase click interceptor — runs before SPA router
    `document.addEventListener("click",function(e){` +
    `var a=e.target.closest("a");if(!a)return;` +
    `var h=a.getAttribute("href");if(!h||h.startsWith("#"))return;` +
    `try{var u=new URL(h,location.href);` +
    `if(u.origin===location.origin&&u.pathname!==location.pathname){` +
    `e.preventDefault();e.stopPropagation();location.href=h}` +
    `}catch(x){}},true);` +
    // pushState override as fallback
    `var p=history.pushState;history.pushState=function(s,t,u){` +
    `if(u){var n=new URL(u,location.href);` +
    `if(n.pathname!==location.pathname){location.href=u;return}}` +
    `p.call(this,s,t,u)}` +
    `})()</script>`;

  // Inject early in <head> so it runs before any module scripts
  result = result.replace("<head>", "<head>" + routerPatch);

  // Fix locale redirect script: new URL(e) on relative hrefs needs a base
  result = result.replace(
    /let t=new URL\(e\)/g,
    "let t=new URL(e,location.href)",
  );
  result = result.replace(
    /new URL\(r\)\.hostname/g,
    "new URL(r,location.href).hostname",
  );

  return result;
}

// ---------------------------------------------------------------------------
// Clone a single page (HTTP fetch — preserves SSR HTML for hydration)
// ---------------------------------------------------------------------------

async function clonePage(pagePath) {
  if (clonedPages.has(pagePath)) return;
  clonedPages.add(pagePath);

  const url = BASE_URL + pagePath;
  console.log(`\nCloning: ${url}`);

  let content;
  try {
    content = await fetchUrl(url);
  } catch (err) {
    console.error(`  Failed to fetch: ${err.message}`);
    clonedPages.delete(pagePath);
    return;
  }

  // Discover & enqueue linked pages
  for (const link of discoverLinks(content)) {
    if (!clonedPages.has(link)) {
      enqueue(link);
      console.log(`  Discovered: ${link}`);
    }
  }

  // Download framer assets referenced in the HTML
  const framerUrls = findFramerUrls(content);
  console.log(`  Assets: ${framerUrls.length}`);

  const assetUrlMap = new Map();
  for (const u of framerUrls) {
    assetUrlMap.set(u, await downloadAsset(u));
  }

  // Rewrite URLs (pages known so far — finalized later)
  const allPaths = [...clonedPages, ...pageQueue];
  content = rewriteHtml(content, assetUrlMap, allPaths, getPageDepth(pagePath));

  // Patch Framer scripts for static hosting
  content = patchFramerScripts(content);

  // Save
  const filename = pagePathToFile(pagePath);
  const filepath = path.join(OUTPUT_DIR, filename);
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, content);
  console.log(`  Saved: ${filename}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Framer Cloner`);
  console.log(`Source : ${BASE_URL}`);
  console.log(`Output : ${OUTPUT_DIR}\n`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Seed with the homepage — every reachable page will be discovered from there
  enqueue("/");

  // Crawl until the queue is empty
  while (pageQueue.length > 0) {
    const pagePath = pageQueue.shift();
    try {
      await clonePage(pagePath);
    } catch (err) {
      console.error(`Error cloning ${pagePath}: ${err.message}`);
    }
  }

  // Re-process all pages so link rewriting covers the full set of discovered pages
  console.log("\nFinalizing link rewriting...");
  const allPaths = [...clonedPages];
  for (const pagePath of allPaths) {
    const filename = pagePathToFile(pagePath);
    const filepath = path.join(OUTPUT_DIR, filename);
    try {
      let content = await fs.readFile(filepath, "utf-8");
      const depth = getPageDepth(pagePath);
      const prefix = depth > 0 ? "../".repeat(depth) : "./";

      const sortedPaths = [...allPaths].sort((a, b) => b.length - a.length);
      for (const otherPath of sortedPaths) {
        const clean = otherPath.replace(/^\//, "");
        if (!clean) continue;

        content = content
          .split(`href="./${clean}"`)
          .join(`href="${prefix}${clean}.html"`);

        content = content
          .split(`href="${BASE_URL}/${clean}"`)
          .join(`href="${prefix}${clean}.html"`);
      }

      content = content.replace(/href="\.\/"/g, `href="${prefix}index.html"`);
      const rootRe = new RegExp(`href="${escapedBaseUrl}/?"`, "g");
      content = content.replace(rootRe, `href="${prefix}index.html"`);
      content = content.replace(
        /href="\.\/(#[^"]+)"/g,
        `href="${prefix}index.html$1"`,
      );

      await fs.writeFile(filepath, content);
    } catch {
      // skip if file doesn't exist
    }
  }

  // Post-process downloaded JS bundles: download assets referenced inside them
  // (fonts, images) and rewrite URLs to local paths.
  console.log("\nPost-processing JS bundles...");
  const assetsDir = path.join(OUTPUT_DIR, "assets");
  const mjsFiles = [];
  async function findMjs(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await findMjs(full);
      else if (entry.name.endsWith(".mjs")) mjsFiles.push(full);
    }
  }
  await findMjs(assetsDir).catch(() => {});

  for (const mjsFile of mjsFiles) {
    let content = await fs.readFile(mjsFile, "utf-8");
    let modified = false;

    // Download and rewrite any framerusercontent.com URLs (images, fonts)
    const framerUrls = findFramerUrls(content);
    if (framerUrls.length > 0) {
      const urlMap = new Map();
      for (const u of framerUrls) {
        urlMap.set(u, await downloadAsset(u));
      }

      const mjsDir = path.dirname(mjsFile);
      const relToOutput = path.relative(mjsDir, OUTPUT_DIR);
      const sorted = [...urlMap.entries()].sort(
        (a, b) => b[0].length - a[0].length,
      );
      for (const [original, local] of sorted) {
        content = content.split(original).join(relToOutput + "/" + local);
      }
      modified = true;
    }

    // Stub the editor bar import (fails on static hosts, crashes hydration)
    if (content.includes("edit.framer.com")) {
      content = content.replace(
        /import\("https:\/\/edit\.framer\.com\/init\.mjs"\)/g,
        "Promise.resolve({createEditorBar:()=>()=>null})",
      );
      modified = true;
    }

    // Fix new URL("./file.framercms","../relative/base") — the second arg
    // must be absolute. Wrap with new URL(base, import.meta.url) so it
    // resolves correctly when served from any host.
    if (/new URL\("\.\/[^"]+","\.\.\//.test(content)) {
      content = content.replace(
        /new URL\("(\.\/.+?)","(\.\.\/.+?)"\)/g,
        'new URL("$1",new URL("$2",import.meta.url))',
      );
      modified = true;
    }

    // NOTE: Individual CMS patches (scanItems, loadModel, lookupItems, compression
    // dict, batch fetch) are NOT needed. The HTML fetch interceptor returns a
    // never-resolving promise for .framercms URLs, so CMS code never reaches
    // error paths — React Suspense keeps SSR DOM intact.

    if (modified) {
      await fs.writeFile(mjsFile, content);
    }
  }
  console.log(`  Processed ${mjsFiles.length} JS bundles`);

  console.log(`\n✓ Clone complete!`);
  console.log(`  Pages cloned: ${clonedPages.size}`);
  console.log(`  Assets downloaded: ${downloadedAssets.size}`);
  console.log(`\nTo serve locally:`);
  console.log(`  npm run serve`);
}

main().catch(console.error);
