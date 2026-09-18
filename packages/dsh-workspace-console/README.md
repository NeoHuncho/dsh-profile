# dsh-workspace-console

Persistent Workspace Console plugin for the DeepSeek Harness Web GUI. It combines the bottom-docked native terminal (tabs, split panes, resize, and terminal shortcuts) with editable workspace actions that run in that terminal.

## Workspace action convention

Each workspace owns its buttons in `.agents/actions.json`:

```json
{
  "version": 1,
  "actions": [
    {
      "id": "dev",
      "name": "Start dev",
      "icon": "run",
      "command": "npm run dev",
      "shortcut": "ctrl+shift+k d"
    }
  ]
}
```

The Harness action editor creates and updates this file atomically. Commands execute only after an explicit button click or matching keyboard chord, in a native terminal rooted at that registered workspace. Treat committed action files as executable project configuration and review them like scripts.

Buttons appear in active Session headers and at the top-right of blank/new Session pages. The trailing `•••` button opens the editor; when no actions exist it reads `+ Add action`.

## Action shortcuts

Action shortcuts are stored beside each action, not in global Harness settings. Use two-step chords to avoid browser and editor conflicts. Recommended leader: `Ctrl+Shift+K`, followed by one mnemonic letter, for example:

- `ctrl+shift+k d` — development server
- `ctrl+shift+k t` — tests
- `ctrl+shift+k b` — build
- `ctrl+shift+k p` — preview

Pressing the leader shows a visual overlay of available second keys and action names. The chord cancels after 1.8 seconds, on Escape, focus loss, or workspace change.

## Terminal shortcuts

Configured in `~/.dsh/settings.yaml` under the existing `native-terminal:` namespace for backward compatibility.

| Action | Default |
| --- | --- |
| Toggle panel | `Ctrl+\`` |
| New terminal tab | `Ctrl+Shift+\`` |
| Split right | `Ctrl+Shift+D` |
| Split down | `Ctrl+Shift+E` |
| Close focused pane | `Ctrl+Shift+W` |
| Next / previous pane | `Ctrl+Shift+]` / `Ctrl+Shift+[` |

## Persistence and build

The package is a profile-local workspace dependency and is mounted from `~/.dsh/profiles/web/cordis.patch.yml`, so it survives Harness restarts. Run `node scripts/build.mjs` after source changes; it regenerates `lib/client.js` and copies the host entry to `lib/index.js`.

## Worktree environments (`.agents/env.json`)

A workspace with `.agents/env.json` gets a fresh git worktree per conversation. The sidebar tray asks this package (through `window.__dshEnv__`) to create one whenever a new conversation is started on such a project; the child workspace appears nested under the project and follows its Space.

| Field | Default | Meaning |
| --- | --- | --- |
| `worktreeRoot` | `.worktrees/{slug}` | Where the worktree lives; `{slug}`, `{project}`, `~` allowed |
| `branchPrefix` | `env/` | Branch `env/<slug>` is created from HEAD and **kept forever** |
| `share` | `["node_modules"]` | Directories symlinked from the main checkout (added to `info/exclude`) |
| `ports` | `{base,count,stride}` | Env *k* gets `base + k*stride … +count-1`; *k* is the lowest free index |
| `healthPort` | — | Index into the port block used to detect a running env started outside the engine |
| `setup` / `start` / `stop` / `teardown` | — | Scripts run in the worktree with `ENV_SLUG ENV_DIR ENV_ROOT ENV_BRANCH ENV_INDEX ENV_PORT_0..N ENV_PORTS` |

Lifecycle: **create** (worktree + share + setup) → **Start environment** button in the header (only while stopped) → Stop / Restart / Logs → **settle** the conversation ⇒ teardown (WIP commit on the env branch, `teardown` script, `git worktree remove`, child workspace deleted) → **unsettle** ⇒ restore from the branch.

State: `$DSH_HOME/storages/env-registry.json`; logs: `$DSH_HOME/storages/env-logs/<id>.log`. HTTP: `GET/POST /native-terminal/envs`, `POST /native-terminal/envs/<id>/(start|stop|restart|teardown|restore|forget)`, `GET …/<id>/log`.
