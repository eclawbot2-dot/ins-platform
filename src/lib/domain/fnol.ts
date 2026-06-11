/**
 * FNOL (first notice of loss) submitted from the client portal — pure
 * validation. The policy MUST be one the session's client owns (the
 * caller passes the owned-policy id list it loaded with a clientId-
 * scoped query), so a forged policyId in the form body cannot attach a
 * claim to another client's policy.
 */

export type FnolInput = {
  policyId: string;
  dateOfLoss: Date | null;
  description: string;
};

export type FnolResult =
  | { ok: true; value: { policyId: string; dateOfLoss: Date; description: string } }
  | { ok: false; error: string };

export const FNOL_MIN_DESCRIPTION = 10;
/** A loss more than 3 years back is almost certainly a typo'd date. */
export const FNOL_MAX_LOOKBACK_DAYS = 365 * 3;

export function validateFnol(
  input: FnolInput,
  ownedPolicyIds: ReadonlyArray<string>,
  now: Date = new Date(),
): FnolResult {
  if (!input.policyId || !ownedPolicyIds.includes(input.policyId)) {
    return { ok: false, error: "Select one of your policies." };
  }
  if (!input.dateOfLoss || Number.isNaN(input.dateOfLoss.getTime())) {
    return { ok: false, error: "Enter the date of loss." };
  }
  if (input.dateOfLoss.getTime() > now.getTime()) {
    return { ok: false, error: "Date of loss cannot be in the future." };
  }
  const lookbackMs = FNOL_MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  if (now.getTime() - input.dateOfLoss.getTime() > lookbackMs) {
    return { ok: false, error: "Date of loss is too far in the past — please contact the agency directly." };
  }
  const description = input.description.trim();
  if (description.length < FNOL_MIN_DESCRIPTION) {
    return { ok: false, error: `Describe what happened (at least ${FNOL_MIN_DESCRIPTION} characters).` };
  }
  return { ok: true, value: { policyId: input.policyId, dateOfLoss: input.dateOfLoss, description } };
}
