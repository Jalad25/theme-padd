import {
  ColorComponent,
  DropdownComponent,
  Setting,
  SliderComponent,
  TextAreaComponent,
  TextComponent,
  ToggleComponent
} from "obsidian";
import { Control } from "./ThemeSettingsSchema";
import { InputValue } from "./ThemeSettings";

//#region Constants

const COLOR_FALLBACK = "#000000";

//#endregion

//#region Types

export type WriteValue = (next: InputValue | undefined) => Promise<void>;
export type GetUserValue = () => InputValue | undefined;

//#endregion

// Render control
export function renderControl(
  setting: Setting,
  control: Control,
  effective: InputValue | undefined,
  write: WriteValue,
  getUserValue: GetUserValue,
): void {
  switch (control.type) {
    case "text": return renderText(setting, control, effective, write, getUserValue);
    case "textarea": return renderTextArea(setting, control, effective, write, getUserValue);
    case "toggle": return renderToggle(setting, control, effective, write, getUserValue);
    case "dropdown": return renderDropdown(setting, control, effective, write, getUserValue);
    case "number": return renderNumber(setting, control, effective, write, getUserValue);
    case "slider": return renderSlider(setting, control, effective, write, getUserValue);
    case "color": return renderColor(setting, control, effective, write, getUserValue);
  }
}

//#region Control renderers

// Render text control
function renderText(
  setting: Setting,
  control: Extract<Control, { type: "text" }>,
  value: InputValue | undefined,
  write: WriteValue,
  getUserValue: GetUserValue,
): void {
  let component: TextComponent | null = null;
  let setReset: (visible: boolean) => void = () => {};

  setting.addText((t) => {
    component = t;
    if (control.placeholder) t.setPlaceholder(control.placeholder);
    t.setValue(typeof value === "string" ? value : "")
     .onChange(async (next) => {
       await write(next);
       setReset(getUserValue() !== undefined);
     });
  });

  setReset = addResetButton(setting, control, getUserValue, write, () => {
    if (component && control.defaultValue !== undefined) component.setValue(control.defaultValue);
    else if (component) component.setValue("");
  });
}

// Render number (text) control
function renderNumber(
  setting: Setting,
  control: Extract<Control, { type: "number" }>,
  value: InputValue | undefined,
  write: WriteValue,
  getUserValue: GetUserValue,
): void {
  let component: TextComponent | null = null;
  let setReset: (visible: boolean) => void = () => {};

  setting.addText((t) => {
    component = t;
    t.inputEl.type = "number";
    if (control.placeholder) t.setPlaceholder(control.placeholder);
    if (control.min !== undefined) t.inputEl.min = String(control.min);
    if (control.max !== undefined) t.inputEl.max = String(control.max);
    if (control.step !== undefined) t.inputEl.step = String(control.step);
    t.setValue(typeof value === "number" ? String(value) : "")
     .onChange(async (raw) => {
       if (raw.trim() === "") {
         await write(undefined);
         setReset(getUserValue() !== undefined);
         return;
       }
       const parsed = Number(raw);
       if (Number.isNaN(parsed)) return; // Leave stored value
       await write(parsed);
       setReset(getUserValue() !== undefined);
     });
  });

  setReset = addResetButton(setting, control, getUserValue, write, () => {
    if (component && control.defaultValue !== undefined) component.setValue(String(control.defaultValue));
    else if (component) component.setValue("");
  });
}

// Render text area control
function renderTextArea(
  setting: Setting,
  control: Extract<Control, { type: "textarea" }>,
  value: InputValue | undefined,
  write: WriteValue,
  getUserValue: GetUserValue,
): void {
  let component: TextAreaComponent | null = null;
  let setReset: (visible: boolean) => void = () => {};

  setting.addTextArea((t) => {
    component = t;
    if (control.placeholder) t.setPlaceholder(control.placeholder);
    if (control.rows !== undefined) t.inputEl.rows = control.rows;
    t.setValue(typeof value === "string" ? value : "")
     .onChange(async (next) => {
       await write(next);
       setReset(getUserValue() !== undefined);
     });
  });

  setReset = addResetButton(setting, control, getUserValue, write, () => {
    if (component && control.defaultValue !== undefined) component.setValue(control.defaultValue);
    else if (component) component.setValue("");
  });
}

