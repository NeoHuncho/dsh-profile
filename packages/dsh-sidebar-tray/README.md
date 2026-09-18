# dsh-sidebar-tray

Replacement browsing region for the DeepSeek Harness Web GUI sidebar. It shadows the shipped `sidebar.workspaces` slot at priority `-1`; drop the row from the profile patch and the original sidebar returns.

## Spaces

Spaces group workspaces, Arc style. Each space has a **name and an emoji**. The active space's emoji + name head the list; a **centred emoji dock** sits at the foot of the sidebar, directly above Settings:

- **Default** (🏠) is built in and shows every workspace not claimed by another space (plus ungrouped sessions). It can be renamed and given another emoji, but not deleted.
- Click an emoji to switch. Hold **Ctrl/Cmd** and every emoji shows its `⇧n` hint; **`Ctrl+Shift+1…9`** switches to the n-th space (Default is 1). This chord used to jump between conversations; that binding is gone.
- `＋` creates a space (name, then optional emoji) and switches to it. Adding a workspace (`⊞`) while a user space is active claims it for that space.
- Right-click an emoji for **Rename…**, **Change emoji…** (preset grid or *Other…* to type/paste one), Move left/right, Delete (workspaces return to Default).
- Hover a project row and press `⤷` to move it to another space.
- Environment child workspaces (per-conversation worktrees created by `dsh-workspace-console`) follow their parent's space automatically.

State lives in `~/.dsh/settings.yaml` under `sidebar-tray:` (`spaces[{id,name,emoji,workspaceIds}]`, `defaultSpace{name,emoji}`, `activeSpaceId`, `settledSessionIds`) so it survives restarts and is identical in every browser.

## Settled conversations

`▾` on a session row settles it: it leaves its group and moves to the **Settled** drawer, from where `↩` brings it back. Settling is reversible, unlike the harness archive.

For a conversation living in a worktree environment, settling also tears that environment down. If the worktree has **uncommitted changes or commits not yet in the main checkout**, a confirmation lists them first; *Cancel* leaves everything as is, *OK* commits them as WIP on the env branch (which is kept) and removes the worktree. Unsettling restores the worktree from the branch.

## Build

```sh
node scripts/build.mjs   # regenerates lib/client.js, copies src/host.js to lib/index.js
node --test test/*.mjs
```
