#!/usr/bin/env node

// Framer Cloner — Clone any Framer website into a fully static, self-contained site.
// Usage: node clone_framer_puppeteer.js <url>

const puppeteer = require("puppeteer");
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
const BASE_URL = parsed.origin; // e.g. https://extractom.com.tr

// Derive output directory: out/<host_with_underscores>
const sanitizedHost = parsed.host.replace(/[^a-zA-Z0-9]/g, "_");
const OUTPUT_DIR = path.join("out", sanitizedHost);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const downloadedAssets = new Map(); // framer url -> local relative path
const clonedPages = new Set(); // page paths already cloned
const pageQueue = []; // pages waiting to be cloned

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Map a framerusercontent.com URL to a local path under assets/.
 * Query params (e.g. ?scale-down-to=512) are encoded into the filename.
 */
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

function findFramerUrls(html) {
  const re = /https:\/\/framerusercontent\.com\/[^"'\s)}\]>]+/g;
  return [...new Set(html.match(re) || [])];
}

function pagePathToFile(pagePath) {
  if (pagePath === "/") return "index.html";
  return pagePath.replace(/^\//, "") + ".html";
}

function getPageDepth(pagePath) {
  if (pagePath === "/") return 0;
  return pagePath.replace(/^\//, "").split("/").length - 1;
}

/**
 * Scan the rendered HTML for internal links (href="./…") and return page paths.
 */
function discoverLinks(html) {
  const re = /href="\.\/([^"#]*?)"/g;
  const paths = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const p = m[1];
    if (!p || p.startsWith("assets/") || p.includes("://")) continue;
    paths.add("/" + p);
  }
  return [...paths];
}

/**
 * Enqueue a page path for cloning if it hasn't been cloned or queued yet.
 */
function enqueue(pagePath) {
  if (clonedPages.has(pagePath)) return;
  if (pageQueue.includes(pagePath)) return;
  pageQueue.push(pagePath);
}

// ---------------------------------------------------------------------------
// Rewrite HTML
// ---------------------------------------------------------------------------

function rewriteHtml(html, assetUrlMap, allPagePaths, depth) {
  const prefix = depth > 0 ? "../".repeat(depth) : "./";
  let result = html;

  // 1. Framer asset URLs → local (longest first to avoid partial matches)
  const sorted = [...assetUrlMap.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [original, local] of sorted) {
    result = result.split(original).join(prefix + local);
  }

  // 2. Internal page links → .html (longest path first to avoid partial matches)
  const sortedPaths = [...allPagePaths].sort((a, b) => b.length - a.length);
  for (const pagePath of sortedPaths) {
    const clean = pagePath.replace(/^\//, "");
    if (!clean) continue;
    result = result
      .split(`href="./${clean}"`)
      .join(`href="${prefix}${clean}.html"`);
  }

  // 3. Root link: href="./" → index.html
  result = result.replace(/href="\.\/"/g, `href="${prefix}index.html"`);

  // 4. Anchor links on root: href="./#x" → index.html#x
  result = result.replace(
    /href="\.\/(#[^"]+)"/g,
    `href="${prefix}index.html$1"`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Clone a single page
// ---------------------------------------------------------------------------

async function clonePage(browser, pagePath) {
  if (clonedPages.has(pagePath)) return;
  clonedPages.add(pagePath);

  const page = await browser.newPage();
  const url = BASE_URL + pagePath;
  console.log(`\nCloning: ${url}`);

  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForTimeout(3000);

  let content = await page.content();

  // Discover & enqueue linked pages
  for (const link of discoverLinks(content)) {
    if (!clonedPages.has(link)) {
      enqueue(link);
      console.log(`  Discovered: ${link}`);
    }
  }

  // Download framer assets
  const framerUrls = findFramerUrls(content);
  console.log(`  Assets: ${framerUrls.length}`);

  const assetUrlMap = new Map();
  for (const u of framerUrls) {
    assetUrlMap.set(u, await downloadAsset(u));
  }

  // Rewrite (using all pages known so far — will be fixed up later)
  const allPaths = [...clonedPages, ...pageQueue];
  content = rewriteHtml(content, assetUrlMap, allPaths, getPageDepth(pagePath));

  // Save
  const filename = pagePathToFile(pagePath);
  const filepath = path.join(OUTPUT_DIR, filename);
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, content);
  console.log(`  Saved: ${filename}`);

  await page.close();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Framer Cloner`);
  console.log(`Source : ${BASE_URL}`);
  console.log(`Output : ${OUTPUT_DIR}\n`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Try local Chrome first (bundled Chromium may be too old for newer macOS),
  // then fall back to Puppeteer's bundled Chromium.
  const chromeArgs = ["--no-sandbox", "--disable-setuid-sandbox"];
  const chromePaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  const localChrome =
    chromeArgs &&
    chromePaths.find((p) => {
      try {
        require("fs").accessSync(p);
        return true;
      } catch {
        return false;
      }
    });

  const launchOptions = {
    headless: "new",
    args: chromeArgs,
  };
  if (localChrome) {
    launchOptions.executablePath = localChrome;
    console.log(`Using: ${localChrome}`);
  }

  const browser = await puppeteer.launch(launchOptions);

  // Seed with the homepage — every reachable page will be discovered from there
  enqueue("/");

  // Crawl until the queue is empty
  while (pageQueue.length > 0) {
    const pagePath = pageQueue.shift();
    try {
      await clonePage(browser, pagePath);
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

      // Fix links that point to pages discovered after this page was first written
      const sortedPaths = [...allPaths].sort((a, b) => b.length - a.length);
      for (const otherPath of sortedPaths) {
        const clean = otherPath.replace(/^\//, "");
        if (!clean) continue;
        content = content
          .split(`href="./${clean}"`)
          .join(`href="${prefix}${clean}.html"`);
      }

      // Root & anchor links
      content = content.replace(/href="\.\/"/g, `href="${prefix}index.html"`);
      content = content.replace(
        /href="\.\/(#[^"]+)"/g,
        `href="${prefix}index.html$1"`,
      );

      await fs.writeFile(filepath, content);
    } catch {
      // skip if file doesn't exist
    }
  }

  await browser.close();

  console.log(`\n✓ Clone complete!`);
  console.log(`  Pages cloned: ${clonedPages.size}`);
  console.log(`  Assets downloaded: ${downloadedAssets.size}`);
  console.log(`\nTo serve locally:`);
  console.log(`  cd ${OUTPUT_DIR} && python3 -m http.server 8000`);
}

main().catch(console.error);
