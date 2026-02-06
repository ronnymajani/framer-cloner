# Framer Cloner

Clone any [Framer](https://www.framer.com/) website into a fully static, self-contained site that can be hosted anywhere.

Framer sites rely heavily on JavaScript rendering and load images from `framerusercontent.com`. Traditional scrapers like wget or httrack can't handle this. Framer Cloner uses a headless browser to render every page, then downloads all assets and rewrites every URL so the result works completely offline.

## Why

I needed to move a Framer site to static hosting and quickly discovered there are no free tools that can do this properly. Framer sites are JavaScript-heavy SPAs that load everything dynamically from their CDN, so traditional scrapers just produce broken pages with missing images. After getting frustrated with wget, httrack, and various online "website downloaders" all failing, I wrote this simple script with the help of Claude to just get it done.

## What it does

- Renders each page with a real Chrome browser (via Puppeteer)
- Crawls the site automatically starting from the homepage — no need to list pages manually
- Discovers CMS / detail pages (e.g. `/products/some-item`, `/blog/some-post`)
- Downloads all images, JS bundles, and other assets from `framerusercontent.com`
- Rewrites HTML so every link and asset reference points to a local file
- Converts SPA-style navigation links (`./products`) to static file links (`./products.html`)
- Handles responsive `srcset` image variants (`?scale-down-to=512`, etc.)

## Requirements

- [Node.js](https://nodejs.org/) (v18+)
- Google Chrome or Chromium

Puppeteer installs a bundled Chromium automatically during `npm install`. The script will also detect and prefer a local Chrome or Chromium installation if available. If the bundled browser fails to launch (e.g. compatibility issues on newer macOS), you can install a fresh one with:

```bash
npx @puppeteer/browsers install chrome@stable
```

## Setup

```bash
git clone https://github.com/ronnymajani/framer-cloner
cd framer-cloner
npm install
```

## Usage

```bash
npm run clone "https://example.com"
```

The cloned site is saved to `out/<domain>/`, for example:

```
out/example_com/
  index.html
  products.html
  products/
    some-item.html
  blog/
    some-post.html
  assets/
    images/
    sites/
```

Serve it locally to verify:

```bash
cd out/example_com
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

The output is plain static HTML/CSS/JS. Host it anywhere:

- **Netlify** — drag and drop the output folder
- **Vercel** — `cd out/example_com && vercel deploy`
- **GitHub Pages** — push the output folder to a `gh-pages` branch
- **AWS S3** — `aws s3 sync out/example_com s3://your-bucket/`
- **Any web server** — just serve the folder

## Status

This tool works as of February 2026. Framer may change their hosting infrastructure or asset delivery at any time, which could require updates to this tool.

## Limitations

- Only clones pages reachable via `<a href>` links from the homepage. Pages that require JavaScript interaction (e.g. infinite scroll, "load more" buttons) to reveal links may be missed.
- Framer animations (scroll, hover, entrance) are preserved via the original JS bundles. The SPA router is patched so navigation does normal page loads instead of client-side routing. Some complex interactions may not work identically outside of Framer's hosting.
- Very large sites will take a while since each page is rendered in a real browser.

## License

MIT
