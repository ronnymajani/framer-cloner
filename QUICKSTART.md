# Quick Start with Bun 🚀

The fastest way to clone your Framer website!

## 1. Install Bun (if needed)
```bash
curl -fsSL https://bun.sh/install | bash
```

## 2. Install dependencies
```bash
bun install
```

## 3. Run the cloner
```bash
bun run clone
```

That's it! Your website will be saved to `./extractom_static/`

## 4. Test locally
```bash
bun run serve
# Visit http://localhost:8000
```

## What Gets Cloned?

✅ All HTML pages  
✅ All images from Framer CDN  
✅ JavaScript-rendered content  
✅ Dynamic elements  
✅ Videos and assets  

## Customization

Want to clone additional pages? Edit the `PAGES` array in `clone_framer_puppeteer.js`:

```javascript
const PAGES = [
  '/',
  '/scfe',
  '/products',
  '/blog',
  '/your-custom-page',  // Add more pages here
];
```

## Why Bun?

- ⚡ 3-4x faster than Node.js
- 📦 Built-in package manager
- 🔥 Hot reloading support
- 🎯 Drop-in Node.js replacement
- 💾 Lower memory usage

## Troubleshooting

**"bun: command not found"**
- Restart your terminal after installing Bun
- Or run: `source ~/.bashrc` (Linux) or `source ~/.zshrc` (Mac)

**Puppeteer download fails**
- Run: `bun install puppeteer --force`
- This will re-download Chromium

**Images still loading from Framer CDN**
- This is normal! The HTML references the CDN
- Downloaded images are in `./extractom_static/assets/`
- You can modify HTML to use local images if needed

## Next Steps

Once cloned, deploy to:
- **Vercel**: `vercel deploy`
- **Netlify**: Drag & drop the folder
- **Cloudflare Pages**: Connect via Git
- **Your own server**: Upload via FTP/SSH

Enjoy your blazing-fast static site! 🎉
