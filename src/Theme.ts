import { ThemeSettings } from "./ThemeSettings";
import { LoadThemeSettingsResult, ThemeLoadError } from "./ThemeSettingsLoader";

//#region Types/Objects/Interfaces

export type SettingsError = { reason: "invalidSettings"; detail: string };

//#endregion

export class Theme {
  readonly name: string;
  settings: ThemeSettings | null = null;
  isUnsupported: boolean = false;
  isActive: boolean = false;
  settingsError: SettingsError | null = null;
  loadError: ThemeLoadError | null = null;

  constructor(name: string) {
    this.name = name;
  }

  // Apply result from theme settings loader
  applyThemeSettingsFromLoadResult(result: LoadThemeSettingsResult, version: string): void {
    // Theme supported, add settings
    if (result.ok) {
      this.applyRawSettings(result.raw, version);
      return;
    }

    // Theme unsupported
    if (result.reason === "unsupported") {
      this.settings = null;
      this.isUnsupported = true;
      this.settingsError = null;
      this.loadError = null;
      return;
    }

    // Load failed
    this.settings = null;
    this.isUnsupported = false;
    this.settingsError = null;
    this.loadError = result.error;
  }

  // Apply settings
  applyRawSettings(raw: unknown, version: string): void {
    const result = ThemeSettings.fromSettingsJSON(raw, version);

    // Invalid settings
    if (!result.ok) {
      this.settings = null;
      this.settingsError = { reason: "invalidSettings", detail: result.reason };
      this.isUnsupported = false;
      this.loadError = null;
      return;
    }

    // Migrate values from previous settings
    result.settings.migrateUserValuesFrom(this.settings);

    // Set settings
    this.settings = result.settings;
    this.settingsError = null;
    this.isUnsupported = false;
    this.loadError = null;
  }
}
