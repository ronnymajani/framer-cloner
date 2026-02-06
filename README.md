# Cloning Your Framer Website (extractom.com.tr)

This guide provides multiple methods to clone your Framer website for static hosting.

## Why httrack Failed

Framer websites use extensive JavaScript to load content and images dynamically from their CDN (`framerusercontent.com`). Traditional scrapers like httrack can't execute JavaScript, so they miss most images and dynamic content.

## Recommended Methods

### Method 1: Python with requests-html (EASIEST)

**Best for**: Quick cloning with minimal setup

```bash
# Install dependencies
pip install requests-html

# Run the script
python3 clone_framer_site.py
```

**Pros**: 
- Simple to use
- Executes JavaScript
- Downloads all assets

**Cons**: 
- Slower than wget
- Requires Python dependencies

---

### Method 2: Node.js with Puppeteer (MOST RELIABLE)

**Best for**: Complete accuracy and control

```bash
# Install dependencies
npm init -y
npm install puppeteer

# Run the script
node clone_framer_puppeteer.js
```

**Pros**: 
- Uses real Chrome browser
- Perfect JavaScript rendering
- Most accurate results

**Cons**: 
- Larger dependency (Chromium download)
- Slower execution

---

### Method 3: wget (FASTEST, BUT LIMITED)

**Best for**: Quick download if you just need HTML structure

```bash
chmod +x clone_framer_site.sh
./clone_framer_site.sh
```

**Pros**: 
- Very fast
- No dependencies
- Simple

**Cons**: 
- May miss some JavaScript-loaded content
- Requires manual fixing of links

---

### Method 4: SingleFile Browser Extension (MANUAL)

**Best for**: One-page cloning or visual verification

1. Install SingleFile extension in Chrome/Firefox
2. Visit each page on extractom.com.tr
3. Click the SingleFile icon to save complete page
4. Repeat for each page you need

**Pros**: 
- Perfect capture of rendered page
- No coding required
- Visual verification

**Cons**: 
- Manual process for each page
- Time-consuming for large sites

---

## After Cloning

### Fix Absolute URLs

Framer assets use absolute URLs. You'll need to either:

1. **Keep the Framer CDN links** (requires internet)
2. **Replace framerusercontent.com URLs** with local paths:

```bash
# Example: Replace CDN URLs with local paths
find . -name "*.html" -type f -exec sed -i 's|https://framerusercontent.com|./assets|g' {} +
```

### Test Locally

```bash
cd extractom_static
python3 -m http.server 8000
# Visit http://localhost:8000
```

### Deploy to Static Hosting

Once cloned and tested, you can deploy to:
- **Netlify**: Drag & drop the folder
- **Vercel**: `vercel deploy`
- **GitHub Pages**: Push to gh-pages branch
- **AWS S3**: `aws s3 sync . s3://your-bucket/`

---

## Pages to Clone

Your main pages:
- `/` (Homepage)
- `/scfe` (Technology)
- `/products`
- `/blog`
- `/contact`
- `/privacy-policy`
- `/cookie-policy`
- `/brochure`

Plus any blog posts under `/blog/*`

---

## Troubleshooting

### Images Not Loading
- Check if images are still hosted on framerusercontent.com
- Verify image paths in the HTML match your local structure
- Check browser console for 404 errors

### JavaScript Not Working
- Some Framer animations/interactions may not work offline
- Consider keeping some Framer JS libraries
- Test each page individually

### Large File Sizes
- Framer sites can be 50-500MB due to images
- Consider optimizing images with tools like:
  - `imagemagick` for batch conversion
  - Online tools like TinyPNG
  - WebP conversion for better compression

---

## Alternative: Framer Export

If you have access to the Framer project file:
1. Open project in Framer
2. Go to Publish settings
3. Click "Export as HTML"
4. This gives you clean, optimized static files

---

## Need Help?

If you encounter issues:
1. Check the browser console for errors
2. Verify all assets downloaded correctly
3. Test in a clean browser (incognito mode)
4. Compare with live site side-by-side
