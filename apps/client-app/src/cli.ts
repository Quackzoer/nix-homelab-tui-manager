import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import {
  NOT_INSTALLED,
  type HomelabConfig,
  type Target,
  addKeysToAgent,
  agentStatus,
  authenticate,
  isAuthenticated,
  describeTarget,
  deployCommand,
  dockerLogsCommand,
  dockerPsCommand,
  dockerRestartCommand,
  loadConfig,
  logsCommand,
  menuItems,
  rebootCommand,
  rebuildCommand,
  restartServiceCommand,
  probeTarget,
  runRemote,
  statusCommand,
  updateCommand,
} from "@homelab/core";
import pkg from "../package.json" with { type: "json" };
import { agentServiceState, enableAgentService } from "./agent.ts";
import { pushState } from "./git.ts";
import { note, startSpinner } from "./ui.ts";

interface GlobalOptions {
  host?: string;
  user?: string;
  port?: string;
}

interface RemoteCall {
  /** Omitted means an interactive login shell. */
  command?: string;
  tty?: boolean;
  /** Runs sudo on the homelab (needs tty for the password prompt). */
  sudo?: boolean;
  /** Plain-language explanations for specific exit codes. */
  explain?: Record<number, string>;
}

function configFrom(cmd: Command): HomelabConfig {
  const opts = cmd.optsWithGlobals<GlobalOptions>();
  const cfg = loadConfig();
  if (opts.host) cfg.target.host = opts.host;
  if (opts.user) cfg.target.user = opts.user;
  if (opts.port) cfg.target.port = Number.parseInt(opts.port, 10);
  return cfg;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

/** Waits for Enter so the output of an action can be read. Returns false when the input is closed (Ctrl-D). */
async function pause(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    await rl.question("\nPress Enter to return to the menu (Ctrl-C to quit) ");
    return true;
  } catch {
    return false;
  } finally {
    rl.close();
  }
}

const loggedIn = new Set<string>();

/**
 * Logs in to the homelab once per run. ssh asks for the key passphrase (and the host-key question)
 * here, up front; afterwards the shared connection or the ssh-agent key serves every action without
 * asking again. The sudo password is a separate prompt on the homelab and is always asked.
 */
async function ensureLogin(target: Target): Promise<boolean> {
  const where = describeTarget(target);
  if (loggedIn.has(where)) return true;
  if (await isAuthenticated(target)) {
    loggedIn.add(where);
    return true;
  }
  note(`→ Logging in to ${where} (ssh may ask for your key passphrase, once)`);
  const code = await authenticate(target);
  if (code !== 0) {
    note(
      code === 255
        ? "✖ ssh could not connect or authenticate (exit code 255)"
        : `✖ Login failed with exit code ${code}`,
    );
    return false;
  }
  loggedIn.add(where);
  // Linux/macOS keep the connection open; elsewhere ssh-agent must hold the key or it asks again.
  const remembered = process.platform !== "win32" || (await agentStatus()) === "ready";
  if (remembered) {
    note("✔ Logged in. Later actions will not ask for the ssh passphrase again");
  } else {
    note("✔ Logged in");
    note(
      "  Tip: run `hl init` once so ssh remembers your key and stops asking for the passphrase.",
    );
  }
  return true;
}

const connected = new Set<string>();

/** Checks the host answers (with a spinner) and logs in. Done once per run; later actions reuse it. */
async function connect(target: Target): Promise<boolean> {
  const where = describeTarget(target);
  if (connected.has(where)) return true;
  const spinner = startSpinner(`Reaching ${where}…`);
  const probe = await probeTarget(target);
  if (!probe.ok) {
    spinner.fail(`Cannot reach ${where} (${probe.host}:${probe.port}): ${probe.reason}`);
    note(
      "  Is the homelab on and reachable from here? Use -H <host> or set HL_HOST to point elsewhere.",
    );
    return false;
  }
  spinner.succeed(
    probe.skipped
      ? `Connecting to ${where}`
      : `${where} is reachable (${probe.host}:${probe.port})`,
  );
  if (!(await ensureLogin(target))) return false;
  connected.add(where);
  return true;
}

/** Runs the call over ssh and reports how it went. Returns ssh's exit code. */
async function execute(target: Target, call: RemoteCall, label: string): Promise<number> {
  if (!(await connect(target))) return 255;
  note(`→ ${label}${call.sudo ? " (you will be asked for the sudo password on the homelab)" : ""}`);

  const code = await runRemote(target, call.command, { tty: call.tty });
  if (code !== 0) {
    const explained = call.explain?.[code];
    note(
      explained
        ? `✖ ${explained}`
        : code === 255
          ? "✖ ssh could not connect or authenticate (exit code 255)"
          : `✖ Command failed with exit code ${code}`,
    );
  } else if (call.command !== undefined && !(call.tty && !call.sudo)) {
    note("✔ Done");
  }
  return code;
}

