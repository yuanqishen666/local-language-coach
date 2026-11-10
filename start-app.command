#!/bin/sh

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
"$SCRIPT_DIR/start-app.sh"
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
  printf '\n启动没有完成。按回车键关闭此窗口。\n'
  read -r _
fi

exit "$EXIT_CODE"
