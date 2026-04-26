export type AddressSearchResult = {
  displayName: string;
  lat: number;
  lng: number;
};

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
};

export async function searchAddresses(query: string): Promise<AddressSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "gb");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Address search failed (${response.status})`);
  }

  const data = (await response.json()) as NominatimResult[];

  return data.map((item) => ({
    displayName: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
  }));
}