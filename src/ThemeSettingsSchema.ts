import { z } from "zod";

//#region Types/Objects/Interfaces

type InputType = Input["type"];
type ColorSpace = (typeof COLOR_SPACES)[number];

export type Action = z.infer<typeof ActionSchema>;
export type Input = z.infer<typeof InputSchema>;
export type HeadingItem = z.infer<typeof HeadingItemSchema>;
export type SettingItem = z.infer<typeof SettingItemSchema>;
export type GroupItem = z.infer<typeof GroupItemSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type ThemeSettingsJSON = z.infer<typeof ThemeSettingsJSONSchema>;

export type ParseResult =
{ ok: true; data: ThemeSettingsJSON; }
| { ok: false; reason: string; };

//#endregion

//#region Constants

const SETTINGS_JSON_SCHEMA_VERSION = 1;

const COLOR_SPACES = ["hex", "rgb", "hsl"] as const;
const DEFAULT_COLOR_SPACE: ColorSpace = "hex";

const ACTION_COMPATIBILITY: Record<Action["action"], readonly InputType[]> = {
  "set-css-variable":        ["text", "textarea", "color", "slider", "dropdown"],
  "set-css-variable-to":     ["toggle"],
  "set-css-variable-themed": ["color"],
  "toggle-class":            ["toggle"],
  "set-class-from-list":     ["dropdown"],
};

//#endregion

//#region Schemas (Zod)

//#region Actions

const SetCssVariable = z.object({
  action: z.literal("set-css-variable"),
  name: z.string(),
  clearMode: z.enum(["empty", "remove"]).optional() // defaults to "empty"
});

const SetCssVariableTo = z.object({
  action: z.literal("set-css-variable-to"),
  name: z.string(),
  value: z.string(),
  clearMode: z.enum(["empty", "remove"]).optional()
});

const SetCssVariableThemed = z.object({
  action: z.literal("set-css-variable-themed"),
  nameLight: z.string(),
  nameDark: z.string(),
  clearMode: z.enum(["empty", "remove"]).optional()
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
  SetCssVariableThemed,
  ToggleClass,
  SetClassFromList
]);

//#endregion

//#region Inputs

const SelectOptionSchema = z.object({
  value: z.string(),
  label: z.string()
});

const TextInputSchema = z.object({
  type: z.literal("text"),
  id: z.string(),
  default: z.string().optional(),
  placeholder: z.string().optional(),
  onChange: ActionSchema.optional()
});

const TextAreaInputSchema = z.object({
  type: z.literal("textarea"),
  id: z.string(),
  default: z.string().optional(),
  placeholder: z.string().optional(),
  onChange: ActionSchema.optional()
});

const ToggleInputSchema = z.object({
  type: z.literal("toggle"),
  id: z.string(),
  default: z.boolean().optional(),
  onChange: ActionSchema.optional()
});

const DropdownInputSchema = z.object({
  type: z.literal("dropdown"),
  id: z.string(),
  default: z.string().optional(),
  options: z.array(SelectOptionSchema),
  onChange: ActionSchema.optional()
}).superRefine((data, ctx) => { // Check default matches an option or empty
  if (data.default === undefined || data.default === "") return;
  if (!data.options.some((o) => o.value === data.default)) {
    ctx.addIssue({
      code: "custom",
      path: ["default"],
      message: `default "${data.default}" does not match any option value`
    });
  }
});

const ColorInputSchema = z.object({
  type: z.literal("color"),
  id: z.string(),
  colorSpace: z.enum(COLOR_SPACES).optional(),
  themed: z.boolean().optional(),
  default: z.string().optional(),
  defaultLight: z.string().optional(),
  defaultDark: z.string().optional(),
  onChange: ActionSchema.optional()
}).superRefine((data, ctx) => { // Check theme mode
  const colorSpace = data.colorSpace ?? DEFAULT_COLOR_SPACE;

  if (data.themed) {
    if (data.default !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["default"],
        message: `themed color cannot have "default"; use "defaultLight" and "defaultDark"`
      });
    }
    if (data.defaultLight === undefined || data.defaultDark === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["themed"],
        message: `themed color requires both "defaultLight" and "defaultDark"`
      });
    }
    if (data.defaultLight !== undefined && !matchesColorSpace(data.defaultLight, colorSpace)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultLight"],
        message: `defaultLight "${data.defaultLight}" does not match colorSpace "${colorSpace}"`
      });
    }
    if (data.defaultDark !== undefined && !matchesColorSpace(data.defaultDark, colorSpace)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultDark"],
        message: `defaultDark "${data.defaultDark}" does not match colorSpace "${colorSpace}"`
      });
    }
  } else {
    if (data.defaultLight !== undefined || data.defaultDark !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["themed"],
        message: `"defaultLight" / "defaultDark" require "themed: true"`
      });
    }
    if (data.default !== undefined && !matchesColorSpace(data.default, colorSpace)) {
      ctx.addIssue({
        code: "custom",
        path: ["default"],
        message: `default "${data.default}" does not match colorSpace "${colorSpace}"`
      });
    }
  }
});

