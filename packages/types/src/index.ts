/**
 * Shared domain types for web, Mini App, and API.
 *
 * CURRENT types match live Postgres / Edge Functions (garage = organization).
 * PLANNED types are the SaaS model that does not exist in the database yet.
 * Do not treat PLANNED fields as queryable columns.
 */

export type EntityStatus = "current" | "planned";

export type MembershipRole = "owner" | "admin" | "staff";

/** Live tenant id (`garages.id`). API should expose this as organizationId. */
export type OrganizationId = number;

export type TelegramUserId = string;

/** Supabase Auth user id (`auth.users.id`). Present after migration 003 + web signup. */
export type AuthUserId = string;

export interface Organization {
  readonly entityStatus: "current";
  id: OrganizationId;
  name: string;
  inviteCode: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface User {
  readonly entityStatus: "current";
  /** Primary key in live DB today. Empty string only in types/tests for email-only placeholders. */
  telegramId: TelegramUserId;
  activeOrganizationId: OrganizationId;
  role: MembershipRole;
  name: string;
  createdAt: string;
  /** Set after `003_auth_email_identity.sql` and Supabase Auth signup. */
  authUserId?: AuthUserId | null;
  email?: string | null;
}

/** Row shape for web session (Supabase Auth + app user). */
export interface WebSessionUser {
  readonly entityStatus: "current";
  authUserId: AuthUserId;
  email: string;
  activeOrganizationId: OrganizationId;
  role: MembershipRole;
  name: string;
  /** Set when the same person also uses Telegram. */
  telegramId?: TelegramUserId | null;
}

export interface Membership {
  readonly entityStatus: "current";
  telegramId: TelegramUserId;
  organizationId: OrganizationId;
  role: MembershipRole;
}

export interface Employee {
  readonly entityStatus: "current";
  telegramId: TelegramUserId;
  organizationId: OrganizationId;
  role: Exclude<MembershipRole, "owner"> | "owner";
  name: string;
}

export interface Vehicle {
  readonly entityStatus: "current";
  id: number;
  organizationId: OrganizationId;
  board: string;
  boardNo: string;
  model: string;
  year: number | null;
  photoUrl: string | null;
  trackKm: boolean;
  trackMh: boolean;
  statusManual: VehicleManualStatus | null;
  serviceIntervalKm: number | null;
  serviceIntervalMh: number | null;
  serviceBaseKm: number | null;
  serviceBaseMh: number | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  marketPrice: number | null;
  priceAt: string | null;
}

export type VehicleManualStatus = "free" | "out" | "fuel" | "lowfuel" | "service";

export type MarkKind = "out" | "in" | "service" | "mileage";

export interface Mark {
  readonly entityStatus: "current";
  id: number;
  organizationId: OrganizationId;
  unitId: number;
  kind: MarkKind;
  at: string;
  who: TelegramUserId | null;
  mileage: number | null;
  engineHours: number | null;
  fuel: number | null;
  dueAt: string | null;
  damage: boolean | null;
  note: string | null;
  closedAt: string | null;
  dismissedAt: string | null;
  tripId: number | null;
}

export interface Trip {
  readonly entityStatus: "current";
  id: number;
  organizationId: OrganizationId;
  plannedHours: number;
  startAt: string;
  endAt: string | null;
  createdBy: TelegramUserId | null;
  lateNotified: boolean;
}

export interface TripUnit {
  readonly entityStatus: "current";
  tripId: number;
  unitId: number;
  outMarkId: number | null;
  inMarkId: number | null;
}

export type PartStatus = string;

export interface Part {
  readonly entityStatus: "current";
  id: number;
  organizationId: OrganizationId;
  unitId: number;
  title: string;
  node: string | null;
  status: PartStatus;
  urgency: string | null;
  eta: string | null;
}

export interface Subscription {
  readonly entityStatus: "current";
  organizationId: OrganizationId;
  active: boolean;
  expiresAt: string | null;
}

export interface Customer {
  readonly entityStatus: "planned";
  id: string;
  organizationId: OrganizationId | string;
  name: string;
  phone: string | null;
}

export interface Booking {
  readonly entityStatus: "planned";
  id: string;
  organizationId: OrganizationId | string;
  customerId: string;
  vehicleIds: Array<number | string>;
  startsAt: string;
  endsAt: string;
  status: "draft" | "confirmed" | "cancelled" | "completed";
}

export interface RouteCatalog {
  readonly entityStatus: "planned";
  id: string;
  organizationId: OrganizationId | string;
  name: string;
}

export interface OperatingHours {
  readonly entityStatus: "planned";
  organizationId: OrganizationId | string;
  timezone: string;
}

export interface MaintenanceEvent {
  readonly entityStatus: "planned";
  id: string;
  organizationId: OrganizationId | string;
  vehicleId: number | string;
  at: string;
}

export interface Expense {
  readonly entityStatus: "planned";
  id: string;
  organizationId: OrganizationId | string;
  amount: number;
  currency: string;
}

export interface Revenue {
  readonly entityStatus: "planned";
  id: string;
  organizationId: OrganizationId | string;
  amount: number;
  currency: string;
}

export interface NotificationRecord {
  readonly entityStatus: "planned";
  id: string;
  organizationId: OrganizationId | string;
  channel: "telegram" | "email" | "in_app";
  status: "queued" | "sent" | "failed";
}

export function isPlanned<T extends { entityStatus: EntityStatus }>(
  value: T,
): value is T & { entityStatus: "planned" } {
  return value.entityStatus === "planned";
}

export function isCurrent<T extends { entityStatus: EntityStatus }>(
  value: T,
): value is T & { entityStatus: "current" } {
  return value.entityStatus === "current";
}

export const LEGACY_TABLE = {
  organizations: "garages",
  organizationId: "garage_id",
  vehicles: "units",
} as const;
