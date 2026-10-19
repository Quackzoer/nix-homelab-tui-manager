import { describe, expect, test } from "vite-plus/test";
import {
  agentStatusFromExit,
  deployCommand,
  dockerRestartCommand,
  loadConfig,
  logsCommand,
  menuItems,
  rebuildCommand,
  shellQuote,
  sshArgs,
  updateCommand,
} from "../src/index.ts";

describe("shellQuote", () => {
  test("wraps and escapes single quotes", () => {
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
});

describe("loadConfig", () => {
  test("defaults", () => {
    const cfg = loadConfig({});
    expect(cfg.target).toEqual({ host: "wyse", user: "krzysztof", port: undefined });
    expect(cfg.nixConfigDir).toBe("~/nix-config");
  });
  test("env overrides", () => {
    const cfg = loadConfig({ HL_HOST: "box", HL_PORT: "2222", HL_REPO: "me/repo" });
    expect(cfg.target.host).toBe("box");
    expect(cfg.target.port).toBe(2222);
    expect(cfg.repo).toBe("me/repo");
  });
  test("rejects bad values", () => {
    expect(() => loadConfig({ HL_PORT: "nope" })).toThrow();
    expect(() => loadConfig({ HL_REPO: "no-slash" })).toThrow();
    expect(() => loadConfig({ HL_NIX_DIR: "~/x; rm -rf /" })).toThrow();
  });
});

describe("sshArgs", () => {
  const target = { host: "wyse", user: "krzysztof" };
  test("no ControlMaster on Windows", () => {
    const args = sshArgs(target, {}, "win32");
    expect(args.join(" ")).not.toContain("ControlMaster");
    expect(args.at(-1)).toBe("krzysztof@wyse");
  });
  test("ControlMaster elsewhere, tty and port honoured", () => {
    const args = sshArgs({ ...target, port: 2222 }, { tty: true }, "linux");
    expect(args).toContain("-t");
    expect(args).toContain("ControlMaster=auto");
    expect(args.slice(args.indexOf("-p"), args.indexOf("-p") + 2)).toEqual(["-p", "2222"]);
  });
  test("keys are added to the agent after the first login", () => {
    expect(sshArgs(target, {}, "win32")).toContain("AddKeysToAgent=yes");
  });
  test("rejects option-like hosts", () => {
    expect(() => sshArgs({ host: "-oProxyCommand=evil" })).toThrow();
  });
});

describe("agentStatusFromExit", () => {
  test("maps ssh-add -l exit codes", () => {
    expect(agentStatusFromExit(0)).toBe("ready");
    expect(agentStatusFromExit(1)).toBe("empty");
    expect(agentStatusFromExit(2)).toBe("missing");
    expect(agentStatusFromExit(null)).toBe("missing");
  });
});

describe("commands", () => {
  const cfg = loadConfig({ HL_REPO: "me/repo" });
  test("names are validated and quoted", () => {
    expect(dockerRestartCommand("n8n")).toBe("docker restart 'n8n'");
    expect(() => dockerRestartCommand("x; reboot")).toThrow();
    expect(() => logsCommand("$(id)")).toThrow();
  });
  test("logs", () => {
    expect(logsCommand("sshd", { follow: true, lines: 20 })).toBe(
      "journalctl --no-pager -n 20 -f -u 'sshd'",
    );
  });
  test("rebuild uses the configured flake host", () => {
    expect(rebuildCommand(cfg)).toContain(`sudo nixos-rebuild switch --flake ".#"'wyse'`);
  });
  test("deploy applies the GitHub flake with --refresh", () => {
    expect(deployCommand(cfg)).toBe(
      "sudo nixos-rebuild switch --flake 'github:Quackzoer/nix-cfg#wyse' --refresh --no-write-lock-file",
    );
    expect(() => loadConfig({ HL_CONFIG_REPO: "nope" })).toThrow();
  });
  test("sudo menu items ask for a tty", () => {
    for (const item of menuItems(cfg).filter((i) => i.sudo)) expect(item.tty).toBe(true);
  });
  test("update downloads the latest release asset", () => {
    expect(updateCommand(cfg)).toContain(
      "https://github.com/me/repo/releases/latest/download/homelab-tui-linux-x64",
    );
    expect(updateCommand(loadConfig({}))).toContain(
      "github.com/Quackzoer/nix-homelab-tui-manager/releases",
    );
  });
  test("tui menu item explains a missing binary", () => {
    expect(menuItems(cfg).find((i) => i.id === "tui")?.explain?.[127]).toContain("hl update");
  });
  test("menu has a shell entry without a command", () => {
    expect(menuItems(cfg).find((i) => i.id === "shell")?.command).toBeUndefined();
  });
});
