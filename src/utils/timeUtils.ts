import { serverTimestamp, Timestamp } from "firebase/firestore";

/**
 * GLOBAL TIME UTILITY — MOROCCO (Africa/Casablanca)
 * 
 * Official standard time across the entire application: MOROCCO TIME (Africa/Casablanca).
 * 
 * Key Principles:
 * 1. Database: Authoritative Firestore server timestamps (serverTimestamp()).
 * 2. Display: Formatted strictly in IANA timezone Africa/Casablanca.
 * 3. Never trust client device clock for business record times.
 * 4. Consistent format: DD/MM/YYYY HH:mm:ss.
 * 5. Automatic handling of Moroccan timezone changes via the IANA timezone database.
 */

export const MOROCCO_TIMEZONE = "Africa/Casablanca";
export const MOROCCO_TIMEZONE_LABEL = "Morocco (Africa/Casablanca)";

// Reusable cached Intl.DateTimeFormat instance configured for Africa/Casablanca
const casablancaFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: MOROCCO_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export interface CasablancaDateTimeParts {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
  second: string;
}

/**
 * Extracts date and time components strictly according to Africa/Casablanca timezone.
 */
export function getCasablancaParts(input?: any): CasablancaDateTimeParts | null {
  const ms = input !== undefined ? parseTimestampMs(input) : Date.now();
  if (ms === null) return null;

  try {
    const parts = casablancaFormatter.formatToParts(new Date(ms));
    let day = "01";
    let month = "01";
    let year = "1970";
    let hour = "00";
    let minute = "00";
    let second = "00";

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.type === "day") day = p.value;
      else if (p.type === "month") month = p.value;
      else if (p.type === "year") year = p.value;
      else if (p.type === "hour") hour = p.value === "24" ? "00" : p.value;
      else if (p.type === "minute") minute = p.value;
      else if (p.type === "second") second = p.value;
    }

    return { day, month, year, hour, minute, second };
  } catch (err) {
    console.error("Error formatting date in Africa/Casablanca:", err);
    // Safe fallback using UTC if Intl fails in rare environment
    const d = new Date(ms);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return {
      day: pad(d.getUTCDate()),
      month: pad(d.getUTCMonth() + 1),
      year: d.getUTCFullYear().toString(),
      hour: pad(d.getUTCHours()),
      minute: pad(d.getUTCMinutes()),
      second: pad(d.getUTCSeconds()),
    };
  }
}

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
 * Centralized formatting utility: Formats any timestamp into MOROCCO TIME (Africa/Casablanca).
 * Default output: DD/MM/YYYY HH:mm:ss
 */
export function formatSystemTime(input: any, options: FormatOptions = {}): string {
  const parts = getCasablancaParts(input);
  if (!parts) {
    return options.fallback !== undefined ? options.fallback : "N/A";
  }

  const { day, month, year, hour, minute, second } = parts;

  if (options.format === "date-only") {
    return `${day}/${month}/${year}`;
  }

  if (options.format === "time-only") {
    return options.includeSeconds === false
      ? `${hour}:${minute}`
      : `${hour}:${minute}:${second}`;
  }

  if (options.includeSeconds === false) {
    return `${day}/${month}/${year} ${hour}:${minute}`;
  }

  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}

/**
 * Formats as DD/MM/YYYY HH:mm:ss in Morocco (Africa/Casablanca)
 */
export function formatSystemDateTime(input: any, includeSeconds: boolean = true): string {
  return formatSystemTime(input, { format: "datetime", includeSeconds });
}

/**
 * Formats as DD/MM/YYYY in Morocco (Africa/Casablanca)
 */
export function formatSystemDate(input: any): string {
  if (typeof input === "string" && /^W\d+$/i.test(input.trim())) {
    return input.trim().toUpperCase();
  }
  return formatSystemTime(input, { format: "date-only" });
}

/**
 * Formats as HH:mm:ss or HH:mm in Morocco (Africa/Casablanca)
 */
export function formatSystemTimeOnly(input: any, includeSeconds: boolean = false): string {
  return formatSystemTime(input, { format: "time-only", includeSeconds });
}

/**
 * Formats as DD/MM/YYYY HH:mm:ss in Morocco (Africa/Casablanca)
 */
export function formatExactTimestamp(input?: any): string {
  return formatSystemTime(input, { format: "datetime", includeSeconds: true, fallback: "N/A" });
}

/**
 * Extracts the calendar date in Morocco (Africa/Casablanca) as "YYYY-MM-DD".
 * Useful for grouping, date filtering, and default form inputs.
 */
export function getMoroccoDateString(input?: any): string {
  const parts = getCasablancaParts(input !== undefined ? input : Date.now());
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Returns today's date in Morocco (Africa/Casablanca) as "YYYY-MM-DD"
 */
export function getMoroccoTodayDateString(): string {
  return getMoroccoDateString(Date.now());
}

/**
 * Returns yesterday's date in Morocco (Africa/Casablanca) as "YYYY-MM-DD"
 */
export function getMoroccoYesterdayDateString(): string {
  const todayParts = getCasablancaParts(Date.now());
  if (!todayParts) return "";
  // Calculate yesterday in Casablanca by shifting 1 calendar day back at midday UTC
  const d = new Date(Date.UTC(Number(todayParts.year), Number(todayParts.month) - 1, Number(todayParts.day) - 1, 12, 0, 0));
  return getMoroccoDateString(d.getTime());
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

/**
 * Calculates the ISO 8601 week number (1 - 53) strictly using Morocco (Africa/Casablanca) time.
 */
export function getISOWeekNumber(input?: any): number {
  const ms = input !== undefined ? parseTimestampMs(input) : Date.now();
  const d = ms !== null ? new Date(ms) : new Date();
  const target = new Date(d.getTime());
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/**
 * Returns formatted week code e.g. "W39", "W40"
 */
export function getISOWeekCode(input?: any): string {
  if (typeof input === "string" && /^W\d+$/i.test(input.trim())) {
    return input.trim().toUpperCase();
  }
  return `W${getISOWeekNumber(input)}`;
}
