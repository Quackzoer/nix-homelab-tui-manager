import {
  BoxRenderable,
  TextAttributes,
  TextRenderable,
  type BoxOptions,
  type ColorInput,
  type KeyEvent,
  type RenderContext,
} from "@opentui/core";

/* -------------------------------------------------------------------------------------------------
 * Accordion for OpenTUI
 *
 * A vertical list of sections. Each section has a one-line header and a body that is shown while the
 * section is open. Sections can be opened and closed with the keyboard or from code:
 *
 *   const accordion = new AccordionRenderable(ctx, { items: [...] });
 *   accordion.set(1).open();            // open the second section
 *   accordion.set("nixos").toggle();    // address a section by id
 *   accordion.set(0).select().open();   // chain controller calls
 *
 * The file only depends on @opentui/core, so it can be moved into that repository unchanged.
 * ----------------------------------------------------------------------------------------------- */

export interface AccordionItemOptions {
  /** Stable identifier used by `accordion.set("id")` and in events. Must be unique in the accordion. */
  id: string;
  title: string;
  /** Secondary text shown at the right end of the header, e.g. a status. */
  subtitle?: string;
  /** Color of `subtitle`. */
  subtitleColor?: ColorInput;
  /** Body text, one entry per line. Add other renderables with `item.body.add(...)`. */
  content?: string | string[];
  /** Start open. */
  open?: boolean;
  /** Disabled sections are skipped by keyboard navigation and cannot be opened. */
  disabled?: boolean;
}

export type AccordionAction =
  | "move-up"
  | "move-down"
  | "move-first"
  | "move-last"
  | "toggle"
  | "open"
  | "close"
  | "activate";

export type AccordionKeyBindings = Partial<Record<AccordionAction, string[]>>;

export const defaultAccordionKeyBindings: Required<AccordionKeyBindings> = {
  "move-up": ["up", "k"],
  "move-down": ["down", "j"],
  "move-first": ["home"],
  "move-last": ["end"],
  toggle: ["space"],
  open: ["right", "l"],
  close: ["left", "h"],
  activate: ["return", "enter"],
};

export interface AccordionOptions extends Omit<BoxOptions<AccordionRenderable>, "focusable"> {
  items?: AccordionItemOptions[];
  /** Index (or id) of the initially selected section. Default 0. */
  selectedIndex?: number;
  /** Allow several sections to be open at once. Default false: opening one closes the others. */
  multiple?: boolean;
  /** `activate` (Enter) also toggles the section. Default true. */
  toggleOnActivate?: boolean;
  /** Wrap from the last section to the first and back. Default false. */
  wrapSelection?: boolean;
  /** Open the section when it becomes selected (and close the previously selected one if not `multiple`). */
  openOnSelect?: boolean;
  keyBindings?: AccordionKeyBindings;
  textColor?: ColorInput;
  bodyTextColor?: ColorInput;
  selectedTextColor?: ColorInput;
  selectedBackgroundColor?: ColorInput;
  /** Selected-header background while the accordion does not have focus. */
  inactiveSelectedBackgroundColor?: ColorInput;
  subtitleColor?: ColorInput;
  openIndicator?: string;
  closedIndicator?: string;
}

export enum AccordionEvents {
  /** (index, item) the selected section changed. */
  SELECTION_CHANGED = "selectionChanged",
  /** (index, item) Enter was pressed on a section. */
  ITEM_ACTIVATED = "itemActivated",
  /** (index, item) */
  ITEM_OPENED = "itemOpened",
  /** (index, item) */
  ITEM_CLOSED = "itemClosed",
}

interface Palette {
  text: ColorInput;
  body: ColorInput;
  selectedText: ColorInput;
  selectedBg: ColorInput;
  inactiveSelectedBg: ColorInput;
  subtitle: ColorInput;
  openIndicator: string;
  closedIndicator: string;
}

const DEFAULT_PALETTE: Palette = {
  text: "#CCCCCC",
  body: "#8A93A0",
  selectedText: "#FFFFFF",
  selectedBg: "#2F4F6F",
  inactiveSelectedBg: "#262B33",
  subtitle: "#8A93A0",
  openIndicator: "▾",
  closedIndicator: "▸",
};

/** One section of an {@link AccordionRenderable}: a header row plus a body that is visible while open. */
export class AccordionItemRenderable extends BoxRenderable {
  readonly itemId: string;
  /** Holds the content. Add arbitrary renderables here. */
  readonly body: BoxRenderable;
  private readonly header: BoxRenderable;
  private readonly titleText: TextRenderable;
  private readonly subtitleText: TextRenderable;
  private bodyLines: TextRenderable[] = [];
  private _heading: string;
  private _open = false;
  private _disabled: boolean;
  private _isSelected = false;
  private _hasFocus = false;
  private palette: Palette;

