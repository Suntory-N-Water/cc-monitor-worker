#!/bin/bash
set -euo pipefail

aqua install --only-link

if ! grep -q "pnpm-completion.bash" ~/.bashrc; then
  mkdir -p ~/.local/share/pnpm-completion
  pnpm completion bash > ~/.local/share/pnpm-completion/pnpm.bash
  {
    echo ''
    echo '# pnpm-completion.bash'
    echo '[ -f ~/.local/share/pnpm-completion/pnpm.bash ] && . ~/.local/share/pnpm-completion/pnpm.bash'
  } >> ~/.bashrc
fi


curl -fsSL https://claude.ai/install.sh | bash
