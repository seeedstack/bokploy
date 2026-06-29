# Deploying the Env-Var Inheritance build to a server

This guide updates a running self-hosted Dokploy server to the
`feat/env-var-inheritance` build.

> ⚠️ This is a **fork** (`seeedstack/bokploy`). The panel's **Update** button
> pulls the *official* `dokploy/dokploy` image and will overwrite this build.
> Do **not** use it. Update by building/pushing your own image as below.

The branch lives at:
`https://github.com/seeedstack/bokploy/tree/feat/env-var-inheritance`

---

## What this update changes

- Adds 3 columns via migration `0173_last_deadpool.sql`:
  - `organization.env`, `server.env` (default `''`)
  - `project.enableEnvInheritance` (default `false`)
- Migrations run **automatically** on container start (`dist/migration.mjs`
  runs before the server boots).
- **Backward compatible:** every existing project gets `enableEnvInheritance =
  false`, so behavior is identical to before. Only newly created projects
  default to inheritance ON.

The migration is additive and reversible (drop the 3 columns). No data rewrite.

---

## 0. Backup the database first

```bash
# Find the Dokploy Postgres container and dump it
docker exec "$(docker ps -q -f name=dokploy-postgres)" \
  pg_dump -U dokploy dokploy > dokploy-backup-$(date +%F).sql
```

Keep `dokploy-backup-*.sql` somewhere safe before continuing.

---

## Option A — build on the server (single Swarm node, simplest)

No registry needed. Swarm can use a locally built image on a one-node cluster.

```bash
# 1. Clone the branch
git clone -b feat/env-var-inheritance \
  git@github.com:seeedstack/bokploy.git bokploy
cd bokploy

# 2. Build the image (tag it however you like)
docker build -t dokploy/dokploy:envinherit -f Dockerfile .

# 3. Point the running service at the new image
docker service update --image dokploy/dokploy:envinherit dokploy
```

---

## Option B — build elsewhere, push to a registry

Use this for multi-node Swarm, or to build off the server.

```bash
# On your build machine
git clone -b feat/env-var-inheritance \
  git@github.com:seeedstack/bokploy.git bokploy
cd bokploy

docker login                      # log in to your registry
docker buildx build --platform linux/amd64 \
  -t YOURNAME/dokploy:envinherit -f Dockerfile . --push
```

```bash
# On the server
docker service update --image YOURNAME/dokploy:envinherit dokploy
```

Replace `YOURNAME` with your Docker Hub / GHCR namespace.

---

## Verify the update

```bash
# Watch the service restart and run the migration
docker service logs dokploy --tail 80 --follow
```

Look for the migration step running with no errors, then
`Server Started on: http://0.0.0.0:3000`.

Confirm the schema:

```bash
docker exec "$(docker ps -q -f name=dokploy-postgres)" \
  psql -U dokploy -d dokploy -c \
  "select column_name from information_schema.columns
   where table_name='project' and column_name='enableEnvInheritance';"
```

Then in the panel: open a **project → Update**. You should see the
**“Automatic environment variable inheritance”** toggle (off for existing
projects, on for newly created ones).

---

## Rollback

```bash
# Revert to the previous image (use the tag you replaced)
docker service update --image dokploy/dokploy:OLDTAG dokploy

# Restore the database if needed
cat dokploy-backup-YYYY-MM-DD.sql | docker exec -i \
  "$(docker ps -q -f name=dokploy-postgres)" psql -U dokploy -d dokploy
```

Dropping the 3 new columns is safe if you also restore the matching image; the
old code never references them.

---

## How inheritance behaves after the update

- **Existing projects:** unchanged (reference-only, `${{project.X}}` style).
- **New projects:** inherit `Global (org) → Project → Environment → Service`,
  service values win. Toggle per project in **Project → Update**.
- **Server scope:** `server.env` is injected only into workloads deployed to
  that server; moving an app to another server does not carry the old server's
  vars.
- **Build args** (`buildArgs`) never auto-inherit, to avoid baking secrets into
  image layers.
- **Compose deploys** are blocked when a required `${VAR:?}` reference is
  unresolved; unresolved optional `${VAR}` only warn.
