#!/usr/bin/env node
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = 'dsh-deepseek-auto-review'
const rawCssPlugin = {
  name: 'raw-css',
  setup(buildApi) {
    buildApi.onResolve({ filter: /\.css\?raw$/ }, args => ({ path: join(args.resolveDir, args.path.replace(/\?raw$/, '')), namespace: 'raw-css' }))
    buildApi.onLoad({ filter: /.*/, namespace: 'raw-css' }, args => ({ contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))}`, loader: 'js' }))
  },
}

const result = await build({
  entryPoints: [join(root, 'src', 'client.jsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  write: false,
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  plugins: [rawCssPlugin],
  legalComments: 'none',
  logLevel: 'warning',
})
const code = result.outputFiles[0].text
const wrapped = `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(pkg)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n${code}\n\t\treturn module.exports;\n\t}\n});\n`
writeFileSync(join(root, 'lib', 'client.js'), wrapped)
console.log(`[${pkg}] built lib/client.js (${(wrapped.length / 1024).toFixed(0)} kB)`)
