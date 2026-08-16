import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'

mkdirSync('extension/dist', { recursive: true })
for (const name of ['background', 'dsh-bridge', 'site-controller', 'shadow-patch']) {
  await build({
    entryPoints: [`extension/src/${name}.js`],
    bundle: true,
    format: 'iife',
    target: 'chrome110',
    outfile: `extension/dist/${name}.js`,
  })
}
copyFileSync('extension/src/options.html', 'extension/dist/options.html')
copyFileSync('extension/src/options.js', 'extension/dist/options.js')
