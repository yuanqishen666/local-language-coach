#!/bin/sh

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR" || exit 1

# The installer's own copy of Node.js, when it had to bring one.
if [ -x "$SCRIPT_DIR/.runtime/node/bin/node" ]; then
  PATH="$SCRIPT_DIR/.runtime/node/bin:$PATH"
  export PATH
fi

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '无法启动：没有找到 Node.js。' '' '请从 https://nodejs.org/ 下载并安装 LTS 版本，重新打开终端后再试。'
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' '无法启动：没有找到 npm。' '' '标准 Node.js 安装会同时安装 npm。请从 https://nodejs.org/ 重新安装 LTS 版本。'
  exit 1
fi

exec npm start
