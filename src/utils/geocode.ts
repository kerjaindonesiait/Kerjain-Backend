/** Approximate centroids for Jabodetabek areas (fallback when geocoder unavailable). */
const AREA_COORDS: Record<string, { lat: number; lng: number }> = {
  "Jakarta Pusat": { lat: -6.1754, lng: 106.8272 },
  "Jakarta Selatan": { lat: -6.2615, lng: 106.8106 },
  "Jakarta Barat": { lat: -6.1671, lng: 106.7563 },
  "Jakarta Timur": { lat: -6.225, lng: 106.9 },
  "Jakarta Utara": { lat: -6.1384, lng: 106.903 },
  Depok: { lat: -6.4025, lng: 106.7942 },
  Tangerang: { lat: -6.1783, lng: 106.6319 },
  "Tangerang Selatan": { lat: -6.2835, lng: 106.7113 },
  Bekasi: { lat: -6.2383, lng: 106.9756 },
  Bogor: { lat: -6.595, lng: 106.816 },
};

export type Coordinates = { latitude: number; longitude: number };

export async function geocodeJobLocation(
  area: string,
  alamat?: string | null,
): Promise<Coordinates | null> {
  const query = [alamat?.trim(), area, "Jakarta, Indonesia"].filter(Boolean).join(", ");

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "id");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "KerjaIn/1.0 (contact@kerjain.id)" },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const results = (await res.json()) as { lat: string; lon: string }[];
      if (results[0]) {
        return {
          latitude: parseFloat(results[0].lat),
          longitude: parseFloat(results[0].lon),
        };
      }
    }
  } catch {
    // fall through to area centroid
  }

  const fallback = AREA_COORDS[area];
  if (!fallback) return null;
  return { latitude: fallback.lat, longitude: fallback.lng };
}
