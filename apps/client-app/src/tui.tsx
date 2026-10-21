import { createCliRenderer, TextAttributes, type TabSelectRenderable } from "@opentui/core";
import type { SelectRenderable } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccordionEvents, type AccordionRenderable } from "@homelab/opentui-accordion";
import { registerAccordion } from "@homelab/opentui-accordion/react";
import type { MenuItem, MenuTab } from "@homelab/core";

registerAccordion();

type Zone = "tabs" | "items" | "actions";
const ZONES: Zone[] = ["tabs", "items", "actions"];

const NO_ACTIONS: MenuItem[] = [];
const ACCENT = "#5FB3FF";
const MUTED = "#444C56";

/** Where the user was, so the menu can come back to the same place after an action. */
export interface MenuState {
  tab: number;
  group: number;
}

export interface MenuProps {
  title: string;
  subtitle: string;
  tabs: MenuTab[];
  initial?: MenuState;
  onDone: (item: MenuItem | undefined, state: MenuState) => void;
}

export function Menu({ title, subtitle, tabs, initial, onDone }: MenuProps) {
  const [tabIndex, setTabIndex] = useState(initial?.tab ?? 0);
  const [groupIndex, setGroupIndex] = useState(initial?.group ?? 0);
  const [zone, setZone] = useState<Zone>("items");

  const tabRef = useRef<TabSelectRenderable>(null);
  const accordionRef = useRef<AccordionRenderable>(null);
  const actionsRef = useRef<SelectRenderable>(null);

  const tabIndexRef = useRef(tabIndex);
  tabIndexRef.current = tabIndex;

  const tab = tabs[tabIndex]!;
  const group = tab.groups[Math.min(groupIndex, tab.groups.length - 1)];
  const state = (): MenuState => ({ tab: tabIndex, group: groupIndex });

  // Stable option arrays: OpenTUI resets the selection whenever it is handed a new `options` array.
  const tabOptions = useMemo(() => tabs.map((t) => ({ name: t.label, description: "" })), [tabs]);
  const accordionItems = useMemo(
    () =>
      tab.groups.map((g) => ({
        id: g.id,
        title: g.title,
        subtitle: g.subtitle,
        content: g.details,
      })),
    [tab],
  );

  // The tab bar follows `tabIndex` when it is changed from the keyboard shortcuts.
  useEffect(() => {
    if (tabRef.current && tabRef.current.getSelectedIndex() !== tabIndex) {
      tabRef.current.setSelectedIndex(tabIndex);
    }
  }, [tabIndex]);

  // Keep the keyboard focus on the active column.
  useEffect(() => {
    const refs = { tabs: tabRef, items: accordionRef, actions: actionsRef } as const;
    for (const z of ZONES) {
      const node = refs[z].current;
      if (!node) continue;
      if (z === zone) node.focus();
      else node.blur();
    }
  }, [zone, tabIndex]);

  // Selection and Enter in the accordion.
  useEffect(() => {
    const accordion = accordionRef.current;
    if (!accordion) return;
    const onSelection = (index: number) => setGroupIndex(index);
    const onActivate = () => setZone("actions");
    accordion.on(AccordionEvents.SELECTION_CHANGED, onSelection);
    accordion.on(AccordionEvents.ITEM_ACTIVATED, onActivate);
    accordion.selectedIndex = Math.min(groupIndex, tab.groups.length - 1);
    return () => {
      accordion.off(AccordionEvents.SELECTION_CHANGED, onSelection);
      accordion.off(AccordionEvents.ITEM_ACTIVATED, onActivate);
    };
    // groupIndex is only read to restore the selection when the tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabIndex]);

  // Used by the keyboard shortcuts and by the tab bar itself. The tab bar reports every change
  // (also the ones made from code), so a tab that is already active is ignored.
  const switchTab = (next: number) => {
    const bounded = (next + tabs.length) % tabs.length;
    if (bounded === tabIndexRef.current) return;
    tabIndexRef.current = bounded;
    setTabIndex(bounded);
    setGroupIndex(0);
  };

  useKeyboard((key) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      onDone(undefined, state());
    } else if (key.name === "escape") {
      if (zone === "actions") setZone("items");
      else if (zone === "items") setZone("tabs");
      else onDone(undefined, state());
    } else if (key.name === "tab") {
      const step = key.shift ? -1 : 1;
      setZone(ZONES[(ZONES.indexOf(zone) + step + ZONES.length) % ZONES.length]!);
    } else if (key.name === "[") switchTab(tabIndex - 1);
    else if (key.name === "]") switchTab(tabIndex + 1);
    else if (zone === "tabs" && key.name === "down") setZone("items");
    else if (zone === "items" && key.name === "right") setZone("actions");
    else if (zone === "actions" && key.name === "left") setZone("items");
  });

  const border = (z: Zone) => (zone === z ? ACCENT : MUTED);
  const actions = group?.items ?? NO_ACTIONS;
  const actionOptions = useMemo(
    () =>
      actions.map((item) => ({ name: item.label, description: item.description, value: item.id })),
    [actions],
  );

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
      border
      borderStyle="rounded"
      borderColor={MUTED}
      title={` ${title} · ${subtitle} `}
    >
      <tab-select
        ref={tabRef}
        height={2}
        tabWidth={16}
        showDescription={false}
        wrapSelection
        selectedBackgroundColor={zone === "tabs" ? "#2F4F6F" : "#262B33"}
        options={tabOptions}
        onChange={(index) => switchTab(index)}
      />
      <box flexDirection="row" flexGrow={1} gap={1}>
        <box
          width="40%"
          border
          borderStyle="rounded"
          borderColor={border("items")}
          title={tab.label}
          flexDirection="column"
        >
          <accordion
            key={tab.id}
            ref={accordionRef}
            flexGrow={1}
            items={accordionItems}
            toggleOnActivate={false}
            keyBindings={{ open: ["o"], close: ["c"], activate: ["return", "enter"] }}
          />
        </box>
        <box
          flexGrow={1}
          border
          borderStyle="rounded"
          borderColor={border("actions")}
          title={group ? `Actions · ${group.title}` : "Actions"}
          flexDirection="column"
        >
          {actions.length === 0 ? (
            <text attributes={TextAttributes.DIM}>Nothing to do here yet.</text>
          ) : (
            <select
              key={`${tab.id}:${group?.id}`}
              ref={actionsRef}
              flexGrow={1}
              options={actionOptions}
              onSelect={(index) => onDone(actions[index], state())}
            />
          )}
        </box>
      </box>
      <text attributes={TextAttributes.DIM}>
        tab pane · [ ] tabs · ↑↓ move · space expand · enter actions · esc back · q quit
      </text>
    </box>
  );
}

/**
 * Shows the menu and resolves with the chosen action (undefined if the user quit) and where the
 * user was. The terminal is restored before resolving.
 */
export async function pickMenuItem(
  props: Omit<MenuProps, "onDone">,
): Promise<{ item: MenuItem | undefined; state: MenuState }> {
  const renderer = await createCliRenderer();
  return new Promise((resolve) => {
    const done = (item: MenuItem | undefined, state: MenuState) => {
      renderer.destroy();
      void renderer.closed.then(() => resolve({ item, state }));
    };
    createRoot(renderer).render(<Menu {...props} onDone={done} />);
  });
}