// Render toggle control
function renderToggle(
  setting: Setting,
  control: Extract<Control, { type: "toggle" }>,
  value: InputValue | undefined,
  write: WriteValue,
  getUserValue: GetUserValue,
): void {
  let component: ToggleComponent | null = null;
  let setReset: (visible: boolean) => void = () => {};

  setting.addToggle((t) => {
    component = t;
    t.setValue(typeof value === "boolean" ? value : false);
    t.onChange(async (next) => {
      await write(next);
      setReset(getUserValue() !== undefined);
    });
  });

  setReset = addResetButton(setting, control, getUserValue, write, () => {
    if (component) component.setValue(control.defaultValue ?? false);
  });
}

// Render dropdown control
function renderDropdown(
  setting: Setting,
  control: Extract<Control, { type: "dropdown" }>,
  value: InputValue | undefined,
  write: WriteValue,
  getUserValue: GetUserValue,
): void {
  let component: DropdownComponent | null = null;
  let setReset: (visible: boolean) => void = () => {};

  setting.addDropdown((d) => {
    component = d;
    // Add "(Default)" option (value: "") if the dev didn't already include one
    if (!("" in control.options)) d.addOption("", "(Default)");
    for (const [optValue, optLabel] of Object.entries(control.options)) {
      d.addOption(optValue, optLabel);
    }
    d.setValue(typeof value === "string" ? value : "");
    d.onChange(async (next) => {
      await write(next);
      setReset(getUserValue() !== undefined);
    });
  });

  setReset = addResetButton(setting, control, getUserValue, write, () => {
    if (component && control.defaultValue !== undefined) component.setValue(control.defaultValue);
  });
}

// Render slider control
function renderSlider(
  setting: Setting,
  control: Extract<Control, { type: "slider" }>,
  value: InputValue | undefined,
  write: WriteValue,
  getUserValue: GetUserValue,
): void {
  let component: SliderComponent | null = null;
  let setReset: (visible: boolean) => void = () => {};

  setting.addSlider((s) => {
    component = s;
    s.setLimits(control.min, control.max, control.step);
    s.setInstant(true);
    s.setValue(typeof value === "number" ? value : control.min);
    s.onChange(async (next) => {
      await write(next);
      setReset(getUserValue() !== undefined);
    });
  });

  setReset = addResetButton(setting, control, getUserValue, write, () => {
    if (component && control.defaultValue !== undefined) component.setValue(control.defaultValue);
  });
}

// Render color control
function renderColor(
  setting: Setting,
  control: Extract<Control, { type: "color" }>,
  value: InputValue | undefined,
  write: WriteValue,
  getUserValue: GetUserValue,
): void {
  let component: ColorComponent | null = null;
  let setReset: (visible: boolean) => void = () => {};

  setting.addColorPicker((c) => {
    component = c;
    c.setValue(typeof value === "string" && value !== "" ? value : COLOR_FALLBACK);
    c.onChange(async (next) => {
      await write(next);
      setReset(getUserValue() !== undefined);
    });
  });

  setReset = addResetButton(setting, control, getUserValue, write, () => {
    if (component) component.setValue(control.defaultValue ?? COLOR_FALLBACK);
  });
}

//#endregion

// Add reset button
function addResetButton(
  setting: Setting,
  control: Control,
  getUserValue: GetUserValue,
  write: WriteValue,
  restoreControl: () => void,
): (visible: boolean) => void {
  if (control.defaultValue === undefined) return () => {};

  let buttonEl: HTMLElement | null = null;
  const setVisible = (visible: boolean) => {
    buttonEl?.toggleVisibility(visible);
  };

  setting.addExtraButton((b) => {
    buttonEl = b.extraSettingsEl;
    b.setIcon("rotate-ccw")
     .setTooltip("Reset (use theme default)")
     .onClick(async () => {
       await write(undefined);
       restoreControl();
       setVisible(false);
     });
  });

  setVisible(getUserValue() !== undefined); // Toggle visibility on changes
  return setVisible;
}
