import { z } from "zod";

//#region Types/Objects/Interfaces

type ColorSpace = (typeof COLOR_SPACES)[number];

export type Action = z.infer<typeof ActionSchema>;
export type Control = z.infer<typeof ControlSchema>;
export type SettingDefinitionItem = z.infer<typeof SettingDefinitionItem>;
export type ThemeSettingsJSON = z.infer<typeof ThemeSettingsJSONSchema>;

export type ParseResult =
{ ok: true; data: ThemeSettingsJSON }
| { ok: false; reason: string };

//#endregion

//#region Constants

export const SETTINGS_JSON_SCHEMA_VERSION = 1;

const COLOR_SPACES = ["hex", "rgb", "hsl"] as const;
const DEFAULT_COLOR_SPACE: ColorSpace = "hex";

const ACTION_COMPATIBILITY: Record<Action["action"], readonly ControlType[]> = {
  "set-css-variable":        ["text", "textarea", "color", "number", "slider", "dropdown"],
  "set-css-variable-to":     ["toggle"],
  "toggle-class":            ["toggle"],
  "set-class-from-list":     ["dropdown"],
};

//#endregion

//#region Schema (Zod)

//#region Action

const SetCssVariable = z.object({
  action: z.literal("set-css-variable"),
  name: z.string(),
  clearMode: z.enum(["remove", "empty", "default"]).optional() // defaults to "remove" when default value not given, otherwise "default"
});

const SetCssVariableTo = z.object({
  action: z.literal("set-css-variable-to"),
  name: z.string(),
  value: z.string(),
  clearMode: z.enum(["remove", "empty"]).optional() // defaults to "remove"
});

const ToggleClass = z.object({
  action: z.literal("toggle-class"),
  class: z.string()
});

const SetClassFromList = z.object({
  action: z.literal("set-class-from-list"),
  classes: z.array(z.string())
});

const ActionSchema = z.discriminatedUnion("action", [
  SetCssVariable,
  SetCssVariableTo,
  ToggleClass,
  SetClassFromList
]);

//#endregion

//#region Controls

const TextControl = z.object({
  type: z.literal("text"),
  id: z.string(), // Theme PADD specific
  defaultValue: z.string().optional(),
  placeholder: z.string().optional(),
  onChange: ActionSchema // Theme PADD specific
});

const TextAreaControl = z.object({
  type: z.literal("textarea"),
  id: z.string(), // Theme PADD specific
  defaultValue: z.string().optional(),
  placeholder: z.string().optional(),
  rows: z.number().int().positive().optional(),
  onChange: ActionSchema // Theme PADD specific
});

const NumberControl = z.object({
  type: z.literal("number"),
  id: z.string(), // Theme PADD specific
  defaultValue: z.number().optional(),
  placeholder: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.union([z.number(), z.literal("any")]).optional(),
  onChange: ActionSchema // Theme PADD specific
}).superRefine((data, ctx) => { // Check min, max, and default to min and max
  if (data.min !== undefined && data.max !== undefined && data.min >= data.max) {
    ctx.addIssue({
      code: "custom", 
      path: ["max"],
      message: `max (${data.max}) must be greater than min (${data.min})`
    });
  }
  if (data.defaultValue !== undefined) {
    if (data.min !== undefined && data.defaultValue < data.min) {
      ctx.addIssue({
        code: "custom", 
        path: ["defaultValue"],
        message: `defaultValue ${data.defaultValue} is below min ${data.min}`
      });
    }
    if (data.max !== undefined && data.defaultValue > data.max) {
      ctx.addIssue({
        code: "custom", 
        path: ["defaultValue"],
        message: `defaultValue ${data.defaultValue} is above max ${data.max}`
      });
    }
  }
});

const ToggleControl = z.object({
  type: z.literal("toggle"),
  id: z.string(), // Theme PADD specific
  defaultValue: z.boolean().optional(),
  onChange: ActionSchema // Theme PADD specific
});

const DropdownControl = z.object({
  type: z.literal("dropdown"),
  id: z.string(), // Theme PADD specific
  defaultValue: z.string().optional(),
  options: z.record(z.string(), z.string()),
  onChange: ActionSchema // Theme PADD specific
}).superRefine((data, ctx) => { // Check default matches an option or empty
  if (data.defaultValue === undefined || data.defaultValue === "") return;
  if (!(data.defaultValue in data.options)) {
    ctx.addIssue({
      code: "custom",
      path: ["defaultValue"],
      message: `defaultValue "${data.defaultValue}" does not match any option key`
    });
  }
});

