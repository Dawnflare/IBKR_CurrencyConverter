import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Development-only rasterizer. Normal builds copy the committed PNGs and need no browser.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'src/assets');
const svg = await readFile(resolve(assets, 'icon.svg'), 'utf8');
await mkdir(resolve(assets, 'icons'), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  for (const size of [16, 24, 32, 48, 128]) {
    const png = await page.evaluate(async ({ svg, size }) => {
      const picture = new Image();
      picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await picture.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.drawImage(picture, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { svg, size });
    await writeFile(resolve(assets, 'icons', `icon-${size}.png`), Buffer.from(png, 'base64'));
  }
} finally {
  await browser.close();
}
console.log('Rendered extension icons: 16, 24, 32, 48, 128 px');
