import { z } from "zod";

//#region Schemas (Zod)

const ApplyVariable = z.object({ kind: z.literal("variable"), name: z.string() });
const ApplyVariableValue = z.object({ kind: z.literal("variable"), name: z.string(), value: z.string() });
const ApplyClass = z.object({ kind: z.literal("class") });
const ApplyClassValue = z.object({ kind: z.literal("class"), value: z.string() });

const SelectOptionSchema = z.object({ value: z.string(), label: z.string() });

const ColorInputFieldSchema = z.object({
  id: z.string(),
  type: z.literal("color"),
  label: z.string(),
  description: z.string().optional(),
  apply: ApplyVariable,
  colorSpace: z.enum(["hex", "rgb", "hsl"]).optional(),
  default: z.string().optional(),
  value: z.string().optional(),
}).superRefine((data, ctx) => { // Colorspace check of default
  if (data.default === undefined) return;
  const colorSpace = data.colorSpace ?? "hex";
  let matchesColorSpace = false;
  switch (colorSpace) {
    case "hex": matchesColorSpace = matchesHex(data.default); break;
    case "rgb": matchesColorSpace = matchesRGB(data.default); break;
    case "hsl": matchesColorSpace = matchesHSL(data.default); break;
  }
  if (!matchesColorSpace) {
    ctx.addIssue({
      code: "custom",
      path: ["default"],
      message: `default "${data.default}" does not match colorSpace "${colorSpace}"`,
    });
  }
});

const TextInputFieldSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  label: z.string(),
  description: z.string().optional(),
  apply: ApplyVariable,
  default: z.string().optional(),
  value: z.string().optional(),
});

const NumberInputFieldSchema = z.object({
  id: z.string(),
  type: z.literal("number"),
  label: z.string(),
  description: z.string().optional(),
  apply: ApplyVariable,
  default: z.string().optional(),
  value: z.string().optional(),
});

const ToggleInputFieldSchema = z.object({
  id: z.string(),
  type: z.literal("toggle"),
  label: z.string(),
  description: z.string().optional(),
  apply: z.union([ApplyClassValue, ApplyVariableValue]),
  value: z.string().optional(),
});

const SelectInputFieldSchema = z.object({
  id: z.string(),
  type: z.literal("select"),
  label: z.string(),
  description: z.string().optional(),
  options: z.array(SelectOptionSchema),
  apply: ApplyClass,
  default: z.string().optional(),
  value: z.string().optional(),
}).superRefine((data, ctx) => { // Check options contain default
  if (data.default === undefined || data.default === "") return;
  if (!data.options.some((o) => o.value === data.default)) {
    ctx.addIssue({
      code: "custom",
      path: ["default"],
      message: `default "${data.default}" does not match any option value`,
    });
  }
});

const InputFieldSchema = z.discriminatedUnion("type", [
  ColorInputFieldSchema,
  TextInputFieldSchema,
  NumberInputFieldSchema,
  ToggleInputFieldSchema,
  SelectInputFieldSchema,
]);

const SectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  inputFields: z.array(InputFieldSchema),
});

const ItemSchema = z.union([InputFieldSchema, SectionSchema]);

const ThemeSettingsJSONSchema = z.object({
  items: z.array(ItemSchema),
}).superRefine((data, ctx) => { // Check unique ids
  // Single pool of ids across sections and inputFields
  // case-insensitive
  const ids = new Set<string>();

  const check = (id: string, path: (string | number)[]) => {
    const key = id.toLowerCase();
    if (ids.has(key)) {
      ctx.addIssue({ code: "custom", path, message: "duplicate id" });
      return;
    }
    ids.add(key);
  };

  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    check(item.id, ["items", i, "id"]);
    if ("inputFields" in item) {
      for (let j = 0; j < item.inputFields.length; j++) {
        check(item.inputFields[j].id, ["items", i, "inputFields", j, "id"]);
      }
    }
  }
});

//#endregion

//#region Types/Objects/Interfaces

export type InputField = z.infer<typeof InputFieldSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Item = z.infer<typeof ItemSchema>;

export type FromSettingsJSONResult =
{ ok: true; settings: ThemeSettings; }
| { ok: false; reason: string; };

//#endregion

export class ThemeSettings {
  items: Item[];
  themeVersion: string;

  constructor() {
    this.items = [];
    this.themeVersion = "";
  }

  // Create theme settings from settings.json
  static fromSettingsJSON(raw: unknown, themeVersion: string): FromSettingsJSONResult {
    const result = ThemeSettingsJSONSchema.safeParse(raw);
    if (!result.success) {
      return { ok: false, reason: formatZodError(result.error, raw) };
    }

    const settings = new ThemeSettings();
    settings.items = result.data.items;
    settings.themeVersion = themeVersion;
    return { ok: true, settings };
  }

  // Find input field by id
  findInputField(id: string): InputField | undefined {
    for (const field of this.allInputFields()) {
      if (field.id === id) return field;
    }
    return undefined;
  }

  // Migrate user input values from a previous ThemeSettings instance
  migrateInputValuesFrom(oldSettings: ThemeSettings | null): void {
    // Return early if old settings do not exist
    if (!oldSettings) return;

    // Collect old user values keyed by inputField id
    const oldValues = new Map<string, string>();
    for (const field of oldSettings.allInputFields()) {
      if (typeof field.value === "string") oldValues.set(field.id, field.value);
    }

    // Apply old user values to this instance's matching inputFields
    for (const field of this.allInputFields()) {
      const value = oldValues.get(field.id);
      if (value !== undefined) field.value = value;
    }
  }

