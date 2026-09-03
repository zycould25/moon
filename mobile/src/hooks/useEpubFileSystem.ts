import { useCallback, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";

type StringEncoding = "utf8" | "base64";

interface StringOptions {
  encoding?: StringEncoding;
}

const readerRuntimeFiles = new Set(["jszip.min.js", "epub.min.js"]);

function getUtf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function toEncoding(options?: StringOptions): FileSystem.ReadingOptions | FileSystem.WritingOptions {
  return {
    encoding: options?.encoding === "base64"
      ? FileSystem.EncodingType.Base64
      : FileSystem.EncodingType.UTF8,
  };
}

/**
 * Expo SDK 54+ moved the classic async filesystem methods under /legacy.
 * The upstream epub adapter still imports them from the modern entry point,
 * where they throw at runtime, so the reader never gets as far as WebView.
 */
export function useEpubFileSystem() {
  const [file, setFile] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [size, setSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const readAsStringAsync = useCallback((fileUri: string, options?: StringOptions) => (
    FileSystem.readAsStringAsync(fileUri, toEncoding(options) as FileSystem.ReadingOptions)
  ), []);

  const writeAsStringAsync = useCallback(async (
    fileUri: string,
    contents: string,
    options?: StringOptions,
  ) => {
    try {
      const fileName = fileUri.slice(fileUri.lastIndexOf("/") + 1);
      if (readerRuntimeFiles.has(fileName)) {
        const info = await FileSystem.getInfoAsync(fileUri);
        if (info.exists && !info.isDirectory && info.size === getUtf8ByteLength(contents)) {
          return;
        }
      }

      await FileSystem.writeAsStringAsync(
        fileUri,
        contents,
        toEncoding(options) as FileSystem.WritingOptions,
      );
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    }
  }, []);

  const deleteAsync = useCallback((fileUri: string) => (
    FileSystem.deleteAsync(fileUri, { idempotent: true })
  ), []);

  const getFileInfo = useCallback(async (fileUri: string) => {
    const info = await FileSystem.getInfoAsync(fileUri);
    return {
      uri: info.uri,
      exists: info.exists,
      isDirectory: info.exists ? info.isDirectory : false,
      size: info.exists ? info.size : undefined,
    };
  }, []);

  const downloadFile = useCallback(async (fromUrl: string, toFile: string) => {
    const destinationDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!destinationDirectory) {
      const message = "设备没有可用的下载目录";
      setError(message);
      return { uri: null, mimeType: null };
    }

    setDownloading(true);
    setProgress(0);
    setSuccess(false);
    setError(null);

    try {
      const task = FileSystem.createDownloadResumable(
        fromUrl,
        `${destinationDirectory}${toFile}`,
        { cache: true },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            setProgress(Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100));
          }
        },
      );
      const result = await task.downloadAsync();
      if (!result) throw new Error("下载 EPUB 失败");

      const contentLength = result.headers?.["Content-Length"]
        ?? result.headers?.["content-length"];
      if (contentLength) setSize(Number(contentLength));
      setFile(result.uri);
      setSuccess(true);
      return { uri: result.uri, mimeType: result.mimeType ?? null };
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return { uri: null, mimeType: null };
    } finally {
      setDownloading(false);
    }
  }, []);

  return {
    file,
    progress,
    downloading,
    size,
    error,
    success,
    documentDirectory: FileSystem.documentDirectory,
    cacheDirectory: FileSystem.cacheDirectory,
    bundleDirectory: FileSystem.bundleDirectory ?? undefined,
    readAsStringAsync,
    writeAsStringAsync,
    deleteAsync,
    downloadFile,
    getFileInfo,
  };
}