const ColorControl = z.object({
  type: z.literal("color"),
  id: z.string(), // Theme PADD specific
  defaultValue: z.string().optional(),
  colorSpace: z.enum(COLOR_SPACES).optional(), // Theme PADD specific
  onChange: ActionSchema // Theme PADD specific
}).superRefine((data, ctx) => { // Check default matches color space
  const colorSpace = data.colorSpace ?? DEFAULT_COLOR_SPACE;
  if (data.defaultValue !== undefined && !matchesColorSpace(data.defaultValue, colorSpace)) {
    ctx.addIssue({
      code: "custom", 
      path: ["defaultValue"],
      message: `defaultValue "${data.defaultValue}" does not match colorSpace "${colorSpace}"`
    });
  }
});

const SliderControl = z.object({
  type: z.literal("slider"),
  id: z.string(), // Theme PADD specific
  defaultValue: z.number().optional(),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  onChange: ActionSchema // Theme PADD specific
}).superRefine((data, ctx) => {
  if (data.min >= data.max) { // Realistic min and max 
    ctx.addIssue({
      code: "custom", 
      path: ["max"],
      message: `max (${data.max}) must be greater than min (${data.min})`
    });
  }
  if (data.defaultValue !== undefined) {
    if (data.defaultValue < data.min || data.defaultValue > data.max) { // min <= default <= max
      ctx.addIssue({
        code: "custom", 
        path: ["defaultValue"],
        message: `defaultValue ${data.defaultValue} is out of range [${data.min}, ${data.max}]`
      });
    }
    if (data.step > 0) { // Realistic step
      const offset = data.defaultValue - data.min; // Default distance from min
      const remainder = Math.abs(offset - Math.round(offset / data.step) * data.step); // Default's distance from nearest point running from min up in step size increments
      if (remainder > 1e-9) { // JavaScript doesn't compare floats cleanly, so we check against a tolerance of 1e-9
        ctx.addIssue({
          code: "custom", 
          path: ["defaultValue"],
          message: `defaultValue ${data.defaultValue} is not aligned to step ${data.step} from min ${data.min}`
        });
      }
    }
  }
});

const ControlSchema = z.discriminatedUnion("type", [
  ToggleControl,
  DropdownControl,
  TextControl,
  TextAreaControl,
  NumberControl,
  SliderControl,
  ColorControl
]);

type ControlType = z.infer<typeof ControlSchema>["type"];

//#endregion

//#region Setting Definitions

const SettingDefinitionBase = z.object({
  name: z.string(),
  desc: z.string().optional(),
  aliases: z.array(z.string()).optional()
});

const SettingDefinitionControl = SettingDefinitionBase.extend({
  type: z.literal("control"), // Theme PADD specific
  control: ControlSchema
});

const SettingDefinitionEmpty = SettingDefinitionBase.extend({
  type: z.literal("empty") // Theme PADD specific
});

const SettingDefinitionGroup = z.object({
  type: z.literal("group"), // Theme PADD (Obsidian uses 'group' | 'list')
  heading: z.string().optional(),
  items: z.array(
    z.discriminatedUnion("type", [SettingDefinitionControl, SettingDefinitionEmpty])
  )
});

const SettingDefinitionItem = z.discriminatedUnion("type", [
  SettingDefinitionControl,
  SettingDefinitionEmpty,
  SettingDefinitionGroup
]);

//#endregion

//#region Root