  constructor(
    ctx: RenderContext,
    options: AccordionItemOptions,
    palette: Palette = DEFAULT_PALETTE,
  ) {
    super(ctx, { id: `accordion-item-${options.id}`, flexDirection: "column", flexShrink: 0 });
    this.itemId = options.id;
    this._heading = options.title;
    this._disabled = options.disabled ?? false;
    this.palette = palette;

    this.titleText = new TextRenderable(ctx, {
      content: "",
      flexGrow: 1,
      height: 1,
      truncate: true,
    });
    this.subtitleText = new TextRenderable(ctx, {
      content: options.subtitle ?? "",
      fg: options.subtitleColor ?? palette.subtitle,
      height: 1,
      flexShrink: 0,
    });
    this.header = new BoxRenderable(ctx, {
      flexDirection: "row",
      height: 1,
      flexShrink: 0,
      paddingX: 1,
      gap: 1,
    });
    this.header.add(this.titleText);
    this.header.add(this.subtitleText);

    this.body = new BoxRenderable(ctx, {
      flexDirection: "column",
      flexShrink: 0,
      paddingLeft: 3,
      paddingRight: 1,
      visible: false,
    });
    this.add(this.header);
    this.add(this.body);

    this.setContent(options.content ?? []);
    if (options.open && !this._disabled) this._open = true;
    this.refresh();
  }

  /** The header text. (`title` is left alone: on a Box it is the border title.) */
  get heading(): string {
    return this._heading;
  }
  set heading(value: string) {
    this._heading = value;
    this.refresh();
  }

  get subtitle(): string {
    return this.subtitleText.plainText;
  }
  set subtitle(value: string) {
    this.subtitleText.content = value;
    this.requestRender();
  }

  get isOpen(): boolean {
    return this._open;
  }
  get disabled(): boolean {
    return this._disabled;
  }
  set disabled(value: boolean) {
    this._disabled = value;
    if (value) this._open = false;
    this.refresh();
  }

  /** Replaces the text lines of the body (other renderables added to `body` are kept). */
  setContent(content: string | string[]): void {
    for (const line of this.bodyLines) {
      this.body.remove(line);
      line.destroy();
    }
    const lines = Array.isArray(content) ? content : content.split("\n");
    this.bodyLines = lines.map((line) => {
      const text = new TextRenderable(this.ctx, {
        content: line,
        fg: this.palette.body,
        height: 1,
        flexShrink: 0,
        truncate: true,
      });
      this.body.add(text);
      return text;
    });
    this.requestRender();
  }

  /** @internal Called by the accordion; use `accordion.set(i).open()` instead. */
  _setOpen(open: boolean): boolean {
    const next = open && !this._disabled;
    if (next === this._open) return false;
    this._open = next;
    this.refresh();
    return true;
  }

  /** @internal */
  _setSelection(selected: boolean, focused: boolean): void {
    if (selected === this._isSelected && focused === this._hasFocus) return;
    this._isSelected = selected;
    this._hasFocus = focused;
    this.refresh();
  }

  private refresh(): void {
    if (this.isDestroyed || this.isFreed()) return; // blur() can run while the tree is torn down
    const p = this.palette;
    const chevron = this._open ? p.openIndicator : p.closedIndicator;
    this.titleText.content = `${chevron} ${this._heading}`;
    this.body.visible = this._open;

    if (this._disabled) {
      this.titleText.fg = p.body;
      this.titleText.attributes = TextAttributes.DIM;
      this.header.backgroundColor = "transparent";
    } else if (this._isSelected) {
      this.titleText.fg = p.selectedText;
      this.titleText.attributes = TextAttributes.BOLD;
      this.header.backgroundColor = this._hasFocus ? p.selectedBg : p.inactiveSelectedBg;
    } else {
      this.titleText.fg = p.text;
      this.titleText.attributes = TextAttributes.NONE;
      this.header.backgroundColor = "transparent";
    }
    this.requestRender();
  }
}

/** Handle returned by `accordion.set(...)`. Every method returns the controller, so calls chain. */
export class AccordionItemController {
  constructor(
    readonly accordion: AccordionRenderable,
    readonly index: number,
  ) {}

  get item(): AccordionItemRenderable {
    return this.accordion.items[this.index]!;
  }
  open(): this {
    this.accordion._setItemOpen(this.index, true);
    return this;
  }
  close(): this {
    this.accordion._setItemOpen(this.index, false);
    return this;
  }
  toggle(): this {
    this.accordion._setItemOpen(this.index, !this.item.isOpen);
    return this;
  }
  /** Makes this section the selected one. */
  select(): this {
    this.accordion.selectedIndex = this.index;
    return this;
  }
  /** Moves on to another section, so `accordion.set(0).open().set(1).open()` reads naturally. */
  set(target: number | string): AccordionItemController {
    return this.accordion.set(target);
  }
}

