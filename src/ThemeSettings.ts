import { Input, Item, parseThemeSettingsJSON } from "./ThemeSettingsSchema";
export type { Action, Input, GroupItem, HeadingItem, Item, SettingItem } from "./ThemeSettingsSchema";

//#region Types/Objects/Interfaces

export type ThemedColorValue = { light: string; dark: string };
export type InputValue = string | number | boolean | ThemedColorValue;

export type FromSettingsJSONResult =
  { ok: true; settings: ThemeSettings; }
  | { ok: false; reason: string; };

//#endregion

export class ThemeSettings {
  items: Item[];
  icon: string | undefined;
  themeVersion: string;
  userValues: Map<string, InputValue>;

  constructor() {
    this.items = [];
    this.icon = undefined;
    this.themeVersion = "";
    this.userValues = new Map();
  }

  // Create theme settings from settings.json
  static fromSettingsJSON(raw: unknown, themeVersion: string): FromSettingsJSONResult {
    const result = parseThemeSettingsJSON(raw); // Validates schema, returns validated object
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    const settings = new ThemeSettings();
    settings.items = result.data.items;
    settings.icon = result.data.icon;
    settings.themeVersion = themeVersion;
    return { ok: true, settings };
  }

  //#region Inputs

  // Find input by id
  findInput(id: string): Input | undefined {
    for (const input of this.allInputs()) {
      if (input.id === id) return input;
    }
    return undefined;
  }

  // Set value input by user
  setInputValue(id: string, value: InputValue | undefined): void {
    const input = this.findInput(id);
    if (!input) return;
    if (value === undefined || !valueMatchesInputShape(value, input)) {
      this.clearUserValue(id);
      return;
    }
    if (isEmptyForInput(value, input) || matchesDefault(value, input)) {
      this.clearUserValue(id);
      return;
    }
    this.setUserValue(id, value);
  }

  // Iterate every input
  private *allInputs(): IterableIterator<Input> {
    for (const item of this.items) {
      if (item.type === "heading") continue; // No inputs
      if (item.type === "setting") {
        yield* item.inputs;
      } else { // group
        for (const setting of item.items) {
          yield* setting.inputs;
        }
      }
    }
  }

  //#endregion

  //#region User & Default Values

  // Get the user's value for an input, or undefined if unset
  getUserValue(id: string): InputValue | undefined {
    return this.userValues.get(id);
  }

  // Set the user's value for an input
  private setUserValue(id: string, value: InputValue): void {
    this.userValues.set(id, value);
  }

  // Clear the user's value for an input
  private clearUserValue(id: string): void {
    this.userValues.delete(id);
  }

  // Get resolved value
  effectiveValue(input: Input): InputValue | undefined {
    const userValue = this.getUserValue(input.id);
    if (userValue !== undefined) return userValue;

    switch (input.type) {
      case "text":
      case "textarea":
      case "dropdown":
        return input.default; // Types: string | undefined
      case "toggle":
        return input.default; // Types: boolean | undefined
      case "slider":
        return input.default; // Types: number | undefined
      case "color":
        if (input.themed) {
          if (input.defaultLight === undefined || input.defaultDark === undefined) return undefined;
          return { light: input.defaultLight, dark: input.defaultDark }; // Types: string | undefined
        }
        return input.default; // Types: string | undefined
    }
  }

  // Migrate user values from a previous ThemeSettings instance
  migrateUserValuesFrom(oldSettings: ThemeSettings | null): void {
    if (!oldSettings) return;

    // Collect old user values keyed by input id
    for (const newInput of this.allInputs()) {
      const oldValue = oldSettings.userValues.get(newInput.id);
      if (oldValue === undefined) continue;
      if (!valueMatchesInputShape(oldValue, newInput)) continue;
      this.setUserValue(newInput.id, oldValue);
    }
  }

  //#endregion

  //#region Theme Settings Application

