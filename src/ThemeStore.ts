import { Theme } from "./Theme";

export class ThemeStore {
  private themes: Map<string, Theme> = new Map();

  // Get theme by name
  get(name: string): Theme | undefined {
    return this.themes.get(name);
  }

  // Get active theme, if any
  getActive(): Theme | undefined {
    for (const theme of this.themes.values()) {
      if (theme.isActive) return theme;
    }
    return undefined;
  }

  // Set active theme by name, ensuring at most one theme has isActive
  setActive(name: string | null): void {
    // Clear the currently active theme (if any) when switching away from it
    const current = this.getActive();
    if (current && current.name !== name) current.isActive = false;

    // Activate the new theme
    if (name) {
      const theme = this.get(name);
      if (theme) theme.isActive = true;
    }
  }

  // Get if specific theme has dev settings
  hasDevSettings(name: string): boolean {
    return this.get(name)?.settings !== null;
  }

  // Get if specific theme has customization settings
  hasCustomizationSettings(name: string): boolean {
    return this.get(name)?.customizationSettings !== undefined && this.get(name)?.customizationSettings !== null;
  }

  // Iterate all themes in the store
  all(): Iterable<Theme> {
    return this.themes.values();
  }

  // Get or create a theme by name
  upsert(name: string): Theme {
    let theme = this.themes.get(name);
    if (!theme) {
      theme = new Theme(name);
      this.themes.set(name, theme);
    }
    return theme;
  }

  // Remove theme by name
  remove(name: string): void {
    this.themes.delete(name);
  }
}
