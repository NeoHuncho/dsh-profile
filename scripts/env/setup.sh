#!/bin/bash
# Prepare a lab DSH_HOME around this worktree:
#   ~/.dsh-lab/<slug>/            DSH_HOME of the lab harness
#     profiles/web -> (this worktree, created by the harness engine)
#     .credentials.yaml           symlink -> live (API keys)
#     plugins/subscriptions/*     symlink -> live (ChatGPT/Claude/Grok logins are shared)
#     settings.yaml               COPY of live (edit freely; port + guard paths adjusted)
set -euo pipefail
cd "$ENV_DIR"; source scripts/env/common.sh

# Private dependency install (workspace packages must link to THIS worktree's
# packages/*, so node_modules cannot be shared with the main checkout).
pnpm install --offline --frozen-lockfile 2>/dev/null || pnpm install --frozen-lockfile

# Build every first-party package so lib/ matches this worktree's src/.
for pkg in packages/*/; do
  [ -f "$pkg/scripts/build.mjs" ] && (cd "$pkg" && node scripts/build.mjs)
done

mkdir -p "$LAB_HOME/plugins" "$LAB_HOME/storages" "$LAB_HOME/sessions"
[ -e "$LAB_HOME/.credentials.yaml" ] || [ ! -f "$LIVE_HOME/.credentials.yaml" ] || ln -s "$LIVE_HOME/.credentials.yaml" "$LAB_HOME/.credentials.yaml"
[ -e "$LAB_HOME/plugins/subscriptions" ] || [ ! -d "$LIVE_HOME/plugins/subscriptions" ] || ln -s "$LIVE_HOME/plugins/subscriptions" "$LAB_HOME/plugins/subscriptions"
[ -e "$LAB_HOME/settings.yaml" ] || [ ! -f "$LIVE_HOME/settings.yaml" ] || cp "$LIVE_HOME/settings.yaml" "$LAB_HOME/settings.yaml"
# Guards/launch: the lab reuses this worktree's copies.
[ -e "$LAB_HOME/guards" ] || ln -s "$ENV_DIR/home/guards" "$LAB_HOME/guards"

cat > "$LAB_HOME/README.txt" <<TXT
Lab harness "$ENV_SLUG" — DSH_HOME=$LAB_HOME, profile worktree $ENV_DIR (branch $ENV_BRANCH)
  start/stop/restart/status/logs:  scripts/env/harness.sh <cmd>   (from the worktree)
  URL: http://127.0.0.1:$LAB_PORT
Subscription logins and API credentials are symlinked from $LIVE_HOME; sessions/storage are private.
TXT
echo "lab $ENV_SLUG ready at $LAB_HOME (port $LAB_PORT). Start with: scripts/env/harness.sh start"
