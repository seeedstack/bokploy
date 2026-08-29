# Docker

Here's how to install docker on different operating systems:

## macOS

1. Visit [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
2. Download the Docker Desktop installer
3. Double-click the downloaded `.dmg` file
4. Drag Docker to your Applications folder
5. Open Docker Desktop from Applications
6. Follow the onboarding tutorial if desired

## Linux

### Ubuntu

```bash
# Uninstall old versions
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt-get remove $pkg; done

# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings

# Add Docker's official GPG key
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## Windows

1. Enable WSL2 if not already enabled
2. Visit [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
3. Download the installer
4. Run the installer and follow the prompts
5. Start Docker Desktop from the Start menu

# Updating the server build

Once `merge-env-inheritance` is folded into this fork's `canary`, rebuild and
redeploy the running Dokploy Swarm service from it.

> ⚠️ This is a **fork** (`seeedstack/bokploy`). The panel's built-in **Update**
> button pulls the *official* `dokploy/dokploy` image and will overwrite this
> build. Do **not** use it — update by building/pushing your own image below.

## First-time clone (skip if `bokploy` is already checked out on the server)

```bash
git clone -b canary git@github.com:seeedstack/bokploy.git bokploy
cd bokploy
```

## 0. Back up the database first

```bash
docker exec "$(docker ps -q -f name=dokploy-postgres)" \
  pg_dump -U dokploy dokploy > dokploy-backup-$(date +%F).sql
```

## On the server

```bash
cd bokploy
git fetch origin
git checkout canary
git pull
docker build -t dokploy/dokploy:envinherit -f Dockerfile .
docker service update --image dokploy/dokploy:envinherit dokploy
```

## Verify the update

```bash
# Watch the service restart and run the migration
docker service logs dokploy --tail 80 --follow
```

Look for the migration step running with no errors, then
`Server Started on: http://0.0.0.0:3000`.

## Staying current with upstream Dokploy fixes

Add the upstream remote once:

```bash
git remote add upstream https://github.com/Dokploy/dokploy.git
```

Then, whenever you want to pull in upstream fixes:

```bash
git fetch upstream
git merge upstream/canary
# rebuild + redeploy using the two docker commands above
```