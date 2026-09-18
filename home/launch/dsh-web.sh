#!/bin/zsh
# Launch script for the DeepSeek Harness web profile, run by launchd
# (com.deepseek.harness.web). Installed by scripts/install-home.sh, which
# symlinks $DSH_HOME/launch -> <repo>/home/launch.

export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

PORT="${DSH_WEB_PORT:-3080}"

# launchd gives us a minimal PATH. Prefer the node that owns the dsh install:
# nvm's current default first, then Homebrew, then whatever is already there.
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_NODE="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NVM_NODE" ] && export PATH="$NVM_NODE:$PATH"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

DSH_BIN="$(command -v dsh || true)"
if [ -z "$DSH_BIN" ]; then
  echo "dsh not found on PATH; install with: npm i -g @deepseek-ai/dsh" >&2
  exit 1
fi

# Another dsh (for example one started by hand in a terminal) may already own the
# port. Wait for it to go away instead of exiting, which under KeepAlive would
# turn into a crash-restart loop. On a real restart the port frees within a
# second or two, so this normally does not wait at all.
while /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  echo "$(date '+%Y-%m-%dT%H:%M:%S') port $PORT still in use; waiting" >&2
  sleep 3
done

# --no-open: at login we only want the server; opening the browser is the
# user's choice, not something that should happen on every boot.
exec "$DSH_BIN" web --no-open --port "$PORT"
