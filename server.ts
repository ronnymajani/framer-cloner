// Simple static file server for testing your cloned Framer site
// Run with: bun run server.ts

const server = Bun.serve({
  port: 8000,
  
  async fetch(req) {
    const url = new URL(req.url);
    let filepath = url.pathname;
    
    // Default to index.html for root
    if (filepath === '/') {
      filepath = '/index.html';
    }
    
    // Add .html extension if missing
    if (!filepath.includes('.')) {
      filepath += '.html';
    }
    
    try {
      const file = Bun.file('./extractom_static' + filepath);
      
      if (await file.exists()) {
        return new Response(file);
      }
      
      // Try without .html extension
      const fileWithoutExt = Bun.file('./extractom_static' + url.pathname);
      if (await fileWithoutExt.exists()) {
        return new Response(fileWithoutExt);
      }
      
      // 404
      return new Response('404 Not Found', { status: 404 });
      
    } catch (error) {
      return new Response('Error: ' + error.message, { status: 500 });
    }
  },
});

console.log(`🚀 Server running at http://localhost:${server.port}`);
console.log(`📁 Serving from: ./extractom_static/`);
console.log(`\nPress Ctrl+C to stop`);
