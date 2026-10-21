import { extend } from "@opentui/react";
import { AccordionRenderable } from "./accordion.ts";

declare module "@opentui/react" {
  interface OpenTUIComponents {
    accordion: typeof AccordionRenderable;
  }
}

/** Registers `<accordion />` for @opentui/react. Call once at startup. */
export function registerAccordion(): void {
  extend({ accordion: AccordionRenderable });
}
