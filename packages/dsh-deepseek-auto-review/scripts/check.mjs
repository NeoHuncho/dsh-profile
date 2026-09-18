#!/usr/bin/env node
/**
 * Regression checks for the failures that kept this plugin from mounting.
 *
 * Run: node scripts/check.mjs   (from the package directory)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const profile = dirname(dirname(root))
const checks = []
const check = (name, fn) => checks.push([name, fn])

const plugin = await import(join(root, 'lib', 'index.js'))

check('host half applies without throwing', () => {
  const registered = []
  plugin.apply({
    sessionProjections: { register: def => registered.push(def) },
    effect() {}, provide() {}, on() {},
    commands: { register() {} },
  }, {})
  assert.equal(registered.length, 1, 'expected exactly one projection registration')
})

check('plugin declares every service it dereferences', () => {
  // `ctx.sessionProjections` and `ctx.commands` are read unconditionally in
  // apply(); an undeclared service is undefined at mount time.
  for (const service of ['approval', 'subagents', 'commands', 'tools', 'sessionProjections']) {
    assert.ok(plugin.inject.includes(service), `inject is missing "${service}"`)
  }
})

check('projection schemas expose .parse (Zod, not Schemastery)', () => {
  // The registry calls stateSchema.parse / wire.viewSchema.parse; a callable
  // Schemastery schema has no .parse and throws on the first snapshot.
  let def
  plugin.apply({
    sessionProjections: { register: value => { def = value } },
    effect() {}, provide() {}, on() {},
    commands: { register() {} },
  }, {})
  assert.equal(typeof def.stateSchema.parse, 'function', 'stateSchema.parse must exist')
  assert.equal(typeof def.wire.viewSchema.parse, 'function', 'viewSchema.parse must exist')
  const state = def.init({}, 0)
  assert.deepEqual(def.stateSchema.parse(state), state)
  assert.deepEqual(def.wire.viewSchema.parse(def.wire.view(state)), state)
})

check('Config schema constructs (no z.undefined / z.optional)', () => {
  // Schemastery 3.18.2 has neither undefined() nor optional(); using either
  // throws "z.undefined is not a function" while the module is evaluated.
  const resolved = plugin.Config({})
  assert.equal(resolved.reviewerProviderRoute, 'codex')
  assert.equal(resolved.reviewerModel, 'gpt-5.6-luna')
})

check('reviewer depth cap admits exactly one child level', () => {
  // subagents.start caps the CHILD's absolute depth, and child = parent + 1.
  // Passing the parent's own depth rejects every reviewer before it starts.
  const source = readFileSync(join(root, 'src', 'index.js'), 'utf8')
  assert.match(source, /maxDepth: \(request\.agent\.session\.header\.delegationDepth \?\? 0\) \+ 1/)
})

check('projection is never mutated in place', () => {
  // stateOf() returns the registry's live cell; assigning to it is a contract
  // violation the change feed never publishes and a replay never reproduces.
  const source = readFileSync(join(root, 'src', 'index.js'), 'utf8')
  assert.doesNotMatch(source, /stateOf\([^)]*\)[\s\S]{0,200}?current\.\w+ =/, 'projection state is mutated')
  assert.match(source, /appendRecent\(this\.recent,/, 'verdict ring should live in runtime state')
})

check('profile patch declares one entry with a mapping config', () => {
  const doc = yaml.load(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8'), { schema: yaml.JSON_SCHEMA })
  const rows = doc.flatMap(patch => [...(patch.insert ?? []), ...(patch.id ? [patch] : [])])
    .filter(row => row.id === 'deepseek-auto-review')
  assert.equal(rows.length, 1, `expected 1 deepseek-auto-review entry, found ${rows.length} (the loader rejects duplicate ids)`)
  const [row] = rows
  assert.equal(typeof row.config, 'object', 'config must be a YAML mapping, not a block scalar')
  assert.ok(!Array.isArray(row.config))
  assert.notEqual(row.disabled, true, 'entry is disabled')
  plugin.Config(row.config)
  for (const stale of ['reviewerLlmProvider', 'contextBudget', 'riskPolicy', 'circuitBreaker']) {
    assert.ok(!(stale in row.config), `config uses unrecognized key "${stale}"`)
  }
})

check('client bundle is rebuilt from current source', () => {
  const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  assert.match(bundle, /DSH Auto Review/, 'bundle predates the rename — run scripts/build.mjs')
  assert.match(bundle, /ctx\.slots\.inject/, 'bundle predates the slots inject change')
})

let failed = 0
for (const [name, fn] of checks) {
  try {
    fn()
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`)
  }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exitCode = failed === 0 ? 0 : 1
