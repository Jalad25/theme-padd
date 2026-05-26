import { Plugin } from "obsidian";
import { ThemePADDSettingTab } from "./ThemePADDSettingTab";
import { ThemeSettings } from "./ThemeSettings";
import { ThemeSettingsLoader } from "./ThemeSettingsLoader";
import { ThemeStore } from "./ThemeStore";
import { Theme } from "./Theme";

//#region Types/Objects/Interfaces

export interface ThemePADDSettings {
  schemaVersion: number;
  themes: Record<string, ThemeSettings>;
}

interface CustomCss {
  themes: Record<string, { version: string }>;
  theme: string;
}

//#endregion

//#region Constants

export const CURRENT_SCHEMA_VERSION = 1; // For data.json schema, currently unused

export const DEFAULT_SETTINGS: ThemePADDSettings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  themes: {}
};

//#endregion

export default class ThemePADDPlugin extends Plugin {
  settings!: ThemePADDSettings;
  themeStore: ThemeStore = new ThemeStore();
  themeSettingsLoader: ThemeSettingsLoader = new ThemeSettingsLoader(this);
  private settingTab!: ThemePADDSettingTab;

  // Get name of currently active theme
  get activeThemeName(): string | null {
    return this.themeStore.getActive()?.name ?? null;
  }

  // Get active theme stored settings
  get activeThemeSettings(): ThemeSettings | null {
    return this.themeStore.getActive()?.settings ?? null;
  }

  async onload() {
    // Plugin Settings
    await this.loadSettings();

    // Settings Tab
    this.settingTab = new ThemePADDSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // Load theme infomation/settings on workspace ready
    this.app.workspace.onLayoutReady(() => this.reconcileThemes());

    // CSS Change event
    this.registerEvent(
      this.app.workspace.on("css-change", async () => {
        await this.reconcileThemes();
      })
    );
  }

  onunload() {
    // Clear theme settings set by plugin
    this.activeThemeSettings?.clearFromDOM();
  }

  //#region Settings

  async loadSettings() {
    const raw: unknown = await this.loadData();

    /* Remove properties from data.json object that are no longer used */
    const known = new Set(Object.keys(DEFAULT_SETTINGS));
    const filtered: Record<string, unknown> = {};
    let droppedAny = false;
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (known.has(k)) filtered[k] = v;
        else droppedAny = true;
      }
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, filtered);
    if (droppedAny) await this.saveSettings();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  //#endregion

  //#region Theme Settings

  // Reconcile themes data/settings
  private async reconcileThemes() {
    // Verify customCss exists, made "safe" with type
    const customCss = (this.app as unknown as { customCss?: CustomCss}).customCss;
    if (!customCss) return;

    // Get installed themes and active theme
    const installed: string[] = Object.keys(customCss.themes ?? {});
    const newActive: string | null = customCss.theme || null;

    // Clear theme settings from DOM if not active, set new active
    if (newActive !== this.activeThemeName) {
      this.activeThemeSettings?.clearFromDOM();
      this.themeStore.setActive(newActive);
    }

    // Remove themes no longer installed
    for (const theme of [...this.themeStore.all()]) {
      if (!installed.includes(theme.name)) await this.removeTheme(theme.name);
    }

    // Load settings.json for newly installed themes and newly updated themes
    for (const name of installed) {
      const version: string = customCss.themes[name].version;

      // Load one at a time, might update later for multiple
      await this.loadThemeSettings(name, version);
    }

    // Apply settings for current active theme
    this.activeThemeSettings?.applyToDOM();

    this.settingTab?.refresh();
  }

  // Load theme settings
  private async loadThemeSettings(themeName: string, fetchedVersion: string): Promise<void> {
    const theme = this.themeStore.upsert(themeName);

    // Theme already has settings at this version
    if (theme.settings?.themeVersion === fetchedVersion) return;

    // data.json has settings at this version
    const saved = this.settings.themes[themeName];
    if (saved && saved.themeVersion === fetchedVersion) {
      theme.applyRawSettings(saved, fetchedVersion);
      await this.persistTheme(theme);
      return;
    }

    // Fetch raw settings, build theme settings object
    const result = await this.themeSettingsLoader.loadThemeSettings(themeName, fetchedVersion);
    theme.applyThemeSettingsLoadResult(result, fetchedVersion);
    await this.persistTheme(theme);
  }

  // Sync the theme's settings to data.json and apply to DOM if active
  private async persistTheme(theme: Theme): Promise<void> {
    if (theme.settings) this.settings.themes[theme.name] = theme.settings;
    else delete this.settings.themes[theme.name];
    await this.saveSettings();
    if (theme.isActive) theme.settings?.applyToDOM();
  }

  // Remove theme from registry and data.json
  private async removeTheme(themeName: string): Promise<void> {
    this.themeStore.remove(themeName);
    if (this.settings.themes[themeName]) {
      delete this.settings.themes[themeName];
      await this.saveSettings();
    }
  }

  // Update a single input field value, persist, apply if active
  async setInputFieldValue(themeName: string, inputFieldId: string, value: string): Promise<void> {
    const theme = this.themeStore.get(themeName);
    if (!theme?.settings) return;

    theme.settings.setInputFieldValue(inputFieldId, value);

    // Persist to data.json
    this.settings.themes[themeName] = theme.settings;
    await this.saveSettings();

    // Apply theme settings
    if (theme.isActive) theme.settings.applyToDOM();
  }

  //#endregion

}
