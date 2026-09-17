#!/usr/bin/env node
// Teach dsh-auto-review to route its reviewer at an explicit LLM provider and
// reasoning effort.
//
// Why this exists: auto-review builds its reviewer child with
// `agentOptions: { model: config.reviewerModel }` and nothing else. The DSH
// `AgentOptions` contract also carries `provider` and `reasoningEffort`, but the
// plugin never forwards them, so `reviewerModel` is an UNQUALIFIED model id that
// can only resolve against the session's DEFAULT provider.
//
// With `agent-default-model.provider: claude` in settings.yaml and a Codex
// reviewer model (gpt-5.6-luna), that id cannot be routed: the reviewer child is
// created and then dies before its first step. runReview() sees
// stopReason "error", reports the "unavailable" fallback, and because
// `fallbackPolicy: rejected` is fail-closed, EVERY approval — including the one
// needed to repair this very config — is rejected. Observed 0/3 success on the
// bare id versus 4/4 (~4-6s each) once `provider: codex` is supplied.
//
// This patch adds two optional config fields, `reviewerLlmProvider` and
// `reviewerReasoningEffort`, and forwards them into agentOptions. Both default
// to "" (absent), so with no config present behaviour is byte-for-byte the
// upstream behaviour. Configure them in cordis.patch.yml under the
// `auto-review` row.
//
// Runs after every `pnpm install` / `dsh plugin add` in this profile so a
// reinstall cannot silently restore the broken routing. Idempotent: it detects
// an already-patched file and exits successfully.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const profileRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const target = join(profileRoot, 'node_modules', 'dsh-auto-review', 'lib', 'index.js')

const SCHEMA_ANCHOR = `	reviewerProvider: z.string().default("fork"),
	reviewerModel: z.string(),
	reviewerTimeoutMs: z.number().default(6e4),`

const SCHEMA_PATCHED = `	reviewerProvider: z.string().default("fork"),
	reviewerModel: z.string(),
	reviewerLlmProvider: z.string().default(""),
	reviewerReasoningEffort: z.string().default(""),
	reviewerTimeoutMs: z.number().default(6e4),`

const CALL_ANCHOR =
  `			...config.reviewerModel !== void 0 ? { agentOptions: { model: config.reviewerModel } } : {}`

const CALL_PATCHED = `			...config.reviewerModel !== void 0 ? { agentOptions: {
				model: config.reviewerModel,
				...config.reviewerLlmProvider ? { provider: config.reviewerLlmProvider } : {},
				...config.reviewerReasoningEffort ? { reasoningEffort: config.reviewerReasoningEffort } : {}
			} } : {}`

let source
try {
  source = readFileSync(target, 'utf8')
} catch {
  // The plugin is not installed in this profile; nothing to patch.
  process.exit(0)
}

if (source.includes('reviewerLlmProvider')) {
  // Already patched (this run, or a previous install).
  process.exit(0)
}

let patched = source
let applied = 0

if (patched.includes(SCHEMA_ANCHOR)) {
  patched = patched.replace(SCHEMA_ANCHOR, SCHEMA_PATCHED)
  applied++
}
if (patched.includes(CALL_ANCHOR)) {
  patched = patched.replace(CALL_ANCHOR, CALL_PATCHED)
  applied++
}

if (applied !== 2) {
  // Upstream changed shape — most likely the fix landed upstream. Do not
  // corrupt the file on a partial match; report loudly and leave it alone.
  console.warn(
    `[fix-auto-review-model-route] expected 2 anchors, matched ${applied}. ` +
      'Leaving dsh-auto-review unpatched; verify reviewerModel routing manually.',
  )
  process.exit(0)
}

writeFileSync(target, patched)
console.log(
  '[fix-auto-review-model-route] added reviewerLlmProvider + reviewerReasoningEffort ' +
    'passthrough to dsh-auto-review.',
)
