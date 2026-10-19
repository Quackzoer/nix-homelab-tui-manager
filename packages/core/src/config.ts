/** Name of the TUI binary that runs on the homelab. */
export const BINARY_NAME = "homelab-tui";

export interface Target {
  host: string;
  user?: string;
  port?: number;
}

export interface HomelabConfig {
  target: Target;
  /** Checkout of the NixOS config on the homelab. Inserted into remote commands unquoted so `~` expands. */
  nixConfigDir: string;
  /** Flake output name, i.e. the `wyse` in `.#wyse`. */
  flakeHost: string;
  /** Where homelab-tui is installed on the homelab. Unquoted for the same reason as nixConfigDir. */
  remoteBin: string;
  /** `owner/name` of the GitHub repo that publishes homelab-tui releases. */
  repo: string;
  /** `owner/name` of the GitHub repo holding the NixOS config that `hl deploy` applies. */
  configRepo: string;
  /** Local checkout of that config repo (on this machine); lets `hl deploy` check it was pushed first. */
  configDir?: string;
}

type Env = Record<string, string | undefined>;

const PATH_LIKE = /^[~A-Za-z0-9_./-]+$/;
const REPO_LIKE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function pathFrom(env: Env, key: string, fallback: string): string {
  const value = env[key] ?? fallback;
  if (!PATH_LIKE.test(value)) throw new Error(`${key} contains unsupported characters: ${value}`);
  return value;
}

/** Reads settings from `HL_*` environment variables; every one has a default for the Wyse box. */
export function loadConfig(env: Env = process.env): HomelabConfig {
  let port: number | undefined;
  if (env.HL_PORT) {
    port = Number.parseInt(env.HL_PORT, 10);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`HL_PORT must be a valid port number, got "${env.HL_PORT}"`);
    }
  }
  if (env.HL_REPO && !REPO_LIKE.test(env.HL_REPO)) {
    throw new Error(`HL_REPO must look like owner/name, got "${env.HL_REPO}"`);
  }
  if (env.HL_CONFIG_REPO && !REPO_LIKE.test(env.HL_CONFIG_REPO)) {
    throw new Error(`HL_CONFIG_REPO must look like owner/name, got "${env.HL_CONFIG_REPO}"`);
  }
  return {
    target: { host: env.HL_HOST ?? "wyse", user: env.HL_USER ?? "krzysztof", port },
    nixConfigDir: pathFrom(env, "HL_NIX_DIR", "~/nix-config"),
    flakeHost: env.HL_FLAKE_HOST ?? "wyse",
    remoteBin: pathFrom(env, "HL_REMOTE_BIN", `~/.local/bin/${BINARY_NAME}`),
    repo: env.HL_REPO ?? "Quackzoer/nix-homelab-tui-manager",
    configRepo: env.HL_CONFIG_REPO ?? "Quackzoer/nix-cfg",
    configDir: env.HL_CONFIG_DIR || undefined,
  };
}

export function describeTarget(target: Target): string {
  const user = target.user ? `${target.user}@` : "";
  const port = target.port ? `:${target.port}` : "";
  return `${user}${target.host}${port}`;
}