export class AccordionRenderable extends BoxRenderable {
  protected static override readonly defaultFocusable = true;

  private _items: AccordionItemRenderable[] = [];
  private _selectedIndex = 0;
  private _multiple: boolean;
  private _toggleOnActivate: boolean;
  private _wrap: boolean;
  private _openOnSelect: boolean;
  private bindings: Required<AccordionKeyBindings>;
  private palette: Palette;

  constructor(ctx: RenderContext, options: AccordionOptions = {}) {
    const {
      items,
      selectedIndex,
      multiple,
      toggleOnActivate,
      wrapSelection,
      openOnSelect,
      keyBindings,
      textColor,
      bodyTextColor,
      selectedTextColor,
      selectedBackgroundColor,
      inactiveSelectedBackgroundColor,
      subtitleColor,
      openIndicator,
      closedIndicator,
      ...boxOptions
    } = options;
    super(ctx, { flexDirection: "column", ...(boxOptions as BoxOptions), focusable: true });

    this._multiple = multiple ?? false;
    this._toggleOnActivate = toggleOnActivate ?? true;
    this._wrap = wrapSelection ?? false;
    this._openOnSelect = openOnSelect ?? false;
    this.bindings = { ...defaultAccordionKeyBindings, ...keyBindings };
    this.palette = {
      text: textColor ?? DEFAULT_PALETTE.text,
      body: bodyTextColor ?? DEFAULT_PALETTE.body,
      selectedText: selectedTextColor ?? DEFAULT_PALETTE.selectedText,
      selectedBg: selectedBackgroundColor ?? DEFAULT_PALETTE.selectedBg,
      inactiveSelectedBg: inactiveSelectedBackgroundColor ?? DEFAULT_PALETTE.inactiveSelectedBg,
      subtitle: subtitleColor ?? DEFAULT_PALETTE.subtitle,
      openIndicator: openIndicator ?? DEFAULT_PALETTE.openIndicator,
      closedIndicator: closedIndicator ?? DEFAULT_PALETTE.closedIndicator,
    };

    if (items) this.items = items;
    if (selectedIndex !== undefined) this.selectedIndex = selectedIndex;
    this.syncSelection();
  }

  /* ----------------------------------------------------------------------------- items */

  get items(): AccordionItemRenderable[] {
    return this._items;
  }

  /** Replaces all sections. Open state is kept for sections whose id is still present. */
  set items(options: AccordionItemOptions[]) {
    const wasOpen = new Set(this._items.filter((i) => i.isOpen).map((i) => i.itemId));
    const selectedId = this._items[this._selectedIndex]?.itemId;
    for (const item of this._items) {
      this.remove(item);
      item.destroyRecursively();
    }
    this._items = [];
    for (const option of options) {
      this.addItem({ ...option, open: option.open ?? wasOpen.has(option.id) });
    }
    const keep =
      selectedId === undefined ? -1 : this._items.findIndex((i) => i.itemId === selectedId);
    this._selectedIndex = Math.max(
      0,
      Math.min(keep < 0 ? this._selectedIndex : keep, this._items.length - 1),
    );
    this.enforceSingleOpen();
    this.syncSelection();
    this.emit(
      AccordionEvents.SELECTION_CHANGED,
      this._selectedIndex,
      this._items[this._selectedIndex],
    );
  }

  addItem(options: AccordionItemOptions, index?: number): AccordionItemRenderable {
    if (this._items.some((i) => i.itemId === options.id)) {
      throw new Error(`Accordion already has an item with id "${options.id}"`);
    }
    const item = new AccordionItemRenderable(this.ctx, options, this.palette);
    const at =
      index === undefined ? this._items.length : Math.max(0, Math.min(index, this._items.length));
    this._items.splice(at, 0, item);
    this.add(item, at);
    this.syncSelection();
    return item;
  }

  removeItem(target: number | string): void {
    const index = this.resolve(target);
    const [item] = this._items.splice(index, 1);
    if (!item) return;
    this.remove(item);
    item.destroyRecursively();
    this._selectedIndex = Math.max(0, Math.min(this._selectedIndex, this._items.length - 1));
    this.syncSelection();
  }

  /* ----------------------------------------------------------------------- programmatic API */

  /** Addresses a section by index or id and returns a chainable controller. */
  set(target: number | string): AccordionItemController {
    return new AccordionItemController(this, this.resolve(target));
  }

