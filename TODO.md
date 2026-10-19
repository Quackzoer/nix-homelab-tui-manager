# TODO

## 1. Clearer errors and more information

- [ ] Map common failures to plain-language messages with a next step, instead of exit codes:
  - [x] 127 on `hl tui` → "homelab-tui is not installed on the homelab" + how to install it (`hl update`)
  - `Permission denied (publickey)` → key not authorised / ssh-agent not running
  - host key changed / unknown host
  - timeout / `ECONNREFUSED` (already handled by the reachability check; add the "is ssh enabled in NixOS?" hint)
- [ ] `hl doctor`: checks local `ssh`, key, reachability, remote `homelab-tui` presence and version, nix-ld, release repo
- [ ] `--verbose` flag printing the exact ssh command being run
- [ ] Show versions (`hl --version` and the remote `homelab-tui --version`) and warn on a mismatch
- [ ] In `homelab-tui`: show the failing command, its exit code and stderr in an error panel instead of dropping to the shell

## 2. homelab-tui: "Update" action

- [ ] Look up the latest GitHub release, compare with the running version
- [ ] Download `homelab-tui-linux-x64` to a temp file next to the binary, verify it against `SHA256SUMS`
- [ ] Replace the running binary atomically (`mv` over the old one) and offer to restart
- [ ] Keep the previous binary as `homelab-tui.old` for rollback
- [ ] Share the download/verify logic with `hl update` via `@homelab/core`

## 3. homelab-tui: toggle automatic updates

- [ ] Action to enable/disable a systemd timer that runs the update check
- [ ] NixOS: define `homelab-tui-update.service` + `.timer` in `nix-cfg` (disabled by default) and let the TUI start/stop it with `systemctl`
- [ ] Show current state (enabled / last run / next run) in the TUI

## 4. Visual polish

Applies to all three: `homelab-tui`, the `hl` menu (client app) and plain CLI output (spinners, colours, error and success messages, `--help` text).

- [ ] Consistent theme (colours, borders, spacing) shared by `hl` menu and `homelab-tui`
- [ ] CLI output polish: consistent colours/icons for success, warning and error lines, aligned tables for `hl status` and `hl docker ps`, tidy `--help` text, respect `NO_COLOR`
- [ ] Dashboard home screen: uptime, load, memory/disk bars, container and failed-unit counts
- [ ] Status colours (green/yellow/red), icons for services
- [ ] Footer with key hints, header with host name and version
- [ ] Loading spinners and non-blocking panels for long actions (rebuild, update)

## 5. homelab-tui: real features (it is a placeholder screen today)

- [ ] Services view: systemd units and Docker containers with status, restart, stop/start and logs
- [ ] Make the list of known services a config file, not hard-coded (Discord bot, Syncthing, GitHub runner, other containers)
- [ ] NixOS actions: rebuild with live output, list generations, roll back, flake update
- [ ] Log viewer: follow, scroll, filter, switch between units/containers
- [ ] System panel: CPU, memory, temperature, eMMC (`/`) and SSD (`/data`) usage
- [ ] `--version` and `--help`, a clear message when not run in a terminal, and always restore the terminal on crash

## 5b. Extensible service menu (`hl` and `homelab-tui`)

Design: [docs/menu-manifest.md](docs/menu-manifest.md). Goal: adding a service (Discord bot, Syncthing, GitHub runner, a container) means adding one folder, not changing menu code.

Done:

- [x] `@homelab/opentui-accordion`: `AccordionRenderable` with programmatic control (`accordion.set(1).open()`), events, keyboard, React binding, tests (kept free of homelab code so it can be proposed to OpenTUI)
- [x] Two-tab, two-column menu in `hl` (General / Services): tabs on top, accordion of entries on the left, actions on the right; menu returns to the same place after an action
- [x] `menuTabs()` in `@homelab/core` builds the tabs; services get the standard actions (status, logs, follow logs, restart)

Next:

- [ ] Builder API: `defineService({...}).action(...)` in `@homelab/core` producing a validated service definition (standard actions from `kind`, extras with argv commands, `sudo`, `danger`)
- [ ] `features/services/<name>/` folders, each with a default export built by the builder, collected by one generated index so adding a folder adds the menu entry (see the design doc for the two options: bundled in the apps vs. JSON manifests written by NixOS)
- [ ] Live state (running / stopped / failed) next to each service, fetched with one ssh call
- [ ] `hl service <id> <action>` CLI mirror generated from the same definitions
- [ ] Decide whether `nix-cfg` moves into this monorepo so a service's menu definition and its NixOS module live in one folder (see design doc)
- [ ] Unit tests: validation (unique ids, safe names), action to command mapping, menu contents per service

## 5d. First-run bootstrap from `homelab-tui` (one click)

- [ ] On a fresh server, `homelab-tui` (installed by the NixOS config) shows an "Initialise" screen: download/clone the config and repo, run the first `nixos-rebuild`, install what is missing, report each step with progress
- [ ] Idempotent steps with a visible checklist (done / skipped / failed) and a "retry failed step" action
- [ ] Documented in `docs/bootstrap.md`: what runs, what needs a password, how to recover