/** Builds the remote call from the resolved config and runs it. */
async function go(
  cmd: Command,
  build: (cfg: HomelabConfig) => RemoteCall | undefined,
): Promise<void> {
  const cfg = configFrom(cmd);
  const call = build(cfg);
  if (!call) return;
  const path = [cmd.parent?.parent ? cmd.parent.name() : undefined, cmd.name()]
    .filter(Boolean)
    .join(" ");
  process.exitCode = await execute(cfg.target, call, `Running hl ${path}`);
}

function positiveInt(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Expected a positive number, got "${value}"`);
  return n;
}

/** Loads the host's ssh key into ssh-agent (passphrase asked once). Returns an exit code. */
async function loadKeys(cfg: HomelabConfig): Promise<number> {
  const where = describeTarget(cfg.target);
  if ((await agentStatus()) === "missing") {
    note("✖ ssh-agent is not running, so ssh cannot remember your key.");
    note(
      process.platform === "win32"
        ? "  Run `hl init` to start it."
        : '  Start one with: eval "$(ssh-agent -s)" (or enable your desktop\'s ssh agent), then run `hl login` again.',
    );
    return 1;
  }
  note("→ Loading your ssh key into ssh-agent (enter the passphrase when asked)");
  const { added, code } = await addKeysToAgent(cfg.target);
  if (added.length === 0) {
    note(
      `✖ No key files found for ${where}. Create one with ssh-keygen and install it on the homelab first.`,
    );
    return 1;
  }
  if (code !== 0) {
    note(`✖ ssh-add failed (exit code ${code})`);
    return code;
  }
  connected.delete(where);
  if (await isAuthenticated(cfg.target)) {
    note(`✔ Done: ssh will not ask for the passphrase again. Keys: ${added.join(", ")}`);
    return 0;
  }
  note(
    `! Key loaded, but ${where} still did not accept it without a prompt. Is the key installed on the homelab (authorized_keys)?`,
  );
  return 1;
}

/** The interactive menu. Actions return to it; q / Esc leaves. */
async function menuLoop(cfg: HomelabConfig): Promise<void> {
  const items = menuItems(cfg);
  const { pickMenuItem } = await import("./tui.tsx");
  // Connect before the first menu, so the passphrase is asked once and the actions run straight away.
  if (!(await connect(cfg.target))) {
    process.exitCode = 255;
    return;
  }
  // The menu comes back after every action; q / Esc leaves it.
  for (;;) {
    const id = await pickMenuItem({
      title: "homelab",
      subtitle: describeTarget(cfg.target),
      items,
    });
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (item.danger && !(await confirm(`${item.label} on ${describeTarget(cfg.target)}?`))) {
      continue;
    }
    const code = await execute(
      cfg.target,
      { command: item.command, tty: item.tty, sudo: item.sudo, explain: item.explain },
      item.label,
    );
    // A clean exit from an interactive program (homelab-tui, a shell) has nothing left to read.
    const interactive = item.tty === true && !item.sudo;
    if (!(interactive && code === 0) && !(await pause())) return;
  }
}

export async function run(argv: string[]): Promise<void> {
  const program = new Command()
    .name("hl")
    .description("Manage the homelab over ssh. Run without a command for an interactive menu.")
    .version(pkg.version)
    .option("-H, --host <host>", "ssh host or alias (env HL_HOST, default wyse)")
    .option("-u, --user <user>", "ssh user (env HL_USER, default krzysztof)")
    .option("-p, --port <port>", "ssh port (env HL_PORT)")
    .enablePositionalOptions();

  program.action(async (_opts, cmd: Command) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      program.outputHelp();
      return;
    }
    await menuLoop(configFrom(cmd));
  });

  program
    .command("init")
    .description(
      "One-time setup: start ssh-agent (asks for administrator rights on Windows) and load your key",
    )
    .action(async (_o, cmd: Command) => {
      const cfg = configFrom(cmd);
      if (process.platform === "win32") {
        const state = await agentServiceState();
        if (state === "missing") {
          note(
            "✖ The OpenSSH Authentication Agent service was not found. Install the optional Windows feature 'OpenSSH Client' first (Settings → System → Optional features).",
          );
          process.exitCode = 1;
          return;
        }
        if (state === "ok") {
          note("✔ ssh-agent service is running and starts automatically");
        } else {
          note(
            "→ Starting the ssh-agent service. Windows will ask for administrator rights (UAC): accept it",
          );
          if (!(await enableAgentService())) {
            note(
              "✖ The service did not start (was the prompt declined?). Run `hl init` again, or in an admin PowerShell:\n" +
                "    Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent",
            );
            process.exitCode = 1;
            return;
          }
          note("✔ ssh-agent service is running and starts automatically");
        }
      }
      process.exitCode = await loadKeys(cfg);
    });

  program
    .command("login")
    .description("Load your ssh key into ssh-agent so ssh asks for the passphrase only once")
    .action(async (_o, cmd: Command) => {
      process.exitCode = await loadKeys(configFrom(cmd));
    });

  program
    .command("tui")
    .description("Open homelab-tui on the homelab, rendered in this terminal")
    .action(async (_o, cmd: Command) => {
      const cfg = configFrom(cmd);
      const code = await execute(
        cfg.target,
        { command: cfg.remoteBin, tty: true, explain: { 127: NOT_INSTALLED } },
        "Running hl tui",
      );
      process.exitCode = code;
      // Closing homelab-tui lands in the hl menu (when there is a terminal to show it in).
      if (!process.stdin.isTTY || !process.stdout.isTTY) return;
      if (code !== 0 && !(await pause())) return;
      process.exitCode = 0;
      await menuLoop(cfg);
    });

  program
    .command("ssh")
    .description("Open a shell on the homelab, or run a command")
    .argument("[command...]", "command to run instead of a login shell")
    .passThroughOptions()
    .action((words: string[], _o, cmd: Command) =>
      go(cmd, () => (words.length > 0 ? { command: words.join(" ") } : {})),
    );

  program
    .command("status")
    .description("Uptime, load, memory, disk, failed units and containers")
    .action((_o, cmd: Command) => go(cmd, () => ({ command: statusCommand() })));

  program
    .command("restart")
    .description("Restart a systemd service")
    .argument("<service>")
    .action((service: string, _o, cmd: Command) =>
      go(cmd, () => ({ command: restartServiceCommand(service), tty: true, sudo: true })),
    );

  program
    .command("logs")
    .description("Show journal logs for a systemd unit")
    .argument("<unit>")
    .option("-f, --follow", "follow new output")
    .option("-n, --lines <n>", "number of lines", positiveInt, 100)
    .action((unit: string, opts: { follow?: boolean; lines: number }, cmd: Command) =>
      go(cmd, () => ({
        command: logsCommand(unit, { follow: opts.follow, lines: opts.lines }),
        tty: opts.follow,
      })),
    );

  const docker = program.command("docker").description("Manage containers on the homelab");
  docker
    .command("ps")
    .description("List containers")
    .action((_o, cmd: Command) => go(cmd, () => ({ command: dockerPsCommand() })));
  docker
    .command("restart")
    .description("Restart a container")
    .argument("<name>")
    .action((name: string, _o, cmd: Command) =>
      go(cmd, () => ({ command: dockerRestartCommand(name) })),
    );
  docker
    .command("logs")
    .description("Show container logs")
    .argument("<name>")
    .option("-f, --follow", "follow new output")
    .option("-n, --lines <n>", "number of lines", positiveInt, 100)
    .action((name: string, opts: { follow?: boolean; lines: number }, cmd: Command) =>
      go(cmd, () => ({
        command: dockerLogsCommand(name, { follow: opts.follow, lines: opts.lines }),
        tty: opts.follow,
      })),
    );

  program
    .command("rebuild")
    .description("Pull the config checkout on the homelab (~/nix-config) and switch to it")
    .action((_o, cmd: Command) =>
      go(cmd, (cfg) => ({ command: rebuildCommand(cfg), tty: true, sudo: true })),
    );

  program
    .command("deploy")
    .description("Apply the latest NixOS config from GitHub on the homelab (push first)")
    .option("-f, --force", "deploy even if local commits are not pushed yet")
    .action(async (opts: { force?: boolean }, cmd: Command) => {
      const cfg = configFrom(cmd);
      if (cfg.configDir && !opts.force) {
        const spinner = startSpinner(`Checking that ${cfg.configDir} is pushed to GitHub…`);
        const state = await pushState(cfg.configDir);
        if (state.error) {
          spinner.fail(state.error);
          note("  Fix that, or use --force to skip the check.");
          process.exitCode = 1;
          return;
        }
        if (state.ahead > 0) {
          spinner.fail(
            `${state.ahead} commit(s) in ${cfg.configDir} are not pushed to GitHub yet. Run git push first, or use --force.`,
          );
          process.exitCode = 1;
          return;
        }
        spinner.succeed(
          state.dirty
            ? "Everything committed is pushed (uncommitted changes will not be deployed)"
            : "Config repo is pushed",
        );
      } else if (!cfg.configDir) {
        note(
          "Tip: set HL_CONFIG_DIR to your local nix-cfg checkout so hl can check it is pushed first.",
        );
      }
      process.exitCode = await execute(
        cfg.target,
        { command: deployCommand(cfg), tty: true, sudo: true },
        `Deploying github:${cfg.configRepo}#${cfg.flakeHost}`,
      );
    });

  program
    .command("reboot")
    .description("Reboot the homelab")
    .option("-y, --yes", "skip the confirmation prompt")
    .action(async (opts: { yes?: boolean }, cmd: Command) => {
      const cfg = configFrom(cmd);
      if (!opts.yes && !(await confirm(`Reboot ${describeTarget(cfg.target)}?`))) return;
      process.exitCode = await execute(
        cfg.target,
        { command: rebootCommand(), tty: true, sudo: true },
        "Rebooting",
      );
    });

  program
    .command("update")
    .description("Install the latest homelab-tui release on the homelab")
    .action((_o, cmd: Command) => go(cmd, (cfg) => ({ command: updateCommand(cfg) })));

  try {
    await program.parseAsync(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
