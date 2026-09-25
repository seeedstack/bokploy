#!/usr/bin/env bash
set -euo pipefail

REMOTE_UPSTREAM_URL="https://github.com/Dokploy/dokploy.git"
UPSTREAM_BRANCH="canary"
IMAGE_TAG="seeedstack/bokploy:canary"
SERVICE_NAME="dokploy"

SKIP_MERGE=false
SKIP_PULL=false
SYNC_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --skip-merge) SKIP_MERGE=true ;;
    --skip-pull) SKIP_PULL=true ;;
    --sync-only) SYNC_ONLY=true ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree dirty. Commit or stash before running this." >&2
  git status --short
  exit 1
fi

if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream "$REMOTE_UPSTREAM_URL"
fi

git fetch origin
git fetch upstream
git checkout canary

if [[ "$SYNC_ONLY" == false ]]; then
  PG_CONTAINER="$(docker ps -q -f name=dokploy-postgres | head -n1)"
  if [[ -z "$PG_CONTAINER" ]]; then
    echo "No dokploy-postgres container found, aborting before touching git/deploy." >&2
    exit 1
  fi

  echo "Backing up database..."
  docker exec "$PG_CONTAINER" pg_dump -U dokploy dokploy \
    > "dokploy-backup-$(date +%F-%H%M%S).sql"
fi

if [[ "$SKIP_PULL" == false ]]; then
  git pull origin canary
fi

if [[ "$SKIP_MERGE" == false ]]; then
  echo "Merging upstream/$UPSTREAM_BRANCH..."
  if ! git merge "upstream/$UPSTREAM_BRANCH" --no-edit; then
    echo
    echo "Merge conflict. Resolve manually, then:"
    echo "  git add <files> && git commit"
    echo "  ./sync-and-deploy.sh --skip-pull --skip-merge"
    exit 1
  fi
fi

cp apps/dokploy/.env.production.example .env.production
cp apps/dokploy/.env.production.example apps/dokploy/.env.production

if [[ "$SYNC_ONLY" == true ]]; then
  echo "Sync done, pushing canary to origin..."
  git push origin canary

  echo "Building + pushing image $IMAGE_TAG..."
  docker buildx build --platform linux/amd64 -t "$IMAGE_TAG" --push .
  exit 0
fi

echo "Building image $IMAGE_TAG..."
docker build -t "$IMAGE_TAG" -f Dockerfile .

echo "Deploying to service $SERVICE_NAME..."
docker service update --image "$IMAGE_TAG" "$SERVICE_NAME"

echo "Build + deploy ok, pushing canary to origin..."
git push origin canary

echo "Watching rollout (ctrl-c to stop watching, deploy continues)..."
docker service logs "$SERVICE_NAME" --tail 80 --follow
