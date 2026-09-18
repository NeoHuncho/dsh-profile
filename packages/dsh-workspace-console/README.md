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
