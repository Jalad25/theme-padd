import {
  App,
  Notice,
  PluginSettingTab,
  setIcon,
  Setting,
  ColorComponent,
  DropdownComponent,
  SliderComponent,
  TextAreaComponent,
  TextComponent,
  ToggleComponent
} from "obsidian";
import ThemePADDPlugin from "./main";
import { ThemeLoadError } from "./ThemeSettingsLoader";
import { SettingsError } from "./Theme";
import { GroupItem, Input, InputValue, SettingItem, ThemedColorValue, ThemeSettings } from "./ThemeSettings";

const COLOR_FALLBACK = "#000000";

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
      this.renderThemeSection(containerEl, themeName);
    }

    // Render unsupported section of themes
    if (unsupported.length > 0) {
      this.renderUnsupportedGroup(containerEl, unsupported);
    }
  }

  //#region Render Utilities

  //#region Supported Theme

  // Render theme section of settings
  private renderThemeSection(element: HTMLElement, themeName: string): void {
    const theme = this.plugin.themeStore.get(themeName);
    if (!theme) return;
    const isActive = theme.isActive;
    const themeSettings = theme.settings;
    const themeErrors = theme.loadError ?? theme.settingsError;
    const isExpanded = this.expandedThemes.has(themeName);

    // Theme container
    const themeBlock = element.createDiv({ cls: "theme-padd-theme-block" });

    // Header
    const themeHeader = themeBlock.createDiv({ cls: "theme-padd-theme-header" });
    setIcon(themeHeader, isExpanded ? "chevron-down" : "chevron-right");
    const headerSetting = new Setting(themeHeader).setName(`${themeName}`).setHeading();
    if (themeSettings?.icon) {
      const wrapper = createSpan({ cls: "theme-padd-theme-icon" });
      setIcon(wrapper, themeSettings.icon);
      if (wrapper.childElementCount === 0) wrapper.setText(themeSettings.icon);
      headerSetting.nameEl.prepend(wrapper);
    }
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

    // Render theme settings
    this.renderThemeSettings(themeBody, themeName, themeSettings);
  }

  // Render theme settings
  private renderThemeSettings(element: HTMLElement, themeName: string, themeSettings: ThemeSettings): void {
    for (const item of themeSettings.items) {
      switch (item.type) {
        case "heading":
          this.renderHeading(element, item.name, item.desc);
          break;
        case "setting":
          this.renderSetting(element, themeName, themeSettings, item);
          break;
        case "group":
          this.renderGroup(element, themeName, themeSettings, item);
          break;
      }
    }
  }

  // Render a heading row
  private renderHeading(element: HTMLElement, name: string, desc?: string): void {
    const setting = new Setting(element).setName(name).setHeading();
    if (desc) setting.setDesc(desc);
  }

  // Render a group, heading with settings
  private renderGroup(element: HTMLElement, themeName: string, themeSettings: ThemeSettings, group: GroupItem): void {
    const groupEl = element.createDiv({ cls: "theme-padd-group" });
    this.renderHeading(groupEl, group.heading);
    for (const item of group.items) {
      this.renderSetting(groupEl, themeName, themeSettings, item);
    }
  }

  // Render a setting row
  private renderSetting(element: HTMLElement, themeName: string, themeSettings: ThemeSettings, item: SettingItem): void {
    const setting = new Setting(element).setName(item.name);
    if (item.desc) setting.setDesc(item.desc);
    if (item.tooltip) setting.setTooltip(item.tooltip);

    for (const input of item.inputs) {
      this.renderInput(setting, themeName, themeSettings, input);
    }
  }

  // Render a single input into an existing Setting row, with reset button
  private renderInput(setting: Setting, themeName: string, themeSettings: ThemeSettings, input: Input): void {
    const value = themeSettings.effectiveValue(input);

    switch (input.type) {
      case "text":
        this.renderTextInput(setting, themeName, input, value);
        break;
      case "textarea":
        this.renderTextArea(setting, themeName, input, value);
        break;
      case "toggle":
        this.renderToggle(setting, themeName, input, value);
        break;
      case "dropdown":
        this.renderDropdown(setting, themeName, input, value);
        break;
      case "color":
        if (input.themed) {
          this.renderThemedColor(setting, themeName, input, value);
        } else {
          this.renderSingleColor(setting, themeName, input, value);
        }
        break;
      case "slider":
        this.renderSlider(setting, themeName, input, value);
        break;
    }
  }

  //#region Inputs

  // Render text input with reset button
  private renderTextInput(setting: Setting, themeName: string, input: Extract<Input, { type: "text" }>, value: InputValue | undefined): void {
    let control: TextComponent | null = null;
    setting.addText((t) => {
      control = t;
      if (input.placeholder) t.setPlaceholder(input.placeholder);
      t.setValue(typeof value === "string" ? value : "")
       .onChange(async (value) => {
          await this.plugin.setUserInputValue(themeName, input.id, value);
       });
    });
    this.addResetButton(setting, themeName, input, () => {
      if (control && input.default !== undefined) control.setValue(input.default);
      else if (control) control.setValue("");
    });
  }

  // Render text area input with reset button
  private renderTextArea(setting: Setting, themeName: string, input: Extract<Input, { type: "textarea" }>, value: InputValue | undefined): void {
    let control: TextAreaComponent | null = null;
    setting.addTextArea((t) => {
      control = t;
      if (input.placeholder) t.setPlaceholder(input.placeholder);
      t.setValue(typeof value === "string" ? value : "");
      t.onChange(async (value) => {
        await this.plugin.setUserInputValue(themeName, input.id, value);
      });
    });
    this.addResetButton(setting, themeName, input, () => {
      if (control && input.default !== undefined) control.setValue(input.default);
      else if (control) control.setValue("");
    });
  }

  // Render toggle input with reset button
  private renderToggle(setting: Setting, themeName: string, input: Extract<Input, { type: "toggle" }>, value: InputValue | undefined): void {
    let control: ToggleComponent | null = null;
    setting.addToggle((t) => {
      control = t;
      t.setValue(typeof value === "boolean" ? value : false);
      t.onChange(async (value) => {
        await this.plugin.setUserInputValue(themeName, input.id, value);
      });
    });
    this.addResetButton(setting, themeName, input, () => {
      if (control) control.setValue(input.default ?? false);
    });
  }

  // Render dropdown input with reset button
  private renderDropdown(setting: Setting, themeName: string, input: Extract<Input, { type: "dropdown" }>, value: InputValue | undefined): void {
    let control: DropdownComponent | null = null;
    setting.addDropdown((d) => {
      control = d;
      for (const option of input.options) d.addOption(option.value, option.label);
      d.setValue(typeof value === "string" ? value : "");
      d.onChange(async (value) => {
        await this.plugin.setUserInputValue(themeName, input.id, value);
      });
    });
    this.addResetButton(setting, themeName, input, () => {
      if (control && input.default !== undefined) control.setValue(input.default);
    });
  }

  // Render single color input with reset button
  private renderSingleColor(setting: Setting, themeName: string, input: Extract<Input, { type: "color" }>, value: InputValue | undefined): void {
    let control: ColorComponent | null = null;
    setting.addColorPicker((c) => {
      control = c;
      c.setValue(typeof value === "string" && value !== "" ? value : COLOR_FALLBACK);
      c.onChange(async (value) => {
        await this.plugin.setUserInputValue(themeName, input.id, value);
      });
    });
    this.addResetButton(setting, themeName, input, () => {
      if (control) control.setValue(input.default ?? COLOR_FALLBACK);
    });
  }

  // Render two (one for each theme mode) color input with reset buttons
  private renderThemedColor(setting: Setting, themeName: string, input: Extract<Input, { type: "color" }>, value: InputValue | undefined): void {
    const initial = (typeof value === "object" && value !== null && "light" in value && "dark" in value)
                      ? { light: typeof value.light === "string" && value.light !== "" ? value.light : COLOR_FALLBACK, dark: typeof value.dark === "string" && value.dark !== "" ? value.dark : COLOR_FALLBACK }
                      : { light: COLOR_FALLBACK, dark: COLOR_FALLBACK };

    let lightControl: ColorComponent | null = null;
    let darkControl: ColorComponent | null = null;

    setting.addColorPicker((c) => {
      lightControl = c;
      c.setValue(initial.light);
      c.onChange(async (value) => {
        const next: ThemedColorValue = { light: value, dark: darkControl?.getValue() ?? initial.dark };
        await this.plugin.setUserInputValue(themeName, input.id, next);
      });
    });
    setting.addColorPicker((c) => {
      darkControl = c;
      c.setValue(initial.dark);
      c.onChange(async (value) => {
        const next: ThemedColorValue = { light: lightControl?.getValue() ?? initial.light, dark: value };
        await this.plugin.setUserInputValue(themeName, input.id, next);
      });
    });

    this.addResetButton(setting, themeName, input, () => {
      lightControl?.setValue(input.defaultLight ?? COLOR_FALLBACK);
      darkControl?.setValue(input.defaultDark ?? COLOR_FALLBACK);
    });
  }

  // Render slider input with reset button
  private renderSlider(setting: Setting, themeName: string, input: Extract<Input, { type: "slider" }>, value: InputValue | undefined): void {
    let control: SliderComponent | null = null;
    setting.addSlider((s) => {
      control = s;
      s.setLimits(input.min, input.max, input.step);
      s.setInstant(true);
      s.setDynamicTooltip();
      s.setValue(typeof value === "number" ? value : input.min);
      s.onChange(async (value) => {
        await this.plugin.setUserInputValue(themeName, input.id, value);
      });
    });
    this.addResetButton(setting, themeName, input, () => {
      if (control && input.default !== undefined) control.setValue(input.default);
    });
  }

  // Add reset button to setting input
  private addResetButton(setting: Setting, themeName: string, input: Input, restoreControl: () => void): void {
    // Return if there are no defaults set
    switch (input.type) {
      case "text":
      case "textarea":
      case "dropdown":
      case "toggle":
      case "slider":
        if (input.default === undefined) return;
        break;
      case "color":
        if (input.themed) {
          if (input.defaultDark === undefined || input.defaultLight === undefined) return;
        } else if (input.default === undefined) return;
    }

    const userValue = this.plugin.themeStore.get(themeName)?.settings?.getUserValue(input.id);
    if (userValue === undefined) return; // Return if user hasn't overridden

    setting.addExtraButton((b) => {
      b.setIcon("rotate-ccw")
       .setTooltip("Reset (use theme default)")
       .onClick(async () => {
         await this.plugin.setUserInputValue(themeName, input.id, undefined);
         restoreControl();
         this.display(); // Rerender so the reset button disappears
       });
    });
  }

  //#endregion

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

    // Labeled details for the failures that carry one
    const details: { label: string; value: string }[] = [];
    if (error.reason === "fetchFailed") {
      details.push({ label: "URL", value: error.url });
      details.push({ label: "Detail", value: error.detail });
    } else if (error.reason === "readFailed" || error.reason === "invalidSettings") {
      details.push({ label: "Detail", value: error.detail });
    }

    // Build list of errors
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

    new Setting(block).setName(titles[error.reason])
                      .setHeading()
                      .setDesc(descriptions[error.reason])
                      .addButton((b) => {
                        b.setButtonText("Copy")
                         .onClick(async () => {
                          await navigator.clipboard.writeText(lines.join("\n"));
                          new Notice("Copied error details");
                        })
                      });

    for (const { label, value } of details) {
      const row = block.createDiv({ cls: "theme-padd-error-detail" });
      row.createDiv({ cls: "theme-padd-error-detail-label", text: label });
      row.createEl("pre", { cls: "theme-padd-error-detail-value", text: value });
    }
  }

  //#endregion

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

  //#endregion
}
