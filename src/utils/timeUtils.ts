import { serverTimestamp, Timestamp } from "firebase/firestore";

/**
 * GLOBAL TIME UTILITY — MOROCCO GMT+1
 * 
 * Official standard time across the entire application: MOROCCO TIME (GMT+1 / UTC+1).
 * 
 * Key Principles:
 * 1. Database: Authoritative Firestore server timestamps (serverTimestamp()).
 * 2. Display: Formatted strictly in Morocco GMT+1 (UTC+1).
 * 3. Never trust client device clock for business record times.
 * 4. Consistent format: DD/MM/YYYY HH:mm:ss.
 */

export const MOROCCO_TIMEZONE = "Africa/Casablanca";
export const MOROCCO_TIMEZONE_LABEL = "Morocco GMT+1";
// Morocco standard time is GMT+1 (1 hour ahead of UTC: +3,600,000 milliseconds)
export const MOROCCO_OFFSET_MS = 3600000;

/**
 * Returns Firestore's authoritative server timestamp Sentinel.
 * Use this whenever committing business records to the database.
 */
export const getServerTimestamp = () => serverTimestamp();

/**
 * Safely parses any timestamp value into UTC epoch milliseconds.
 * Supports Firestore Timestamp, ISO strings, epoch numbers, Date objects.
 */
export function parseTimestampMs(input: any): number | null {
  if (input === null || input === undefined || input === "") return null;

  // Firestore Timestamp with .toMillis()
  if (typeof input === "object" && typeof input.toMillis === "function") {
    return input.toMillis();
  }

  // Firestore Timestamp with .toDate()
  if (typeof input === "object" && typeof input.toDate === "function") {
    return input.toDate().getTime();
  }

  // Raw Firestore Timestamp object { seconds, nanoseconds }
  if (typeof input === "object" && typeof input.seconds === "number") {
    return input.seconds * 1000 + Math.floor((input.nanoseconds || 0) / 1000000);
  }

  // JS Date instance
  if (input instanceof Date) {
    const t = input.getTime();
    return isNaN(t) ? null : t;
  }

  // Epoch number (ms or seconds)
  if (typeof input === "number") {
    if (isNaN(input)) return null;
    // Heuristic: if less than 10 billion, it's seconds, convert to ms
    return input < 10000000000 ? input * 1000 : input;
  }

  // String parsing
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Numeric string epoch
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      return num < 10000000000 ? num * 1000 : num;
    }

    // YYYY-MM-DD date string
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(trimmed + "T00:00:00Z");
      return isNaN(d.getTime()) ? null : d.getTime();
    }

    const d = new Date(trimmed);
    const t = d.getTime();
    return isNaN(t) ? null : t;
  }

  // Fallback for Firestore FieldValue sentinel or unknown object
  if (typeof input === "object") {
    return Date.now();
  }

  return null;
}

/**
 * Converts any timestamp into a clean UTC ISO string for normalized state storage.
 */
export function normalizeTimestampToISO(input: any): string {
  const ms = parseTimestampMs(input);
  if (ms === null) return "";
  return new Date(ms).toISOString();
}

/**
 * Normalizes common timestamp fields in Firestore documents so that components
 * receive consistent, serializable ISO strings without breaking when encountering
 * raw Firestore Timestamp objects.
 */
export function normalizeDocTimestamps<T extends Record<string, any>>(data: T): T {
  if (!data || typeof data !== "object") return data;

  const res: any = { ...data };
  const keysToNormalize = [
    "timestamp",
    "createdAt",
    "updatedAt",
    "lastUpdate",
    "validatedAt",
    "approvedAt",
    "cancelledAt",
    "scannedAt"
  ];

  for (const key of keysToNormalize) {
    if (res[key] !== undefined && res[key] !== null) {
      // If it is a Firestore Timestamp object or number
      if (
        (typeof res[key] === "object" && ("seconds" in res[key] || typeof res[key].toDate === "function")) ||
        typeof res[key] === "number"
      ) {
        res[key] = normalizeTimestampToISO(res[key]);
      }
    }
  }

  return res as T;
}

