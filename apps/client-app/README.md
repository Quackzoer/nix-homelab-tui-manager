# client-app (`hl`)

CLI + TUI launcher for managing the homelab over ssh. It shells out to the system `ssh`
(key/agent auth), so it keeps working when `host-app` on the box is broken.

```bash
bun run start                 # interactive menu (no arguments)
bun run start -- status       # any command: status / logs / docker ps / rebuild / reboot / tui / update
bun run build                 # compile to dist/hl
```

Settings come from env vars (all optional): `HL_HOST` (wyse), `HL_USER` (krzysztof), `HL_PORT`,
`HL_NIX_DIR` (~/nix-config), `HL_FLAKE_HOST` (wyse), `HL_REMOTE_BIN` (~/.local/bin/homelab-tui),
`HL_REPO` (owner/name of the release repo, default Quackzoer/nix-homelab-tui-manager),
`HL_CONFIG_REPO` (owner/name of the NixOS config, default Quackzoer/nix-cfg), `HL_CONFIG_DIR` (local nix-cfg checkout).

## Deploying config changes

```bash
git commit -am "..." && git push     # in nix-cfg
bun run hl deploy                    # homelab fetches the repo from GitHub and runs nixos-rebuild switch
```

`deploy` only sees what is **pushed** to GitHub. Set `HL_CONFIG_DIR` to your local nix-cfg checkout and `hl`
refuses to deploy while commits are unpushed (`--force` skips the check). sudo on the homelab always asks
for your password, so commands that use it (`deploy`, `rebuild`, `restart`, `reboot`) run in a terminal.
