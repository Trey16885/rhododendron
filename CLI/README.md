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

galla chat my-site          # talk to Galla; it writes the files
galla update                # fetch the latest galla
```

## Connectors

`galla connect` lets the chat app in your browser work with these projects.

```sh
galla connect
```

It prints a pairing token and holds the terminal. In the chat app, open
**Connectors**, click **Galla CLI**, paste the token. Then `/create`, `/edit`
and `/publish` in the chat act on real files.

Galla CLI is built in: always port **4316**, and it can't be renamed, re-pointed
or removed — the point of it is being one address that is always what it says it
is. You can add your own connectors alongside it, and those you can remove.

**The token is what makes the fixed port safe.** Anything else on your machine
can reach 4316, so reaching it must not be enough. The connector also listens on
loopback only (nothing on your network can see it), refuses any origin other
than the chat app, refuses requests that aren't `application/json` — that's the
kind that would skip the browser's preflight — and refuses paths that point
outside a project.

`galla token` prints the token again. It needs `python3`
(`pkg install -y python` on Termux).

## Talking to Galla

```sh
galla chat my-site          # or just `galla chat` inside the folder
```

Galla sees the project's files and writes what you ask for:

```
you   > make the heading blue and add an about page
Galla > Updated the heading colour and added a second page.
  wrote index.html
  wrote about.html
you   > /publish
```

Inside the chat: `/files` lists them, `/publish` ships the project, `/exit` leaves.

**New files are written straight away. Anything that already exists asks first**
— that file is your work until you say otherwise. A path pointing outside the
project is refused.

This needs Ollama running (`OLLAMA_ORIGINS="*" ollama serve`), but no GitHub
token — chatting and publishing are separate. Set `GALLA_MODEL` to use a model
other than the default.

Memories from the chat app do not carry over: those live in the browser. This
is a workspace, not the same conversation.

### The token

`galla auth` asks for a GitHub personal access token — make one at
<https://github.com/settings/tokens/new> with the **repo** scope.

There are three ways to give it, so an awkward terminal is never a dead end:

```sh
galla auth                      # prompts; each character shows as a dot
galla auth ghp_your_token       # pass it straight in
GALLA_TOKEN=ghp_your_token galla auth
```

At the prompt the token is masked, not invisible: you will see a dot per
character, so you can tell a paste registered. Press **Enter** to finish — a
paste without a trailing newline waits, as any prompt would.

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
