#!/bin/bash
# Remove the lab DSH_HOME (sessions/storage of the lab harness). The worktree
# itself is removed by the engine afterwards; the lab/<slug> branch is kept.
set -uo pipefail
cd "$ENV_DIR"; source scripts/env/common.sh
scripts/env/harness.sh stop || true
case "$LAB_HOME" in
  "$HOME"/.dsh-lab/*) rm -rf "$LAB_HOME/sessions" "$LAB_HOME/storages" "$LAB_HOME/attachments" "$LAB_HOME"/*.log "$LAB_HOME"/*.pid "$LAB_HOME/settings.yaml" "$LAB_HOME/README.txt" "$LAB_HOME/.credentials.yaml" "$LAB_HOME/plugins" "$LAB_HOME/guards" ;;
  *) echo "refusing to clean unexpected LAB_HOME=$LAB_HOME" ;;
esac
exit 0
