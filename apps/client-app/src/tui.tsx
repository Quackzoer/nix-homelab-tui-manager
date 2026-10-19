import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import type { MenuItem } from "@homelab/core";

interface MenuProps {
  title: string;
  subtitle: string;
  items: MenuItem[];
  onDone: (id?: string) => void;
}

function Menu({ title, subtitle, items, onDone }: MenuProps) {
  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") onDone(undefined);
  });

  return (
    <box flexDirection="column" flexGrow={1} padding={1} border borderStyle="rounded">
      <text attributes={TextAttributes.BOLD}>{title}</text>
      <text attributes={TextAttributes.DIM}>{subtitle}</text>
      <box flexGrow={1} marginTop={1}>
        <select
          focused
          flexGrow={1}
          options={items.map((item) => ({
            name: item.label,
            description: item.description,
            value: item.id,
          }))}
          onSelect={(_index, option) => onDone(option?.value as string | undefined)}
        />
      </box>
      <text attributes={TextAttributes.DIM}>↑/↓ move · enter select · q quit</text>
    </box>
  );
}

/** Shows the menu and resolves with the chosen item id (undefined if the user quit). The terminal is restored before resolving. */
export async function pickMenuItem(props: Omit<MenuProps, "onDone">): Promise<string | undefined> {
  const renderer = await createCliRenderer();
  return new Promise((resolve) => {
    const done = (id?: string) => {
      renderer.destroy();
      void renderer.closed.then(() => resolve(id));
    };
    createRoot(renderer).render(<Menu {...props} onDone={done} />);
  });
}
