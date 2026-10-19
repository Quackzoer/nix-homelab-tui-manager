import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { AccordionEvents, AccordionRenderable } from "../src/index.ts";

let setup: TestRendererSetup | undefined;
afterEach(async () => {
  await setup?.dispose();
  setup = undefined;
});

async function make(options: ConstructorParameters<typeof AccordionRenderable>[1] = {}) {
  setup = await createTestRenderer({ width: 40, height: 14 });
  const accordion = new AccordionRenderable(setup.renderer, {
    width: 40,
    items: [
      { id: "a", title: "Alpha", subtitle: "ok", content: ["alpha line 1", "alpha line 2"] },
      { id: "b", title: "Beta", content: "beta body" },
      { id: "c", title: "Gamma", disabled: true, content: "never shown" },
      { id: "d", title: "Delta", content: "delta body" },
    ],
    ...options,
  });
  setup.renderer.root.add(accordion);
  accordion.focus();
  await setup.renderOnce();
  return { accordion, ...setup };
}

describe("AccordionRenderable", () => {
  test("renders headers closed, bodies hidden", async () => {
    const { captureCharFrame } = await make();
    const frame = captureCharFrame();
    expect(frame).toContain("▸ Alpha");
    expect(frame).toContain("▸ Beta");
    expect(frame).not.toContain("alpha line 1");
  });

  test("set(i).open() / close() / toggle() are programmatic and chainable", async () => {
    const { accordion, renderOnce, captureCharFrame } = await make();
    accordion.set(0).open();
    await renderOnce();
    expect(captureCharFrame()).toContain("alpha line 1");
    expect(captureCharFrame()).toContain("▾ Alpha");

    accordion.set("b").open();
    await renderOnce();
    expect(captureCharFrame()).toContain("beta body");
    expect(captureCharFrame()).not.toContain("alpha line 1"); // single mode closes the others

    accordion.set(1).close().set(3).open();
    await renderOnce();
    expect(captureCharFrame()).not.toContain("beta body");
    expect(captureCharFrame()).toContain("delta body");
    accordion.set(3).toggle();
    expect(accordion.items[3]!.isOpen).toBe(false);
  });

  test("multiple mode keeps several open; openAll / closeAll", async () => {
    const { accordion } = await make({ multiple: true });
    accordion.set(0).open();
    accordion.set(1).open();
    expect(accordion.items.map((i) => i.isOpen)).toEqual([true, true, false, false]);
    accordion.closeAll();
    expect(accordion.items.some((i) => i.isOpen)).toBe(false);
    accordion.openAll();
    expect(accordion.items.map((i) => i.isOpen)).toEqual([true, true, false, true]); // disabled stays closed
  });

  test("keyboard: move skips disabled, space toggles, right/left open/close, enter activates", async () => {
    const { accordion, mockInput, renderOnce } = await make();
    const activated: string[] = [];
    accordion.on(AccordionEvents.ITEM_ACTIVATED, (_i: number, item: { itemId: string }) =>
      activated.push(item.itemId),
    );

    mockInput.pressKey("ARROW_DOWN");
    expect(accordion.selectedIndex).toBe(1);
    mockInput.pressKey("ARROW_DOWN");
    expect(accordion.selectedIndex).toBe(3); // Gamma is disabled
    mockInput.pressKey("ARROW_UP");
    mockInput.pressKey("ARROW_UP");
    expect(accordion.selectedIndex).toBe(0);

    mockInput.pressKey(" ");
    await renderOnce();
    expect(accordion.items[0]!.isOpen).toBe(true);
    mockInput.pressKey("ARROW_LEFT");
    expect(accordion.items[0]!.isOpen).toBe(false);
    mockInput.pressKey("ARROW_RIGHT");
    expect(accordion.items[0]!.isOpen).toBe(true);

    mockInput.pressEnter(); // toggles closed and reports activation
    expect(accordion.items[0]!.isOpen).toBe(false);
    expect(activated).toEqual(["a"]);
  });

  test("emits selection and open/close events", async () => {
    const { accordion } = await make();
    const log: string[] = [];
    accordion.on(AccordionEvents.SELECTION_CHANGED, (i: number) => log.push(`select:${i}`));
    accordion.on(AccordionEvents.ITEM_OPENED, (i: number) => log.push(`open:${i}`));
    accordion.on(AccordionEvents.ITEM_CLOSED, (i: number) => log.push(`close:${i}`));
    accordion.set(1).select().open();
    accordion.set(1).close();
    expect(log).toEqual(["select:1", "open:1", "close:1"]);
  });

  test("openOnSelect follows the selection", async () => {
    const { accordion } = await make({ openOnSelect: true });
    accordion.set(1).select();
    expect(accordion.items[1]!.isOpen).toBe(true);
    accordion.set(3).select();
    expect(accordion.items.map((i) => i.isOpen)).toEqual([false, false, false, true]);
  });

  test("replacing items keeps open state and selection by id", async () => {
    const { accordion } = await make();
    accordion.set("d").select().open();
    accordion.items = [
      { id: "z", title: "Zeta" },
      { id: "d", title: "Delta v2", content: "new body" },
    ];
    expect(accordion.selectedItem?.itemId).toBe("d");
    expect(accordion.selectedItem?.isOpen).toBe(true);
  });

  test("throws a clear error for an unknown item", async () => {
    const { accordion } = await make();
    expect(() => accordion.set("nope")).toThrow(/No accordion item/);
    expect(() => accordion.set(9)).toThrow(RangeError);
  });
});