## 5e. Use OpenTUI for the dialogs around the menu

- [ ] Confirmation dialog (bordered, in the same theme) instead of the plain `[y/N]` readline prompt
- [ ] Result panel after an action (bordered: label, success/failure, plain-language explanation, "Enter: back to menu") instead of the plain "Press Enter" line
- [ ] Login/connection progress as a bordered panel (reaching host, logging in, agent tip)
- [ ] Streamed command output stays in the normal terminal; only the parts before and after it are OpenTUI screens

## 5c. Docs

- [x] `docs/` directory with architecture, conventions and the menu manifest design
- [ ] Keep `docs/` in sync with code changes (same commit); review it when finishing each TODO section
- [x] Add a short "Project docs" pointer to `AGENTS.md` so coding assistants read `docs/` first
- [ ] Add `docs/nix-cfg.md`: module layout, how to add a service, deploy flow, recovery (rollback, boot generations)

## 6. hl (client): usability

- [x] Return to the menu after an action finishes instead of exiting (Enter to continue, `q`/Esc leaves)
- [x] Log in to ssh once up front; later actions reuse it without asking (sudo still asks every time)
- [ ] Config file (`~/.config/homelab/config.json`) plus `hl init` wizard; env vars stay as overrides
- [x] Windows has no ssh connection reuse: keys are added to ssh-agent on first login (`AddKeysToAgent`), and `hl` prints a hint when the OpenSSH Authentication Agent service is not running
- [ ] Optional: run several steps in one ssh session
- [ ] Confirm before restarting services/containers (skip with `--yes`) and add `--dry-run` to print the ssh command without running it
- [ ] `--json` output for `status` (scripting), shell completions
- [ ] `hl update --self` to update `hl` itself, and warn when `hl` and `homelab-tui` versions differ

## 7. Security and robustness

- [ ] Verify downloads against `SHA256SUMS` in `hl update`, the in-app update and the NixOS install service; replace binaries atomically
- [x] sudo always asks for a password (`wheelNeedsPassword = true` in `nix-cfg`); apps run sudo commands in a terminal so the prompt works
- [ ] Set the `krzysztof` password on the homelab (`ssh -t krzysztof@wyse sudo passwd krzysztof`) **before** deploying the config that requires it
- [ ] Members of the `docker` group can start root containers without a password: decide whether that is acceptable
- [ ] Decide public vs private release repo; private needs a token for downloads
- [ ] Timeouts and Ctrl-C handling for long remote commands (rebuild, logs -f)

## 8. Code and repo health

- [ ] Tests for the CLI (stub `ssh` on PATH and assert the commands) and a TUI smoke test; core already has unit tests
- [ ] Stamp the release version (`v0.1.<run number>`) into the builds (`bun build --define`); both apps report `0.0.0` today
- [ ] Shared `packages/ui` with OpenTUI components and theme used by both apps (keep `@homelab/core` free of React)
- [ ] Delete the stale `apps/client-app/bun.lock` and `apps/host-app/bun.lock`
- [ ] Remove or repurpose `apps/website` (Vite starter) and fix the root `dev` script that points at it
- [ ] Run `vp check` (lint included) and the tests on every PR; lint has not been run end to end yet
- [ ] Confirm `hl.exe` from the Windows release build works on a clean machine

## 9. Config deployment (`hl deploy`)

- [x] `hl deploy`: homelab applies the latest config from GitHub (`nixos-rebuild switch --flake github:...#wyse --refresh`); refuses when local commits are unpushed if `HL_CONFIG_DIR` is set
- [ ] Commit `flake.lock` in `nix-cfg` (steps are in the nix-cfg README); without it every deploy picks up the newest nixpkgs, not the one you tested
- [ ] Commit the real `hosts/wyse/hardware-configuration.nix` copied from the server (the placeholder fails the build on purpose)
- [ ] `hl lock` / `hl update-flake`: generate or refresh `flake.lock` on the homelab and copy it back, so no local Nix is needed
- [ ] Show what changed: commit being deployed, and the NixOS generation before/after
- [ ] Optional `--branch` to deploy a test branch, and `hl rollback` to switch back to the previous generation
- [ ] Private config repo: needs a token on the homelab (`nix.settings.access-tokens`)
- [ ] `hl deploy --dry-run` (`nixos-rebuild dry-activate`) before the real switch

## Release and deployment

- [x] GitHub Actions workflow publishing `homelab-tui` and `hl` for Linux and Windows on every push to `main` (tag `v0.1.<run number>`; work on `dev` to avoid releases) (`.github/workflows/release.yml`)
- [x] NixOS module installing `homelab-tui` from the latest release on boot (`nix-cfg/modules/homelab-tui.nix`)
- [ ] Create the GitHub repo, set `origin`, rename the branch to `main` and push (the module's repo name assumes `Quackzoer/nix-homelab-tui-manager`)
- [ ] Delete old releases automatically (keep the newest ~10), since every push to `main` creates one
- [ ] Add a "build + typecheck + test" workflow on pull requests
