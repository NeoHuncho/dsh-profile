# dsh-native-terminal

Bottom-docked terminal panel (tabs, split panes, shortcuts) and workspace-free
**Quick chats** for the DeepSeek Harness Web GUI.

## Why this exists

It replaces the community `dsh-plugin-terminal`, which crashed this profile.
That plugin bundled its **own** `node-pty@1.1.0` alongside the copy DSH already
loads (`1.2.0-beta.15`). Two native PTY addons in one process is an ABI hazard,
and nested pnpm installs additionally skipped node-pty's chmod step, leaving
`spawn-helper` non-executable so every session died with `posix_spawnp failed.`

**This package bundles no native module at all.** It allocates PTYs through the
host's own `ctx.subprocess.spawnTerminal` seam, so that entire class of failure
cannot recur. `xterm.js` in the browser is pure JavaScript.

## Shortcuts

Configured in `~/.dsh/settings.yaml` under `native-terminal:`.

| Action | Default |
| --- | --- |
| Toggle panel | `Ctrl+\`` |
| New terminal tab | `Ctrl+Shift+\`` |
| Split right | `Ctrl+Shift+D` |
| Split down | `Ctrl+Shift+E` |
| Close focused pane | `Ctrl+Shift+W` |
| Next / previous pane | `Ctrl+Shift+]` / `Ctrl+Shift+[` |

Panes and the dock are also resizable by dragging.

## Quick chats

A collapsible group at the sidebar foot, directly above Settings.

Stated plainly: DSH has no session that lacks a workspace — every session header
carries a canonical `cwd`. "Not tied to a workspace" is therefore implemented as
one dedicated workspace rooted at your home directory, presented separately from
the project list. These chats behave like any other chat; they simply never file
themselves under one of your projects.

## Build

`node scripts/build.mjs` regenerates `lib/client.js` from `src/`.
The host half (`lib/index.js`) is plain ESM copied from `src/host.js`.
