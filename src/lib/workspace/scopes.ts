/**
 * Google Workspace OAuth scopes per capability. These are the scopes
 * the SA's Client ID must be granted in the Workspace Admin Console
 * under Security → API controls → Domain-wide delegation.
 */

export const SCOPES = {
  /** Gmail — send mail as the impersonated subject. */
  gmail: "https://www.googleapis.com/auth/gmail.send",
  /** Calendar — create events for tasks/renewals. */
  calendar: "https://www.googleapis.com/auth/calendar",
} as const;

export type WorkspaceCapability = keyof typeof SCOPES;

export const CAPABILITIES: WorkspaceCapability[] = ["gmail", "calendar"];

export const CAPABILITY_LABELS: Record<WorkspaceCapability, string> = {
  gmail: "Gmail (send)",
  calendar: "Calendar (read/write)",
};

/** Space-separated scope set an admin authorizes for the SA Client ID. */
export const ALL_WORKSPACE_SCOPES = CAPABILITIES.map((c) => SCOPES[c]).join(" ");
