// Publishes a release from this computer instead of GitHub Actions.
// Builds the installer and uploads it to a GitHub Release for the version in
// package.json. Uses $GH_TOKEN, or the token from `gh auth login`.
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
let token = process.env.GH_TOKEN;
if (!token) {
  try {
    token = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    console.error('Set GH_TOKEN or run `gh auth login` first.');
    process.exit(1);
  }
}

console.log(`Publishing Even Keel ${version} to GitHub Releases…`);
const env = { ...process.env, GH_TOKEN: token };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync('npx', ['electron-builder', '--win', '--publish', 'always'], { stdio: 'inherit', shell: true, env });
process.exit(result.status ?? 1);
