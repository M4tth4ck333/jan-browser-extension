#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';

const target = process.argv[2] === 'firefox' ? 'dist-firefox' : 'dist';
const manifest = process.argv[2] === 'firefox' ? 'manifest.firefox.json' : 'manifest.json';

const targetDir = resolve(process.cwd(), target);

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}
mkdirSync(targetDir, { recursive: true });

cpSync(resolve(process.cwd(), manifest), resolve(targetDir, 'manifest.json'));
cpSync(resolve(process.cwd(), 'icons'), resolve(targetDir, 'icons'), { recursive: true });
cpSync(resolve(process.cwd(), 'src'), resolve(targetDir, 'src'), { recursive: true });

console.log(`Built ${target} using ${manifest}`);
