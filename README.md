# Bokploy
Bokploy is a custom build of Dokploy, a free, self-hostable Platform as a Service (PaaS) that simplifies the deployment and management of applications and databases.

## ✨ Features

Bokploy includes everything in Dokploy and my custom integration.

- **Applications**: Deploy any type of application (Node.js, PHP, Python, Go, Ruby, etc.).
- **Databases**: Create and manage databases with support for MySQL, PostgreSQL, MongoDB, MariaDB, libsql, and Redis.
- **Backups**: Automate backups for databases to an external storage destination.
- **Docker Compose**: Native support for Docker Compose to manage complex applications.
- **Multi Node**: Scale applications to multiple nodes using Docker Swarm to manage the cluster.
- **Templates**: Deploy open-source templates (Plausible, Pocketbase, Calcom, etc.) with a single click.
- **Traefik Integration**: Automatically integrates with Traefik for routing and load balancing.
- **Real-time Monitoring**: Monitor CPU, memory, storage, and network usage for every resource.
- **Docker Management**: Easily deploy and manage Docker containers.
- **CLI/API**: Manage your applications and databases using the command line or through the API.
- **Notifications**: Get notified when your deployments succeed or fail (via Slack, Discord, Telegram, Email, etc.).
- **Multi Server**: Deploy and manage your applications remotely to external servers.
- **Self-Hosted**: Self-host Dokploy on your VPS.

## 🚀 Getting Started

For detailed documentation, visit [docs.dokploy.com](https://docs.dokploy.com).

## 🍴 This fork

This is `seeedstack/bokploy`, a fork of Dokploy that tracks `upstream/canary` and publishes its own image, `seeedstack/bokploy:canary`. The panel's **Update** and **Reload Server** buttons pull from that repo (hardcoded in `packages/server/src/services/settings.ts` and `apps/dokploy/server/api/routers/settings.ts`), so they are safe to use.

Requires [Docker](https://docs.docker.com/engine/install/) (with buildx) on the build machine.

### Updating

Images are built on a personal machine, not the server. The server is amd64, so the build must target `linux/amd64` (`buildx`); on Apple Silicon this runs under QEMU and is slow.

1. On your machine (once: `docker login -u seeedstack`):
   ```bash
   git remote add upstream https://github.com/Dokploy/dokploy.git   # first time only
   ./sync-and-deploy.sh --sync-only
   ```
   This merges `upstream/canary`, pushes `canary` to origin, then builds and pushes `seeedstack/bokploy:canary`. On a merge conflict, resolve it, commit, and rerun with `--skip-pull --skip-merge`.
2. In the panel, press **Update**.

The update check compares image digests, which only happens when the service has `RELEASE_TAG=canary`. Set it once (this is also the manual bootstrap/redeploy command):

```bash
docker service update --force --env-add RELEASE_TAG=canary --image seeedstack/bokploy:canary dokploy
```

Back up the database before an update that includes migrations:

```bash
docker exec "$(docker ps -q -f name=dokploy-postgres)" \
  pg_dump -U dokploy dokploy > dokploy-backup-$(date +%F).sql
```

Verify with `docker service logs dokploy --tail 80 --follow` and look for the migration finishing, then `Server Started on: http://0.0.0.0:3000`.

If an update breaks the panel, roll back to the previous task spec:

```bash
docker service update --rollback dokploy
```

Running `./sync-and-deploy.sh` without `--sync-only` on the server instead backs up the DB, builds locally, and redeploys the service.

## 🔒 Security

Report vulnerabilities privately to [contact@dokploy.com](mailto:contact@dokploy.com) with a description, reproduction steps, and impact. Don't disclose publicly until fixed. Don't access data beyond what's needed to demonstrate the issue, and no DoS, spam, or social engineering.
