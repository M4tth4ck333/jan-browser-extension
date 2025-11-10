#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const target = process.argv[2] === 'firefox' ? 'dist-firefox' : 'dist';
const manifest = process.argv[2] === 'firefox' ? 'manifest.firefox.json' : 'manifest.json';

const targetDir = resolve(process.cwd(), target);
const uiBuildDir = resolve(process.cwd(), 'build/popup');

console.log('Building popup UI with Vite…');
execSync('npx vite build', { stdio: 'inherit' });

if (!existsSync(uiBuildDir)) {
  throw new Error('Popup UI build directory not found.');
}

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}
mkdirSync(targetDir, { recursive: true });

cpSync(resolve(process.cwd(), manifest), resolve(targetDir, 'manifest.json'));
cpSync(resolve(process.cwd(), 'icons'), resolve(targetDir, 'icons'), { recursive: true });

const runtimeCopies = [
  ['src/background', 'background'],
  ['src/content', 'content'],
  ['src/constants.js', 'constants.js'],
  ['src/lib', 'lib'],
  ['src/mcp-bridge.js', 'mcp-bridge.js'],
  ['src/mcp-tools', 'mcp-tools'],
  ['src/search', 'search'],
];

for (const [from, to] of runtimeCopies) {
  const sourcePath = resolve(process.cwd(), from);
  const targetPath = resolve(targetDir, to);
  cpSync(sourcePath, targetPath, { recursive: true });
}

cpSync(uiBuildDir, resolve(targetDir, 'popup'), { recursive: true });

console.log(`Built ${target} using ${manifest}`);
