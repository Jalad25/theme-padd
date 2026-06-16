# Roadmap
> **Last updated: 2026-06-16**

High-level direction for this plugin.

## Currently Scheduled

See [Milestones](https://github.com/Jalad25/theme-padd/milestones) for currently tracked changes.

## Planned

Planned for upcoming releases. Order is approximate and may change.

- **Stage changes before applying them** — Save and Cancel buttons on every settings page (per theme, per theme's customizations, and the global page) so adjustments don't immediately rewrite your vault's styling. Tweak as many controls as you want. Nothing applies until you click Save, and Cancel discards everything in flight.
- **Live preview while staging** — see your in-flight changes applied to the vault before you commit them. A small in-vault banner stays visible while you have unsaved changes so you can browse around and check the look, then return to the settings tab to Save or Cancel. Pairs with the staged-changes feature above.
- **Broader control coverage to match what other settings plugins can do** — extend the schema so theme authors can express settings that currently need workarounds: more input types, the ability to wire one control to multiple CSS variables, theme-aware (light/dark) color pickers, and unit-suffixed numeric inputs.

## Wishlist

Features being considered, but would like more feedback before pursuing. Order is not priority and some of these may never happen.

- **Support for hosts other than GitHub** — fetch `settings.json` from GitLab, Codeberg, or a plain URL, not just GitHub releases. Helpful for theme authors who don't publish on GitHub (if Obsidian ever allows this...).
- **Import/export customizations** — share a JSON blob of your customizations (per-theme and global) with someone else, or back them up between vaults.

## Recently Shipped

- [**0.2.0**](https://github.com/Jalad25/theme-padd/releases/tag/0.2.0) — Reworked the settings schema around Obsidian's new declarative settings (1.13). Per-theme and global customizations get their own pages. Themes now appear with status pills (Active / Error / Unsupported). Uninstalling a theme cleans up any settings and customizations you had for it.
- [**0.1.2**](https://github.com/Jalad25/theme-padd/releases/tag/0.1.2) — Bug fixes and stability improvements.
- [**0.1.1**](https://github.com/Jalad25/theme-padd/releases/tag/0.1.1) — Bug fixes.
- [**0.1.0**](https://github.com/Jalad25/theme-padd/releases/tag/0.1.0) — Initial release: per-theme settings UI driven by a theme's `settings.json`, plus user-authored customizations layered per theme and vault-wide.

## Out of Scope

To save everyone time, these have been considered and declined:

- **Editing a theme's source CSS** — Theme PADD reads the settings a theme author exposes; it doesn't patch or override the theme's `.css` files directly. Use a CSS snippet for that.
- **Auto-syncing user values across vaults** — settings live in each vault's `data.json`. Syncing belongs in a dedicated sync tool (Obsidian Sync, git, Syncthing, etc.), not here.