export interface FormatOptions {
  format?: "datetime" | "date-only" | "time-only";
  includeSeconds?: boolean;
  fallback?: string;
}

/**
 * Centralized formatting utility: Formats any timestamp into MOROCCO TIME (GMT+1).
 * Default output: DD/MM/YYYY HH:mm:ss
 */
export function formatSystemTime(input: any, options: FormatOptions = {}): string {
  const ms = parseTimestampMs(input);
  if (ms === null) {
    return options.fallback !== undefined ? options.fallback : "N/A";
  }

  // Shift by Morocco GMT+1 offset (+1 hour)
  const shifted = new Date(ms + MOROCCO_OFFSET_MS);
  const pad = (n: number) => n.toString().padStart(2, "0");

  const day = pad(shifted.getUTCDate());
  const month = pad(shifted.getUTCMonth() + 1);
  const year = shifted.getUTCFullYear();
  const hours = pad(shifted.getUTCHours());
  const minutes = pad(shifted.getUTCMinutes());
  const seconds = pad(shifted.getUTCSeconds());

  if (options.format === "date-only") {
    return `${day}/${month}/${year}`;
  }

  if (options.format === "time-only") {
    return options.includeSeconds === false
      ? `${hours}:${minutes}`
      : `${hours}:${minutes}:${seconds}`;
  }

  if (options.includeSeconds === false) {
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Formats as DD/MM/YYYY HH:mm:ss in Morocco GMT+1
 */
export function formatSystemDateTime(input: any, includeSeconds: boolean = true): string {
  return formatSystemTime(input, { format: "datetime", includeSeconds });
}

/**
 * Formats as DD/MM/YYYY in Morocco GMT+1
 */
export function formatSystemDate(input: any): string {
  return formatSystemTime(input, { format: "date-only" });
}

/**
 * Formats as HH:mm:ss or HH:mm in Morocco GMT+1
 */
export function formatSystemTimeOnly(input: any, includeSeconds: boolean = false): string {
  return formatSystemTime(input, { format: "time-only", includeSeconds });
}

/**
 * SupervisorWorkspace alias: Formats as DD/MM/YYYY HH:mm:ss in Morocco GMT+1
 */
export function formatExactTimestamp(input?: any): string {
  return formatSystemTime(input, { format: "datetime", includeSeconds: true, fallback: "N/A" });
}

/**
 * Extracts the calendar date in Morocco GMT+1 as "YYYY-MM-DD".
 * Useful for grouping, date filtering, and default form inputs.
 */
export function getMoroccoDateString(input?: any): string {
  const ms = input ? parseTimestampMs(input) : Date.now();
  if (ms === null) return "";
  const shifted = new Date(ms + MOROCCO_OFFSET_MS);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = shifted.getUTCFullYear();
  const month = pad(shifted.getUTCMonth() + 1);
  const day = pad(shifted.getUTCDate());
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's date in Morocco GMT+1 as "YYYY-MM-DD"
 */
export function getMoroccoTodayDateString(): string {
  return getMoroccoDateString(Date.now());
}

/**
 * Returns yesterday's date in Morocco GMT+1 as "YYYY-MM-DD"
 */
export function getMoroccoYesterdayDateString(): string {
  const yesterdayMs = Date.now() - 24 * 60 * 60 * 1000;
  return getMoroccoDateString(yesterdayMs);
}

/**
 * Calculates a friendly relative time (e.g., "Just now", "5m ago")
 * relative to the current moment.
 */
export function getSystemRelativeTime(input: any): string {
  const ms = parseTimestampMs(input);
  if (ms === null) return "";
  const now = Date.now();
  const diff = now - ms;

  if (diff < 0) return "Just now"; // server timestamp slightly ahead of client clock
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Compares two timestamps for descending sorting (most recent first)
 */
export function compareTimestampsDesc(a: any, b: any): number {
  const timeA = parseTimestampMs(a) || 0;
  const timeB = parseTimestampMs(b) || 0;
  return timeB - timeA;
}
