import { Plugin } from "obsidian";
import { ThemeSettingsLoader } from "./ThemeSettingsLoader";
import { ThemePADDSettingTab } from "./ThemePADDSettingTab";
import { ThemeStore } from "./ThemeStore";
import { InputValue, ThemeSettings } from "./ThemeSettings";
import { Theme } from "./Theme";
import { Control, ThemeSettingsJSON } from "./ThemeSettingsSchema";
import { encodeKey, Scope } from "./KeyEncoding";

//#region Types/Objects/Interfaces

export interface Customizations {
  perTheme: Record<string, ThemeSettings>;
  global: ThemeSettings | null;
}

export interface ThemePADDSettings {
  schemaVersion: number;
  themes: Record<string, ThemeSettings>;
  customizations: Customizations;
  userValues: Record<string, InputValue>;
}

interface CustomCss {
  themes: Record<string, { version: string }>;
  theme: string;
}

//#endregion

//#region Constants

export const DATA_JSON_SCHEMA_VERSION = 1; // For data.json schema, currently unused

export const DEFAULT_SETTINGS: ThemePADDSettings = {
  schemaVersion: DATA_JSON_SCHEMA_VERSION,
  themes: {},
  customizations: { perTheme: {}, global: null },
  userValues: {}
};

//#endregion

export default class ThemePADDPlugin extends Plugin {
  pluginSettings!: ThemePADDSettings;
  themeStore: ThemeStore = new ThemeStore();
  themeSettingsLoader: ThemeSettingsLoader = new ThemeSettingsLoader(this);
  globalSettings: ThemeSettings | null = null;
  private pluginSettingTab!: ThemePADDSettingTab;
  private devStyleEl: HTMLStyleElement | null = null; // dev style element
  private globalStyleEl: HTMLStyleElement | null = null; // global style element
  private customStyleEl: HTMLStyleElement | null = null; // custom style element

  async onload() {
    // Plugin Settings
    await this.loadPluginSettings();

    // Hydrate global settings
    const rawGlobal = this.pluginSettings.customizations.global;
    if (!rawGlobal) this.globalSettings = null;
    else {
      const result = ThemeSettings.fromSettingsJSON(rawGlobal, "");
      this.globalSettings = result.ok ? result.settings : null;
    }

    // Settings Tab
    this.pluginSettingTab = new ThemePADDSettingTab(this.app, this);
    this.addSettingTab(this.pluginSettingTab);

    // Load theme infomation/settings on workspace ready
    this.app.workspace.onLayoutReady(() => {
      this.createStyleElements();
      this.reconcileThemes();
    });

    // CSS Change event
    this.registerEvent(
      this.app.workspace.on("css-change", async () => {
        await this.reconcileThemes();
      })
    );
  }

  onunload() {
    // Style elements will automatically be removed
    // Classes need to be removed from the body
    const active = this.themeStore.getActive();
    if (active?.settings) this.clearClassesFromBody(active.settings);
    if (active?.customizationSettings) this.clearClassesFromBody(active.customizationSettings);
    if (this.globalSettings) this.clearClassesFromBody(this.globalSettings);
  }

  //#region Plugin Settings

  async loadPluginSettings() {
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

    this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, filtered);

