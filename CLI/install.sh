#!/usr/bin/env bash
# Galla CLI installer.
#
#   curl -fsSL https://raw.githubusercontent.com/Trey16885/rhododendron/main/CLI/install.sh | bash
#
# Note the host: raw.githubusercontent.com serves the file itself. github.com
# serves an HTML page, which would pipe a web page into your shell.
set -euo pipefail

REPO_RAW="${GALLA_SOURCE:-https://raw.githubusercontent.com/Trey16885/rhododendron/main/CLI}"
BIN_DIR="${GALLA_BIN_DIR:-$HOME/.local/bin}"
WORKSPACE="${GALLA_HOME:-$HOME/Galla}"

say()  { printf '%s\n' "$*"; }
fail() { printf 'galla: %s\n' "$*" >&2; exit 1; }

for dep in git curl; do
    command -v "$dep" >/dev/null 2>&1 || fail "$dep is required but not installed."
done

# On Termux these are a package away and installing them is expected. Anywhere
# else, installing system packages behind your back is not, so we only say what
# is missing.
if command -v pkg >/dev/null 2>&1 && [ -n "${PREFIX:-}" ]; then
    if ! command -v python3 >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
        echo "Installing python and node (needed by 'galla connect') ..."
        pkg install -y python nodejs-lts || echo "  (carry on; 'galla connect' will say if python is missing)"
    fi
fi

# Being unable to check is not the same as the file being wrong: without
# python3 there is nothing to parse with, and the connector needs python3 to
# run anyway, so it will say so at that point.
python_parses() {
    command -v python3 >/dev/null 2>&1 || return 0
    python3 -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "$1" 2>/dev/null
}

mkdir -p "$BIN_DIR" "$WORKSPACE"

# Installing from a clone (./install.sh) copies the sibling script; installing
# over curl fetches it.
# Only when this file is actually a file. Piped in over curl -- which is how
# `galla update` runs it -- BASH_SOURCE is not a path, and resolving it to the
# working directory would install a stray ./galla instead of downloading.
here=""
if [ -f "${BASH_SOURCE[0]:-/nonexistent}" ]; then
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

if [ -n "$here" ] && [ -f "$here/galla" ]; then
    cp "$here/galla" "$tmp"
    say "Installing from $here/galla"
else
    curl -fsSL "$REPO_RAW/galla" -o "$tmp" || fail "could not download galla from $REPO_RAW"
    say "Downloaded galla from $REPO_RAW"
fi

# Do not trust the download. Files in this project have arrived truncated
# before, and installing half a script would leave no way to update back out
# of it. This check used to live in `galla update`; it belongs here, now that
# update is this installer.
head -n1 "$tmp" | grep -q '^#!' || fail "downloaded file is not a script (check the URL)"
bash -n "$tmp" 2>/dev/null || fail "the downloaded galla is incomplete or broken; nothing was changed"

chmod +x "$tmp"
mv "$tmp" "$BIN_DIR/galla"
trap - EXIT

# The connector ships alongside the CLI.
CONFIG_DIR="${GALLA_CONFIG_DIR:-$HOME/.galla}"
mkdir -p "$CONFIG_DIR"
if [ -n "$here" ] && [ -f "$here/connector.py" ]; then
    cp "$here/connector.py" "$CONFIG_DIR/connector.py"
elif curl -fsSL "$REPO_RAW/connector.py" -o "$CONFIG_DIR/connector.py.tmp" 2>/dev/null &&
     head -n1 "$CONFIG_DIR/connector.py.tmp" | grep -q '^#!' &&
     python_parses "$CONFIG_DIR/connector.py.tmp"; then
    mv "$CONFIG_DIR/connector.py.tmp" "$CONFIG_DIR/connector.py"
else
    rm -f "$CONFIG_DIR/connector.py.tmp"
    say "(the connector could not be fetched; 'galla update' will retry)"
fi

say ""
say "Installed:  $BIN_DIR/galla"
say "Projects:   $WORKSPACE"

case ":$PATH:" in
    *":$BIN_DIR:"*) say ""; say "Run 'galla' to get started." ;;
    *)
        say ""
        say "$BIN_DIR is not on your PATH. Add it with:"
        say ""
        say "    echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc && exec bash"
        say ""
        say "Then run 'galla' to get started."
        ;;
esac
