const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const animated = Boolean(process.stderr.isTTY);

// Everything goes to stderr so command output on stdout stays clean for piping.
export function note(message: string): void {
  process.stderr.write(`${message}\n`);
}

export interface Spinner {
  succeed(message: string): void;
  fail(message: string): void;
}

export function startSpinner(text: string): Spinner {
  if (!animated) {
    note(`${text}`);
    return { succeed: (m) => note(`✔ ${m}`), fail: (m) => note(`✖ ${m}`) };
  }
  let frame = 0;
  const draw = () => process.stderr.write(`\r\x1b[2K${FRAMES[frame++ % FRAMES.length]} ${text}`);
  draw();
  const timer = setInterval(draw, 80);
  const end = (symbol: string, message: string) => {
    clearInterval(timer);
    process.stderr.write(`\r\x1b[2K${symbol} ${message}\n`);
  };
  return { succeed: (m) => end("✔", m), fail: (m) => end("✖", m) };
}