const SliderInputSchema = z.object({
  type: z.literal("slider"),
  id: z.string(),
  default: z.number().optional(),
  min: z.number(),
  max: z.number(),
  step: z.union([z.number(), z.literal("any")]),
  onChange: ActionSchema.optional()
}).superRefine((data, ctx) => { // Check min/max, default range, step
  if (data.min >= data.max) { // Realistic min and max
    ctx.addIssue({
      code: "custom",
      path: ["max"],
      message: `max (${data.max}) must be greater than min (${data.min})`
    });
  }
  if (data.default !== undefined) {
    if (data.default < data.min || data.default > data.max) { // min <= default <= max
      ctx.addIssue({
        code: "custom",
        path: ["default"],
        message: `default ${data.default} is out of range [${data.min}, ${data.max}]`
      });
    }
    if (typeof data.step === "number" && data.step > 0) { // Realistic step
      const offset = data.default - data.min; // Default distance from min
      const remainder = Math.abs(offset - Math.round(offset / data.step) * data.step); // Default's distance from nearest point running from min up in step size increments
      if (remainder > 1e-9) { // JavaScript doesn't compare floats cleanly, so we check against a tolerance of 1e-9
        ctx.addIssue({
          code: "custom",
          path: ["default"],
          message: `default ${data.default} is not aligned to step ${data.step} from min ${data.min}`
        });
      }
    }
  }
});

const InputSchema = z.discriminatedUnion("type", [
  TextInputSchema,
  TextAreaInputSchema,
  ToggleInputSchema,
  DropdownInputSchema,
  ColorInputSchema,
  SliderInputSchema
]);

//#endregion

//#region Items

const HeadingItemSchema = z.object({
  type: z.literal("heading"),
  name: z.string(),
  desc: z.string().optional()
});

const SettingItemSchema = z.object({
  type: z.literal("setting"),
  name: z.string(),
  desc: z.string().optional(),
  tooltip: z.string().optional(),
  inputs: z.array(InputSchema)
});

const GroupItemSchema = z.object({
  type: z.literal("group"),
  heading: z.string(),
  items: z.array(SettingItemSchema)
});

const ItemSchema = z.discriminatedUnion("type", [
  HeadingItemSchema,
  SettingItemSchema,
  GroupItemSchema
]);

//#endregion

//#region Root

const ThemeSettingsJSONSchema = z.object({
  schemaVersion: z.literal(SETTINGS_JSON_SCHEMA_VERSION),
  icon: z.string().optional(),
  items: z.array(ItemSchema)
}).superRefine((data, ctx) => { // Check unique ids and actions compatible with input
  type ActionSite = { action: z.infer<typeof ActionSchema>, input: z.infer<typeof InputSchema>, path: (string | number)[] };
  const inputIds = new Set<string>();
  const actions: ActionSite[] = [];

  // Iterate all items
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (item.type === "heading") continue; // Nothing to check for headings
    if (item.type === "setting") {
      iterateInputs(item.inputs, ["items", i, "inputs"]);
    } else { // group
      // Iterate items in group
      for (let j = 0; j < item.items.length; j++) {
        iterateInputs(item.items[j].inputs, ["items", i, "items", j, "inputs"]);
      }
    }
  }

  // Iterate inputs
  // basepath: JSON path to inputs array
  function iterateInputs(inputs: z.infer<typeof InputSchema>[], basePath: (string | number)[]) {
    for (let k = 0; k < inputs.length; k++) {
      const input = inputs[k];
      const inputPath = [...basePath, k];

      // Collect id
      const key = input.id.toLowerCase();
      if (inputIds.has(key)) { // Duplicate id found
        ctx.addIssue({ code: "custom", path: [...inputPath, "id"], message: "duplicate id" });
      } else {
        inputIds.add(key);
      }

      // Collect action
      if (input.onChange !== undefined) {
        actions.push({ action: input.onChange, input, path: [...inputPath, "onChange"] });
      }
    }
  }

  // Check action compatibility with input
  for (const { action, input, path } of actions) {
    // Type level compatibility
    const allowed = ACTION_COMPATIBILITY[action.action];
    if (!allowed.includes(input.type)) {
      ctx.addIssue({
        code: "custom",
        path,
        message: `action "${action.action}" is not allowed on input "${input.type}" (allowed: ${allowed.join(", ")})`
      });
      continue; // If this error occurs there's no need to check themed
    }

    // Themed specific compatibility
    if (input.type === "color") {
      if (input.themed && action.action !== "set-css-variable-themed") {
        ctx.addIssue({
          code: "custom",
          path,
          message: `themed color must use "set-css-variable-themed"`
        });
      }
      if (!input.themed && action.action === "set-css-variable-themed") {
        ctx.addIssue({
          code: "custom",
          path,
          message: `"set-css-variable-themed" requires "themed: true" on the color input`
        });
      }
    }
  }
});

//#endregion

//#endregion

// Parse and validate a settings.json against the schema
export function parseThemeSettingsJSON(raw: unknown): ParseResult {
  const result = ThemeSettingsJSONSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, reason: result.error.issues[0]?.message ?? "invalid settings" };
  }
  return { ok: true, data: result.data };
}

//#region Utilities

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
