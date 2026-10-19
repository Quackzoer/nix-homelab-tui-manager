import { type HomelabConfig } from "./config.ts";
import { assertName, shellQuote } from "./ssh.ts";

/** Release asset the homelab downloads; built on a linux-x64 runner. */
export const LINUX_ASSET = "homelab-tui-linux-x64";

function lineCount(lines: number): number {
  if (!Number.isInteger(lines) || lines <= 0) throw new Error(`Invalid line count: ${lines}`);
  return lines;
}

// These are plain shell commands on purpose: they must keep working when homelab-tui is broken.

export function statusCommand(): string {
  return [
    `echo "== host =="; hostname; uptime -p`,
    `echo; echo "== load =="; cat /proc/loadavg`,
    `echo; echo "== memory =="; free -h`,
    `echo; echo "== disk =="; df -h / /data 2>/dev/null`,
    `echo; echo "== failed units =="; systemctl --failed --no-legend --plain || true`,
    `echo; echo "== containers =="; docker ps --format 'table {{.Names}}\\t{{.Status}}' 2>&1 || true`,
  ].join("; ");
}

export function dockerPsCommand(): string {
  return `docker ps -a --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}'`;
}

export function dockerRestartCommand(name: string): string {
  return `docker restart ${shellQuote(assertName("container", name))}`;
}

export function dockerLogsCommand(
  name: string,
  options: { follow?: boolean; lines?: number } = {},
): string {
  const follow = options.follow ? " -f" : "";
  return `docker logs --tail ${lineCount(options.lines ?? 100)}${follow} ${shellQuote(assertName("container", name))}`;
}

export function restartServiceCommand(service: string): string {
  return `sudo systemctl restart ${shellQuote(assertName("service", service))} && systemctl status --no-pager --lines 5 ${shellQuote(service)}`;
}

export function logsCommand(
  unit: string,
  options: { follow?: boolean; lines?: number } = {},
): string {
  const follow = options.follow ? " -f" : "";
  return `journalctl --no-pager -n ${lineCount(options.lines ?? 100)}${follow} -u ${shellQuote(assertName("unit", unit))}`;
}

export function rebuildCommand(cfg: HomelabConfig): string {
  const flakeHost = shellQuote(assertName("flake host", cfg.flakeHost));
  return `cd ${cfg.nixConfigDir} && git pull --ff-only && sudo nixos-rebuild switch --flake ".#"${flakeHost}`;
}

/**
 * Applies the NixOS config straight from GitHub (no checkout needed on the homelab).
 * `--refresh` re-fetches the repo; `--no-write-lock-file` is required for remote flakes (same flags as autoUpgrade).
 * Needs a terminal: sudo asks for the password every time.
 */
export function deployCommand(cfg: HomelabConfig): string {
  const flakeHost = assertName("flake host", cfg.flakeHost);
  const flake = shellQuote(`github:${cfg.configRepo}#${flakeHost}`);
  return `sudo nixos-rebuild switch --flake ${flake} --refresh --no-write-lock-file`;
}

/** Schedules the reboot a few seconds out so ssh can exit cleanly instead of reporting a dropped connection. */
export function rebootCommand(): string {
  return `sudo systemd-run --quiet --on-active=3s --unit=hl-reboot systemctl reboot && echo "Rebooting in 3 seconds"`;
}

export function updateCommand(cfg: HomelabConfig): string {
  if (!cfg.repo)
    throw new Error("Set HL_REPO (owner/name) to the GitHub repo that publishes releases");
  const url = `https://github.com/${cfg.repo}/releases/latest/download/${LINUX_ASSET}`;
  const bin = cfg.remoteBin;
  return `mkdir -p "$(dirname ${bin})" && curl -fsSL ${shellQuote(url)} -o ${bin}.new && chmod +x ${bin}.new && mv -f ${bin}.new ${bin} && echo "Installed ${bin}"`;
}

export interface MenuItem {
  id: string;
  label: string;
  description: string;
  /** Remote command; omitted means an interactive login shell. */
  command?: string;
  tty?: boolean;
  /** Runs sudo on the homelab, so it needs a terminal for the password prompt. */
  sudo?: boolean;
  /** Ask for confirmation before running. */
  danger?: boolean;
}

export function menuItems(cfg: HomelabConfig): MenuItem[] {
  return [
    {
      id: "tui",
      label: "Open homelab-tui",
      description: "The full management TUI running on the homelab",
      command: cfg.remoteBin,
      tty: true,
    },
    {
      id: "status",
      label: "Status",
      description: "Uptime, load, memory, disk, failed units, containers",
      command: statusCommand(),
    },
    {
      id: "containers",
      label: "Containers",
      description: "docker ps -a",
      command: dockerPsCommand(),
    },
    {
      id: "deploy",
      label: "Deploy config",
      description: "Apply the latest NixOS config from GitHub (push first)",
      command: deployCommand(cfg),
      tty: true,
      sudo: true,
    },
    {
      id: "rebuild",
      label: "Rebuild from checkout",
      description: "git pull in ~/nix-config on the homelab + nixos-rebuild switch",
      command: rebuildCommand(cfg),
      tty: true,
      sudo: true,
    },
    { id: "shell", label: "SSH shell", description: "Plain login shell on the homelab", tty: true },
    {
      id: "reboot",
      label: "Reboot",
      description: "Reboot the homelab",
      command: rebootCommand(),
      tty: true,
      sudo: true,
      danger: true,
    },
  ];
}
