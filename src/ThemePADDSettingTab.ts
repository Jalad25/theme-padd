import {
  App,
  ButtonComponent,
  Notice,
  PluginSettingTab,
  Setting,
  SettingDefinitionItem,
  SettingDefinitionPage,
  setIcon,
  requireApiVersion
} from "obsidian";
import ThemePADDPlugin from "./main";
import { Control, SETTINGS_JSON_SCHEMA_VERSION } from "./ThemeSettingsSchema";
import { InputValue, isEmptyForControl, matchesDefault, ThemeSettings, valueMatchesControlType } from "./ThemeSettings";
import { decodeKey, encodeKey, Scope } from "./KeyEncoding";
import { SettingsError, Theme } from "./Theme";
import { ThemeLoadError } from "./ThemeSettingsLoader";
import { EditCustomizationModal } from "./EditCustomizationModal";
import { renderControl } from "./SettingsTabControls";

//#region Types/Objects/Interfaces

type ThemeGroup = {
  supported: Theme[],
  unsupported: Theme[]
}

//#endregion

export class ThemePADDSettingTab extends PluginSettingTab {
  plugin: ThemePADDPlugin;

  /* Legacy Path Variables */
  private expandedSections = new Set<string>();
  private hasAutoExpanded = false;

  constructor(app: App, plugin: ThemePADDPlugin) {
    super(app, plugin);
    this.plugin = plugin;

    // Icon for menu
    this.icon = "palette";
  }

  refresh(): void {
    if (requireApiVersion("1.13.0")) this.update(); // Declarative settings
    else if (this.containerEl.isShown()) this.display(); // Legacy settings
  }

  //#region Shared Obsidian Binding Hooks

  // Override getting value of control for key
  getControlValue(key: string): unknown {
    const stored = this.plugin.pluginSettings.userValues[key];
    if (stored === undefined) return undefined;

    const keyParts = decodeKey(key);
    if (!keyParts) return undefined;

    const settings = this.settingsForScope(keyParts.scope);
    const control = settings?.findControl(keyParts.id);
    if (!control) return stored; // Orphan value

    // Check if value type is allowed in control, in case if edited outside Obsidian
    if (!valueMatchesControlType(stored, control)) return undefined;
    return stored;
  }

  // Override persistance of control value for key
  async setControlValue(key: string, controlValue: unknown): Promise<void> {
    const keyParts = decodeKey(key);
    if (!keyParts) return;
    
    const settings = this.settingsForScope(keyParts.scope);
    const control = settings?.findControl(keyParts.id);
    if (!control) return;

    const value = controlValue as InputValue | undefined;
    // Check value is given, can be used in control, was cleared, or matches the default
    if (value === undefined || !valueMatchesControlType(value, control)
        || isEmptyForControl(value, control) || matchesDefault(value, control)) {
      delete this.plugin.pluginSettings.userValues[key]; // Remove
    } else {
      this.plugin.pluginSettings.userValues[key] = value; // Set
    }

    await this.plugin.persistAndApplySettings(keyParts.scope);
  }

  //#endregion

  //#region Legacy Settings

  //#region Obsidian Binding Hooks

  // Legacy settings
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Obsidian version < 1.13.0 styling
    this.containerEl.addClass("theme-padd-legacy-settings-tab");

    // Plugin and settings schema version row
    const pluginVersion = `Version ${this.plugin.manifest.version}`;
    const schemaVersion = `Settings schema version: ${SETTINGS_JSON_SCHEMA_VERSION}`;
    const desc = activeDocument.createDocumentFragment();
    desc.createSpan({ text: schemaVersion });
    desc.createEl("br")
    desc.createEl("a", { text: "Visit GitHub repository", href: "https://github.com/Jalad25/theme-padd" });
    new Setting(containerEl)
      .setName(pluginVersion)
      .setDesc(desc)
      .addButton((b) => {
        b.setCta()
         .setButtonText("Copy version")
          .onClick(async () => {
            await navigator.clipboard.writeText(`${pluginVersion}\n${schemaVersion}`);
            new Notice("Copied version");
          });
      });

    // Collect themes
    const themes = this.collectKnownThemes();

