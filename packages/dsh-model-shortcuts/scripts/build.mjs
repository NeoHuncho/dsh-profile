#!/usr/bin/env node
/**
 * Build the client bundle for dsh-model-shortcuts.
 *
 * Same envelope as dsh-native-terminal: the web shell loads client plugins
 * through `window.__ModuleLoader__.load`, where shared singletons (react, the
 * client UI packages) arrive via the injected `require` rather than being
 * bundled. So bundle our own sources, but leave `react` external.
 */

import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PKG = 'dsh-model-shortcuts'

/** Resolve `?raw` CSS imports to string modules. */
const rawCssPlugin = {
  name: 'raw-css',
  setup(build) {
    build.onResolve({ filter: /\.css\?raw$/ }, (args) => {
      const bare = args.path.replace(/\?raw$/, '')
      const path = bare.startsWith('.')
        ? join(args.resolveDir, bare)
        : join(root, '..', '..', 'node_modules', bare)
      return { path, namespace: 'raw-css' }
    })
    build.onLoad({ filter: /.*/, namespace: 'raw-css' }, (args) => ({
      contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))}`,
      loader: 'js',
    }))
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

const wrapped = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PKG)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${code}
\t\treturn module.exports;
\t}
});
`

writeFileSync(join(root, 'lib', 'client.js'), wrapped)
console.log(`[${PKG}] built lib/client.js (${(wrapped.length / 1024).toFixed(0)} kB)`)
