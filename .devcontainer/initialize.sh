#!/bin/bash

set -euo pipefail

mkdir -p ~/.claude
[ ! -f ~/.claude.json ] && echo "{}" > ~/.claude.json

docker volume create devcontainer-aqua-pkgs
docker volume create devcontainer-pnpm-global-store
docker volume create devcontainer-bun-install-cache
docker volume create devcontainer-claude-binary
docker volume create devcontainer-gh-config

if [ ! -e .devcontainer/.env ]; then
  BASENAME=$(basename "$(pwd)")
  echo "BASENAME=${BASENAME}" > .devcontainer/.env
fi
