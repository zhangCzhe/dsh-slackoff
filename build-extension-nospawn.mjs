// 零依赖打包：不调用 esbuild（其原生二进制 spawn 在本沙箱被 EPERM 拦截），
// 直接把这几个小模块的 ESM import/export 内联成 IIFE，产出与 esbuild 等价的 dist/*。
// 仅适用于本项目这种「单文件相对导入 + 无顶层变量名冲突」的简单图。
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(root, 'extension/src')
const distDir = resolve(root, 'extension/dist')

const read = (p) => readFileSync(p, 'utf8')

// 去掉 ESM 语法：import 行、export 前缀、export {} 列表
function stripEsm(code) {
  return code
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/^export\s+(function|const|let|var|class)\s+/gm, '$1 ')
    .replace(/^export\s+\{[^}]*\}\s*;?\s*$/gm, '')
    .trim()
}

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]\.\/([^'"]+)\.js['"]/g

function bundle(entryName) {
  const bodies = []
  const seen = new Set()

  function visit(rel) {
    if (seen.has(rel)) return
    seen.add(rel)
    const abs = resolve(srcDir, rel + '.js')
    const code = read(abs)
    for (const m of code.matchAll(IMPORT_RE)) visit(m[2]) // 先内联依赖
    bodies.push(stripEsm(code))
  }

  visit(entryName)
  return '(function () {\n' + bodies.join('\n\n') + '\n})();\n'
}

mkdirSync(distDir, { recursive: true })
for (const name of ['background', 'dsh-bridge', 'site-controller', 'shadow-patch']) {
  writeFileSync(resolve(distDir, name + '.js'), bundle(name))
  console.log('built dist/' + name + '.js')
}
copyFileSync(resolve(srcDir, 'options.html'), resolve(distDir, 'options.html'))
copyFileSync(resolve(srcDir, 'options.js'), resolve(distDir, 'options.js'))
console.log('built dist/options.html + options.js')
