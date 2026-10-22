/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The packaged app loads index.html from disk, so lock it down with a strict
// Content-Security-Policy. It is only added to production builds because the
// Vite dev server needs inline scripts and a websocket for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'even-keel-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome130',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    restoreMocks: true,
  },
});
