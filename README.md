# nix-homelab-tui-manager

Bun + Vite+ monorepo for managing the homelab (NixOS on the Dell Wyse, config in `nix-cfg`).

| Path              | What                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `apps/client-app` | `hl` — CLI + TUI launcher that runs on the desktop and talks to the homelab over ssh            |
| `apps/host-app`   | `homelab-tui` — the TUI that runs on the homelab (open it from the desktop with `hl tui`)       |
| `packages/core`   | `@homelab/core` — shared config, ssh helpers and remote actions (consumed as TypeScript source) |
| `apps/website`    | Vite starter site                                                                               |

## Development

```bash
bun install
vp run ready         # check + test + build everything
vp run dev:client    # run hl
vp run dev:host      # run homelab-tui
vp run dev           # website
```

See `apps/client-app/README.md` for the `hl` commands and `HL_*` settings.

## Running `hl`

```bash
bun run hl                 # interactive menu
bun run hl status          # status, logs <unit>, docker ps, rebuild, reboot, ...
```

`hl` talks to the homelab with your system `ssh` (default `krzysztof@wyse`; override with `-H <host>` or `HL_HOST`).

## `hl tui` needs `host-app` installed on the homelab

`hl tui` runs `~/.local/bin/homelab-tui` on the homelab, so that binary has to be built **for Linux** and
copied there first. A Windows build (`vp run -r build` on your PC) produces `.exe` files that will not run
on the NixOS box, and OpenTUI has a native core, so build on Linux (WSL works):

```bash
# in WSL / on a Linux machine
bun install
cd apps/host-app && bun run build            # -> dist/homelab-tui
ssh krzysztof@wyse 'mkdir -p ~/.local/bin'
scp dist/homelab-tui krzysztof@wyse:~/.local/bin/homelab-tui
```

The NixOS config also needs `programs.nix-ld.enable = true;`, otherwise compiled Bun binaries cannot start.
Once releases are published from CI (every push to `main`), `hl update` replaces the manual copy.
