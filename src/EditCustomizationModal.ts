import { Modal, Setting } from "obsidian";
import ThemePADDPlugin from "./main";
import { parseThemeSettingsText, ThemeSettingsJSON, SETTINGS_JSON_SCHEMA_VERSION } from "./ThemeSettingsSchema";
import { ThemeSettings } from "./ThemeSettings";

//#region Constants

const EMPTY_TEMPLATE = `{
  "schemaVersion": ${SETTINGS_JSON_SCHEMA_VERSION},
  "settingItems": []
}`;

//#endregion

export class EditCustomizationModal extends Modal {
  private title: string;
  private current: ThemeSettings | null;
  private onSave: (newSettings: ThemeSettingsJSON | null) => Promise<void> | void;
  private rawValue!: string;
  private errorEl!: HTMLElement;

  constructor(
    plugin: ThemePADDPlugin,
    title: string,
    current: ThemeSettings | null,
    onSave: (newSettings: ThemeSettingsJSON | null) => Promise<void> | void
  ) {
    super(plugin.app);
    this.title = title;
    this.current = current;
    this.onSave = onSave;
  }

  onOpen(): void {
    this.setTitle(this.title);

    const { contentEl } = this;

    // Header
    new Setting(contentEl)
      .setName("Settings")
      .setDesc("Edit as JSON. Save with an empty body to delete.");

    // Render text area input
    new Setting(contentEl)
      .setClass("theme-padd-customization-editor")
      .addTextArea((t) => {
        const initialValue = this.serializeForEditor(this.current);
        this.rawValue = initialValue;
        t.setValue(initialValue).onChange((value) => {
          this.rawValue = value;
        });
        t.inputEl.rows = 20;
      });

    // Render error section
    this.errorEl = contentEl.createDiv({ cls: "theme-padd-customization-editor-error" });
    this.errorEl.toggleVisibility(false);

    // Render save/cancel buttons
    const buttonRow = contentEl.createDiv({ cls: "theme-padd-customization-editor-buttons" });
    new Setting(buttonRow)
      .addButton((b) => {
        b.setButtonText("Cancel")
         .onClick(() => this.close());
      })
      .addButton((b) => {
        b.setButtonText("Save")
         .setCta()
         .onClick(async () => {
            const text = this.rawValue.trim();

            // Empty body = user deletion
            if (text === "") {
              await this.onSave(null);
              this.close();
              return;
            }

            // Check input, if any
            const result = parseThemeSettingsText(text);
            if (!result.ok) { // Malformed settings
              this.errorEl.setText(result.reason);
              this.errorEl.toggleVisibility(true);
              return;
            }

            // Empty settings (no settingItems) is treated the same as deletion
            if (result.data.settingItems.length === 0) {
              await this.onSave(null);
              this.close();
              return;
            }

            await this.onSave(result.data);
            this.close();
        });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  //#region Utilities

  // JSON serialize for editor input
  // NOTE: Hides themeVersion so the user only sees the fields they actually author
  private serializeForEditor(current: ThemeSettings | null): string {
    if (!current) return EMPTY_TEMPLATE;
    const projected = {
      schemaVersion: current.schemaVersion,
      settingItems: current.settingItems
    };
    return JSON.stringify(projected, null, 2);
  }

  //#endregion
}
