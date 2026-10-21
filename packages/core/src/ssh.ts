import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Target } from "./config.ts";

const HOST_LIKE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NAME_LIKE = /^[A-Za-z0-9][A-Za-z0-9_.@:-]*$/;

/** Single-quotes a value for a POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Guards service/container/unit names before they are placed into a remote command. */
export function assertName(kind: string, value: string): string {
  if (!NAME_LIKE.test(value)) throw new Error(`Invalid ${kind}: ${JSON.stringify(value)}`);
  return value;
}

export interface SshOptions {
  /** Allocate a pseudo-terminal (needed for interactive programs and Ctrl-C on followed logs). */
  tty?: boolean;
}

export function sshArgs(
  target: Target,
  options: SshOptions = {},
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (!HOST_LIKE.test(target.host)) throw new Error(`Invalid host: ${JSON.stringify(target.host)}`);
  if (target.user !== undefined && !HOST_LIKE.test(target.user)) {
    throw new Error(`Invalid user: ${JSON.stringify(target.user)}`);
  }
  // AddKeysToAgent: after the first successful login the key stays in ssh-agent, so later calls
  // (also on Windows, which has no connection sharing) do not ask for the passphrase again.
  const args = [
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "AddKeysToAgent=yes",
  ];
  if (options.tty) args.push("-t");
  if (target.port !== undefined) args.push("-p", String(target.port));
  // Windows OpenSSH has no ControlMaster support; elsewhere reuse one connection between calls.
  if (platform !== "win32") {
    args.push(
      "-o",
      "ControlMaster=auto",
      "-o",
      "ControlPersist=10m",
      "-o",
      `ControlPath=${join(homedir(), ".ssh", "hl-%C")}`,
    );
  }
  args.push(target.user ? `${target.user}@${target.host}` : target.host);
  return args;
}

/**
 * Runs the system `ssh` with inherited stdio, so key/passphrase prompts and interactive
 * programs work exactly as in a normal terminal. Without a command it opens a login shell.
 * Resolves with ssh's exit code.
 */
export function runRemote(
  target: Target,
  command?: string,
  options: SshOptions = {},
): Promise<number> {
  const args =
    command === undefined
      ? sshArgs(target, { ...options, tty: true })
      : [...sshArgs(target, options), command];
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", args, { stdio: "inherit" });
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "ENOENT" ? new Error("`ssh` was not found on PATH") : error);
    });
    child.on("close", (code, signal) => resolve(code ?? (signal ? 128 : 1)));
  });
}

export type AgentStatus = "ready" | "empty" | "missing";

/** Maps the exit code of `ssh-add -l` to what it means: keys loaded, agent running but empty, or no agent. */
export function agentStatusFromExit(code: number | null): AgentStatus {
  if (code === 0) return "ready";
  if (code === 1) return "empty";
  return "missing";
}

/** Asks `ssh-add -l` whether an ssh-agent is running and holds keys. */
export function agentStatus(): Promise<AgentStatus> {
  return new Promise((resolve) => {
    const child = spawn("ssh-add", ["-l"], { stdio: "ignore" });
    child.on("error", () => resolve("missing"));
    child.on("close", (code) => resolve(agentStatusFromExit(code)));
  });
}

function runSilently(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", args, { stdio: "ignore" });
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "ENOENT" ? new Error("`ssh` was not found on PATH") : error);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/**
 * True when ssh can log in right now without asking anything (shared connection, agent key or a
 * key without passphrase). Uses BatchMode, so it never prompts and never hangs on a question.
 */
export function isAuthenticated(target: Target): Promise<boolean> {
  return runSilently(["-o", "BatchMode=yes", ...sshArgs(target), "true"]).then(
    (code) => code === 0,
  );
}

/**
 * Logs in once with the terminal attached, so passphrase and host-key questions are answered here.
 * Afterwards the connection (macOS/Linux) or the key in ssh-agent (all platforms) is reused, so
 * later calls run without asking again. Resolves with ssh's exit code.
 */
export function authenticate(target: Target): Promise<number> {
  return runRemote(target, "true");
}

/** Reads the key files ssh would try for a host out of `ssh -G` output (`~` expanded). */
export function parseIdentityFiles(config: string, home: string = homedir()): string[] {
  const files = [...config.matchAll(/^identityfile (.+)$/gm)].map((m) =>
    m[1]!.trim().replace(/^~(?=[\\/]|$)/, home),
  );
  return [...new Set(files)];
}

/** Loads the host's key files that exist into ssh-agent. `ssh-add` asks for each passphrase once. */
export async function addKeysToAgent(target: Target): Promise<{ added: string[]; code: number }> {
  const files = parseIdentityFiles(await sshConfigFor(target)).filter((file) => existsSync(file));
  if (files.length === 0) return { added: [], code: 1 };
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn("ssh-add", files, { stdio: "inherit" });
    child.on("error", (error: NodeJS.ErrnoException) =>
      reject(error.code === "ENOENT" ? new Error("`ssh-add` was not found on PATH") : error),
    );
    child.on("close", (exit) => resolve(exit ?? 1));
  });
  return { added: files, code };
}

export interface ProbeResult {
  ok: boolean;
  host: string;
  port: number;
  /** True when the check was skipped (e.g. a ProxyJump is configured), so `ok` is not meaningful. */
  skipped: boolean;
  reason?: string;
}

function sshConfigFor(target: Target): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("ssh", ["-G", ...sshArgs(target)], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out));
  });
}

/**
 * Checks that the ssh port answers before ssh is started, so callers can show progress and fail fast.
 * The endpoint comes from `ssh -G`, so ~/.ssh/config aliases (HostName/Port) are honoured.
 */
export async function probeTarget(target: Target, timeoutMs = 5000): Promise<ProbeResult> {
  const config = await sshConfigFor(target);
  const host = /^hostname (.+)$/m.exec(config)?.[1]?.trim() ?? target.host;
  const port = Number(/^port (\d+)$/m.exec(config)?.[1]) || target.port || 22;
  const proxied = /^proxycommand /m.test(config) || /^proxyjump (?!none)/m.test(config);
  if (proxied) return { ok: true, host, port, skipped: true };

  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (reason?: string) => {
      socket.destroy();
      resolve({ ok: reason === undefined, host, port, skipped: false, reason });
    };
    socket.setTimeout(timeoutMs, () => finish(`no answer after ${timeoutMs / 1000}s`));
    socket.on("connect", () => finish());
    socket.on("error", (error: NodeJS.ErrnoException) => finish(error.code ?? error.message));
  });
}
