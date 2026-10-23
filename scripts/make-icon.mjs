// Renders the app icon (build/icon.png and build/icon.ico) from an inline SVG.
// Run with: npm run icon
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import pngToIco from 'png-to-ico';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a7d71"/>
      <stop offset="1" stop-color="#185850"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#g)"/>
  <path d="M120 212 H392" stroke="#ffffff" stroke-width="40" stroke-linecap="round" fill="none"/>
  <path d="M140 282 C 166 352, 210 388, 256 388 C 302 388, 346 352, 372 282" stroke="#ffffff" stroke-width="40" stroke-linecap="round" fill="none"/>
</svg>`;

const outDir = path.resolve('build');
fs.mkdirSync(outDir, { recursive: true });

function render(size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

fs.writeFileSync(path.join(outDir, 'icon.png'), render(1024)); // macOS wants 1024px
const icoSizes = [16, 24, 32, 48, 64, 128, 256].map(render);
fs.writeFileSync(path.join(outDir, 'icon.ico'), await pngToIco(icoSizes));
console.log('Wrote build/icon.png and build/icon.ico');
