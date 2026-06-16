# Authoring Theme PADD settings

This document is for theme authors who want to ship a Theme PADD settings panel with their theme, and for power users writing customizations on top of an existing theme. The schema is the same in both cases.

## Table of contents

- [How Theme PADD finds your settings](#how-theme-padd-finds-your-settings)
- [Top-Level Shape](#top-level-shape)
- [Setting Items](#setting-items)
- [Controls](#controls)
- [Actions](#actions)
- [`clearMode`](#clearmode)
- [Validation Rules](#validation-rules)
- [Where user values live](#where-user-values-live)
- [The three scopes](#the-three-scopes)
- [Authoring tips](#authoring-tips)
- [Full reference example](#full-reference-example)

## How Theme PADD finds your settings

When a user installs your theme, Theme PADD reads its `theme.css` and looks for a `@themepadd` block inside any CSS comment.

```css
/*
  @themepadd
  host: github
  repo: your-username/your-theme
*/
```

Both `host` and `repo` are required. `host` is currently limited to `github` (case-insensitive). `repo` is the `owner/repo` slug.

If the block is missing, Theme PADD treats your theme as one that simply doesn't support Theme PADD. If the block is present but `host` is anything other than `github`, the user sees an "Unsupported repository host" error.

When the block is present and the host is GitHub, Theme PADD fetches:

```
https://github.com/<repo>/releases/download/<themeVersion>/settings.json
```

The `<themeVersion>` is whatever version Obsidian reports for the installed copy of your theme. So for every release of your theme, attach a `settings.json` asset to the GitHub Release with that tag. Theme PADD validates the file against the schema below. On failure, the user sees the first validation error inline on your theme's entry.

## Top-Level Shape

```jsonc
{
  "schemaVersion": 1,
  "settingItems": [
    // setting items
  ]
}
```

- `schemaVersion`: must be the literal number `1`.
- `settingItems`: array of items, each one of three kinds (`control`, `empty`, `group`).

The Zod schema in [src/ThemeSettingsSchema.ts](src/ThemeSettingsSchema.ts) is the authoritative source if any detail below is ambiguous.

## Setting Items

An entry in `settingItems` is discriminated by its `type` field.

### `control`: an interactive row

A label, optional description, and one control (toggle, slider, color picker, etc.).

```jsonc
{
  "type": "control",
  "name": "Accent color",
  "desc": "Override the theme's accent.",   // optional
  "aliases": ["accent", "highlight"],        // optional, reserved for future use
  "control": { /* see "Controls" */ }
}
```

### `empty`: descriptive row, no control

Use to drop a paragraph of guidance between rows.

```jsonc
{
  "type": "empty",
  "name": "About this section",
  "desc": "These settings adjust the sidebar layout.",
  "aliases": ["sidebar info"]
}
```

### `group`: a labeled subsection

Groups its children visually under a heading. Groups cannot nest.

```jsonc
{
  "type": "group",
  "heading": "Sidebar",                      // optional, omit for an unlabeled group
  "items": [
    // only "control" or "empty", no nested "group"
  ]
}
```

## Controls

A control's shape depends on its `type`, but every control shares three required fields:

- `type` — the control kind (one of seven below).
- `id` — a unique identifier for storing the user's value. **Uniqueness is enforced case-insensitively** across the whole file: `"BodyFont"` and `"bodyfont"` collide.
- `onChange` — the action that runs when the user changes the value (see [Actions](#actions)).

### `text`

Single-line text input.

```jsonc
{
  "type": "text",
  "id": "tagline",
  "defaultValue": "Hello",
  "placeholder": "Type here",
  "onChange": { /* action */ }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `defaultValue` | string | no | The value the control starts at and reverts to when reset. |
| `placeholder` | string | no | Greyed-out hint shown when the input is empty. |

### `textarea`

Multi-line text input.

```jsonc
{
  "type": "textarea",
  "id": "footer-html",
  "defaultValue": "",
  "placeholder": "Footer markup",
  "rows": 6,
  "onChange": { /* action */ }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `defaultValue` | string | no | The value the control starts at and reverts to when reset. |
| `placeholder` | string | no | Greyed-out hint shown when the input is empty. |
| `rows` | positive integer | no | Number of visible lines in the textarea. |

### `number`

Numeric input.

```jsonc
{
  "type": "number",
  "id": "max-width",
  "defaultValue": 800,
  "placeholder": "px",
  "min": 400,
  "max": 2000,
  "step": 10,
  "onChange": { /* action */ }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `defaultValue` | number | no | The value the control starts at and reverts to when reset. Must lie within `[min, max]` if both are set. |
| `placeholder` | string | no | Greyed-out hint shown when the input is empty. |
| `min` | number | no | Lowest accepted value. |
| `max` | number | no | Highest accepted value. Must be `> min` if both are set. |
| `step` | number \| `"any"` | no | Increment when adjusting the value. `"any"` allows arbitrary precision. |

### `toggle`

Boolean switch.

```jsonc
{
  "type": "toggle",
  "id": "show-banner",
  "defaultValue": true,
  "onChange": { /* action */ }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `defaultValue` | boolean | no | Starting state of the toggle. Treated as `false` if omitted. |

### `dropdown`

Single-select from a map of value -> label.

```jsonc
{
  "type": "dropdown",
  "id": "density",
  "defaultValue": "comfy",
  "options": {
    "compact": "Compact",
    "comfy": "Comfortable",
    "spacious": "Spacious"
  },
  "onChange": { /* action */ }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `options` | `Record<string, string>` | yes | Map of selectable values to the labels shown to the user. |
| `defaultValue` | string | no | Initial selection. Must be `""` (no selection) or a key in `options`. |

### `color`

Color picker.

```jsonc
{
  "type": "color",
  "id": "accent",
  "defaultValue": "#7c3aed",
  "colorSpace": "hex",
  "onChange": { /* action */ }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `defaultValue` | string | no | Starting color. Must match the declared `colorSpace` format. |
| `colorSpace` | `"hex"` \| `"rgb"` \| `"hsl"` | no | Format used when reading and writing the value. Defaults to `"hex"`. |

Color formats:

- `hex`: `#rrggbb` 
  - Six hex digits, exactly seven characters total
- `rgb`: `rgb(R, G, B)` 
  - Each channel an integer `0–255`
- `hsl`: `hsl(H, S%, L%)`
  - `H` `0–360`
  - `S` and `L` percentages `0–100`

### `slider`

Numeric range slider.

```jsonc
{
  "type": "slider",
  "id": "line-height",
  "defaultValue": 1.5,
  "min": 1.0,
  "max": 2.5,
  "step": 0.1,
  "onChange": { /* action */ }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `min` | number | yes | Left end of the slider range. Must be `< max`. |
| `max` | number | yes | Right end of the slider range. |
| `step` | number | yes | Increment between selectable values. |
| `defaultValue` | number | no | Initial position of the slider. Must lie within `[min, max]` and align to `step` starting from `min`. |

The step-alignment rule means with `min: 1.0, step: 0.1`, valid defaults are `1.0, 1.1, 1.2, …`. `1.05` would fail validation.

## Actions

The action under `onChange` describes what to do when the user changes the control's value. There are four.

### `set-css-variable`

Writes the control's value to a CSS custom property on the vault `<body>`.

```jsonc
{
  "action": "set-css-variable",
  "name": "--my-accent",
  "clearMode": "default"
}
```

Compatible with: `text`, `textarea`, `number`, `slider`, `dropdown`, `color`.

### `set-css-variable-to`

Writes a *literal* value to a CSS variable when a toggle is on.

```jsonc
{
  "action": "set-css-variable-to",
  "name": "--corner-radius",
  "value": "12px",
  "clearMode": "remove"
}
```

Compatible with: `toggle`.

When the toggle is `true`, the variable is set to `value`. When `false`, behavior follows `clearMode`. Cannot use `"default"` mode here as toggles don't have a meaningful default value to write to CSS.

### `toggle-class`

Adds or removes a class on the vault `<body>`.

```jsonc
{
  "action": "toggle-class",
  "class": "my-compact-mode"
}
```

Compatible with: `toggle`. When `true`, the class is added; when `false`, removed.

### `set-class-from-list`

Picks one class from a list, based on a dropdown's value.

```jsonc
{
  "action": "set-class-from-list",
  "classes": ["theme-warm", "theme-cool", "theme-mono"]
}
```

Compatible with: `dropdown`. Pair with a dropdown whose `options` keys are the same class names:

```jsonc
{
  "type": "control",
  "name": "Palette",
  "control": {
    "type": "dropdown",
    "id": "palette",
    "defaultValue": "theme-warm",
    "options": {
      "theme-warm": "Warm",
      "theme-cool": "Cool",
      "theme-mono": "Monochrome"
    },
    "onChange": {
      "action": "set-class-from-list",
      "classes": ["theme-warm", "theme-cool", "theme-mono"]
    }
  }
}
```

Whichever class is selected is added to `<body>`. The others (from the `classes` list) are removed.

### Compatibility matrix

| Action | text | textarea | number | toggle | dropdown | color | slider |
|---|---|---|---|---|---|---|---|
| `set-css-variable` | ✓ | ✓ | ✓ |   | ✓ | ✓ | ✓ |
| `set-css-variable-to` |   |   |   | ✓ |   |   |   |
| `toggle-class` |   |   |   | ✓ |   |   |   |
| `set-class-from-list` |   |   |   |   | ✓ |   |   |

Pairing an action with an incompatible control fails validation.

## `clearMode`

Only `set-css-variable` and `set-css-variable-to` accept `clearMode`. It controls what happens when the user clears their value or sets it to the default.

| Value | Behavior |
|---|---|
| `"remove"` | The CSS variable is not written. The page falls back to whatever CSS already set it (your theme's own rules, Obsidian's defaults, etc.). |
| `"empty"` | The CSS variable is written with an empty value. |
| `"default"` | The CSS variable is written using the control's `defaultValue`. *Requires* the control to have a non-empty `defaultValue`. **Only `set-css-variable` supports this.** |

If you don't specify `clearMode`:

- For `set-css-variable`: defaults to `"default"` if the control has a `defaultValue`, otherwise `"remove"`.
- For `set-css-variable-to`: defaults to `"remove"`.

The practical effect of `"default"`: by setting a `defaultValue` and leaving `clearMode` unset, your `settings.json` becomes the source of truth for the variable's default. The user sees the same look whether they touch the control or not, and resetting always restores your intended value.

## Validation rules

In addition to per-control validation, the top-level schema enforces:

- **Unique `id`s** across every control in the file, compared **case-insensitively**.
- **Action compatibility**: an action can only be paired with the control types in the matrix above.
- **`clearMode: "default"` requires `defaultValue`**: a non-empty value for string-typed controls (`text`, `textarea`, `color`, `dropdown`), or any defined value for numeric/boolean controls (`number`, `slider`, `toggle`).

If validation fails on the user's machine, Theme PADD shows the first error on your theme's entry. Test your `settings.json` locally against the Zod schema before publishing a release.

## Where user values live

Theme PADD stores user-set values in its own `data.json`, keyed by scope:

- `dev:theme:<themeName>:<id>` — values for *your* theme's own controls.
- `custom:theme:<themeName>:<id>` — values for per-theme user customizations.
- `global:<id>` — values for vault-wide user customizations.

A few rules worth knowing:

- A control whose current value matches its `defaultValue` is *not* persisted. The default is implied.
- Clearing a string-typed control (text/textarea/dropdown/color) removes its stored value.
- A stored value whose type no longer matches its control (e.g. you changed a `number` to a `text` in a new release) is ignored at read time.

You don't typically interact with these keys directly, but they're useful to know about when debugging or considering schema changes between theme versions.

## The three scopes

Your `settings.json` is the **dev** scope. The same schema is also used in two user-facing scopes:

| Scope | Authored by | Stored in `data.json` under | Applies when |
|---|---|---|---|
| **dev** | Theme author | `themes[<themeName>]` | The theme is active. |
| **custom** | User, per theme | `customizations.perTheme[<themeName>]` | The theme is active. |
| **global** | User, vault-wide | `customizations.global` | Always. |

At apply time, Theme PADD layers scopes onto the vault `<body>` in the following order:
- dev
- global
- custom

Later layers override earlier ones when keys collide. For CSS variables, the override is a single merged map written via `body.setCssProps`. Class actions (`toggle-class`, `set-class-from-list`) write to `body.classList` directly. Later scopes still win, because they run last.

## Authoring tips

- **Namespace your CSS variables** — Prefix with your theme's name (e.g. `--mytheme-accent`). Theme PADD writes variables directly to `body.style`, which beats stylesheet rules in cascade specificity. Name collisions with Obsidian's built-in variables would override Obsidian's defaults across the whole vault.
- **Use `clearMode: "default"` for visual defaults** — It makes your `settings.json` the source of truth and means resetting a control restores the look you intended, even if your theme's plain CSS doesn't set the variable.
- **Group related controls** — Use `group` items with `heading`s. Long flat lists are harder to scan.
- **Don't nest groups** — The schema only allows one level. Top-level items can be controls, empty, or groups; a group's items can be controls or empty.
- **Version every release** — Theme PADD fetches `settings.json` from the GitHub release tagged with the installed theme version. If you ship a new theme version without attaching a new `settings.json`, the user sees a fetch error.
- **Validate before you publish** — A small Node script using [Zod](https://zod.dev) and the schema from [src/ThemeSettingsSchema.ts](src/ThemeSettingsSchema.ts) can catch schema errors in CI.

## Full reference example

A small but exhaustive example that exercises every control type and every action type.

```json
{
  "schemaVersion": 1,
  "settingItems": [
    {
      "type": "empty",
      "name": "Welcome",
      "desc": "These settings tweak the MyTheme look."
    },
    {
      "type": "group",
      "heading": "Palette",
      "items": [
        {
          "type": "control",
          "name": "Accent",
          "control": {
            "type": "color",
            "id": "accent",
            "defaultValue": "#7c3aed",
            "colorSpace": "hex",
            "onChange": { "action": "set-css-variable", "name": "--mytheme-accent" }
          }
        },
        {
          "type": "control",
          "name": "Palette mode",
          "control": {
            "type": "dropdown",
            "id": "palette",
            "defaultValue": "warm",
            "options": { "warm": "Warm", "cool": "Cool" },
            "onChange": { "action": "set-class-from-list", "classes": ["warm", "cool"] }
          }
        }
      ]
    },
    {
      "type": "group",
      "heading": "Typography",
      "items": [
        {
          "type": "control",
          "name": "Body font size",
          "control": {
            "type": "slider",
            "id": "body-size",
            "defaultValue": 16,
            "min": 12, "max": 24, "step": 1,
            "onChange": { "action": "set-css-variable", "name": "--font-text-size" }
          }
        },
        {
          "type": "control",
          "name": "Max content width",
          "control": {
            "type": "number",
            "id": "max-width",
            "defaultValue": 800,
            "min": 400, "max": 2000, "step": 10,
            "onChange": { "action": "set-css-variable", "name": "--file-line-width" }
          }
        }
      ]
    },
    {
      "type": "group",
      "heading": "Layout",
      "items": [
        {
          "type": "control",
          "name": "Compact mode",
          "control": {
            "type": "toggle",
            "id": "compact",
            "defaultValue": false,
            "onChange": { "action": "toggle-class", "class": "mytheme-compact" }
          }
        },
        {
          "type": "control",
          "name": "Rounded corners",
          "control": {
            "type": "toggle",
            "id": "rounded",
            "defaultValue": true,
            "onChange": { "action": "set-css-variable-to", "name": "--radius-s", "value": "8px" }
          }
        },
        {
          "type": "control",
          "name": "Tagline",
          "control": {
            "type": "text",
            "id": "tagline",
            "placeholder": "Optional banner text",
            "onChange": { "action": "set-css-variable", "name": "--mytheme-tagline" }
          }
        },
        {
          "type": "control",
          "name": "Footer notice",
          "control": {
            "type": "textarea",
            "id": "footer",
            "rows": 4,
            "placeholder": "HTML footer notice",
            "onChange": { "action": "set-css-variable", "name": "--mytheme-footer" }
          }
        }
      ]
    }
  ]
}
```