    if (droppedAny) await this.savePluginSettings();
  }

  async savePluginSettings() {
    await this.saveData(this.pluginSettings);
  }

  //#endregion

  //#region Theme Settings

  // Reconcile themes data/settings
  private async reconcileThemes(): Promise<void> {
    // Tap into a property that is not in the Obsidian public API to get list of themes and the active theme
    const customCss = (this.app as unknown as { customCss?: CustomCss }).customCss;
    if (!customCss) return;

    const installed: string[] = Object.keys(customCss.themes ?? {}); // Installed themes
    const newActive: string | null = customCss.theme || null; // Active theme
    const activeChanged = newActive !== this.themeStore.getActive()?.name; // Previously marked active theme

    // If changed, clear previous active theme style from DOM
    if (activeChanged) {
      const previousActive = this.themeStore.getActive();
      if (previousActive?.settings) this.clearThemeSettingsFromDOM(previousActive.settings, { kind: "dev", themeName: previousActive.name });
      if (previousActive?.customizationSettings) this.clearThemeSettingsFromDOM(previousActive.customizationSettings, { kind: "custom", themeName: previousActive.name });
    }

    // Remove no longer installed themes
    for (const theme of [...this.themeStore.all()]) {
      if (!installed.includes(theme.name)) await this.removeTheme(theme.name);
    }

    // Load theme settings
    for (const name of installed) {
      const version: string = customCss.themes[name].version;
      await this.loadThemeSettings(name, version);
    }

    // Set active theme in store
    if (activeChanged) this.themeStore.setActive(newActive);

    const active = this.themeStore.getActive();
    if (active) this.applyActiveLayers(active); // Apply all settings styles
    else if (this.globalSettings) this.applyThemeSettingsToDOM(this.globalSettings, { kind: "global" }); // Apply just the global settings styles

    this.pluginSettingTab?.refresh();
  }

  // Load theme settings
  private async loadThemeSettings(themeName: string, fetchedVersion: string): Promise<void> {
    const theme = this.themeStore.upsert(themeName); // Update or create in store

    // Get raw settings
    const rawCustomization = this.pluginSettings.customizations.perTheme[theme.name];
    if (!rawCustomization) {
      theme.customizationSettings = null;
    } else {
      const result = ThemeSettings.fromSettingsJSON(rawCustomization, "");
      theme.customizationSettings = result.ok ? result.settings : null;
    }

    // If same version already loaded, exit
    if (theme.settings?.themeVersion === fetchedVersion) return;

    // Load from data.json and apply settings style, if active
    const saved = this.pluginSettings.themes[themeName];
    if (saved && saved.themeVersion === fetchedVersion) {
      theme.applyRawSettings(saved, fetchedVersion);
      await this.persistAndApplySettings({ kind: "dev", themeName: theme.name });
      return;
    }

    // Load from repo and apply settings style, if active
    const result = await this.themeSettingsLoader.loadThemeSettings(themeName, fetchedVersion);
    theme.applyThemeSettingsFromLoadResult(result, fetchedVersion);
    await this.persistAndApplySettings({ kind: "dev", themeName: theme.name });
  }

  // Sync the theme's dev settings to data.json and apply to DOM, if active
  async persistAndApplySettings(scope: Scope): Promise<void> {
    if (scope.kind === "dev" || scope.kind === "custom") {
      const theme = this.themeStore.get(scope.themeName);
      if (!theme) return;
      if (scope.kind === "dev") {
        if (theme.settings) this.pluginSettings.themes[theme.name] = theme.settings;
        else delete this.pluginSettings.themes[theme.name];
      } else {
        if (theme.customizationSettings) this.pluginSettings.customizations.perTheme[theme.name] = theme.customizationSettings;
        else delete this.pluginSettings.customizations.perTheme[theme.name];
      }
      await this.savePluginSettings()
        .then(() => {
          if (theme.isActive) this.applyActiveLayers(theme);
        });
    } else {
      if (this.globalSettings) this.pluginSettings.customizations.global = this.globalSettings;
      else this.pluginSettings.customizations.global = null;
      await this.savePluginSettings()
        .then(() => {
          if (this.globalSettings) this.applyThemeSettingsToDOM(this.globalSettings, { kind: "global" });
        });
    }
  }

  // Save perTheme customizations settings
  async applyCustomizationSettings(themeName: string, newSettings: ThemeSettingsJSON | null): Promise<void> {
    const theme = this.themeStore.get(themeName);
    if (!theme) return;

    // Remove from DOM
    if (theme.isActive && theme.customizationSettings) this.clearThemeSettingsFromDOM(theme.customizationSettings, { kind: "custom", themeName: theme.name });

    // Clear if empty
    if (!newSettings) {
      theme.customizationSettings = null;
      await this.persistAndApplySettings({ kind: "custom", themeName: theme.name });
      return;
    }

    // Load raw settings
    const result = ThemeSettings.fromSettingsJSON(newSettings, "");
    if (!result.ok) return;

    theme.customizationSettings = result.settings;
    await this.persistAndApplySettings({ kind: "custom", themeName: theme.name });
  }

  // Save global settings
  async applyGlobalCustomizationSettings(newSettings: ThemeSettingsJSON | null): Promise<void> {
    // Remove from DOM
    if (this.globalSettings) this.clearThemeSettingsFromDOM(this.globalSettings, { kind: "global" });

    // Clear if empty
    if (!newSettings) {
      this.globalSettings = null;
      await this.persistAndApplySettings({ kind: "global" });
      return;
    }

    // Load raw settings
    const result = ThemeSettings.fromSettingsJSON(newSettings, "");
    if (!result.ok) return;

    this.globalSettings = result.settings;
    await this.persistAndApplySettings({ kind: "global" });
  }

  // Apply dev -> global -> perTheme customizations for the given active theme
  private applyActiveLayers(theme: Theme): void {
    if (theme.settings) this.applyThemeSettingsToDOM(theme.settings, { kind: "dev", themeName: theme.name });
    if (this.globalSettings) this.applyThemeSettingsToDOM(this.globalSettings, { kind: "global" });
    if (theme.customizationSettings) this.applyThemeSettingsToDOM(theme.customizationSettings, { kind: "custom", themeName: theme.name });
  }

  // Remove theme from store and data.json
  private async removeTheme(themeName: string): Promise<void> {
    this.themeStore.remove(themeName);
    if (this.pluginSettings.themes[themeName]) {
      delete this.pluginSettings.themes[themeName];
      await this.savePluginSettings();
    }
  }

  applyThemeSettingsToDOM(settings: ThemeSettings, scope: Scope): void {
    // Body = Vault body
    const body = this.app.workspace.rootSplit?.doc?.body;
    if (!body) return; // Workspace not ready yet

    const lookupValue = (id: string): InputValue | undefined => {
      return this.pluginSettings.userValues[encodeKey(scope, id)];
    };

    const varDeclarations: string[] = [];
    for (const control of settings.allControls()) {
      switch (control.onChange.action) {
        case "set-css-variable": {
          // Get clearMode
          const clearMode = resolveDefaultClearMode(control, control.onChange.clearMode);
          const value = clearMode === "default"
            ? settings.effectiveValue(control, lookupValue)
            : lookupValue(control.id);
          const decl = formatVariableDeclaration(control.onChange.name, value, clearMode);
          if (decl) varDeclarations.push(decl);
          break;
        }
        case "set-css-variable-to": {
          const value = settings.effectiveValue(control, lookupValue);
          const emitted: InputValue | undefined = value === true ? control.onChange.value : undefined;
          const decl = formatVariableDeclaration(control.onChange.name, emitted, control.onChange.clearMode);
          if (decl) varDeclarations.push(decl);
          break;
        }
        case "toggle-class": {
          const value = settings.effectiveValue(control, lookupValue);
          body.toggleClass(control.onChange.class, value === true);
          break;
        }
        case "set-class-from-list": {
          const value = settings.effectiveValue(control, lookupValue);
          body.removeClasses(control.onChange.classes);
          if (typeof value === "string" && value !== "" && control.onChange.classes.includes(value)) {
            body.addClass(value);
          }
          break;
        }
      }
    }

    this.writeStyleElement(scope, varDeclarations);
  }

  clearThemeSettingsFromDOM(settings: ThemeSettings, scope?: Scope): void {
    if (scope) this.writeStyleElement(scope, []);
    this.clearClassesFromBody(settings);
  }

  // Clear classes from VAULT body
  private clearClassesFromBody(settings: ThemeSettings): void {
    const body = this.app.workspace.rootSplit?.doc?.body;
    if (!body) return;
    for (const control of settings.allControls()) {
      switch (control.onChange.action) {
        case "toggle-class":
          body.removeClass(control.onChange.class);
          break;
        case "set-class-from-list":
          body.removeClasses(control.onChange.classes);
          break;
      }
    }
  }

  // Create style elements: dev (theme dev settings changes), global, and custom
  private createStyleElements(): void {
    const head = this.app.workspace.rootSplit?.doc?.head;
    if (!head) return;
    this.devStyleEl = head.createEl("style", { attr: { "data-theme-padd-scope": "dev" } });
    this.globalStyleEl = head.createEl("style", { attr: { "data-theme-padd-scope": "global" } });
    this.customStyleEl = head.createEl("style", { attr: { "data-theme-padd-scope": "custom" } });
    this.register(() => { // Registered in order of precedence
      this.devStyleEl?.remove();
      this.globalStyleEl?.remove();
      this.customStyleEl?.remove();
      this.devStyleEl = null;
      this.globalStyleEl = null;
      this.customStyleEl = null;
    });
  }

  // Add CSS changes to style element
  private writeStyleElement(scope: Scope, declarations: string[]): void {
    const styleEl = scope.kind === "dev" ? this.devStyleEl
                                         : scope.kind === "global" ? this.globalStyleEl
                                                                   : this.customStyleEl;
    if (!styleEl) return;
    styleEl.textContent = declarations.length === 0 ? "" : `body {\n  ${declarations.join("\n  ")}\n}`;
  }

  //#endregion

}

//#region Utilities

// Build variable declaration for style element CSS
function formatVariableDeclaration(
  name: string,
  value: InputValue | undefined,
  clearMode: "empty" | "remove" | "default" | undefined
): string | null {
  if (value === undefined) {
    if (clearMode === "empty") return `${name}: ;`;
    return null; // remove or default (with no resolved default value), remove completely
  }
  return `${name}: ${typeof value === "number" ? String(value) : value};`;
}

// Determine which default type is used (either "remove" or "default")
function resolveDefaultClearMode(control: Control, initialClearMode: "remove" | "empty" | "default" | undefined): "remove" | "empty" | "default" {
  if (initialClearMode !== undefined) return initialClearMode;
  let hasDefaultValue = false;
  switch (control.type) {
    case "text":
    case "textarea":
    case "dropdown":
    case "color":
      hasDefaultValue = control.defaultValue !== undefined && control.defaultValue !== "";
      break;
    case "number":
    case "slider":
    case "toggle":
      hasDefaultValue = control.defaultValue !== undefined;
      break;
  }
  return hasDefaultValue ? "default" : "remove";
}

//#endregion