    // Auto-expand the active theme on first render
    const activeTheme = this.plugin.themeStore.getActive()?.name;
    if (!this.hasAutoExpanded && activeTheme && themes.supported.some((t) => t.name === activeTheme)) {
      this.expandedSections.add(activeTheme);
      this.hasAutoExpanded = true;
    }

    // Global customizations
    this.renderSettingsSection(containerEl, { kind: "global" });

    // Supported themes
    new Setting(containerEl).setName("Themes").setHeading();
    for (const theme of themes.supported) this.renderSettingsSection(containerEl, { kind: "dev", themeName: theme.name });

    // Unsupported themes
    if (themes.unsupported.length > 0) this.renderUnsupportedGroup(containerEl, themes.unsupported);
  }

  //#endregion

  // Render settings section for scope
 private renderSettingsSection(element: HTMLElement, scope: Scope): void {
    const isExpandedKey = scope.kind === "dev"
                            ? scope.themeName
                            : scope.kind === "custom"
                                ? `custom:${scope.themeName}`
                                : "global";
    const isExpanded = this.expandedSections.has(isExpandedKey);

    // Name
    const name = scope.kind === "dev" ? scope.themeName
                                      : scope.kind === "custom"
                                          ? "Your customizations"
                                          : "Global customizations";
    const desc = scope.kind === "dev" 
                  ? ""
                  : this.hasSettingsForScope(scope) 
                      ? scope.kind === "custom" 
                        ? "Author additional settings on top of this theme." 
                        : "Author your own settings that apply to the whole vault."
                      : scope.kind === "custom"
                        ? "Applies to the specific theme."
                        : "Applies to the whole vault.";

    // Settings base
    const settingsBase = new Setting(element).setName(name);
    if (desc !== "") settingsBase.setDesc(desc); 
    const headerContainer = settingsBase.controlEl;
    if (scope.kind !== "dev" && this.hasSettingsForScope(scope)
        || scope.kind === "dev") 
      setIcon(headerContainer, isExpanded ? "chevron-down" : "chevron-right");

    // Expand/Collapse event
    if (scope.kind !== "dev" && this.hasSettingsForScope(scope)
        || scope.kind === "dev")
      headerContainer.addEventListener("click", () => {
        if (this.expandedSections.has(isExpandedKey)) this.expandedSections.delete(isExpandedKey);
        else this.expandedSections.add(isExpandedKey);
        this.display();
      });

    switch(scope.kind) {
      case "custom":
      case "global": 
        this.renderCustomizationSettings(element, settingsBase, scope);
        break;
      case "dev": 
        this.renderDevSettings(element, settingsBase.nameEl, scope.themeName);
        break;
    }
  }
 
  // Render dev settings
  private renderDevSettings(container: HTMLElement, header: HTMLElement, themeName: string): void {
    const devScope: Scope = { kind: "dev", themeName: themeName};
    const isExpanded = this.expandedSections.has(themeName);
    const theme = this.plugin.themeStore.get(themeName);
    if (!theme) return; // Exit if theme not found
    const errors = theme.loadError ?? theme.settingsError;

    // Render pills summary shown next to the theme name
    if (theme.isActive) header.createSpan({ text: "Active", cls: "theme-padd-theme-pill theme-padd-theme-pill-success" });
    if (theme.isUnsupported) header.createSpan({ text: "Dev unsupported", cls: "theme-padd-theme-pill theme-padd-theme-pill-warning"});
    if (errors) header.createSpan({ text: "Error", cls: "theme-padd-theme-pill theme-padd-theme-pill-error" });

    // Don't bother rendering if not visible
    if (!isExpanded) return;

    // Controls container
    const body = container.createDiv({ cls: "theme-padd-theme-body" });

    // Customization settings
    this.renderSettingsSection(body, { kind: "custom", themeName: themeName });

    // Errors
    if (errors) {
      const setting = new Setting(body);
      this.renderThemeErrors(setting, theme.name, errors);
      return;
    }

    // Dev settings
    if (this.hasSettingsForScope(devScope)) {
      this.renderSettingsControls(body, devScope);
    } else if (!theme.isUnsupported) { // Still loading
      const spinner = body.createDiv({ cls: "theme-padd-loading-container" });
      setIcon(spinner, "loader-circle");
      return;
    }
  }

  // Render customization settings section for scope
  private renderCustomizationSettings(container: HTMLElement, setting: Setting, scope: Scope): void {
    if (scope.kind === "dev") return; // Cannot be rendered here
    const isExpanded = this.expandedSections.has(scope.kind === "custom"
                                ? `custom:${scope.themeName}`
                                : "global");

    // Nothing set, define customization settings with button to add settings
    if (!this.hasSettingsForScope(scope)) {
      setting.addButton((b) => {
                b.setButtonText(scope.kind === "custom" ? "Add custom settings" : "Add global settings")
                .setCta()
                .onClick(() => this.openEditCustomizationModal(scope));
              });
      return;
    }

    // Don't bother rendering if not visible
    if (!isExpanded) return;

    // Controls container
    const body = container.createDiv({ cls: "theme-padd-theme-body" });

    // Settings
    this.renderSettingsControls(body, scope); 

    // Edit section with button
    new Setting(body)
      .setName("Edit customizations")
      .setDesc("Modify the underlying customization JSON.")
      .addButton((b) => {
        b.setIcon("pencil")
         .setTooltip("Edit customization JSON")
         .setCta()
         .onClick(() => this.openEditCustomizationModal(scope));
      });

    // Delete section with button
    new Setting(body)
      .setName("Delete customizations")
      .setDesc(`Remove all customizations for ${scope.kind === "custom" ? "this theme." : "the global settings."}`)
      .addButton((b) => {
        b.setIcon("trash")
         .setTooltip("Delete customization JSON")
         .onClick(() => this.deleteCustomizationSettings(scope));
        // setDestructive was added in 1.13.0, older versions use the deprecated setWarning
        if (requireApiVersion("1.13.0")) b.setDestructive();
      });
  }

  // Render settings controls for scope
  private renderSettingsControls(parent: HTMLElement, scope: Scope): void {
    const settings = this.settingsForScope(scope);

    if (!settings) return; // Return if no settings

    // Iterate setting items
    for (const item of settings.settingItems) {
      if (item.type === "empty") { // Setting description empty
        const setting = new Setting(parent).setName(item.name).setClass("theme-padd-settings-group");
        if (item.desc) setting.setDesc(item.desc);
      } else if (item.type === "control") { // Setting description control
        const setting = new Setting(parent).setName(item.name).setClass("theme-padd-settings-group");
        if (item.desc) setting.setDesc(item.desc);
        this.renderControlWithReset(setting, item.control, settings, encodeKey(scope, item.control.id));
      } else { // Setting description group
        const groupEl = parent.createDiv({ cls: "theme-padd-settings-group" });
        if (item.heading) new Setting(groupEl).setName(item.heading).setHeading();
        for (const child of item.items) {
          if (child.type === "empty") {
            const setting = new Setting(groupEl).setName(child.name);
            if (child.desc) setting.setDesc(child.desc);
          } else {
            const setting = new Setting(groupEl).setName(child.name);
            if (child.desc) setting.setDesc(child.desc);
            this.renderControlWithReset(setting, child.control, settings, encodeKey(scope, child.control.id));
          }
        }
      }
    }
  }

  // Render unsupported theme group
  private renderUnsupportedGroup(parent: HTMLElement, themes: Theme[]): void {
    // Detail for expanding/collapsing
    const details = parent.createEl("details", { cls: "theme-padd-theme-details" });
    details.createEl("summary", {
      text: `Themes without Theme PADD support (${themes.length})`,
      cls: "theme-padd-theme-summary",
    });

    // List unsupported themes
    const list = details.createEl("ul", { cls: "theme-padd-unsupported-list" });
    for (const theme of themes) {
      const li = list.createEl("li");
      li.createSpan({ text: theme.name });
      if (theme.isActive) li.createSpan({ text: "Active", cls: "theme-padd-theme-pill-success" });
      new ButtonComponent(li) // Edit custom settings button
        .setClass("theme-padd-add-customization-button")
        .setButtonText("Add customizations")
        .setTooltip("Author your own settings for this theme")
        .setCta()
        .onClick(() => this.openEditCustomizationModal({ kind: "custom", themeName: theme.name }));
    }
  }

  //#endregion

  //#region Declarative Settings

  //#region Obsidian Binding Hooks

  // Declarative settings
  getSettingDefinitions(): SettingDefinitionItem[] {
    const items: SettingDefinitionItem[] = [];

    // Obsidian version >= 1.13.0 styling
    this.containerEl.addClass("theme-padd-declarative-settings-tab");

    // Plugin and settings schema version row
    const pluginVersion = `Version ${this.plugin.manifest.version}`;
    const schemaVersion = `Settings schema version: ${SETTINGS_JSON_SCHEMA_VERSION}`;
    const desc = activeDocument.createDocumentFragment();
    desc.createSpan({ text: schemaVersion });
    desc.createEl("br");
    desc.createEl("a", { text: "Visit GitHub repository", href: "https://github.com/Jalad25/theme-padd" });
    items.push({
      type: "group",
      heading: "",
      items: [{
        name: " ",
        render: (setting) => {
          setting.setName(pluginVersion)
                 .setDesc(desc)
                 .addButton((b) => {
                   b.setCta()
                   .setButtonText("Copy version")
                   .onClick(async () => {
                       await navigator.clipboard.writeText(`${pluginVersion}\n${schemaVersion}`);
                       new Notice("Copied version");
                     });
                 });
        }
      }]
    });

    // Collect themes
    const themes = this.collectKnownThemes();

    // Global settings
    const customizationSettings = this.customizationSection({ kind: "global" });
    if (customizationSettings !== null) items.push(customizationSettings);

    // Supported themes
    if (themes.supported.length > 0) {
      items.push({
        type: "group",
        heading: "Themes",
        items: themes.supported.map((theme): SettingDefinitionPage => this.themeSection(theme)),
      });
    }

    // Unsupported themes
    if (themes.unsupported.length > 0) {
      items.push(this.unsupportedGroup(themes.unsupported));
    }

    return items;
  }

  //#endregion

  // Define theme section
  private themeSection(theme: Theme): SettingDefinitionPage {
    const errors = theme.loadError ?? theme.settingsError;
    const devScope: Scope = { kind: "dev", themeName: theme.name };
    const items: SettingDefinitionItem[] = [];

    // Define labels summary shown next to the theme name
    const descParts: string[] = [];
    if (theme.isActive) descParts.push("Active");
    if (theme.isUnsupported) descParts.push("Dev unsupported");
    if (theme.loadError || theme.settingsError) descParts.push("Error");
    const desc = descParts.join(" · ");

    // Customization settings
    const customizationSettings = this.customizationSection({ kind: "custom", themeName: theme.name });
    if (customizationSettings !== null) {
      items.push(customizationSettings);
    }

    // Added to separate it from other settings
    items.push({ type: "group", heading: " " });

    /* Page items */
    if (errors) { // Errors
      items.push({
        name: " ",
        render: (setting) => this.renderThemeErrors(setting, theme.name, errors),
      });
    }
    else if (this.hasSettingsForScope(devScope)) { // Dev settings
      for (const item of this.settingsControls(devScope)) {
        items.push(item);
      }
    } else if (!theme.isUnsupported) { // Still loading
      items.push({
        name: " ",
        render: (setting) => {
          const container = setting.settingEl.createDiv({ cls: "theme-padd-loading-container" });
          setIcon(container, "loader-circle");
        },
      });
    }

    return {
      type: "page",
      name: theme.name,
      desc,
      items: items
    };
  }
  
  // Define Customization section for scope
  private customizationSection(scope: Scope): SettingDefinitionItem | null {
    if (scope.kind === "dev") return null; // Cannot be defined here

    // Name and description
    const name = scope.kind === "custom" ? "Your customizations" : "Global customizations";
    const desc = this.hasSettingsForScope(scope) 
                    ? scope.kind === "custom" 
                      ? "Author additional settings on top of this theme." 
                      : "Author your own settings that apply to the whole vault."
                    : scope.kind === "custom"
                      ? "Applies to the specific theme."
                      : "Applies to the whole vault.";

    // Settings base
    const settingsBase = {
      name: name,
      desc: desc
    };

    // Nothing set, define customization settings group as action button to add settings
    if (!this.hasSettingsForScope(scope)) {
      return {
        ...settingsBase,
        action: () => this.openEditCustomizationModal(scope)
      };
    }

    // Controls
    const items: SettingDefinitionItem[] = [];
    for (const item of this.settingsControls(scope)) items.push(item);

    // Edit section as button
    items.push({ 
      name: "Edit customizations",
      desc: "Modify the underlying customization JSON.",
      action: () => this.openEditCustomizationModal(scope),
    });

    // Delete section as button
    items.push({
      name: "Delete customizations",
      desc: `Remove all customizations for ${scope.kind === "custom" ? "this theme." : "the global settings."}`,
      action: () => { void this.deleteCustomizationSettings(scope); },
    });
    
    return {
      type: "page",
      ...settingsBase,
      items: items
    };
  }

  // Define settings controls for scope
  private settingsControls(scope: Scope): SettingDefinitionItem[] {
    const out: SettingDefinitionItem[] = [];
    const settings = this.settingsForScope(scope);

    if (!settings) return []; // Return if no settings

    // Iterate setting items
    for (const item of settings.settingItems) {
      if (item.type === "empty") { // Setting description empty
        out.push({ name: item.name, desc: item.desc });
      } else if (item.type === "control") { // Setting description control
        out.push({
          name: item.name,
          desc: item.desc,
          render: (setting) => this.renderControlWithReset(setting, item.control, settings, encodeKey(scope, item.control.id))
        });
      } else { // Setting description group
        out.push({
          type: "group",
          heading: item.heading,
          items: item.items.map((child) =>
            child.type === "empty"
              ? { name: child.name, desc: child.desc }
              : {
                  name: child.name,
                  desc: child.desc,
                  render: (setting) => this.renderControlWithReset(setting, child.control, settings, encodeKey(scope, child.control.id))
                }
          )
        });
      }
    }
    return out;
  }

  // Define unsupported theme group
  private unsupportedGroup(themes: Theme[]): SettingDefinitionItem {
    return {
      type: "group",
      heading: `Themes without Theme PADD support (${themes.length})`,
      items: themes.map((theme) => ({
        name: theme.name,
        desc: theme.isActive ? "Active" : undefined,
        action: () => this.openEditCustomizationModal({ kind: "custom", themeName: theme.name })
      }))
    };
  }

  //#endregion

  //#region Shared Settings Functions

  //#region Modals

  // Open EditCustomizationModal
  private openEditCustomizationModal(scope: Scope): void {
    if (scope.kind === "dev") return; // Cannot open for dev settings
    const title = scope.kind === "custom" ? `${scope.themeName} - customizations` : "Global customizations";
    new EditCustomizationModal(this.plugin, title, this.settingsForScope(scope), async (newSettings) => {
      if (scope.kind === "custom") await this.plugin.applyCustomizationSettings(scope.themeName, newSettings);
      else await this.plugin.applyGlobalCustomizationSettings(newSettings);
      this.refresh();
    }).open();
  }

  // Delete customization setting
  private async deleteCustomizationSettings(scope: Scope): Promise<void> {
    if (scope.kind === "dev") return; // Cannot delete for dev settings
    if (scope.kind === "custom") await this.plugin.applyCustomizationSettings(scope.themeName, null);
    else await this.plugin.applyGlobalCustomizationSettings(null);
    this.refresh(); // Update

    // Force the settings window to re-navigate to the tab's root view
    if (requireApiVersion("1.13.0")) {
      const setting = (this.app as App & { setting?: { openTabById?: (id: string) => void } }).setting;
      if (setting?.openTabById) setting.openTabById("theme-padd");
    }
  }

  //#endregion

  // Render a control with reset button
  private renderControlWithReset(setting: Setting, control: Control, settings: ThemeSettings, key: string): void {
    const write = (value: InputValue | undefined) => this.setControlValue(key, value);
    const getUserValue = (): InputValue | undefined => this.getControlValue(key) as InputValue | undefined;
    const effective = settings.effectiveValue(control, () => getUserValue());
    renderControl(setting, control, effective, write, getUserValue);
  }

  // Render theme errors
  private renderThemeErrors(setting: Setting, themeName: string, error: ThemeLoadError | SettingsError): void {
    /* Titles and descriptions for errors. May move out later */
    const titles: Record<ThemeLoadError["reason"] | SettingsError["reason"], string> = {
      readFailed: "Couldn't read theme.css",
      unsupportedHost: "Unsupported repository host",
      fetchFailed: "Couldn't download settings",
      invalidSettings: "Malformed settings specification",
    };
    const descriptions: Record<ThemeLoadError["reason"] | SettingsError["reason"], string> = {
      readFailed: `Couldn't read theme.css for "${themeName}". Check that the theme is installed correctly.`,
      unsupportedHost: `"${themeName}" points to an unsupported repository host. Theme PADD currently only supports GitHub.`,
      fetchFailed: `Couldn't download the settings specification for "${themeName}". Check your internet connection or the theme's release on GitHub.`,
      invalidSettings: `"${themeName}" published a malformed settings specification. See the detail below.`,
    };

    const details: { label: string; value: string }[] = [];

    // Labeled details for the failures that carry one
    if (error.reason === "fetchFailed") {
      details.push({ label: "URL", value: error.url });
      details.push({ label: "Detail", value: error.detail });
    } else if (error.reason === "readFailed" || error.reason === "invalidSettings") {
      details.push({ label: "Detail", value: error.detail });
    }

    // Build clipboard payload
    const lines: string[] = [];
    lines.push(`Theme: ${themeName}`);
    lines.push(`Error: ${titles[error.reason]}`);
    lines.push("");
    lines.push(descriptions[error.reason]);
    for (const { label, value } of details) {
      lines.push("");
      lines.push(`${label}:`);
      lines.push(value);
    }

    // Build row with stacked layout
    setting.settingEl.empty();
    setting.settingEl.addClass("theme-padd-error-row");

    const info = setting.settingEl.createDiv({ cls: "theme-padd-error-info" });
    info.createDiv({ cls: "theme-padd-error-title", text: titles[error.reason] });
    info.createDiv({ cls: "theme-padd-error-desc", text: descriptions[error.reason] });

    if (details.length > 0) {
      const detailsEl = setting.settingEl.createDiv({ cls: "theme-padd-error-details" });
      for (const { label, value } of details) {
        detailsEl.createDiv({ cls: "theme-padd-error-detail-label", text: label });
        detailsEl.createEl("pre", { cls: "theme-padd-error-detail-value", text: value });
      }
    }

    // Copy button
    const actions = setting.settingEl.createDiv({ cls: "theme-padd-error-actions" });
    new ButtonComponent(actions)
      .setButtonText("Copy")
      .onClick(async () => {
        await navigator.clipboard.writeText(lines.join("\n"));
        new Notice("Copied error details");
      });
  }

  //#endregion

  //#region Utilities

  private hasSettingsForScope(scope: Scope): boolean {
    if (scope.kind === "global") return this.plugin.globalSettings !== null;
    switch (scope.kind) {
      case "dev": return this.plugin.themeStore.hasDevSettings(scope.themeName);
      case "custom": return this.plugin.themeStore.hasCustomizationSettings(scope.themeName);
    }
  }
  
  private settingsForScope(scope: Scope): ThemeSettings | null {
    switch (scope.kind) {
      case "dev":    return this.plugin.themeStore.get(scope.themeName)?.settings ?? null;
      case "custom":    return this.plugin.themeStore.get(scope.themeName)?.customizationSettings ?? null;
      case "global": return this.plugin.globalSettings;
    }
  }

  private collectKnownThemes(): ThemeGroup {
    const installedThemes = [...this.plugin.themeStore.all()].sort((a, b) => a.name.localeCompare(b.name));
    const supportedThemes: Theme[] = [];
    const unsupportedThemes: Theme[] = [];
    for (const theme of installedThemes) {
      if (!theme.isUnsupported || theme.customizationSettings) supportedThemes.push(theme);
      else unsupportedThemes.push(theme);
    }

    return { supported: supportedThemes, unsupported: unsupportedThemes };
  }

  //#endregion
}
