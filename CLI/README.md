# Galla CLI

Make projects, resume them, and put them on the web.

The chat app has no filesystem, so `/edit`, `/create` and `/publish` live here
instead, where there is a real folder and real git.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/Trey16885/rhododendron/main/CLI/install.sh | bash
```

Note the host: `raw.githubusercontent.com` serves the file itself. Plain
`github.com` serves an HTML page, which would pipe a web page into your shell.

Needs `git` and `curl`. Works on Linux, macOS and Termux.

Installs `galla` to `~/.local/bin` and makes `~/Galla` for your projects. If the
installer says that directory isn't on your `PATH`, run the line it prints.

## Use

```sh
galla auth                  # save your GitHub token (once)
galla new my-site           # start a project in ~/Galla/my-site
galla open my-site          # resume it - opens a shell in the folder
galla link my-site          # pick a repo, or make a new one
galla publish my-site       # commit, push, and put it on GitHub Pages
galla list                  # what you have
```

### The token

`galla auth` asks for a GitHub personal access token — make one at
<https://github.com/settings/tokens/new> with the **repo** scope.

It is saved in `~/.galla/config`, readable only by you (`chmod 600`), and stays
saved until you replace it by running `galla auth` again. It is deliberately
never written into a project's git remote: `.git/config` is world-readable and
travels with the folder.

### Publishing

`galla publish` commits everything, pushes to `main`, and tries to switch on
GitHub Pages for you. If your token can't do that (fine-grained tokens often
can't), it prints the four steps to do it once by hand:

1. Open `https://github.com/<owner>/<repo>/settings/pages`
2. Under **Build and deployment**, set Source to **Deploy from a branch**
3. Pick branch **main** and folder **/ (root)**, then Save
4. Wait about a minute for the link to appear

After that, every `galla publish` updates the live site in about a minute.

Your site ends up at `https://<owner>.github.io/<repo>/`.

## Where things live

| | |
|---|---|
| Projects | `~/Galla/<name>` — override with `GALLA_HOME` |
| Token | `~/.galla/config` — override with `GALLA_CONFIG_DIR` |
| The command | `~/.local/bin/galla` — override with `GALLA_BIN_DIR` |

`.galla/` inside a project is Galla's own bookkeeping and is gitignored, so it
never ends up on your published site.
