//#region Types/Objects/Interfaces

export type Scope =
{ kind: "dev"; themeName: string }
| { kind: "custom"; themeName: string }
| { kind: "global" };

//#endregion

// Build the Obsidian-bound key string
export function encodeKey(scope: Scope, id: string): string {
  switch (scope.kind) {
    case "dev": return `dev:theme:${scope.themeName}:${id}`;
    case "custom": return `custom:theme:${scope.themeName}:${id}`;
    case "global": return `global:${id}`;
  }
}

// Quick list of key prefixes for every encoded key tied to a given theme
export function themeKeyPrefixes(themeName: string): string[] {
  return [`dev:theme:${themeName}:`, `custom:theme:${themeName}:`];
}

// Recover the scope and the dev's id from an Obsidian-bound key string
export function decodeKey(key: string): { scope: Scope; id: string } | null {
  if (key.startsWith("global:")) {
    return { scope: { kind: "global" }, id: key.slice("global:".length) };
  }
  if (key.startsWith("dev:theme:")) {
    const rest = key.slice("dev:theme:".length);
    const colonIdx = rest.indexOf(":");
    if (colonIdx < 0) return null;
    return {
      scope: { kind: "dev", themeName: rest.slice(0, colonIdx) },
      id: rest.slice(colonIdx + 1),
    };
  }
  if (key.startsWith("custom:theme:")) {
    const rest = key.slice("custom:theme:".length);
    const colonIdx = rest.indexOf(":");
    if (colonIdx < 0) return null;
    return {
      scope: { kind: "custom", themeName: rest.slice(0, colonIdx) },
      id: rest.slice(colonIdx + 1),
    };
  }
  return null;
}
