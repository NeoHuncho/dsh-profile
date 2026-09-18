#!/usr/bin/env node
/**
 * PreToolUse guard: refuse any tool call that could stop, kill, or restart the
 * DSH host process (or mass-kill unrelated runs).
 *
 * Runs on every tool call, independently of the approval/auto-review stack, so
 * it still blocks when approval prompts are disabled. Exit 2 = block, and
 * stderr becomes the reason the model sees.
 */
import { readFileSync } from 'node:fs'

let payload = {}
try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}') } catch { payload = {} }

// Only tools that actually EXECUTE a command are in scope. Scanning every tool
// blocks prose: a todo list, a file edit, or a message that merely mentions
// `kill` is not an attempt to run it, and blocking those makes the guard
// unusable (it locked the agent out of editing this very file).
const EXECUTING_TOOLS = new Set(['bash', 'shell', 'terminal', 'native_terminal', 'run_command'])
const toolName = String(payload.tool_name ?? payload.toolName ?? '').toLowerCase()
if (!EXECUTING_TOOLS.has(toolName)) process.exit(0)

// Within an executing tool, only the command field is the thing being run.
const input = payload.tool_input ?? payload.toolInput ?? {}
const text = [input.command, input.cmd, input.script]
  .filter(value => typeof value === 'string')
  .join('\n')
if (!text) process.exit(0)

// A dangerous verb only counts in COMMAND POSITION: start of the script, or
// after a separator (; & | && || newline), a subshell open, or a `$(`/backtick.
// Without this anchor the guard fires on prose — `echo "don't kill the server"`
// is not a kill — which produced real false positives.
const CMD = String.raw`(?:^|[\n;&|(\`]|\$\()\s*`
// Privilege/runner prefixes that still leave the real verb in command position.
// Leading `VAR=value` assignments (`DSH_HOME=x dsh web`) also leave the verb in
// command position.
const RUN = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)*(?:(?:sudo|doas|command|exec|nohup|npx|pnpm\s+dlx|bunx|time)\s+(?:-\w+\s+)*)*`
const at = (verb, flags = '') => new RegExp(CMD + RUN + verb, flags)

// Lab harnesses: a second `dsh web` booted with a DIFFERENT DSH_HOME (for
// example `DSH_HOME=~/.dsh-lab/foo dsh web --port 3081`, or the env helper
// `scripts/env/harness.sh restart`) never touches the supervised live server,
// so those commands are allowed. The live home is `$DSH_HOME` (default ~/.dsh).
const LIVE_HOME = (process.env.DSH_HOME || `${process.env.HOME}/.dsh`).replace(/\/+$/, '')
const labHarnessCommand = (cmd) => {
  if (/(?:^|[\s;&|(])scripts\/env\/harness\.sh\b/.test(cmd)) return true
  const m = /DSH_HOME=(["']?)([^\s"';&|]+)\1\s+(?:[A-Z_]+=\S+\s+)*(?:\S*\/)?dsh\s+(?:web|--profile)\b/.exec(cmd)
  if (m === null) return false
  const home = m[2].replace(/^~/, process.env.HOME).replace(/\/+$/, '')
  return home !== LIVE_HOME && home !== `${process.env.HOME}/.dsh`
}

const RULES = [
  // Process-killing verbs. Blocked outright: an agent has no reason to signal
  // processes it did not start, and `job_kill` stops its own background jobs.
  [at(String.raw`(?:kill|killall|pkill)\b`), 'kill/killall/pkill are not available to agents; use job_kill for your own background jobs'],
  // Process managers that terminate by name.
  [at(String.raw`(?:pm2|forever)\s+(?:stop|kill|restart|delete)\b`), 'process-manager stop/restart is reserved for the user'],
  // launchd control of the supervised harness.
  [at(String.raw`launchctl\s+(?:kickstart|bootout|unload|stop|remove)\b`), 'launchctl stop/restart is reserved for the user'],
  [at(String.raw`launchctl\s+\S*.*?(?:com\.deepseek\.harness|dsh-web)`), 'launchctl control of the DSH service is reserved for the user'],
  // Booting another harness or restarting this one.
  [at(String.raw`dsh\s+(?:web\b|--profile\b)`), 'starting or restarting a DSH server is reserved for the user', 'dsh-start'],
  [at(String.raw`\S*\.dsh/launch/dsh-web`), 'the DSH launch script is reserved for the user'],
  // The market restart endpoint, however it is reached (curl/wget/fetch).
  [/\/dsh-market\/(?:api\/v1\/)?restart/, 'the market restart endpoint is reserved for the user'],
  // Shutdown/reboot of the machine.
  [at(String.raw`(?:shutdown|reboot|halt)\b`), 'host shutdown/reboot is reserved for the user'],
]

// The dsh-start rule alone is waived for lab harnesses; kill/launchctl stay.
for (const [pattern, reason, tag] of RULES) {
  if (tag === 'dsh-start' && labHarnessCommand(text)) continue
  if (pattern.test(text)) {
    process.stderr.write(
      `Blocked by the process-control guard: ${reason}.\n` +
      `This command could stop the DSH host process and interrupt every live agent run. ` +
      `Do not attempt a workaround — report to the user and let them restart it themselves.\n`,
    )
    process.exit(2)
  }
}
