import { requestUrl } from "obsidian";
import type ThemePADDPlugin from "./main";

//#region Types/Objects/Interfaces

interface ThemeSettingsPointer {
  host: string;
  repo: string;
}

export type ThemeLoadError =
{ reason: "readFailed"; detail: string } // couldn't read theme.css
| { reason: "unsupportedHost"; host: string } // @themepadd host not supported
| { reason: "fetchFailed"; url: string; detail: string }; // network/HTTP error

export type LoadThemeSettingsResult =
{ ok: true; raw: unknown; }
| { ok: false; reason: "unsupported"; } // Unsupported by Theme PADD
| { ok: false; reason: "error"; error: ThemeLoadError; };

type FetchResult =
{ ok: true; raw: unknown }
| { ok: false; detail: string };

//#endregion

export class ThemeSettingsLoader {
  private plugin: ThemePADDPlugin;

  constructor(plugin: ThemePADDPlugin) {
    this.plugin = plugin;
  }

  // Find and fetch the raw settings.json for a theme
  async loadThemeSettings(themeName: string, fetchedVersion: string): Promise<LoadThemeSettingsResult> {
    // Read theme.css from .obsidian/themes folder
    const themeCssPath = `${this.plugin.app.vault.configDir}/themes/${themeName}/theme.css`;
    let themeCss: string;
    try {
      themeCss = await this.plugin.app.vault.adapter.read(themeCssPath);
    } catch (e) {
      return { ok: false, reason: "error", error: { reason: "readFailed", detail: `Could not read ${themeCssPath}: ${describeError(e)}` } };
    }

    // Verify pointer exists
    const pointer = this.parseThemePointer(themeCss);
    if (!pointer) {
      // Theme does not use Theme PADD; not an error, just unsupported
      return { ok: false, reason: "unsupported" };
    }

    // Build settings.json url
    const url = this.themeSettingsJsonUrl(pointer, fetchedVersion);
    if (url === null) {
      // Theme's set host not supported to get settings.json
      return { ok: false, reason: "error", error: { reason: "unsupportedHost", host: pointer.host } };
    }

    // Fetch settings.json
    const fetched = await this.fetchThemeSettingsJson(url);
    if (!fetched.ok) {
      // Fetch failed
      return { ok: false, reason: "error", error: { reason: "fetchFailed", url, detail: fetched.detail } };
    }

    return { ok: true, raw: fetched.raw };
  }

  // Parse theme.css for Theme PADD data
  private parseThemePointer(css: string): ThemeSettingsPointer | null {
    // Look for @themepadd
    const match = css.match(/\/\*[\s\S]*?@themepadd[\s\S]*?\*\//);
    if (!match) return null;

    // Regex for pointer properties
    const body = match[0];

    // Find host and repo
    const field = (name: string): string | undefined => {
      const m = body.match(new RegExp(`${name}\\s*:\\s*(\\S+)`));
      return m?.[1];
    };
    const host = field("host");
    const repo = field("repo");

    if (!host || !repo) return null;
    return { host, repo };
  }

  // Build theme's settings.json url
  private themeSettingsJsonUrl(themeSettingsPointer: ThemeSettingsPointer, themeVersion: string): string | null {
    // Currently only supports github repos
    if (themeSettingsPointer.host && themeSettingsPointer.host.toLowerCase() === "github") return `https://github.com/${themeSettingsPointer.repo}/releases/download/${themeVersion}/settings.json`;

    return null;
  }

  // Fetch theme's settings.json file
  private async fetchThemeSettingsJson(url: string): Promise<FetchResult> {
    try {
      const results = await requestUrl({ url, method: "GET" });
      if (results.status !== 200) { // Fetch failed
        return { ok: false, detail: `HTTP ${results.status}` };
      }
      return { ok: true, raw: JSON.parse(results.text) };
    } catch (e) {
      return { ok: false, detail: describeError(e) }; // Other failure
    }
  }
}

//#region Utilities

// Get the description of the error
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try { return JSON.stringify(e); } catch { return String(e); }
}

//#endregion
