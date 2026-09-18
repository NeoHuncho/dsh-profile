# Sourced by the lab scripts. A lab harness is a second `dsh web` booted with
# its OWN DSH_HOME (~/.dsh-lab/<slug>) so its sessions, storage and settings
# never touch the live harness at ~/.dsh. The profile it runs is this worktree.
: "${ENV_SLUG:?ENV_SLUG missing}"; : "${ENV_DIR:?ENV_DIR missing}"
LIVE_HOME="${LIVE_DSH_HOME:-$HOME/.dsh}"
LAB_HOME="$(cd "$ENV_DIR/../.." && pwd)"     # ~/.dsh-lab/<slug>
LAB_PORT="${ENV_PORT_0:-3081}"
PID_FILE="$LAB_HOME/dsh-web.pid"
LOG_FILE="$LAB_HOME/dsh-web.log"
DSH_BIN="$(command -v dsh || echo "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" | sort -V | tail -1)/bin/dsh")"