  //#region Theme Settings Application

  // Apply this theme's settings to DOM
  applyToDOM(): void {
    // CSS variables to apply, if any
    const cssVariables: Record<string, string> = {};

    // Iterate every inputField, whether top-level or inside a section
    for (const inputField of this.allInputFields()) {
      const value = inputField.value; // User set value

      // Apply depending on kind
      switch (inputField.apply.kind) {
        case "class":
          // Toggle applies provided value if user value is on
          if (inputField.type === "toggle") activeDocument.body.toggleClass(inputField.apply.value, value === "on");
          else if (inputField.type === "select") {
            // Iterate select options to remove classes not chosen by user
            const optionClasses = inputField.options.map((o) => o.value).filter(Boolean);
            if (optionClasses.length) activeDocument.body.removeClasses(optionClasses);

            // Add class chosen by user
            if (value) activeDocument.body.addClass(value);
          }
          break;
        case "variable":
          // Toggle applies provided value if user value is on
          if (inputField.type === "toggle") {
            cssVariables[inputField.apply.name] = value === "on" ? inputField.apply.value : "";
          } else {
            // Set user value or default
            cssVariables[inputField.apply.name] = value ?? inputField.default ?? "";
          }
          break;
      }
    }

    // Set CSS variables to body
    activeDocument.body.setCssProps(cssVariables);
  }

  // Remove this theme's settings from the DOM
  clearFromDOM(): void {
    const cssVariables: Record<string, string> = {};

    // Iterate every inputField, whether top-level or inside a section
    for (const inputField of this.allInputFields()) {
      // Remove depending on kind
      switch (inputField.apply.kind) {
        case "class":
          if (inputField.type === "toggle") activeDocument.body.removeClass(inputField.apply.value);
          else if (inputField.type === "select") {
            const optionClasses = inputField.options.map((o) => o.value).filter(Boolean);
            if (optionClasses.length) activeDocument.body.removeClasses(optionClasses);
          }
          break;
        case "variable":
          cssVariables[inputField.apply.name] = "";
          break;
      }
    }

    // Set CSS variables to body
    activeDocument.body.setCssProps(cssVariables);
  }

  //#endregion

  // Update a single input field value
  setInputFieldValue(fieldId: string, value: string): void {
    const inputField = this.findInputField(fieldId);
    if (!inputField) return;

    if (value === "" || value == null) delete inputField.value; // No user set value
    else if (inputField.type !== "toggle" && matchesDefault(inputField, value)) delete inputField.value; // Same as default, no user set value
    else inputField.value = value; // Set user set value
  }

  // Walk every inputField
  private *allInputFields(): IterableIterator<InputField> {
    for (const item of this.items) {
      if (itemIsSection(item)) {
        yield* item.inputFields;
      } else {
        yield item;
      }
    }
  }
}

//#region Utilities

export function itemIsSection(item: Item): item is Section {
  return "inputFields" in item;
}

// Check if user input value is the same as default
function matchesDefault(inputField: Exclude<InputField, { type: "toggle" }>, userInputValue: string): boolean {
  if (inputField.default === undefined) return false;
  if (inputField.type === "color") return inputField.default.toLowerCase() === userInputValue.toLowerCase();
  return inputField.default === userInputValue;
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
    const n = parseDigits(part);
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

  const h = parseDigits(parts[0]);
  if (h === null || h < 0 || h > 360) return false;

  for (const part of parts.slice(1)) {
    const p = part.trim();
    if (!p.endsWith("%")) return false;
    const n = parseDigits(p.slice(0, -1));
    if (n === null || n < 0 || n > 100) return false;
  }
  return true;
}

// Parse a single integer, rejecting empty strings, decimals, or non-digit characters
function parseDigits(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  for (const ch of trimmed) {
    if (ch < "0" || ch > "9") return null;
  }
  return Number(trimmed);
}

// Format a Zod error into a single line, id aware message
function formatZodError(error: z.ZodError, raw: unknown): string {
  // Get issue with path
  const issue = error.issues[0];
  const path = issue.path;

  // Find id
  let node: unknown = raw;
  let id: string | undefined;
  let context: "inputField" | "section" | undefined;
  for (const piece of path) {
    // Break if node or piece doesn't exist
    if (!node || typeof node !== "object" || !(piece in (node as Record<string, unknown>))) break;
    node = (node as Record<string, unknown>)[piece as string];
    if (node && typeof node === "object" && "id" in node && typeof node.id === "string") {
      id = node.id;
      // Section has inputFields
      // InputField has type
      if ("inputFields" in node) context = "section";
      else if ("type" in node) context = "inputField";
    }
  }

  // Build the prefix
  let prefix: string;
  if (id && context) prefix = `${context} "${id}"`;
  else if (path.length > 0) prefix = `at items${path.map(p => typeof p === "number" ? `[${p}]` : `.${String(p)}`).join("")}`;
  else prefix = "settings";

  return `Invalid settings: ${prefix} ${issue.message}`;
}

//#endregion
