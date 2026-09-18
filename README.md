# dsh-profile

My [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web profile: the plugin composition, first‑party plugins and launch/guard scripts that make up my daily harness. Clone it into a harness home and you get the same setup — minus anything personal (sessions, credentials, settings and workspaces live outside this repo).

## What's inside

| Path | Purpose |
| --- | --- |
| `package.json` → `dsh.profile.bundles` | Bundle stack: `dsh-base`, `dsh-web-app`, `dsh-plugin-subscriptions`, `dshmarket`, `archify`, `dsh-quick-search` |
| `cordis.patch.yml` | Profile patch: every first‑party row and its config (auto‑review policy, terminal, market) |
| `packages/*` | First‑party plugins (workspace packages, prebuilt `lib/` committed) |
| `vendor/` | Pinned tarballs not on npm (subscriptions fork with Codex web search) |
| `home/guards` | PreToolUse guard that stops agents from killing/restarting the live harness |
| `home/launch` | launchd start script + plist template (macOS, start at login, keep alive) |
| `scripts/install-home.sh` | Symlinks `home/*` into `$DSH_HOME` and writes the plist |
| `.agents/env.json`, `scripts/env/` | Per‑conversation *lab harness* environments (see below) |

### First‑party plugins

| Package | What it does |
| --- | --- |
| `dsh-sidebar-tray` | Replaces the sidebar workspace region: **Spaces** (Arc‑style emoji dock above Settings, `Ctrl+Shift+1…9` to switch, hold Ctrl for hints), 5‑per‑workspace session groups, settled conversations drawer |
| `dsh-workspace-console` | Bottom‑docked native terminal (tabs/splits), per‑workspace action buttons from `.agents/actions.json`, and per‑conversation **worktree environments** from `.agents/env.json` |
| `dsh-quick-search` | `Cmd/Ctrl+K` palette over projects and sessions |
| `dsh-model-shortcuts` | `Ctrl+Shift+M` / `Ctrl+Shift+L` to switch model and reasoning effort |
| `dsh-deepseek-auto-review` | Second‑model approval reviewer (Codex Guardian style) with risk rules |
| `dsh-agent-lifecycle-cleanup` | Drains child agents before a parent is disposed |
| `dsh-persistence-guidance` | System‑prompt section: prefer persistent implementations over runtime plugins |

## Install

```sh
npm i -g @deepseek-ai/dsh pnpm
export DSH_HOME="$HOME/.dsh"           # default
mkdir -p "$DSH_HOME/profiles"
git clone https://github.com/NeoHuncho/dsh-profile "$DSH_HOME/profiles/web"
cd "$DSH_HOME/profiles/web"
pnpm install                            # builds node-pty etc. (allowBuilds in pnpm-workspace.yaml)
scripts/install-home.sh                 # guards + launch symlinks, launchd plist (macOS)
dsh web                                 # or: launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.deepseek.harness.web.plist
```

Then log into your subscriptions (ChatGPT/Claude/Grok) from **Settings → Subscriptions**; tokens are stored under `$DSH_HOME/plugins/subscriptions/`, outside the repo.

After changing a plugin's `src/`, run its `node scripts/build.mjs` and restart the harness (the profile has `patchReload: live` for patch rows, but host plugin code is pinned per process).

## Worktree environments

Any workspace with an `.agents/env.json` gets a fresh **git worktree per conversation**. Opening a conversation creates nothing; a **"Start on a new worktree"** checkbox (on by default) sits above the composer and your **first message** creates `.worktrees/<slug>` on branch `env/<slug>` — `node_modules` (or whatever `share` lists) symlinked from the main checkout, a block of free ports allocated by increment, the `setup` script running in the background — and moves the conversation there. Nothing starts automatically: a **Start environment** button appears in the session header once setup is done and while the environment is not running. **Settling** the conversation warns about uncommitted work, then stops and deletes the worktree (changes are committed to the env branch first); **unsettling** restores it.

```jsonc
// .agents/env.json
{
  "version": 1,
  "worktreeRoot": ".worktrees/{slug}",   // or absolute, ~ allowed
  "branchPrefix": "env/",
  "share": ["node_modules"],
  "ports": { "base": 3017, "count": 2, "stride": 10 },
  "setup": "scripts/env/setup.sh",        // run once after the worktree is created
  "start": "scripts/env/start.sh",        // long‑running; exit ⇒ stopped
  "stop": "scripts/env/stop.sh",          // optional
  "teardown": "scripts/env/teardown.sh"   // optional; before the worktree is removed
}
```

Scripts receive `ENV_SLUG`, `ENV_DIR`, `ENV_ROOT`, `ENV_BRANCH`, `ENV_INDEX`, `ENV_PORT_0…N`.

### The lab harness (this repo)

This repo carries its own `env.json`: each conversation on the profile gets a worktree under `~/.dsh-lab/<slug>/profiles/web`, and **Start environment** boots a second harness with `DSH_HOME=~/.dsh-lab/<slug>` on its own port (3081, 3082, …) — separate sessions and storage, shared subscription login. Agents working in that worktree can restart *their* harness with `scripts/env/harness.sh restart` while the live one stays protected by the guard.

## Guard

`home/guards/block-process-control.mjs` is a Claude‑Code‑style `PreToolUse` hook that refuses commands able to stop or restart the live harness (`kill`, `launchctl`, `dsh web`, the market restart endpoint…). It allows `dsh web` when the command sets `DSH_HOME=` to another home, so lab harnesses can be restarted. Mount it with `@deepseek-ai/dsh-hooks-claude-code` (row in `cordis.patch.yml`, commented until you want it) — the same rules are also enforced by the auto‑reviewer's `riskRules`.

## Not included, on purpose

`$DSH_HOME/sessions`, `storages`, `settings.yaml`, `.credentials.yaml`, `plugins/subscriptions/*.json`, `attachments` — personal state. `node_modules` is installed, not committed.

## License

MIT for the code in `packages/` and `scripts/`. Vendored tarballs keep their own licenses.
