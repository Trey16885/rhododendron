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

galla doctor my-site        # why is GitHub refusing? ask it, permission by permission
galla chat my-site          # talk to Galla; it writes the files
galla models                # the models Galla can use
galla model opus-1          # switch which one Galla uses
galla update                # re-run the installer; always fetches
```

## Updating

```sh
galla update
```

It runs the same installer the `curl` line above runs, so there is one code
path and nothing to keep in step. It always fetches and replaces — there is no
version comparison to go stale.

There used to be one, and it was the bug: `VERSION` stayed at `1.0.0` through
every release, so `galla update` compared it against itself, said "Already on
1.0.0" and installed nothing. It reported success every time while doing
nothing at all.

The installer verifies before it replaces: the download must start with `#!`
**and** pass `bash -n`. Files in this project have arrived truncated more than
once, and installing half a script would leave no way to update back out of it.
A bad download changes nothing.

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
token — chatting and publishing are separate.

### Switching models

```sh
galla models                # the five Galla models; the one in use is marked *
galla model                 # which one Galla is using
galla model opus-1          # switch to it, and remember that
galla model default         # back to GPT 5.6 Sol
```

These five are the whole list, the same ones the chat app offers, so a project
behaves the same whichever end you drive it from:

| | |
|---|---|
| `treyleo16/gpt-5-6-sol` | GPT 5.6 Sol — the default |
| `rhododendron/galla:sonnet-1` | GallaSonnet 1 Pro |
| `rhododendron/galla:opus-1` | GallaOpus 1 |
| `rhododendron/galla:1` | Galla 1 |
| `rhododendron/galla:1-pro` | Galla 1 Pro |

**Nothing else resolves.** Another model may be sitting on the same machine —
`galla model llama3.2` still won't take it, and `galla models` won't list it.
Galla's instructions are written for these models and a project should behave
the same wherever it's opened, so the roster is the product, not a default to
be talked out of.

Say a model however is natural: the full id, the name from the chat app, or the
short end of it. Capitals, spaces, dots and dashes are all ignored, so
`GallaOpus 1`, `galla:opus-1` and `opus` are one name.

The choice is saved in `~/.galla/config`, so it survives closing the terminal.

For one command only, set `GALLA_MODEL` — it wins over the saved choice without
replacing it:

```sh
GALLA_MODEL=sonnet galla chat my-site
```

So the order is: `GALLA_MODEL` in this shell → whatever `galla model` last saved
→ `treyleo16/gpt-5-6-sol`. The roster applies to the environment variable too;
an escape hatch there would mean there was no roster.

Naming a Galla model Ollama hasn't pulled still sets it, with a note telling you
to `ollama pull` it — being unable to check (Ollama not running) is not the same
as the name being wrong, so it doesn't refuse.

Memories from the chat app do not carry over: those live in the browser. This
is a workspace, not the same conversation.

### The token

`galla auth` asks for a GitHub **fine-grained** personal access token — make one
at <https://github.com/settings/personal-access-tokens/new>.

**Repository access: All repositories.** One limited to selected repositories
can't create a new repo, and wouldn't cover a repo you make tomorrow.

**Repository permissions:**

| | | |
|---|---|---|
| Contents | Read and write | push your files |
| Administration | Read and write | create the repository |
| Pages | Read and write | switch the site on |
| Metadata | Read-only | ticked for you already |

Add Workflows if you want Actions later.

Fine-grained tokens expire. When yours does, everything starts refusing you —
run `galla auth` again with a new one.

A classic token with the `repo` scope still works; `galla auth` says so and
carries on. The permissions above just aren't how it's described.

There are three ways to give it, so an awkward terminal is never a dead end:

```sh
galla auth                              # prompts; each character shows as a dot
galla auth github_pat_your_token        # pass it straight in
GALLA_TOKEN=github_pat_your_token galla auth
```

At the prompt the token is masked, not invisible: you will see a dot per
character, so you can tell a paste registered. Press **Enter** to finish — a
paste without a trailing newline waits, as any prompt would.

It is saved in `~/.galla/config`, readable only by you (`chmod 600`), and stays
saved until you replace it by running `galla auth` again. It is deliberately
never written into a project's git remote: `.git/config` is world-readable and
travels with the folder.

**GitHub can't tell you what a fine-grained token is allowed to do** — it
reports permissions nowhere, only refusals at the point of use. So `galla auth`
can't check the ticks for you.

### When it says you need a permission you already have

```sh
galla doctor my-site
```

It asks GitHub about each thing separately and prints what came back:

```
Token
  ok        signed in as Trey16885

Repository  Trey16885/my-site
  visible   yes, and it is PRIVATE
            Pages on a private repo needs a paid plan.

Permissions, as GitHub answers them
  Pages     read ok, Pages not switched on yet
  Contents  git can authenticate to Trey16885/my-site
```

Publishing can fail for several reasons that all arrive as the same refused
call, and only GitHub's message tells them apart:

| what you see | what it usually is |
|---|---|
| `Upgrade to GitHub Pro...` | the repo is **private** — Pages on a private repo needs a paid plan. Making it public is the free fix. Nothing to do with the token. |
| `Resource not accessible by personal access token` | the token really is missing **Pages: Read and write**, or its resource owner is an organisation rather than you |
| `Not Found` | the token can't see that repo at all — scoped to selected repositories without this one, or a different resource owner |
| a git error on push | **Contents: Read and write**, or the token expired |

`galla publish` prints GitHub's own sentence, not a guess about it. An earlier
version asserted "add the Pages permission" for every one of these, which was
wrong whenever the token was already correct.

### Publishing

`galla publish` commits everything, pushes to `main`, and tries to switch on
GitHub Pages for you. If your token can't do that — **Pages: Read and write** is
the tick people most often leave off — it prints the four steps to do it once by
hand:

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
