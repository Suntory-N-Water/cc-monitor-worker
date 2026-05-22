# https://github.com/devcontainers/images/tree/main/src/base-debian
FROM mcr.microsoft.com/devcontainers/base:bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  colordiff \
  python3 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# コンテナ内ユーザー名を node に統一する
RUN groupmod -n node vscode \
  && usermod -l node vscode && usermod -d /home/node -m node \
  && echo "node ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/node && rm /etc/sudoers.d/vscode

ENV TZ=Asia/Tokyo

RUN mkdir -p /workspaces && chown node:node /workspaces

USER node:node
WORKDIR /workspaces

# aqua
ENV PATH="/home/node/.local/share/aquaproj-aqua/bin:${PATH}"
RUN mkdir -p /home/node/.local/share/aquaproj-aqua/pkgs

# pnpm
ENV PNPM_HOME="/home/node/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN mkdir -p "${PNPM_HOME}/store" \
  # pnpm v10 ではデフォルトストアがワークスペースルート直下になるため、Docker volume を使うよう明示設定
  && mkdir -p /home/node/.config/pnpm \
  && echo "store-dir=${PNPM_HOME}/store" > /home/node/.config/pnpm/rc

# bun
RUN mkdir -p /home/node/.bun/install/cache

# claude code
RUN mkdir -p /home/node/.local/share/claude

# gh
RUN mkdir -p /home/node/.config/gh
