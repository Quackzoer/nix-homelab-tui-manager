import { afterEach, describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { loadConfig, menuTabs, type MenuItem } from "@homelab/core";
import { Menu } from "../src/tui.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let teardown: (() => void) | undefined;
afterEach(() => teardown?.());

async function open() {
  const picked: { item?: MenuItem | null } = {};
  const setup = await testRender(
    <Menu
      title="homelab"
      subtitle="krzysztof@wyse"
      tabs={menuTabs(loadConfig({}))}
      onDone={(item) => (picked.item = item ?? null)}
    />,
    { width: 90, height: 24 },
  );
  teardown = () => setup.renderer.destroy();
  await setup.renderOnce();
  return { ...setup, picked };
}

describe("menu", () => {
  test("two columns under a tab bar", async () => {
    const { captureCharFrame } = await open();
    const frame = captureCharFrame();
    expect(frame).toContain("General");
    expect(frame).toContain("Services");
    expect(frame).toContain("System");
    expect(frame).toContain("Actions · System");
  });

  test("arrows move, space expands, enter goes to the actions, enter runs one", async () => {
    const { captureCharFrame, mockInput, renderOnce, picked } = await open();
    mockInput.pressKey("ARROW_DOWN");
    mockInput.pressKey(" ");
    await renderOnce();
    expect(captureCharFrame()).toContain("Apply the config from GitHub");
    expect(captureCharFrame()).toContain("Actions · NixOS config");

    mockInput.pressEnter(); // to the actions column
    await renderOnce();
    mockInput.pressEnter(); // run the first action
    await renderOnce();
    expect(picked.item?.id).toBe("deploy");
  });

  test("] switches to Services and lists standard actions per service", async () => {
    const { waitForFrame, mockInput, renderOnce, picked } = await open();
    mockInput.pressKey("]");
    const frame = await waitForFrame((f) => f.includes("Actions · Syncthing"));
    expect(frame).toContain("Syncthing");
    expect(frame).toContain("Actions · Syncthing");
    expect(frame).toContain("Follow logs");

    mockInput.pressKey("ARROW_RIGHT");
    await renderOnce();
    mockInput.pressKey("ARROW_DOWN");
    mockInput.pressEnter();
    await renderOnce();
    expect(picked.item?.id).toBe("syncthing:logs");
  });

  test("q quits without choosing", async () => {
    const { mockInput, renderOnce, picked } = await open();
    mockInput.pressKey("q");
    await renderOnce();
    expect(picked.item).toBeNull();
  });
});
