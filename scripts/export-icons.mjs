import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const logoDir = path.join(root, 'Logo');
const outDir = path.join(root, 'icons');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function pickSvg() {
  const files = await fs.readdir(logoDir);
  const svgs = files.filter(f => f.toLowerCase().endsWith('.svg'));
  if (!svgs.length) throw new Error(`No SVGs found in ${logoDir}`);
  // Prefer a vertical/square logo for small sizes
  const byScore = svgs
    .map(name => ({
      name,
      score:
        (name.toLowerCase().includes('vertical') ? 100 : 0) +
        (name.toLowerCase().includes('app') ? 50 : 0) +
        (name.toLowerCase().includes('icon') ? 30 : 0) +
        (name.trim() !== name ? -5 : 0), // filenames with trailing spaces are penalized
    }))
    .sort((a, b) => b.score - a.score);
  const main = byScore[0].name;
  // Toolbar can be same as main unless a simpler mark exists
  const toolbarCandidate = svgs.find(n => n.toLowerCase().includes('toolbar')) || main;
  return { mainSvg: path.join(logoDir, main), toolbarSvg: path.join(logoDir, toolbarCandidate) };
}

async function exportPngs(svgPath, prefix, sizes) {
  for (const size of sizes) {
    const out = path.join(outDir, `${prefix}-${size}.png`);
    // Use higher density for crisp rasterization, then resize to exact square
    await sharp(svgPath, { density: size * 4 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    console.log(`Wrote ${path.relative(root, out)}`);
  }
}

(async () => {
  try {
    await ensureDir(outDir);
    const { mainSvg, toolbarSvg } = await pickSvg();
    console.log(`Using main icon:     ${path.basename(mainSvg)}`);
    console.log(`Using toolbar icon:  ${path.basename(toolbarSvg)}`);

    await exportPngs(mainSvg, 'app', [16, 32, 48, 128]);
    await exportPngs(toolbarSvg, 'toolbar', [16, 32]);

    console.log('\nDone. Update your manifest to reference icons/icons if not already.');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
})();
