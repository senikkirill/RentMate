/** Matches live `garages.expires_at` semantics in the Edge Function. */
export function isSubscriptionActive(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (expiresAt == null || expiresAt === "") return true;
  return new Date(expiresAt) > now;
}

/** Mutations are blocked when expired; snapshot always allowed. */
export function requiresActiveSubscription(action: string): boolean {
  return action !== "snapshot";
}

export function isSubscriptionGateClosed(
  action: string,
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return requiresActiveSubscription(action) && !isSubscriptionActive(expiresAt, now);
}
