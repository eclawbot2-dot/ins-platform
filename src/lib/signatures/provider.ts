/**
 * E-signature provider seam (Wave D-final, deferred-API).
 *
 * Provider-agnostic, env-gated, DORMANT by default — mirrors the AI /
 * Xero adapter pattern. With no provider configured the agency runs the
 * MANUAL flow: generate a printable "sign here" packet, send it, and
 * mark it signed by hand. The DocuSign / Dropbox-Sign branches are seams
 * only — they THROW a clearly-labelled "not configured" error so a
 * future wave can wire a real envelope API in one place.
 *
 *   ESIGN_PROVIDER = docusign | dropbox_sign   (unset → manual)
 *   plus provider-specific keys (DOCUSIGN_*, DROPBOX_SIGN_API_KEY) that
 *   live as EMPTY placeholders in .env.example until that wave lands.
 */

import type { SignatureProvider } from "@prisma/client";

/** Which provider is active, derived from env. Defaults to MANUAL. */
export function configuredProvider(): SignatureProvider {
  const raw = (process.env.ESIGN_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "docusign") return "DOCUSIGN";
  if (raw === "dropbox_sign" || raw === "dropbox-sign" || raw === "hellosign") return "DROPBOX_SIGN";
  return "MANUAL";
}

/** Is a real e-sign provider wired up (vs the manual print-and-sign flow)? */
export function eSignEnabled(): boolean {
  const provider = configuredProvider();
  if (provider === "DOCUSIGN") {
    return Boolean(
      process.env.DOCUSIGN_INTEGRATION_KEY &&
        process.env.DOCUSIGN_USER_ID &&
        process.env.DOCUSIGN_ACCOUNT_ID,
    );
  }
  if (provider === "DROPBOX_SIGN") {
    return Boolean(process.env.DROPBOX_SIGN_API_KEY);
  }
  return false;
}

export type EnvelopeInput = {
  title: string;
  signerName: string;
  signerEmail: string;
  message?: string | null;
  documentPath?: string | null;
};

export type EnvelopeResult = {
  envelopeId: string;
  /** Hosted-signing URL when the provider returns one. */
  signUrl?: string | null;
};

/**
 * Dispatch an envelope through the active provider. In MANUAL mode this
 * is never called (the action records a SENT request without an
 * envelope); the real-provider branches are dormant seams that throw a
 * descriptive error until a future wave implements them.
 */
export async function dispatchEnvelope(input: EnvelopeInput): Promise<EnvelopeResult> {
  const provider = configuredProvider();
  if (provider === "DOCUSIGN") {
    if (!eSignEnabled()) {
      throw new Error("DocuSign selected (ESIGN_PROVIDER=docusign) but DOCUSIGN_* keys are not set.");
    }
    // Seam: a future wave wires the DocuSign eSignature REST envelope here.
    throw new Error("DocuSign adapter is a dormant seam — not implemented in this wave.");
  }
  if (provider === "DROPBOX_SIGN") {
    if (!eSignEnabled()) {
      throw new Error("Dropbox Sign selected (ESIGN_PROVIDER=dropbox_sign) but DROPBOX_SIGN_API_KEY is not set.");
    }
    // Seam: a future wave wires the Dropbox Sign signature_request API here.
    throw new Error("Dropbox Sign adapter is a dormant seam — not implemented in this wave.");
  }
  throw new Error("No e-signature provider configured — use the manual print-and-sign flow.");
}