const ThemeSettingsJSONSchema = z.object({
  schemaVersion: z.literal(SETTINGS_JSON_SCHEMA_VERSION), // Theme PADD specific
  settingItems: z.array(SettingDefinitionItem)
}).superRefine((data, ctx) => { // Check unique ids and actions compatible with control
  type ControlSite = { control: z.infer<typeof ControlSchema>; path: (string | number)[] };
  const ids = new Set<string>();
  const controls: ControlSite[] = [];

  // Iterate all setting items
  for (let i = 0; i < data.settingItems.length; i++) {
    const item = data.settingItems[i];
    if (item.type === "empty") continue; // Nothing to check for empty
    if (item.type === "control") {
      collectIdAndControl(item.control, ["settingItems", i, "control"]);
    } else { // group
      // Iterate items in group
      for (let j = 0; j < item.items.length; j++) {
        const child = item.items[j];
        if (child.type === "control") {
          collectIdAndControl(child.control, ["settingItems", i, "items", j, "control"]);
        }
      }
    }
  }

  // Iterate controls
  // path: JSON path to control
  function collectIdAndControl(control: z.infer<typeof ControlSchema>, path: (string | number)[]) {
    // Collect id
    const id = control.id.toLowerCase();
    if (ids.has(id)) { // Duplicate id found
      ctx.addIssue({ code: "custom", path: [...path, "id"], message: "duplicate id" });
    } else {
      ids.add(id);
    }

    // Collect control
    controls.push({ control, path });
  }

  // Check action compatibility with control
  for (const { control, path } of controls) {
    // Type level compatibility
    const allowed = ACTION_COMPATIBILITY[control.onChange.action];
    if (!allowed.includes(control.type)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "onChange"],
        message: `action "${control.onChange.action}" is not allowed on control "${control.type}" (allowed: ${allowed.join(", ")})`
      });
    }

    // clearMode "default" requires the control to define defaultValue
    if (control.onChange.action === "set-css-variable"
        && control.onChange.clearMode === "default"
        && !controlHasDefaultValue(control)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "onChange", "clearMode"],
        message: `clearMode "default" requires the control to define defaultValue`
      });
    }
  }
});

// Return if control has a default value set
function controlHasDefaultValue(control: z.infer<typeof ControlSchema>): boolean {
  switch (control.type) {
    case "text":
    case "textarea":
    case "dropdown":
    case "color":
      return control.defaultValue !== undefined && control.defaultValue !== "";
    case "number":
    case "slider":
      return control.defaultValue !== undefined;
    case "toggle":
      return control.defaultValue !== undefined; // not relevant for set-css-variable but kept exhaustive
  }
}

//#endregion

//#endregion

//#region Parse Data

// Parse and validate a settings.json against the schema
export function parseThemeSettingsJSON(raw: unknown): ParseResult {
  const result = ThemeSettingsJSONSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, reason: result.error.issues[0]?.message ?? "invalid settings" };
  }
  return { ok: true, data: result.data };
}

// Parse and validate a JSON text blob against the schema
export function parseThemeSettingsText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `Invalid JSON: ${message}` };
  }
  return parseThemeSettingsJSON(raw);
}

//#endregion

//#region Color Utilities

// Check that a color string matches the declared colorSpace
function matchesColorSpace(value: string, colorSpace: ColorSpace): boolean {
  switch (colorSpace) {
    case "hex": return matchesHex(value);
    case "rgb": return matchesRGB(value);
    case "hsl": return matchesHSL(value);
  }
}

// Hex check
function matchesHex(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length !== 7 || trimmed[0] !== "#") return false;
  const digits = trimmed.slice(1);
  for (const ch of digits) {
    if (!((ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F"))) return false;
  }
  return true;
}

// RGB check
function matchesRGB(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith("rgb(") || !trimmed.endsWith(")")) return false;
  const inner = trimmed.slice(4, -1);
  const parts = inner.split(",");
  if (parts.length !== 3) return false;
  for (const part of parts) {
    const n = parsePositiveInteger(part);
    if (n === null || n < 0 || n > 255) return false;
  }
  return true;
}

// HSL check
function matchesHSL(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith("hsl(") || !trimmed.endsWith(")")) return false;
  const inner = trimmed.slice(4, -1);
  const parts = inner.split(",");
  if (parts.length !== 3) return false;

  const h = parsePositiveInteger(parts[0]);
  if (h === null || h < 0 || h > 360) return false;

  for (const part of parts.slice(1)) {
    const p = part.trim();
    if (!p.endsWith("%")) return false;
    const n = parsePositiveInteger(p.slice(0, -1));
    if (n === null || n < 0 || n > 100) return false;
  }
  return true;
}

// Parse a single non-negative integer, rejecting empty, decimals, signs, non-digits
function parsePositiveInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  for (const ch of trimmed) {
    if (ch < "0" || ch > "9") return null;
  }
  return Number(trimmed);
}

//#endregion
