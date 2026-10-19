# host-app (`homelab-tui`)

The TUI that runs on the homelab itself. Reach it from the desktop with `hl tui`.

```bash
bun run start    # run
bun run build    # compile to dist/homelab-tui (build on the target OS: OpenTUI has a native core)
```

Must be built on Linux and installed at `~/.local/bin/homelab-tui` on the homelab before `hl tui` works.
See the root README ("`hl tui` needs `host-app` installed on the homelab").
