"use client";

// Dashboard header site switcher. Owners/multi-location owners pick which
// location is active; every scoped query (dashboard counters, prep, orders,
// cleaning) follows that choice without a reload or a re-login. Everyone else
// never sees it — a staff tablet has exactly one site to work against.
import { MapPin } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canSwitchLocation } from "@/lib/locations";

export default function LocationSwitcher() {
  const { role, locations, locationId, setLocationId } = useAuth();

  if (!canSwitchLocation(role) || locations.length === 0) return null;

  return (
    <label className="location-picker">
      <MapPin className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
      <span className="sr-only">Active location</span>
      <select
        value={locationId ?? ""}
        onChange={(e) => setLocationId(e.target.value)}
        title="Switch location"
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
