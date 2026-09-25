# Making the panel's Update / Reload buttons safe to use

## The problem

GUIDES.md already warns about this:

> The panel's built-in **Update** button pulls the *official* `dokploy/dokploy`
> image and will overwrite this build. Do **not** use it.

Traced both button code paths — there are actually **two** places this happens,
not one:

| UI button | Component | tRPC mutation | Server code |
|---|---|---|---|
| "Update Server" (in the Update dialog) | `apps/dokploy/components/dashboard/settings/web-server/update-webserver.tsx` | `settings.updateServer` | `apps/dokploy/server/api/routers/settings.ts:553` |
| "Reload Server" (dokploy server actions) | `apps/dokploy/components/dashboard/settings/servers/actions/show-dokploy-actions.tsx:38` | `settings.reloadServer` | `apps/dokploy/server/api/routers/settings.ts:92` → `reloadDockerResource()` in `packages/server/src/services/settings.ts:283` |

Both end up running `docker service update --image dokploy/dokploy:<tag> dokploy`
against the **official** Docker Hub image — neither knows this is a fork.

The version-check that drives the Update dialog (`getUpdateData`,
`packages/server/src/services/settings.ts:48-137`) already has special-case
handling for `canary`/`feature` branches: instead of semver, it compares the
Docker **image digest** currently running (`docker service inspect`) against
the digest of that tag on Docker Hub. That's exactly the right check for a
branch-tracking fork — it's just hardcoded to `dokploy/dokploy`
(`settings.ts:53`).

## Chosen plan: point the existing flow at our own registry

Don't rebuild the update mechanism — repoint the three hardcoded
`dokploy/dokploy` strings at our own public Docker Hub repo
(`seeedstack/bokploy`), and publish new images from a personal machine
instead of the server. The existing check → confirm → wait → reload UX on
the panel is reused completely unchanged; only where the image gets built
and pushed changes.

### Code changes

