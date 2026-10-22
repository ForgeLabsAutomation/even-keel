// Starts the Vite dev server and opens the app in Electron with hot reload.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/';
console.log(`Vite running at ${url}`);

const env = { ...process.env, EVEN_KEEL_DEV_URL: url };
// Editors like VS Code set this, which would make Electron behave like plain Node.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
