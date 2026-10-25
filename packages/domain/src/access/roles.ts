import type { MembershipRole } from "@rentmate/types";

export function isOwnerOrAdmin(role: string): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}

export function isOwner(role: string): boolean {
  return role === "owner";
}

/**
 * Legacy Edge Function named this `owner()` but it means “caller is staff” (403 owner only).
 */
export function isStaffOnly(role: string): boolean {
  return !isOwnerOrAdmin(role);
}
