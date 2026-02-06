// Clone Framer website using Puppeteer (headless Chrome)
// This properly executes JavaScript and captures all assets

const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const https = require("https");
const http = require("http");

const BASE_URL = "https://extractom.com.tr";
const OUTPUT_DIR = "./extractom_static";

// Pages to clone (add more as needed)
const PAGES = [
  "/",
  "/scfe",
  "/products",
  "/blog",
  "/contact",
  "/privacy-policy",
  "/cookie-policy",
  "/brochure",
];

// Track all downloaded assets to avoid duplicates
const downloadedAssets = new Map(); // url (without query) -> local relative path

async function downloadFile(url, filepath) {
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (response) => {
        // Follow redirects
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
 * Given a framerusercontent.com URL, return a local relative path for saving it.
 * Handles both /images/... and /sites/... paths, and strips query params for the filename.
 */
function getLocalAssetPath(framerUrl) {
  const parsed = new URL(framerUrl);
  // pathname like /images/ABC123.webp or /sites/xxx/chunk-ABC.mjs
  const pathname = parsed.pathname;

  // For images: /images/ABC.webp -> assets/images/ABC.webp
  // For sites: /sites/xxx/file.mjs -> assets/sites/xxx/file.mjs
  // Strip leading slash
  const relativePath = pathname.replace(/^\//, "");

  // For URLs with query params (e.g. ?scale-down-to=512), encode into filename
  if (parsed.search) {
    const ext = path.extname(pathname);
    const base = pathname.replace(/^\//, "").replace(ext, "");
    const paramSuffix = parsed.search.replace("?", "_").replace(/[=&]/g, "_");
    return path.join("assets", base + paramSuffix + ext);
  }

  return path.join("assets", relativePath);
}

/**
 * Download a framer asset and return the local relative path.
 * Deduplicates downloads.
 */
async function downloadAsset(url) {
  const localPath = getLocalAssetPath(url);
  const fullPath = path.join(OUTPUT_DIR, localPath);

  if (downloadedAssets.has(url)) {
    return downloadedAssets.get(url);
  }

  downloadedAssets.set(url, localPath);

  try {
    await downloadFile(url, fullPath);
  } catch (err) {
    console.error(`    Failed to download: ${url} - ${err.message}`);
  }

  return localPath;
}

/**
 * Find all framerusercontent.com URLs in the HTML content.
 */
function findFramerUrls(html) {
  const urlPattern = /https:\/\/framerusercontent\.com\/[^"'\s)}\]>]+/g;
  const matches = html.match(urlPattern) || [];
  return [...new Set(matches)];
}

/**
 * Replace all framerusercontent.com URLs in the HTML with local paths.
 * The `depth` parameter controls relative path prefix (e.g., "../" for nested pages).
 */
function rewriteHtml(html, urlMap, depth = 0) {
  const prefix = depth > 0 ? "../".repeat(depth) : "./";
  let result = html;

  // Sort URLs by length descending to avoid partial replacements
  const sortedUrls = [...urlMap.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );

  for (const [originalUrl, localPath] of sortedUrls) {
    // Replace all occurrences
    result = result.split(originalUrl).join(prefix + localPath);
  }

  return result;
}

async function clonePage(browser, pagePath) {
  const page = await browser.newPage();
  const url = BASE_URL + pagePath;

  console.log(`\nCloning: ${url}`);

  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });

  // Navigate to page
  await page.goto(url, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });

  // Wait for images to load
  await page.waitForTimeout(3000);

  // Get page content
  let content = await page.content();

  // Find all framer URLs in the page
  const framerUrls = findFramerUrls(content);
  console.log(`  Found ${framerUrls.length} framer asset URLs`);

  // Download all assets and build URL map
  const urlMap = new Map();
  for (const assetUrl of framerUrls) {
    const localPath = await downloadAsset(assetUrl);
    urlMap.set(assetUrl, localPath);
  }

  // Calculate depth for relative paths
  const depth = pagePath === "/" ? 0 : (pagePath.match(/\//g) || []).length - 1;

  // Rewrite HTML to use local paths
  content = rewriteHtml(content, urlMap, depth);

  // Save HTML
  const filename =
    pagePath === "/" ? "index.html" : pagePath.replace(/^\//, "") + ".html";
  const filepath = path.join(OUTPUT_DIR, filename);
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, content);

  console.log(`  Saved: ${filename}`);
  console.log(`  Downloaded ${urlMap.size} assets`);

  await page.close();
}

async function main() {
  console.log("Starting Framer site clone...\n");

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Launch browser
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // Clone each page
  for (const pagePath of PAGES) {
    try {
      await clonePage(browser, pagePath);
    } catch (err) {
      console.error(`Error cloning ${pagePath}:`, err.message);
    }
  }

  await browser.close();

  console.log(`\n✓ Clone complete!`);
  console.log(`  Total unique assets downloaded: ${downloadedAssets.size}`);
  console.log(`\nWebsite saved to: ${OUTPUT_DIR}`);
  console.log("\nTo serve locally:");
  console.log(`  cd ${OUTPUT_DIR} && python3 -m http.server 8000`);
}

main().catch(console.error);
