import {
  App,
  Notice,
  PluginSettingTab,
  setIcon,
  Setting,
  ColorComponent
} from "obsidian";
import ThemePADDPlugin from "./main";
import { ThemeLoadError } from "./ThemeSettingsLoader";
import { SettingsError } from "./Theme";
import { InputField, itemIsSection, ThemeSettings } from "./ThemeSettings";

export class ThemePADDSettingTab extends PluginSettingTab {
  plugin: ThemePADDPlugin;
  private expandedThemes = new Set<string>();
  private hasAutoExpanded = false;

  constructor(app: App, plugin: ThemePADDPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // Refresh only when showing settings tab
  refresh(): void {
    if (this.containerEl.isShown()) this.display();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

		// Plugin version for quick view
    containerEl.createDiv({
			cls: "theme-padd-version",
      text: `Version: ${this.plugin.manifest.version}`
    });

    // Collect every theme we know about, sorted by name
    const installedThemes = [...this.plugin.themeStore.all()].sort((a, b) => a.name.localeCompare(b.name));

    // Show message when no themes are installed
    if (installedThemes.length === 0) {
      new Setting(containerEl).setName("No themes installed.").setHeading();
      return;
    }

    // Determine what themes are supported and which ones are not
    const unsupported: string[] = [];
    const supported: string[] = [];
    for (const theme of installedThemes) {
      if (theme.isUnsupported) unsupported.push(theme.name);
      else supported.push(theme.name);
    }

    // Auto-expand the active theme on the first render of this tab instance
    const activeTheme = this.plugin.activeThemeName;
    if (!this.hasAutoExpanded && activeTheme && supported.includes(activeTheme)) {
      this.expandedThemes.add(activeTheme);
      this.hasAutoExpanded = true;
    }

    // Iterate supported themes and render their block
    for (const themeName of supported) {
      this.renderTheme(containerEl, themeName);
    }

    // Render unsupported section of themes
    if (unsupported.length > 0) {
      this.renderUnsupportedGroup(containerEl, unsupported);
    }
  }

  //#region Render Utilities 

  // Render theme block
  private renderTheme(element: HTMLElement, themeName: string): void {
    const theme = this.plugin.themeStore.get(themeName);
    if (!theme) return;
    const isActive = theme.isActive;
    const themeSettings = theme.settings;
    const themeErrors = theme.loadError ?? theme.settingsError;
    const isExpanded = this.expandedThemes.has(themeName);

    // Theme block container
    const themeBlock = element.createDiv({ cls: "theme-padd-theme-block" });

    // Header
    const themeHeader = themeBlock.createDiv({ cls: "theme-padd-theme-header" });
    setIcon(themeHeader, isExpanded ? "chevron-down" : "chevron-right");
    new Setting(themeHeader).setName(`${themeName}`).setHeading();
    if (isActive) themeHeader.createSpan({ text: "Active", cls: "theme-padd-active-theme-pill" });

    // Event toggle expand/collapse of theme block
    themeHeader.addEventListener("click", () => {
      if (this.expandedThemes.has(themeName)) this.expandedThemes.delete(themeName);
      else this.expandedThemes.add(themeName);
      this.display(); // Reload settings tab
    });

    // If theme isn't showing settings, do not bother rendering
    if (!isExpanded) return;

    // Theme body holding all settings or errors
    const themeBody = themeBlock.createDiv({ cls: "theme-padd-theme-body" });

    // Render errors, if any
    if (themeErrors) {
      this.renderThemeErrors(themeBody, themeName, themeErrors);
      return;
    }

    // Render loading spinner if settings not loaded yet
    if (!themeSettings) {
      const spinnerContainer = themeBody.createDiv({ cls: "theme-padd-loading-container"});
      setIcon(spinnerContainer, "loader-circle");
      return;
    }

    // Render settings
    this.renderThemeSettings(themeBody, themeName, themeSettings);
  }

  // Render theme settings
  private renderThemeSettings(element: HTMLElement, themeName: string, themeSettings: ThemeSettings): void {
    // Iterate items in authoring order
    for (const item of themeSettings.items) {
      // Set section
      if (itemIsSection(item)) {
        // Set section label and description
        const sectionElement = new Setting(element).setName(item.label).setHeading();
        if (item.description) {
          sectionElement.setDesc(item.description);
        }

        // Iterate section inputFields and render
        for (const inputField of item.inputFields) {
          this.renderInputField(element, themeName, inputField);
        }
      } else { // Set inputField
        this.renderInputField(element, themeName, item);
      }
    }
  }

  // Render input field
  private renderInputField(element: HTMLElement, themeName: string, inputField: InputField): void {
    const settingElement = new Setting(element).setName(inputField.label);
    if (inputField.description) settingElement.setDesc(inputField.description);

    // Render inputs
    switch (inputField.type) {
      case "color":
        let colorPicker: ColorComponent | null = null;
        let suppressOnChange = false;
        settingElement.addColorPicker((c) => {
          colorPicker = c;
          suppressOnChange = true;
          c.setValue(inputField.value ?? inputField.default ?? "#000000");
          suppressOnChange = false;
          c.onChange(async (value) => {
              if (suppressOnChange) return;
              await this.plugin.setInputFieldValue(themeName, inputField.id, value);
           });
        })
        .addExtraButton((b) => { // Reseet color picker to blank
          b.setIcon("rotate-ccw")
           .setTooltip("Reset (use theme default)")
           .onClick(async () => {
              suppressOnChange = true;
              await this.plugin.setInputFieldValue(themeName, inputField.id, "");
              colorPicker?.setValue(inputField.default ?? "#000000");
              suppressOnChange = false;
           });
        });
        break;
      case "text":
        settingElement.addText((t) => {
          t.setValue(inputField.value ?? inputField.default ?? "")
           .onChange(async (value) => {
            await this.plugin.setInputFieldValue(themeName, inputField.id, value);
          });
        });
        break;
      case "number":
        settingElement.addText((n) => {
          n.inputEl.type = "number";
          n.setValue(inputField.value ?? inputField.default ?? "")
           .onChange(async (value) => {
              await this.plugin.setInputFieldValue(themeName, inputField.id, value);
           });
        });
        break;
      case "toggle":
        settingElement.addToggle((t) => {
          t.setValue(inputField.value === "on")
           .onChange(async (value) => {
              await this.plugin.setInputFieldValue(themeName, inputField.id, value ? "on" : "off");
           });
        });
        break;
      case "select":
        settingElement.addDropdown((d) => {
          // Check if default value was added
          // If not, add one by default
          const hasDefaultOption = inputField.options.some((o) => o.value === "");
          if (!hasDefaultOption) d.addOption("", "Default");

          for (const option of inputField.options) d.addOption(option.value, option.label);
          d.setValue(inputField.value ?? inputField.default ?? "")
           .onChange(async (value) => {
              await this.plugin.setInputFieldValue(themeName, inputField.id, value);
           });
        });
        break;
    }
  }

  // Render unsupported themes
  private renderUnsupportedGroup(parent: HTMLElement, themeNames: string[]): void {
    // Detail element to allow expanding/collapsing
    const details = parent.createEl("details", { cls: "theme-padd-theme-details" });

    // Detail summary
    details.createEl("summary", { 
      text: `Themes without Theme PADD support (${themeNames.length})`, 
      cls: "theme-padd-theme-summary" 
    });

    // Message
    details.createEl("p", {
      text: "These themes don't declare a @themepadd directive in their theme.css. Their authors haven't added theme padd support, so there's nothing to configure here.",
      cls: "setting-item-description",
    });

    // List unsupported themes
    const list = details.createEl("ul", { cls: "theme-padd-unsupported-list" });
    const activeName = this.plugin.activeThemeName;
    for (const name of themeNames) {
      const li = list.createEl("li");
      li.createSpan({ text: name });

      // Show if theme is currently active
      if (name === activeName) {
        li.createSpan({ text: "Active", cls: "theme-padd-active-theme-pill" });
      }
    }
  }

  // Render theme errors
  private renderThemeErrors(element: HTMLElement, themeName: string, error: ThemeLoadError | SettingsError): void {
    /* Titles and descriptions for errors. May move out later */
    const titles: Record<ThemeLoadError["reason"] | SettingsError["reason"], string> = {
      readFailed: "Couldn't read theme.css",
      unsupportedHost: "Unsupported repository host",
      fetchFailed: "Couldn't download settings",
      invalidSettings: "Malformed settings specification"
    };

    const descriptions: Record<ThemeLoadError["reason"] | SettingsError["reason"], string> = {
      readFailed: `Couldn't read theme.css for "${themeName}". Check that the theme is installed correctly.`,
      unsupportedHost: `"${themeName}" points to an unsupported repository host. Theme PADD currently only supports GitHub.`,
      fetchFailed: `Couldn't download the settings specification for "${themeName}". Check your internet connection or the theme's release on GitHub.`,
      invalidSettings: `"${themeName}" published a malformed settings specification. See the detail below.`
    };

    const block = element.createDiv({ cls: "theme-padd-error-block" });

    new Setting(block).setName(titles[error.reason])
                      .setHeading()
                      .setDesc(descriptions[error.reason])
                      .addButton((b) => {
                        b.setButtonText("Copy")
                         .onClick(async () => {
                          await navigator.clipboard.writeText(plainText);
                          new Notice("Copied error details");
                        })
                      });

    // Labeled monospace details for the failures that carry one
    const details: { label: string; value: string }[] = [];
    if (error.reason === "fetchFailed") {
      details.push({ label: "URL", value: error.url });
      details.push({ label: "Detail", value: error.detail });
    } else if (error.reason === "readFailed" || error.reason === "invalidSettings") {
      details.push({ label: "Detail", value: error.detail });
    }

    for (const { label, value } of details) {
      const row = block.createDiv({ cls: "theme-padd-error-detail" });
      row.createDiv({ cls: "theme-padd-error-detail-label", text: label });
      row.createEl("pre", { cls: "theme-padd-error-detail-value", text: value });
    }

    // Build a plain-text version of the whole block for sharing
    const plainText = this.buildErrorPlainText(themeName, titles[error.reason], descriptions[error.reason], details);
  }

  // Build a plain-text representation of an error block for copy-to-clipboard
  private buildErrorPlainText(themeName: string, title: string, description: string, details: { label: string; value: string }[]): string {
    const lines: string[] = [];
    lines.push(`Theme: ${themeName}`);
    lines.push(`Error: ${title}`);
    lines.push("");
    lines.push(description);
    for (const { label, value } of details) {
      lines.push("");
      lines.push(`${label}:`);
      lines.push(value);
    }
    return lines.join("\n");
  }

  //#endregion
}
