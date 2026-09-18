# dsh-sidebar-tray

Replacement browsing region for the DeepSeek Harness Web GUI sidebar. It shadows the shipped `sidebar.workspaces` slot at priority `-1`; drop the row from the profile patch and the original sidebar returns.

## Spaces

Spaces group workspaces, Arc/Zen style. A pill strip under the sidebar header lists them:

- **Default** is built in and shows every workspace not claimed by another space (plus ungrouped sessions). It can be renamed but not deleted.
- `＋` creates a space and switches to it. Adding a workspace (`⊞`) while a user space is active claims it for that space.
- Hover a project row and press `⤷` to move it to another space. Right-click a pill for rename / move / delete; deleting a space returns its workspaces to Default.
- **`Ctrl+Shift+1…9`** switches to the n-th space (Default is 1). This chord used to jump between conversations; that binding is gone.
- Environment child workspaces (per-conversation worktrees created by `dsh-workspace-console`) follow their parent's space automatically.

State lives in `~/.dsh/settings.yaml` under `sidebar-tray:` (`spaces`, `activeSpaceId`, `settledSessionIds`) so it survives restarts and is identical in every browser.

## Settled conversations

`▾` on a session row settles it: it leaves its group and moves to the **Settled** drawer above Settings, from where `↩` brings it back. Settling is reversible, unlike the harness archive.

## Build

```sh
node scripts/build.mjs   # regenerates lib/client.js, copies src/host.js to lib/index.js
node --test test/*.mjs
```
