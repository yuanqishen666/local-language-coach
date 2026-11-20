#!/bin/sh
# Yujian installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/yuanqishen666/local-language-coach/main/scripts/install.sh | sh
#
# It downloads the app into ~/yujian, and when this computer has no Node.js new enough it puts a
# private copy of Node.js inside that folder (.runtime/node) without touching the system. Running it
# again updates the app; the data folder is never touched.
#
#   YUJIAN_DIR          where to install (default: ~/yujian)
#   YUJIAN_NO_START=1   install without starting
#   YUJIAN_GITHUB_MIRROR prefix GitHub URLs with a public proxy, for example https://gh-proxy.com
#   YUJIAN_NODE_MIRROR  where to download Node.js from (default: https://nodejs.org/dist)

set -eu

REPO='yuanqishen666/local-language-coach'
BRANCH="${YUJIAN_BRANCH:-main}"
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=13
NODE_LINE='latest-v22.x'

case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in
  zh*) ZH=1 ;;
  *) ZH=0 ;;
esac

# say <english> <chinese>
say() {
  if [ "$ZH" = 1 ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi
}

fail() {
  say "$1" "$2" >&2
  exit 1
}

has() {
  command -v "$1" >/dev/null 2>&1
}

# fetch <url> <file>
fetch() {
  if has curl; then
    curl -fsSL --connect-timeout 15 --retry 2 -o "$2" "$1"
  else
    wget -q --timeout=20 -O "$2" "$1"
  fi
}

node_is_new_enough() {
  "$1" -e "const [a, b] = process.versions.node.split('.').map(Number); process.exit(a > $NODE_MIN_MAJOR || (a === $NODE_MIN_MAJOR && b >= $NODE_MIN_MINOR) ? 0 : 1)" >/dev/null 2>&1
}

sha256_of() {
  if has sha256sum; then
    sha256sum "$1" | cut -d ' ' -f 1
  elif has shasum; then
    shasum -a 256 "$1" | cut -d ' ' -f 1
  else
    return 1
  fi
}

is_yujian() {
  [ -f "$1/package.json" ] && grep -q '"name": *"local-language-coach"' "$1/package.json"
}

# github_url <full GitHub URL>
# Public prefix proxies use URLs such as https://gh-proxy.com/https://github.com/owner/repo.
github_url() {
  if [ -n "${YUJIAN_GITHUB_MIRROR:-}" ]; then
    printf '%s/%s\n' "${YUJIAN_GITHUB_MIRROR%/}" "$1"
  else
    printf '%s\n' "$1"
  fi
}

github_download_failure() {
  if [ -n "${YUJIAN_GITHUB_MIRROR:-}" ]; then
    fail "Could not download through $YUJIAN_GITHUB_MIRROR. This is a third-party community proxy and may be unavailable; try another network or download the ZIP manually." "没有通过 $YUJIAN_GITHUB_MIRROR 下载成功。它是第三方公益代理，可能暂时不可用；请更换网络，或手动下载 ZIP。"
  fi
  fail 'Could not download from github.com. Check the network or proxy and run this again. On a mainland China network, copy the fallback command from the README; it uses gh-proxy.com for this public repository and npmmirror for Node.js. You can also download the ZIP manually, unpack it into the yujian folder, and run this again.' '没有从 github.com 下载成功。请检查网络或代理后重新运行。中国大陆网络可复制 README 里的备用命令：它通过 gh-proxy.com 下载本公开仓库，通过 npmmirror 下载 Node.js。也可以手动下载 ZIP，解压到 yujian 文件夹后重新运行。'
}

node_download_failure() {
  if [ -n "${YUJIAN_NODE_MIRROR:-}" ]; then
    fail "Could not download Node.js through $YUJIAN_NODE_MIRROR. Change YUJIAN_NODE_MIRROR or try another network, then run this again." "没有通过 $YUJIAN_NODE_MIRROR 下载到 Node.js。请更换 YUJIAN_NODE_MIRROR 或网络后重新运行。"
  fi
  fail 'Could not download Node.js from nodejs.org. On a mainland China network, set YUJIAN_NODE_MIRROR=https://npmmirror.com/mirrors/node and run this again.' '没有从 nodejs.org 下载到 Node.js。中国大陆网络请设置 YUJIAN_NODE_MIRROR=https://npmmirror.com/mirrors/node 后重新运行。'
}

# Fetch the app from GitHub: with git when there is one, otherwise the source archive unpacked
# over the folder (data/ is not part of the archive).
download_app() {
  REPO_URL=$(github_url "https://github.com/$REPO")
  if has git && [ "$1" = clone ] && [ -z "${YUJIAN_GITHUB_MIRROR:-}" ]; then
    git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 clone --depth 1 --branch "$BRANCH" "${REPO_URL}.git" "$DIR" || return 1
  elif has git && [ -d "$DIR/.git" ]; then
    if [ -n "${YUJIAN_GITHUB_MIRROR:-}" ]; then
      git -C "$DIR" -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 -c "url.${YUJIAN_GITHUB_MIRROR%/}/https://github.com/.insteadOf=https://github.com/" pull --ff-only
    else
      git -C "$DIR" -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 pull --ff-only
    fi
  else
    fetch "$(github_url "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz")" "$TMP/app.tar.gz" || return 1
    mkdir -p "$DIR"
    tar -xzf "$TMP/app.tar.gz" -C "$DIR" --strip-components=1
  fi
}

get_app() {
  if is_yujian "$DIR"; then
    say "Updating the app in $DIR" "正在更新 $DIR 里的应用"
    if ! download_app update; then
      say 'Could not update from github.com; keeping the copy that is already there.' '没有从 github.com 更新成功，继续使用现有的版本。'
    fi
  elif [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
    fail "$DIR already exists and holds something else. Choose another folder with YUJIAN_DIR=/path and run this again." "$DIR 已经存在，里面是别的内容。请用 YUJIAN_DIR=/路径 指定另一个文件夹后重新运行。"
  else
    say "Downloading the app into $DIR" "正在把应用下载到 $DIR"
    if ! download_app clone; then
      github_download_failure
    fi
  fi
}

get_node() {
  if has node && has npm && node_is_new_enough node; then
    return 0
  fi
  RUNTIME="$DIR/.runtime/node"
  if [ -x "$RUNTIME/bin/node" ] && node_is_new_enough "$RUNTIME/bin/node"; then
    PATH="$RUNTIME/bin:$PATH"
    export PATH
    return 0
  fi

  case "$(uname -s)" in
    Darwin) OS=darwin ;;
    Linux) OS=linux ;;
    *) OS='' ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) ARCH=x64 ;;
    arm64 | aarch64) ARCH=arm64 ;;
    *) ARCH='' ;;
  esac
  if [ -z "$OS" ] || [ -z "$ARCH" ] || { [ "$OS" = linux ] && ldd --version 2>&1 | grep -qi musl; }; then
    fail "There is no ready-made Node.js for this system. Install Node.js $NODE_MIN_MAJOR.$NODE_MIN_MINOR or newer yourself, then run this again." "没有适合这台电脑的现成 Node.js。请自行安装 Node.js $NODE_MIN_MAJOR.$NODE_MIN_MINOR 或更新的版本后重新运行。"
  fi

  say "Node.js $NODE_MIN_MAJOR.$NODE_MIN_MINOR or newer was not found. Downloading a private copy into $RUNTIME (about 50 MB)" "没有找到 Node.js $NODE_MIN_MAJOR.$NODE_MIN_MINOR 或更新的版本，正在下载一份只供语见使用的到 ${RUNTIME}（约 50 MB）"
  MIRROR="${YUJIAN_NODE_MIRROR:-https://nodejs.org/dist}"
  fetch "$MIRROR/$NODE_LINE/SHASUMS256.txt" "$TMP/sums.txt" || node_download_failure
  LINE=$(grep "  node-v[0-9.]*-$OS-$ARCH\\.tar\\.gz\$" "$TMP/sums.txt" | head -n 1)
  WANT=${LINE%% *}
  FILE=${LINE##* }
  if [ -z "$WANT" ] || [ -z "$FILE" ]; then
    fail 'Could not read the list of Node.js downloads.' '没有读到 Node.js 的下载列表。'
  fi
  fetch "$MIRROR/$NODE_LINE/$FILE" "$TMP/node.tar.gz" || node_download_failure
  GOT=$(sha256_of "$TMP/node.tar.gz") || fail 'Cannot verify the download: neither sha256sum nor shasum is available.' '无法校验下载的文件：没有找到 sha256sum 或 shasum。'
  if [ "$GOT" != "$WANT" ]; then
    fail 'The Node.js download does not match its checksum. Nothing was installed; run this again.' 'Node.js 的下载文件与校验值不一致，没有安装。请重新运行。'
  fi
  rm -rf "$RUNTIME"
  mkdir -p "$RUNTIME"
  tar -xzf "$TMP/node.tar.gz" -C "$RUNTIME" --strip-components=1
  PATH="$RUNTIME/bin:$PATH"
  export PATH
}

main() {
  DIR="${YUJIAN_DIR:-$HOME/yujian}"
  if ! has curl && ! has wget; then
    fail 'curl or wget is needed to download the app.' '下载应用需要 curl 或 wget。'
  fi
  has tar || fail 'tar is needed to unpack the download.' '解压下载的文件需要 tar。'

  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT

  get_app
  get_node

  case "$(uname -s)" in
    Darwin) LAUNCHER='start-app.command' ;;
    *) LAUNCHER='start-app.sh' ;;
  esac
  say "Installed in $DIR. Next time, start it with $DIR/$LAUNCHER" "已安装到 ${DIR}。以后用 $DIR/$LAUNCHER 启动"

  if [ "${YUJIAN_NO_START:-}" = 1 ]; then
    return 0
  fi
  rm -rf "$TMP"
  trap - EXIT
  cd "$DIR"
  exec npm start
}

# The whole file is read before anything runs, so a download that breaks off does nothing.
main "$@"
