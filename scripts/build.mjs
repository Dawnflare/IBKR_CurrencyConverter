import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const test = process.argv.includes('--test');
const out = resolve(root, 'dist', test ? 'test' : 'production');
// Only these generated directories can be removed, after absolute containment checks.
if (!['dist/test', 'dist/production'].includes(relative(root, out).replaceAll('\\', '/'))) throw new Error('Unsafe output directory');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const hosts = ['https://api.frankfurter.dev/*', 'https://api.currencyapi.com/*'];
const manifest = {
  manifest_version: 3, name: `IBKR USD Lens${test ? ' — SYNTHETIC TEST ONLY' : ''}`, version: '0.1.0',
  minimum_chrome_version: '114', description: 'Estimated USD annotations for KRW. Captured Positions layout supported; live-site validation pending.',
  permissions: ['storage'], optional_host_permissions: hosts,
  background: { service_worker: 'background.js', type: 'module' },
  action: { default_title: 'IBKR USD Lens', default_popup: 'popup.html' },
  content_scripts: [{ matches: test ? ['http://127.0.0.1:4173/*'] : ['https://portal.interactivebrokers.com/*'], js: ['content.js'], run_at: 'document_idle', all_frames: false, world: 'ISOLATED' }],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; connect-src https://api.frankfurter.dev https://api.currencyapi.com" },
};
const fixturePlugin = { name: 'synthetic-only', setup(builder) { builder.onResolve({ filter: /site\/production$/ }, () => ({ path: resolve(root, 'tests/fixtures/site-adapter.ts') })); } };
const common = { bundle: true, target: 'chrome114', logLevel: 'info', sourcemap: false, legalComments: 'none', absWorkingDir: root, metafile: true };
const content = await build({ ...common, entryPoints: ['src/content/index.ts'], outfile: resolve(out, 'content.js'), format: 'iife', plugins: test ? [fixturePlugin] : [] });
await build({ ...common, entryPoints: ['src/worker/background.ts'], outfile: resolve(out, 'background.js'), format: 'esm', define: { __FIXTURE_ORIGIN__: test ? JSON.stringify('http://127.0.0.1:4173') : 'null' } });
await build({ ...common, entryPoints: ['src/popup/popup.ts'], outfile: resolve(out, 'popup.js'), format: 'iife' });
await copyFile(resolve(root, 'src/popup/popup.html'), resolve(out, 'popup.html'));
await copyFile(resolve(root, 'src/popup/popup.css'), resolve(out, 'popup.css'));
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
if (!test && Object.keys(content.metafile.inputs).some(p => p.includes('fixtures') || p.includes('demo/'))) throw new Error('Fixture code leaked into production');
if (test) {
  const demo = resolve(root, 'dist/demo'); await mkdir(demo, { recursive: true });
  await build({ ...common, entryPoints: ['demo/demo.ts'], outfile: resolve(demo, 'demo.js'), format: 'iife' });
  for (const file of ['index.html', 'demo.css']) await copyFile(resolve(root, 'demo', file), resolve(demo, file));
}
// Inspectable build provenance contains source paths only, never account or key data.
await writeFile(resolve(out, 'BUILD.txt'), `IBKR USD Lens 0.1.0\nStatus: live-site-validation-pending\nBuild: ${test ? 'synthetic fixture (never load on IBKR)' : 'production, captured Positions layout'}\nNode: ${process.version}\n`);
console.log(`Unpacked extension: ${out}`);
