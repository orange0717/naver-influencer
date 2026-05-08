export const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

export function isTrialExpired(trialStartedCookie: string | undefined | null): boolean {
  if (!trialStartedCookie) return false;
  const started = Number(trialStartedCookie);
  if (!Number.isFinite(started)) return false;
  return Date.now() - started > TRIAL_DURATION_MS;
}
