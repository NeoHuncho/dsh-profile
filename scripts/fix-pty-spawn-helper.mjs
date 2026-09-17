#!/usr/bin/env node
// Restore the execute bit on every node-pty `spawn-helper` binary in this
// profile.
//
// Why this exists: node-pty ships `spawn-helper` as a prebuilt Mach-O binary
// and relies on its own install/postinstall scripts to mark it executable.
// When pnpm installs node-pty as a NESTED dependency of a plugin (here:
// dsh-plugin-terminal -> node-pty@1.1.0), that chmod can be skipped, and the
// file lands as -rw-r--r--. node-pty then fails at runtime with
// "posix_spawnp failed." and the terminal panel cannot open any session,
// which looks like a broken plugin rather than a file-mode problem.
//
// This runs after every `pnpm install` / `dsh plugin add` in this profile, so
// a reinstall cannot silently reintroduce the failure. It is idempotent and
// only ever adds execute bits to files named `spawn-helper` under node-pty.

import { chmodSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const profileRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const modulesRoot = join(profileRoot, 'node_modules')

/** Collect every node_modules/node-pty directory, including nested ones. */
function findNodePtyDirs(root, found = [], depth = 0) {
  if (depth > 8) return found
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const full = join(root, entry.name)
    if (entry.name === 'node-pty') {
      found.push(full)
      continue
    }
    if (entry.name === 'node_modules' || !entry.name.startsWith('.')) {
      findNodePtyDirs(full, found, depth + 1)
    }
  }
  return found
}

/** Recursively mark files named `spawn-helper` executable. */
function fixHelpers(dir, fixed = [], depth = 0) {
  if (depth > 6) return fixed
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return fixed
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      fixHelpers(full, fixed, depth + 1)
      continue
    }
    if (entry.name !== 'spawn-helper') continue
    try {
      const mode = statSync(full).mode
      // 0o111 = execute bits for user/group/other.
      if ((mode & 0o111) === 0o111) continue
      chmodSync(full, mode | 0o111)
      fixed.push(full)
    } catch {
      // A helper we cannot stat or chmod is not worth failing the install for.
    }
  }
  return fixed
}

if (process.platform === 'win32') {
  // Windows uses ConPTY and has no spawn-helper; nothing to repair.
  process.exit(0)
}

const fixed = []
for (const dir of findNodePtyDirs(modulesRoot)) fixHelpers(dir, fixed)

if (fixed.length > 0) {
  console.log(
    `[fix-pty-spawn-helper] restored execute bit on ${fixed.length} node-pty spawn-helper binar${
      fixed.length === 1 ? 'y' : 'ies'
    }:`,
  )
  for (const file of fixed) console.log(`  ${file.replace(profileRoot + '/', '')}`)
}
