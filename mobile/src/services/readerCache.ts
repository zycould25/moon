import AsyncStorage from "@react-native-async-storage/async-storage";

const locationsKey = (bookId: string) => `moon-reader-locations-v1:${bookId}`;

function normalizeLocations(locations: unknown): string | null {
  try {
    const serialized = typeof locations === "string" ? locations : JSON.stringify(locations);
    const parsed = JSON.parse(serialized) as unknown;
    return Array.isArray(parsed) && parsed.length > 0 ? serialized : null;
  } catch {
    return null;
  }
}

export async function getCachedLocations(bookId: string): Promise<string | null> {
  const cached = await AsyncStorage.getItem(locationsKey(bookId));
  return normalizeLocations(cached);
}

export async function setCachedLocations(bookId: string, locations: unknown): Promise<void> {
  const normalized = normalizeLocations(locations);
  if (normalized) await AsyncStorage.setItem(locationsKey(bookId), normalized);
}

export async function removeCachedLocations(bookId: string): Promise<void> {
  await AsyncStorage.removeItem(locationsKey(bookId));
}
