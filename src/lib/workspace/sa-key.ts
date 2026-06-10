/**
 * Source the Workspace service-account key from the environment.
 * Sourced, in order of precedence:
 *   1. GOOGLE_WORKSPACE_SA_KEY      — inline JSON
 *   2. GOOGLE_WORKSPACE_SA_KEY_FILE — filesystem path to the SA JSON
 *      (default points at C:/Users/bot/secrets/ins-workspace-sa.json,
 *      which may not exist yet)
 *
 * IMPORTANT: this module must NEVER throw at import/build time. When
 * nothing is configured (the default, including CI) the getter returns
 * null and callers degrade to "not configured".
 */

import { readFileSync } from "node:fs";
import { parseServiceAccountKey, type ServiceAccountKey } from "./google-jwt";

let cached: { key: ServiceAccountKey | null } | null = null;

/** Reset the memoized key (tests + after an env change). */
export function resetWorkspaceSaKeyCache(): void {
  cached = null;
}

export function getWorkspaceServiceAccountKey(): ServiceAccountKey | null {
  if (cached) return cached.key;

  const inline = process.env.GOOGLE_WORKSPACE_SA_KEY?.trim();
  const file = process.env.GOOGLE_WORKSPACE_SA_KEY_FILE?.trim();

  let json: string | null = null;
  if (inline) {
    json = inline;
  } else if (file) {
    try {
      json = readFileSync(file, "utf8");
    } catch {
      json = null; // missing/unreadable — "not configured", never throws
    }
  }

  if (!json) {
    cached = { key: null };
    return null;
  }

  try {
    cached = { key: parseServiceAccountKey(json) };
  } catch {
    cached = { key: null };
  }
  return cached.key;
}

/** True iff a usable SA key is present in the environment. */
export function isWorkspaceSaConfigured(): boolean {
  return getWorkspaceServiceAccountKey() !== null;
}
