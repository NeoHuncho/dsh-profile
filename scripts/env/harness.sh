#!/bin/bash
# Control the lab harness for this worktree environment.
#   scripts/env/harness.sh start|stop|restart|status|logs|run
# `run` stays in the foreground (used by the harness engine's Start button);
# `start` detaches (for agents working inside the worktree). Both write the pid
# file so stop/restart/status work regardless of who started it.
set -uo pipefail
cd "$(dirname "$0")/../.."
export ENV_DIR="${ENV_DIR:-$PWD}"
if [ -z "${ENV_SLUG:-}" ]; then ENV_SLUG="$(basename "$(cd "$ENV_DIR/../.." && pwd)")"; fi
export ENV_SLUG
source scripts/env/common.sh

alive() { [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; }
listening() { /usr/sbin/lsof -nP -iTCP:"$LAB_PORT" -sTCP:LISTEN -t 2>/dev/null; }

do_stop() {
  local pids; pids="$( { [ -f "$PID_FILE" ] && cat "$PID_FILE"; listening; } | sort -u )"
  [ -z "$pids" ] && { echo "lab $ENV_SLUG: not running"; rm -f "$PID_FILE"; return 0; }
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null
  for _ in $(seq 1 40); do [ -z "$(listening)" ] && ! alive && break; sleep 0.25; done
  [ -n "$(listening)" ] && kill -9 $(listening) 2>/dev/null
  rm -f "$PID_FILE"; echo "lab $ENV_SLUG: stopped"
}

case "${1:-status}" in
  run)
    do_stop >/dev/null
    echo "lab $ENV_SLUG: DSH_HOME=$LAB_HOME → http://127.0.0.1:$LAB_PORT"
    echo $$ > "$PID_FILE"
    exec env DSH_HOME="$LAB_HOME" "$DSH_BIN" web --no-open --port "$LAB_PORT" ;;
  start)
    do_stop >/dev/null
    nohup env DSH_HOME="$LAB_HOME" "$DSH_BIN" web --no-open --port "$LAB_PORT" >>"$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    for _ in $(seq 1 60); do [ -n "$(listening)" ] && break; sleep 0.5; done
    [ -n "$(listening)" ] && echo "lab $ENV_SLUG: started → http://127.0.0.1:$LAB_PORT (pid $(cat "$PID_FILE"))" || { echo "lab $ENV_SLUG: failed to start, see $LOG_FILE"; tail -20 "$LOG_FILE"; exit 1; } ;;
  stop) do_stop ;;
  restart) do_stop; exec "$0" start ;;
  status) if [ -n "$(listening)" ]; then echo "lab $ENV_SLUG: running → http://127.0.0.1:$LAB_PORT"; else echo "lab $ENV_SLUG: stopped"; fi ;;
  logs) tail -n "${2:-100}" -f "$LOG_FILE" ;;
  *) echo "usage: $0 start|stop|restart|status|logs|run" >&2; exit 2 ;;
esac
