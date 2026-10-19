import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer } from "@opentui/react";
import { BINARY_NAME } from "@homelab/core";

function App() {
  const renderer = useRenderer();
  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") renderer.destroy();
  });

  return (
    <box alignItems="center" justifyContent="center" flexGrow={1}>
      <box justifyContent="center" alignItems="flex-end">
        <ascii-font font="tiny" text="homelab" />
        <text attributes={TextAttributes.DIM}>{BINARY_NAME} · q to quit</text>
      </box>
    </box>
  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