  // Apply this theme's settings to DOM
  applyToDOM(): void {
    for (const input of this.allInputs()) {
      if (input.onChange === undefined) continue; // No action

      const value = this.effectiveValue(input);
      switch (input.onChange.action) {
        case "set-css-variable": // Set CSS Variable in DOM body
          if (value === undefined) {
            clearCssVariable(input.onChange.name, input.onChange.clearMode);
          } else if (typeof value === "string") {
            writeCssVariableToBody(input.onChange.name, value);
          } else if (typeof value === "number") {
            writeCssVariableToBody(input.onChange.name, String(value));
          }
          break;
        case "set-css-variable-to": // Set CSS Variable in DOM body when toggled on
          if (value === true) writeCssVariableToBody(input.onChange.name, input.onChange.value);
          else clearCssVariable(input.onChange.name, input.onChange.clearMode);
          break;
        case "set-css-variable-themed": // Set CSS Variables (for light and dark) in DOM body
          if (typeof value === "object" && value !== null && "light" in value && "dark" in value) {
            writeCssVariableToBody(input.onChange.nameLight, value.light);
            writeCssVariableToBody(input.onChange.nameDark, value.dark);
          } else {
            clearCssVariable(input.onChange.nameLight, input.onChange.clearMode);
            clearCssVariable(input.onChange.nameDark, input.onChange.clearMode);
          }
          break;
        case "toggle-class": // Set class in DOM body element when toggled on
          activeDocument.body.toggleClass(input.onChange.class, value === true);
          break;
        case "set-class-from-list": // Set class from list in DOM DOM body element when selected
          // Remove all classes in the list
          activeDocument.body.removeClasses(input.onChange.classes);

          // Set selected
          if (typeof value === "string" && value !== "" && input.onChange.classes.includes(value)) {
            activeDocument.body.addClass(value);
          }
          break;
      }
    }
  }

  // Remove this theme's settings from the DOM
  clearFromDOM(): void {
    for (const input of this.allInputs()) {
      if (input.onChange === undefined) continue;

      switch (input.onChange.action) {
        case "set-css-variable":
        case "set-css-variable-to":
          clearCssVariable(input.onChange.name, input.onChange.clearMode);
          break;
        case "set-css-variable-themed":
          clearCssVariable(input.onChange.nameLight, input.onChange.clearMode);
          clearCssVariable(input.onChange.nameDark, input.onChange.clearMode);
          break;
        case "toggle-class":
          activeDocument.body.removeClass(input.onChange.class);
          break;
        case "set-class-from-list":
          activeDocument.body.removeClasses(input.onChange.classes);
          break;
      }
    }
  }

  //#endregion
}

//#region Utilities

// Check a value is "empty" for its input
function isEmptyForInput(value: InputValue, input: Input): boolean {
  switch (input.type) {
    case "text":
    case "textarea":
    case "dropdown":
      return value === "";
    case "color":
      if (input.themed) {
        return typeof value === "object" && value !== null
          && "light" in value && value.light === ""
          && "dark"  in value && value.dark === "";
      }
      return value === "";
    case "toggle":
    case "slider":
      return false; // booleans/numbers are never "empty"
  }
}

// Check a value equals the input's declared default 
function matchesDefault(value: InputValue, input: Input): boolean {
  switch (input.type) {
    case "text":
    case "textarea":
    case "dropdown":
      return input.default !== undefined && value === input.default;
    case "slider":
      return value === input.default;
    case "toggle":
      // If a default is declared, compare. Otherwise treat false as the implicit default
      if (input.default !== undefined) return value === input.default;
      return value === false;
    case "color":
      if (input.themed) {
        if (input.defaultLight === undefined || input.defaultDark === undefined) return false;
        return typeof value === "object" && value !== null
          && "light" in value && value.light.toLowerCase() === input.defaultLight.toLowerCase()
          && "dark"  in value && value.dark.toLowerCase()  === input.defaultDark.toLowerCase();
      }
      return typeof value === "string" && input.default !== undefined && value.toLowerCase() === input.default.toLowerCase();
  }
}

// Check that a stored user value still matches the new input's expected shape
function valueMatchesInputShape(value: InputValue, input: Input): boolean {
  switch (input.type) {
    case "text":
    case "textarea":
    case "dropdown":
      return typeof value === "string";
    case "toggle":
      return typeof value === "boolean";
    case "slider":
      return typeof value === "number";
    case "color":
      if (input.themed) {
        return typeof value === "object" && value !== null
          && "light" in value && typeof value.light === "string"
          && "dark" in value && typeof value.dark === "string";
      }
      return typeof value === "string";
  }
}

// Write a CSS custom property to the document body
function writeCssVariableToBody(name: string, value: string): void {
  activeDocument.body.style.setProperty(name, value);
}

// Clear a CSS custom property from the document body
function clearCssVariable(name: string, clearMode: "empty" | "remove" | undefined): void {
  if (clearMode === "remove") activeDocument.body.style.removeProperty(name); // Clears variable from body
  else activeDocument.body.style.setProperty(name, ""); // Sets varible to ""
}

//#endregion
