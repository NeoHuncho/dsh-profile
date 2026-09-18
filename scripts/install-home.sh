#!/usr/bin/env bash
# Wire this profile repo into a DeepSeek Harness home.
#
#   DSH_HOME=~/.dsh scripts/install-home.sh            # default home
#   DSH_HOME=~/.dsh-lab/foo scripts/install-home.sh --no-launchd
#
# What it does (idempotent):
#   1. Symlinks $DSH_HOME/guards -> <repo>/home/guards   (PreToolUse process guard)
#   2. Symlinks $DSH_HOME/launch -> <repo>/home/launch   (launchd start script)
#   3. On macOS, installs ~/Library/LaunchAgents/com.deepseek.harness.web.plist
#      from the template (skip with --no-launchd). It does NOT load/restart it.
#
# It never touches sessions/, storages/, settings.yaml or credentials.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
LAUNCHD=1
for arg in "$@"; do
  case "$arg" in
    --no-launchd) LAUNCHD=0 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$DSH_HOME"

link() { # link <target> <linkpath>
  local target="$1" link="$2"
  if [ -L "$link" ]; then
    rm "$link"
  elif [ -e "$link" ]; then
    local backup="$link.bak.$(date +%s)"
    echo "backing up existing $link -> $backup"
    mv "$link" "$backup"
  fi
  ln -s "$target" "$link"
  echo "linked $link -> $target"
}

link "$REPO/home/guards" "$DSH_HOME/guards"
link "$REPO/home/launch" "$DSH_HOME/launch"

if [ "$LAUNCHD" = 1 ] && [ "$(uname)" = Darwin ]; then
  PLIST="$HOME/Library/LaunchAgents/com.deepseek.harness.web.plist"
  mkdir -p "$(dirname "$PLIST")"
  sed -e "s|__DSH_HOME__|$DSH_HOME|g" -e "s|__HOME__|$HOME|g" \
    "$REPO/home/launch/com.deepseek.harness.web.plist.template" > "$PLIST"
  echo "wrote $PLIST (load with: launchctl bootstrap gui/\$(id -u) $PLIST)"
fi

echo
echo "Profile expected at: $DSH_HOME/profiles/web"
if [ "$(cd "$DSH_HOME/profiles/web" 2>/dev/null && pwd -P)" != "$(cd "$REPO" && pwd -P)" ]; then
  echo "  (this repo is at $REPO — clone or symlink it there if it is not already)"
fi
echo "Then: cd $DSH_HOME/profiles/web && pnpm install && dsh web"
