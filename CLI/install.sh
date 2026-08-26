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

mkdir -p "$BIN_DIR" "$WORKSPACE"

# Installing from a clone (./install.sh) copies the sibling script; installing
# over curl fetches it.
here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

if [ -n "$here" ] && [ -f "$here/galla" ]; then
    cp "$here/galla" "$tmp"
    say "Installing from $here/galla"
else
    curl -fsSL "$REPO_RAW/galla" -o "$tmp" || fail "could not download galla from $REPO_RAW"
    say "Downloaded galla from $REPO_RAW"
fi

head -n1 "$tmp" | grep -q '^#!' || fail "downloaded file is not a script (check the URL)"

chmod +x "$tmp"
mv "$tmp" "$BIN_DIR/galla"
trap - EXIT

say ""
say "Installed:  $BIN_DIR/galla"
say "Projects:   $WORKSPACE"

case ":$PATH:" in
    *":$BIN_DIR:"*) say ""; say "Run 'galla' to get started." ;;
    *)
        say ""
        say "$BIN_DIR is not on your PATH. Add it with:"
        say ""
        say "    echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc && exec bash"
        say ""
        say "Then run 'galla' to get started."
        ;;
esac
