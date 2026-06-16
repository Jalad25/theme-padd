<p align="center">
  <img src="assets/PluginBanner.png" alt="Theme PADD" align="center" width=800>
</p>

<p align="center">
  <a href="https://github.com/jalad25/theme-padd/releases/latest"><img src="https://img.shields.io/github/v/release/Jalad25/theme-padd?label=Latest%20Release&logo=Github" alt="GitHub release"></a>
	<a href="https://community.obsidian.md/plugins/theme-padd"><img src="https://img.shields.io/badge/Obsidian-Install-7c3aed?logo=obsidian&logoColor=white"></a>
</p>
<p align="center">
  <a href="https://community.obsidian.md/plugins/theme-padd"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&query=%24%5B%22theme-padd%22%5D.downloads&label=Obsidian%20Downloads&color=7c3aed&logo=obsidian&logoColor=white" alt="Obsidian Downloads"></a>
  <a href="https://github.com/Jalad25/theme-padd/releases"><img src="https://img.shields.io/github/downloads/Jalad25/theme-padd/total?label=Assets%20Downloaded&logo=Github" alt="Assets downloaded"></a>
</p>
<p align="center">
		<a href="https://community.obsidian.md/plugins/theme-padd#scorecard"><img alt="Obsidian Scorecard" src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Jalad25/theme-padd/badges/theme-padd.json"></a>
	<a href="https://obsidianpluginaudit.com/audit/theme-padd/latest"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fapi.obsidianpluginaudit.com%2Fbadge%2Ftheme-padd%2Flatest.json&cacheSeconds=60&label=3rd%20Party%20Obsidian%20Plugin%20Audit"></a>
</p>

# Theme PADD

A PADD (Palette, Animation, Decoration, and Density) modifier for your themes.

## Features

- **Per-theme settings UI** — themes that opt in get their own settings panel under **Settings → Theme PADD**, with controls defined by the theme author.
- **Multiple input types** — color pickers (hex/rgb/hsl), text, number, toggle, and dropdown selects, organized into sections.
- **Live preview** — settings apply to the DOM immediately as you tweak them.
- **Values persist across theme updates** — when a theme ships a new version of its settings spec, your customizations migrate forward by field id.
- **Auto-discovery** — Theme PADD reads the `@themepadd` directive from each installed theme's `theme.css` and fetches the settings spec from the theme's GitHub release. No per-theme configuration needed.
- **Clear error reporting** — if a theme's spec is malformed or can't be downloaded, the settings tab shows a readable error with a **Copy** button so you can share the details with the theme author.

## Installation

### Obsidian Community Plugins

1. Open Obsidian and go to **Settings → Community plugins**.
2. If restricted mode is on, select **Turn on community plugins**.
3. Select **Browse** and search for **Theme PADD**.
4. Select **Install**, then **Enable**.

### BRAT

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs plugins directly from their GitHub repository and auto-updates them on each release.

1. Install **BRAT** from **Settings → Community plugins → Browse** and enable it.
2. Open the command palette (`Ctrl+P` (Windows) or `Command+P` (macOS)) and run **BRAT: Add a beta plugin for testing**.
3. Enter the repository URL: `https://github.com/Jalad25/theme-padd`.
4. Choose whether to track the latest release or the latest commit, then select **Add Plugin**.
5. Open **Settings → Community plugins** and enable **Theme PADD**.

To get future updates, run **BRAT: Check for updates to all beta plugins** from the command palette, or enable auto-update in BRAT's settings.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. In your vault, create the folder `.obsidian/plugins/theme-padd/` if it does not already exist.
3. Copy the downloaded files into that folder.
4. Open Obsidian, go to **Settings → Community plugins**, and enable **Theme PADD**.

## Usage

1. Install a theme with Theme PADD support from **Settings → Appearance → Themes**.
2. Open **Settings → Theme PADD** and expand the theme to tweak its settings.

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for details.
