import { Control, parseThemeSettingsJSON, SettingDefinitionItem } from "./ThemeSettingsSchema";
export type { Control, SettingDefinitionItem, ThemeSettingsJSON } from "./ThemeSettingsSchema";

//#region Types/Objects/Interfaces

export type InputValue = string | number | boolean;

export type FromSettingsJSONResult =
{ ok: true; settings: ThemeSettings }
| { ok: false; reason: string };

//#endregion

export class ThemeSettings {
  settingItems: SettingDefinitionItem[];
  themeVersion: string;
  schemaVersion: number;

  constructor() {
    this.settingItems = [];
    this.themeVersion = "";
    this.schemaVersion = 1;
  }

  // Create theme settings from settings.json or data.json
  static fromSettingsJSON(raw: unknown, themeVersion: string): FromSettingsJSONResult {
    const result = parseThemeSettingsJSON(raw); // Validates schema, returns validated object
    if (!result.ok) return { ok: false, reason: result.reason };

    const settings = new ThemeSettings();
    settings.settingItems = result.data.settingItems;
    settings.themeVersion = themeVersion;
    settings.schemaVersion = result.data.schemaVersion;
    return { ok: true, settings };
  }

  //#region Controls

  // Find a control by id
  findControl(id: string): Control | undefined {
    for (const control of this.allControls()) {
      if (control.id === id) return control;
    }
    return undefined;
  }

  // Iterate every control
  *allControls(): IterableIterator<Control> {
    for (const item of this.settingItems) {
      if (item.type === "empty") continue; // No controls
      if (item.type === "control") {
        yield item.control;
      } else { // group
        for (const child of item.items) {
          if (child.type === "control") yield child.control;
        }
      }
    }
  }

  //#endregion

  // Return user value, default, or undefined
  effectiveValue(control: Control, getUserValue: (id: string) => InputValue | undefined): InputValue | undefined {
    const userValue = getUserValue(control.id);
    if (userValue !== undefined) return userValue;

    switch (control.type) {
      case "text":
      case "textarea":
      case "dropdown":
      case "color":
        return control.defaultValue;
      case "toggle":
        return control.defaultValue;
      case "slider":
      case "number":
        return control.defaultValue;
    }
  }
}

//#region Utilities

// Check a value is "empty" for its control
export function isEmptyForControl(value: InputValue, control: Control): boolean {
  switch (control.type) {
    case "text":
    case "textarea":
    case "dropdown":
    case "color":
      return value === "";
    case "toggle":
    case "slider":
    case "number":
      return false;
  }
}

// Check a value equals the default 
export function matchesDefault(value: InputValue, control: Control): boolean {
  switch (control.type) {
    case "text":
    case "textarea":
    case "dropdown":
      return control.defaultValue !== undefined && value === control.defaultValue;
    case "slider":
      return value === control.defaultValue;
    case "number":
      return control.defaultValue !== undefined && value === control.defaultValue;
    case "toggle":
      // If a default is declared, compare. Otherwise treat false as the implicit default
      if (control.defaultValue !== undefined) return value === control.defaultValue;
      return value === false;
    case "color":
      return typeof value === "string"
          && control.defaultValue !== undefined
          && value.toLowerCase() === control.defaultValue.toLowerCase();
  }
}

// Check if stored value type same as control binding
export function valueMatchesControlType(value: InputValue, control: Control): boolean {
  switch (control.type) {
    case "text":
    case "textarea":
    case "dropdown":
    case "color":
      return typeof value === "string";
    case "toggle":
      return typeof value === "boolean";
    case "slider":
    case "number":
      return typeof value === "number";
  }
}

//#endregion
