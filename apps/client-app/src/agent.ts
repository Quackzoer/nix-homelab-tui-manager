import { spawn } from "node:child_process";

function powershell(command: string, inherit = false): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
      stdio: inherit ? "inherit" : ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout?.on("data", (chunk) => (out += chunk));
    child.on("error", () => resolve({ code: 1, out: "" }));
    child.on("close", (code) => resolve({ code: code ?? 1, out: out.trim() }));
  });
}

export type ServiceState = "ok" | "stopped" | "missing";

/** Windows: is the OpenSSH Authentication Agent running and set to start automatically? */
export async function agentServiceState(): Promise<ServiceState> {
  const { code, out } = await powershell(
    '$s = Get-Service ssh-agent -ErrorAction SilentlyContinue; if ($s) { "$($s.Status)/$($s.StartType)" }',
  );
  if (code !== 0 || out === "") return "missing";
  return out === "Running/Automatic" ? "ok" : "stopped";
}

/**
 * Windows: enables and starts the ssh-agent service. That needs administrator rights, so it opens
 * a UAC prompt ("Run as administrator") for just that one command. Resolves true when the service
 * ends up running and automatic.
 */
export async function enableAgentService(): Promise<boolean> {
  const inner = "Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent";
  await powershell(
    `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-Command','${inner}'`,
    true,
  );
  return (await agentServiceState()) === "ok";
}