  open(target: number | string): this {
    this._setItemOpen(this.resolve(target), true);
    return this;
  }
  close(target: number | string): this {
    this._setItemOpen(this.resolve(target), false);
    return this;
  }
  toggle(target: number | string): this {
    const index = this.resolve(target);
    this._setItemOpen(index, !this._items[index]!.isOpen);
    return this;
  }
  openAll(): this {
    this._items.forEach((_, i) => this._setItemOpen(i, true, true));
    return this;
  }
  closeAll(): this {
    this._items.forEach((_, i) => this._setItemOpen(i, false));
    return this;
  }

  get selectedIndex(): number {
    return this._selectedIndex;
  }
  set selectedIndex(index: number) {
    if (this._items.length === 0) return;
    const next = Math.max(0, Math.min(index, this._items.length - 1));
    if (next === this._selectedIndex) {
      this.syncSelection();
      return;
    }
    this._selectedIndex = next;
    this.syncSelection();
    if (this._openOnSelect) this._setItemOpen(next, true);
    this.emit(AccordionEvents.SELECTION_CHANGED, next, this._items[next]);
  }

  get selectedItem(): AccordionItemRenderable | undefined {
    return this._items[this._selectedIndex];
  }

  get multiple(): boolean {
    return this._multiple;
  }
  set multiple(value: boolean) {
    this._multiple = value;
    this.enforceSingleOpen();
  }

  moveUp(): void {
    this.move(-1);
  }
  moveDown(): void {
    this.move(1);
  }

  /** @internal Used by controllers and key handling. */
  _setItemOpen(index: number, open: boolean, keepOthers = false): void {
    const item = this._items[index];
    if (!item) return;
    if (open && !this._multiple && !keepOthers) {
      this._items.forEach((other, i) => {
        if (i !== index && other._setOpen(false)) this.emit(AccordionEvents.ITEM_CLOSED, i, other);
      });
    }
    if (item._setOpen(open)) {
      this.emit(open ? AccordionEvents.ITEM_OPENED : AccordionEvents.ITEM_CLOSED, index, item);
    }
    this.requestRender();
  }

  /* ---------------------------------------------------------------------------- keyboard */

  override handleKeyPress(key: KeyEvent): boolean {
    if (key.ctrl || key.meta) return false;
    const name = key.name;
    const is = (action: AccordionAction) => this.bindings[action].includes(name);
    const index = this._selectedIndex;

    if (is("move-up")) this.move(-1);
    else if (is("move-down")) this.move(1);
    else if (is("move-first")) this.selectedIndex = this.firstEnabled(0, 1);
    else if (is("move-last")) this.selectedIndex = this.firstEnabled(this._items.length - 1, -1);
    else if (is("toggle")) this.toggle(index);
    else if (is("open")) this._setItemOpen(index, true);
    else if (is("close")) this._setItemOpen(index, false);
    else if (is("activate")) {
      if (this._toggleOnActivate) this.toggle(index);
      this.emit(AccordionEvents.ITEM_ACTIVATED, index, this._items[index]);
    } else return false;
    return true;
  }

  /* ------------------------------------------------------------------------------- focus */

  override focus(): void {
    super.focus();
    this.syncSelection();
  }
  override blur(): void {
    super.blur();
    this.syncSelection();
  }

  /* ----------------------------------------------------------------------------- internals */

  private resolve(target: number | string): number {
    const index =
      typeof target === "number" ? target : this._items.findIndex((i) => i.itemId === target);
    if (index < 0 || index >= this._items.length) {
      throw new RangeError(
        `No accordion item ${JSON.stringify(target)} (have ${this._items.length})`,
      );
    }
    return index;
  }

  private firstEnabled(from: number, step: 1 | -1): number {
    for (let i = from; i >= 0 && i < this._items.length; i += step) {
      if (!this._items[i]!.disabled) return i;
    }
    return this._selectedIndex;
  }

  private move(step: 1 | -1): void {
    const count = this._items.length;
    if (count === 0) return;
    let next = this._selectedIndex;
    for (let tries = 0; tries < count; tries++) {
      next += step;
      if (next < 0 || next >= count) {
        if (!this._wrap) return;
        next = (next + count) % count;
      }
      if (!this._items[next]!.disabled) {
        this.selectedIndex = next;
        return;
      }
    }
  }

  private enforceSingleOpen(): void {
    if (this._multiple) return;
    let seen = false;
    this._items.forEach((item, i) => {
      if (!item.isOpen) return;
      if (seen && item._setOpen(false)) this.emit(AccordionEvents.ITEM_CLOSED, i, item);
      seen = true;
    });
  }

  private syncSelection(): void {
    this._items.forEach((item, i) => item._setSelection(i === this._selectedIndex, this.focused));
  }
}