Hardcode `seeedstack/bokploy` directly (no env var — see "Alternatives
considered" for why):

- `packages/server/src/services/settings.ts:53` — Docker Hub API URL used by
  `getUpdateData`.
- `packages/server/src/services/settings.ts:298` — inside `reloadDockerResource()`,
  the "Reload Server" path.
- `apps/dokploy/server/api/routers/settings.ts:565` — inside the `updateServer`
  mutation, the "Update Server" path.

### Build moves to the personal machine, not the server

Build machine is Apple Silicon (arm64); the Dokploy server is Ubuntu 24 on
Intel (amd64) — cross-arch, so the build must target `linux/amd64` explicitly
via `buildx`, not a plain `docker build`.

- New script (adapted from `sync-and-deploy.sh`'s merge+build steps) runs on
  the Mac: `git fetch`/merge `upstream/canary` → `docker buildx build
  --platform linux/amd64 -t seeedstack/bokploy:canary --push .`. Must be
  tagged exactly `canary` — that's the tag `getUpdateData` looks up for the
  digest comparison. Docker Desktop ships `buildx` + QEMU emulation already,
  so no extra setup — just a slower (emulated) build than native.
- `sync-and-deploy.sh` on the server keeps its DB-backup + local
  `docker service update` steps for standalone/manual use, but they're no
  longer on the routine update path — the panel's Update button now does the
  pull+redeploy once the Mac has pushed a new image.
- Server no longer needs `docker login` at all — it only pulls, and pulling
  a public image needs no credentials anywhere.

### One-time setup

0. **Verify before touching anything**: SSH in and run
   `docker service inspect dokploy --format '{{json .Spec.TaskTemplate.ContainerSpec.Env}}'`
   to check whether `RELEASE_TAG` is already set on the live service, and to
   what. This matters more than it looks — `getDokployImageTag()`
   (`packages/server/src/services/settings.ts:29`) is
   `process.env.RELEASE_TAG || "latest"`, and the digest-comparison branch
   this whole plan relies on only runs when that resolves to `"canary"` or
   `"feature"`. Nothing in this repo (`sync-and-deploy.sh`, Dockerfile,
   compose) sets `RELEASE_TAG` — the only place it's referenced is its own
   definition. Today's `sync-and-deploy.sh` also deploys under the tag
   `dokploy/dokploy:envinherit`, not `canary`. So it's not yet confirmed that
   the digest-comparison branch is even active in production — if it isn't,
   `getUpdateData` is currently falling through to the semver branch, which
   would keep doing that even after the registry-string edit (checking a
   `seeedstack/bokploy` repo that will never have a `latest`/`v*` tag), and
   silently report "no update available" forever instead of erroring.
1. `docker login -u seeedstack` — once, on the **personal Mac** (the only
   place now running `docker push`). Credentials persist in
   `~/.docker/config.json`; the server never needs this.
2. Ship this code change itself via the existing manual path (SSH +
   `sync-and-deploy.sh`, or the GUIDES.md commands). Unavoidable bootstrap —
   the new repo-pointing logic only exists once the new image is running, so
   the very first deploy of this change can't go through the button. **If
   step 0 showed `RELEASE_TAG` isn't already `canary`, set it in this same
   bootstrap command**, e.g.:
   `docker service update --force --env-add RELEASE_TAG=canary --image seeedstack/bokploy:canary dokploy`
   — no separate step needed, just don't deploy without it. Every deploy
   after this one can go through the button, as long as the Mac has pushed a
   matching `seeedstack/bokploy:canary` image first.
3. Before relying on the Mac build for a real update, time one buildx run
   end-to-end. This repo pulls in three native-compiled modules (`bcrypt`,
   `better-sqlite3`, `sharp`) — cross-compiling those `--platform linux/amd64`
   on Apple Silicon runs node-gyp under QEMU emulation, which is commonly
   5–10x slower than a native build and occasionally flaky/OOM-prone on a
   resource-capped Docker Desktop VM. "A few extra minutes" was an
   unverified guess; measure it once instead of assuming it.

### Gaps found during review (and fixed above)

- `reloadDockerResource()` (`settings.ts:298`) has its **own** copy of the
  hardcoded image string, completely independent of `updateServer`. Missed on
  the first pass — fixing only the Update button would have left the Reload
  button still overwriting the fork.
- `dokploy-backup-*.sql` (written by `sync-and-deploy.sh`'s DB backup step)
  is not in `.gitignore`. Not a blocker for this plan since the script's git
  dirty-tree check already runs before the backup step, but worth fixing
  separately — it's a landmine for any future automation of this script.
- Silent-failure blind spot in `getUpdateData` (pre-existing, not introduced
  here): if `docker service inspect` ever can't resolve the running image to
  a digest, the function's outer `catch` swallows the error and reports "no
  update available" with no visible error anywhere.

## Alternatives considered and rejected

### A. Rewire `updateServer` to spawn `sync-and-deploy.sh` from inside the container

The first design explored: have the `updateServer` mutation directly
`spawnAsync` the full script (fetch/merge upstream/build/push/deploy) from
inside the `dokploy` container itself.

Rejected because:
- **Self-kill race** — the script's own `docker service update` step replaces
  the very container running it, killing the script mid-`git push` /
  mid-log-tail.
- Needed new infra the container doesn't have: the git checkout bind-mounted
  in, a git deploy key inside the container (alongside the already-present
  `docker.sock`, i.e. root-equivalent host access — bigger blast radius if
  compromised), and a rewritten status-reporting mechanism since the current
  UI's blind-8-second-wait-then-poll-health pattern is wrong for a build that
  takes minutes.

### B. Host-side cron/flock runner, decoupled from the container lifecycle

Second design, meant to fix (A)'s self-kill race properly: `updateServer`
just touches a trigger file; a `flock`-guarded cron job on the host (outside
any container) picks it up, runs the script, verifies the *new* container's
health after the old one is replaced, and rolls back via
`docker service update --rollback dokploy` on failure. Status persisted to a
file on the already-mounted `/etc/dokploy` path so it survives the container
swap.

More robust than (A) — genuinely solves the self-kill race and adds real
rollback — but rejected as unnecessary complexity once we noticed the
existing digest-comparison update-check code already does what's needed, and
that the current button's self-replacing `docker service update` already
works fine in production for the official image today. No new subsystem,
lock file, or rollback logic needed for the problem actually in front of us.

### C. GitHub Container Registry instead of Docker Hub

Considered because the repo already lives on GitHub. Rejected: GHCR
implements the OCI Distribution spec, not Docker Hub's v2 REST API —
`getUpdateData`'s digest lookup would need a real rewrite (anonymous bearer
token exchange, reading the digest out of a response header instead of JSON)
instead of a one-line URL swap. Docker Hub keeps the change to three
hardcoded strings.

### D. Env-var-driven repo name instead of hardcoding

Considered `process.env.UPDATE_IMAGE_REPO || "dokploy/dokploy"` to avoid ever
conflicting with upstream on that line during `git merge upstream/canary`.
Rejected in favor of hardcoding `seeedstack/bokploy` directly — one fewer
one-time server command (`docker service update --env-add ...`), at the cost
of an occasional trivial one-line merge conflict, which is cheaper than the
extra setup step.
