import { requireOptionalNativeModule } from "expo";

export interface NativeEpubMetadata {
  title: string;
  author: string;
  coverUri: string;
  renditionLayout: "fixed" | "reflowable";
  pageCount: number;
  fileSize: number;
}

interface MoonEpubNativeModule {
  inspect(fileUri: string, bookId: string): Promise<NativeEpubMetadata>;
  prepareForReading(fileUri: string, bookId: string): Promise<string>;
  removeArtifacts(bookId: string): Promise<void>;
}

export async function prepareEpubForReading(
  fileUri: string,
  bookId: string,
): Promise<string | null> {
  if (!nativeModule) return null;
  return nativeModule.prepareForReading(fileUri, bookId);
}

export async function removeEpubArtifacts(bookId: string): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.removeArtifacts(bookId);
}

const nativeModule = requireOptionalNativeModule<MoonEpubNativeModule>("MoonEpub");

export async function inspectEpub(
  fileUri: string,
  bookId: string,
): Promise<NativeEpubMetadata | null> {
  if (!nativeModule) return null;
  return nativeModule.inspect(fileUri, bookId);
}
