// Clone Framer website using Puppeteer with Bun
// This properly executes JavaScript and captures all assets

import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'https://extractom.com.tr';
const OUTPUT_DIR = './extractom_static';

// Pages to clone (add more as needed)
const PAGES = [
  '/',
  '/scfe',
  '/products',
  '/blog',
  '/contact',
  '/privacy-policy',
  '/cookie-policy',
  '/brochure'
];

async function downloadFile(url, filepath) {
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(filepath, arrayBuffer);
  } catch (error) {
    throw error;
  }
}

async function clonePage(browser, pagePath) {
  const page = await browser.newPage();
  const url = BASE_URL + pagePath;
  
  console.log(`Cloning: ${url}`);
  
  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Navigate to page
  await page.goto(url, { 
    waitUntil: 'networkidle0',
    timeout: 60000 
  });
  
  // Wait for images to load
  await page.waitForTimeout(3000);
  
  // Get all image URLs
  const imageUrls = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.map(img => img.src).filter(src => src);
  });
  
  // Get page content
  const content = await page.content();
  
  // Save HTML
  const filename = pagePath === '/' ? 'index.html' : pagePath.replace(/^\//, '') + '.html';
  const filepath = path.join(OUTPUT_DIR, filename);
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, content);
  
  console.log(`  Saved HTML: ${filename}`);
  console.log(`  Found ${imageUrls.length} images`);
  
  // Download images
  for (const imgUrl of imageUrls) {
    try {
      if (imgUrl.includes('framerusercontent.com')) {
        const imgPath = new URL(imgUrl).pathname;
        const localPath = path.join(OUTPUT_DIR, 'images', imgPath);
        await downloadFile(imgUrl, localPath);
        console.log(`    Downloaded: ${path.basename(imgPath)}`);
      }
    } catch (err) {
      console.error(`    Failed to download: ${imgUrl}`);
    }
  }
  
  await page.close();
}

async function main() {
  console.log('Starting Framer site clone...\n');
  
  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
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
  
  console.log('\n✓ Clone complete!');
  console.log(`\nWebsite saved to: ${OUTPUT_DIR}`);
  console.log('\nTo serve locally:');
  console.log(`  cd ${OUTPUT_DIR} && python3 -m http.server 8000`);
}

main().catch(console.error);
