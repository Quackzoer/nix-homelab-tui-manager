import {
  type MenuItem,
  logsCommand,
  menuItems,
  restartServiceCommand,
  serviceStatusCommand,
} from "./actions.ts";
import type { HomelabConfig } from "./config.ts";

/** One expandable entry of the left column: a title, some detail lines and the actions shown on the right. */
export interface MenuGroup {
  id: string;
  title: string;
  /** Short state shown next to the title, e.g. "web UI :8384". */
  subtitle?: string;
  /** Lines shown while the group is expanded. */
  details: string[];
  items: MenuItem[];
}

export interface MenuTab {
  id: string;
  label: string;
  groups: MenuGroup[];
}

/** A systemd service that gets its own entry in the Services tab. */
export interface KnownService {
  id: string;
  label: string;
  unit: string;
  subtitle?: string;
  details?: string[];
}

/**
 * Hard-coded until services are declared next to their NixOS config
 * (see docs/menu-manifest.md); the Services tab is already built from this shape.
 */
export const knownServices: KnownService[] = [
  {
    id: "syncthing",
    label: "Syncthing",
    unit: "syncthing.service",
    subtitle: "web UI :8384",
    details: ["File sync", "Data in /data/syncthing"],
  },
  {
    id: "docker",
    label: "Docker",
    unit: "docker.service",
    details: ["Container runtime", "List containers under General › System"],
  },
];

/** The standard actions every service gets. */
export function serviceItems(service: KnownService): MenuItem[] {
  const { id, label, unit } = service;
  return [
    {
      id: `${id}:status`,
      label: "Status",
      description: `systemctl status ${unit}`,
      command: serviceStatusCommand(unit),
    },
    {
      id: `${id}:logs`,
      label: "Logs",
      description: "Last 100 journal lines",
      command: logsCommand(unit, { lines: 100 }),
    },
    {
      id: `${id}:follow`,
      label: "Follow logs",
      description: "Live journal, Ctrl-C to stop",
      command: logsCommand(unit, { follow: true, lines: 50 }),
      tty: true,
    },
    {
      id: `${id}:restart`,
      label: `Restart ${label}`,
      description: `sudo systemctl restart ${unit}`,
      command: restartServiceCommand(unit),
      tty: true,
      sudo: true,
      danger: true,
    },
  ];
}

/** The two tabs of the interactive menu. Action ids stay the same as in `menuItems`. */
export function menuTabs(cfg: HomelabConfig, services: KnownService[] = knownServices): MenuTab[] {
  const all = new Map(menuItems(cfg).map((item) => [item.id, item]));
  const pick = (...ids: string[]): MenuItem[] =>
    ids.map((id) => all.get(id)).filter((item): item is MenuItem => item !== undefined);

  return [
    {
      id: "general",
      label: "General",
      groups: [
        {
          id: "system",
          title: "System",
          details: ["Health overview, containers", "and the tools on the homelab"],
          items: pick("status", "containers", "tui", "shell"),
        },
        {
          id: "nixos",
          title: "NixOS config",
          details: ["Apply the config from GitHub", "(push your changes first)"],
          items: pick("deploy", "rebuild"),
        },
        {
          id: "power",
          title: "Power",
          details: ["Reboot the homelab"],
          items: pick("reboot"),
        },
      ],
    },
    {
      id: "services",
      label: "Services",
      groups: services.map((service) => ({
        id: service.id,
        title: service.label,
        subtitle: service.subtitle,
        details: service.details ?? [service.unit],
        items: serviceItems(service),
      })),
    },
  ];
}
