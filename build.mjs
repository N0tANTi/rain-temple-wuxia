// Builds the block's demo into dist/ (index.html at the top) with the files it loads and their licences:
// `npm install`, then `npm run build`.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
execSync(`node "${path.join(here, 'node_modules/vite/bin/vite.js')}" build --config vite.config.mjs`, { cwd: here, stdio: 'inherit' });

const put = (from, to) => fs.copyFileSync(path.join(here, from), path.join(dist, to));
put('LICENSE', 'LICENSE.txt');
put('LICENCE-NOTES.md', 'LICENCE-NOTES.md');

// Embed the same release (including its notices) for a file:// double click.
const entry = fs.readFileSync(path.join(dist,'index.html'),'utf8');
const script = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/;
const bundleName = entry.match(script)?.[1];
if (!bundleName) throw Error('Missing compiled temple entry');
const bundle = fs.readFileSync(path.join(dist,bundleName),'utf8');
const model = name => 'data:model/gltf-binary;base64,' + fs.readFileSync(path.join(dist,'figure',name)).toString('base64');
const assets = {man:model('starter-man.glb'),clips:model('starter-man-clips.glb'),hands:JSON.parse(fs.readFileSync(path.join(here,'src/figure/hands-anymove.json'),'utf8'))};
assets.score = 'data:audio/mp4;base64,' + fs.readFileSync(path.join(dist,'audio','过桥听雨.m4a')).toString('base64');
const notices=['LICENSE.txt','LICENCE-NOTES.md','THIRD-PARTY-NOTICES.md','CREDITS.md','LICENSES/CC0-1.0.txt'].map(f=>fs.readFileSync(path.join(dist,f),'utf8')).join('\n\n');
const packed='<script>globalThis.templeAssets='+JSON.stringify(assets)+'</script>\n<script type="module">'+bundle.replace(/<\/script/gi,'<\\/script')+'</script>';
const portable=entry.replace(script,()=>packed).replace('</body>',()=>'<script type="text/plain" id="credits">'+notices.replace(/<\/script/gi,'<\\/script')+'</script></body>');
fs.writeFileSync(path.join(here,'../雨过山寺.html'),portable);

let bytes = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else bytes += fs.statSync(p).size;
  }
};
walk(dist);
console.log(`dist: ${(bytes / 1048576).toFixed(1)} MB`);
