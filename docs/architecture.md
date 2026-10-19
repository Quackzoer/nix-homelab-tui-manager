# Architecture

Status: implemented

## Pieces

| Path                         | Runs on         | What                                                                                                     |
| ---------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/client-app`            | desktop         | `hl`: commander CLI plus an OpenTUI menu. Talks to the homelab through the system `ssh`                  |
| `apps/host-app`              | homelab (NixOS) | `homelab-tui`: OpenTUI app installed at `~/.local/bin/homelab-tui`                                       |
| `packages/core`              | both            | `@homelab/core`: config, ssh helpers, remote command builders, shared types                              |
| `packages/opentui-accordion` | both            | `AccordionRenderable` + React binding for OpenTUI. No homelab code in it, so it can be proposed upstream |
| `apps/website`               | n/a             | Vite starter, kept only as a monorepo reference                                                          |

`nix-cfg` (separate repo, `Quackzoer/nix-cfg`) is the NixOS configuration of the server. It installs `homelab-tui` and is applied with `hl deploy`.

## How `hl` reaches the server

- Always the system `ssh` binary (key passphrase, agent and host-key prompts stay with the user's own setup).
- `hl` builds a shell command in `@homelab/core` (`actions.ts`) and runs it with `runRemote`. Anything user-supplied is quoted with `shellQuote` and names are checked with `assertName`.
- Commands that use `sudo` always run with a TTY (`ssh -t`) so the password prompt works. Sudo must always ask for a password (`security.sudo.wheelNeedsPassword = true` in `nix-cfg`). Never add passwordless rules.
- Login happens once per run: `hl` checks with `ssh -o BatchMode=yes` whether it can already log in, and if not runs one interactive `ssh ... true` so the passphrase and host-key questions are answered up front. After that, Linux/macOS reuse the connection (`ControlMaster`), and every platform keeps the key in ssh-agent (`AddKeysToAgent=yes`). On Windows the OpenSSH Authentication Agent service must be running and the key loaded once; `hl init` does both (it starts the service through a UAC administrator prompt, then runs `ssh-add`); otherwise every action asks again (`hl` prints a hint). The sudo password is a separate prompt on the server and is always asked.
- The interactive menu loops: after an action it waits for Enter and shows the menu again; `q`/Esc leaves.
- Before connecting, `probeTarget` checks that the host resolves and the port answers, so a dead server fails fast with a readable message.

## Releases and installation

- Push to `main` runs `.github/workflows/release.yml`: typecheck, test, build both apps on Linux and Windows, publish a GitHub release tagged `v<MAJOR_MINOR>.<run number>`.
- Binaries are built with `bun build --compile`. OpenTUI has a native core, so each OS is built on its own runner.
- The server downloads `homelab-tui-linux-x64` from `/releases/latest`: `hl update` does it on demand, the `homelab-tui-install` service in `nix-cfg` does it at boot if the file is missing. Bun-compiled binaries need `programs.nix-ld.enable = true` on NixOS.

## Where changes go

| Change                              | Where                                                          | How it reaches the server         |
| ----------------------------------- | -------------------------------------------------------------- | --------------------------------- |
| New `hl` command or menu behaviour  | `apps/client-app`, `packages/core`                             | Only on your PC: just run it      |
| New `homelab-tui` screen            | `apps/host-app`                                                | Merge to `main`, then `hl update` |
| New system service or NixOS setting | `nix-cfg`                                                      | Push, then `hl deploy`            |
| New service in the menu             | `nix-cfg` (manifest), see [menu-manifest.md](menu-manifest.md) | Push, then `hl deploy`            |

## The interactive menu (`hl`)

- Layout: tab bar on top (General, Services), two columns below: an accordion of entries on the left, the actions of the selected entry on the right. Built from `menuTabs()` in `@homelab/core`.
- Keys: `Tab` switches pane, `[` `]` switch tab, arrows move, space expands, Enter/→ goes to the actions, Esc goes back, `q` quits. The menu returns to the same place after an action.
- OpenTUI resets a list's selection whenever it gets a new `options` array, so pass memoised arrays.
