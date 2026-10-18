#!/usr/bin/env bash
# Deploy control for taxtracks -> gmktec home server. Run from the Mac.
# Usage: deploy/deploy.sh <init|deploy|db-push|db-pull|logs|status|restart|stop>
set -euo pipefail

HOST="${DEPLOY_HOST:-gmktec}"
ROOT="${DEPLOY_ROOT:-apps/taxtracks}"   # relative to $HOME on the server
SRC="$ROOT/src"
DATA="$ROOT/data"
COMPOSE="docker compose -f deploy/compose.yml"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DB="$REPO_ROOT/data/taxtracks.db"

stamp() { date +%Y%m%d-%H%M%S; }

confirm() {
  read -r -p "$1 [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]]
}

cmd_init() {
  ssh "$HOST" "mkdir -p ~/$SRC ~/$DATA"
  if ssh "$HOST" "test -f ~/$ROOT/env"; then
    echo "env file already exists on server -- leaving it alone"
  else
    scp "$REPO_ROOT/deploy/env.example" "$HOST:$ROOT/env"
    echo "uploaded env template -> ~/$ROOT/env  (ssh in and fill real values)"
  fi
  echo "init done: ~/$ROOT/{src,data,env} ready on $HOST"
}

cmd_deploy() {
  cd "$REPO_ROOT"
  if ! ssh "$HOST" "test -f ~/$ROOT/env"; then
    echo "no ~/$ROOT/env on $HOST -- run '$0 init' and fill in the env file first" >&2
    exit 1
  fi
  if ! git diff-index --quiet HEAD --; then
    echo "warning: uncommitted changes -- deploying committed HEAD only" >&2
  fi
  local tmp
  tmp="$(mktemp -d)"
  # expand $tmp now: it's a local and would be gone when the EXIT trap fires
  trap "rm -rf '$tmp'" EXIT
  git archive HEAD | tar -x -C "$tmp"
  rsync -az --delete "$tmp"/ "$HOST:$SRC/"
  # make the bind-mount target ourselves: if docker creates it, it lands
  # root-owned and the uid-1000 container can't write the sqlite file
  ssh "$HOST" "mkdir -p ~/$DATA"
  ssh "$HOST" "set -e; cd ~/$SRC; $COMPOSE build app; $COMPOSE up -d app"
  echo "deployed $(git rev-parse --short HEAD) -> https://taxtracks.mustbemerrick.com"
}

# The db runs in WAL mode: recent writes can sit in the -wal sidecar file for a while
# before SQLite folds them into the main .db file. Copying just the main file (as scp
# does) without checkpointing first can silently ship a stale/empty-looking db.
checkpoint_local() {
  node -e "new (require('node:sqlite').DatabaseSync)('$LOCAL_DB').exec('PRAGMA wal_checkpoint(TRUNCATE)')"
}

checkpoint_remote() {
  ssh "$HOST" "cd ~/$SRC && $COMPOSE exec -T app node -e \"new (require('node:sqlite').DatabaseSync)('/app/data/taxtracks.db').exec('PRAGMA wal_checkpoint(TRUNCATE)')\""
}

cmd_db_push() {
  [[ -f "$LOCAL_DB" ]] || { echo "no local db at $LOCAL_DB" >&2; exit 1; }
  checkpoint_local
  confirm "Overwrite the SERVER database with your local copy?" || exit 1
  ssh "$HOST" "if [ -f ~/$DATA/taxtracks.db ]; then cp ~/$DATA/taxtracks.db ~/$DATA/taxtracks.db.backup-$(stamp); fi"
  scp "$LOCAL_DB" "$HOST:$DATA/taxtracks.db"
  # drop stale -wal/-shm sidecars left over from the server's previous db generation --
  # otherwise the app can reopen against mismatched WAL frames instead of the fresh file
  ssh "$HOST" "rm -f ~/$DATA/taxtracks.db-wal ~/$DATA/taxtracks.db-shm"
  # restart so the app reopens the new file instead of holding the old one
  ssh "$HOST" "cd ~/$SRC 2>/dev/null && $COMPOSE restart app || true"
  echo "local db pushed to server (server copy backed up first)"
}

cmd_db_pull() {
  checkpoint_remote
  confirm "Overwrite your LOCAL database with the server copy?" || exit 1
  [[ -f "$LOCAL_DB" ]] && cp "$LOCAL_DB" "$LOCAL_DB.backup-$(stamp)"
  scp "$HOST:$DATA/taxtracks.db" "$LOCAL_DB"
  # drop stale local sidecars for the same reason the push side does
  rm -f "$LOCAL_DB-wal" "$LOCAL_DB-shm"
  echo "server db pulled to $LOCAL_DB (local copy backed up first)"
}

cmd_logs()    { ssh "$HOST" "cd ~/$SRC && $COMPOSE logs -f --tail=200 app"; }
cmd_status()  { ssh "$HOST" "cd ~/$SRC && $COMPOSE ps"; }
# `up -d`, not `restart`: restart reuses the existing container's already-baked-in
# env, so editing the env file and running `restart` would silently keep serving the
# old values. `up -d` recreates the container, picking up env file changes too.
cmd_restart() { ssh "$HOST" "cd ~/$SRC && $COMPOSE up -d app"; }
cmd_stop()    { ssh "$HOST" "cd ~/$SRC && $COMPOSE stop app"; }

case "${1:-}" in
  init)     cmd_init ;;
  deploy)   cmd_deploy ;;
  db-push)  cmd_db_push ;;
  db-pull)  cmd_db_pull ;;
  logs)     cmd_logs ;;
  status)   cmd_status ;;
  restart)  cmd_restart ;;
  stop)     cmd_stop ;;
  *) echo "usage: $0 <init|deploy|db-push|db-pull|logs|status|restart|stop>" >&2; exit 1 ;;
esac
