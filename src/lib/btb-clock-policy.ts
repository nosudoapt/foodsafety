import { createHash } from "node:crypto";

export interface ClockPolicy {
  geofence: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  requireNetwork: boolean;
  networks: string[];
  requireDevice: boolean;
}

export interface PresenceInput {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  ip: string | null;
  deviceId: string;
}

const rad = (value: number) => (value * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function ipv4(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

/** IPv4 CIDR or exact IPv6/text match. Empty allowlist denies when required. */
export function ipAllowed(ip: string | null, networks: readonly string[]): boolean {
  if (!ip) return false;
  for (const entry of networks) {
    const rule = entry.trim();
    if (!rule) continue;
    if (!rule.includes("/")) {
      if (rule.toLowerCase() === ip.toLowerCase()) return true;
      continue;
    }
    const [base, bitsRaw] = rule.split("/");
    const bits = Number(bitsRaw);
    const network = ipv4(base), address = ipv4(ip);
    if (network !== null && address !== null && Number.isInteger(bits) && bits >= 0 && bits <= 32) {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if ((network & mask) === (address & mask)) return true;
    }
  }
  return false;
}

/** The first trustworthy proxy address (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || request.headers.get("cf-connecting-ip")?.trim() || null;
}

export function policyFromRow(row: Record<string, unknown> | null | undefined): ClockPolicy {
  return {
    geofence: row?.clock_geofence === true,
    latitude: row?.clock_latitude == null ? null : Number(row.clock_latitude),
    longitude: row?.clock_longitude == null ? null : Number(row.clock_longitude),
    radiusM: Number(row?.clock_radius_m ?? 150),
    requireNetwork: row?.clock_require_network === true,
    networks: Array.isArray(row?.clock_networks) ? row.clock_networks as string[] : [],
    requireDevice: row?.clock_require_device === true,
  };
}

export function deviceHash(employeeId: string, deviceId: string): string {
  return createHash("sha256").update(`btb-clock-device:${employeeId}:${deviceId}`).digest("hex");
}

/** Returns a staff-facing refusal, or null when the presence checks pass. */
export function presenceProblem(policy: ClockPolicy, input: PresenceInput): string | null {
  if (policy.geofence) {
    if (policy.latitude === null || policy.longitude === null) return "This branch has not finished its clock-in location setup. Ask your manager.";
    if (input.latitude === null || input.longitude === null || !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
      return "Allow location access to clock in. The restaurant position is checked on the server.";
    }
    if (input.accuracy === null || !Number.isFinite(input.accuracy) || input.accuracy < 0 || input.accuracy > 300) {
      return "Location accuracy is too weak. Move near a window or step outside, then retry.";
    }
    if (distanceMeters(policy.latitude, policy.longitude, input.latitude, input.longitude) > policy.radiusM) {
      return `You must be within ${policy.radiusM} m of the restaurant to clock in.`;
    }
  }
  if (policy.requireNetwork) {
    if (!policy.networks.length) return "This branch has not configured its restaurant network. Ask your manager.";
    if (!ipAllowed(input.ip, policy.networks)) return "Clock in on the restaurant’s network, not from home or the car park.";
  }
  if (policy.requireDevice && !input.deviceId) return "This device is not set up for time clock. Ask your manager to reset it.";
  return null;
}
