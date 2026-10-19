import { spawn } from "node:child_process";

export interface PushState {
  /** Commits that exist locally but not on the upstream branch. */
  ahead: number;
  /** Uncommitted changes in the working tree (these are never deployed). */
  dirty: boolean;
  error?: string;
}

function git(dir: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", ["-C", dir, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("error", (error) => resolve({ code: 1, out: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

/** Checks whether everything committed in `dir` has been pushed to GitHub. */
export async function pushState(dir: string): Promise<PushState> {
  const fetched = await git(dir, ["fetch", "--quiet"]);
  if (fetched.code !== 0)
    return { ahead: 0, dirty: false, error: `git fetch failed: ${fetched.out.trim()}` };
  const ahead = await git(dir, ["rev-list", "--count", "@{u}..HEAD"]);
  if (ahead.code !== 0) {
    return {
      ahead: 0,
      dirty: false,
      error: `cannot compare with the upstream branch: ${ahead.out.trim()}`,
    };
  }
  const status = await git(dir, ["status", "--porcelain"]);
  return { ahead: Number(ahead.out.trim()) || 0, dirty: status.out.trim().length > 0 };
}
