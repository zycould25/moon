import Foundation
import MoonEpubFFI

public enum MoonRenditionLayout: String, Codable, Sendable {
    case fixed
    case reflowable
}

public struct MoonEpubMetadata: Codable, Sendable {
    public let title: String
    public let author: String
    public let coverPath: String
    public let renditionLayout: MoonRenditionLayout
    public let pageCount: Int
    public let fileSize: UInt64

    public var coverURL: URL? {
        coverPath.isEmpty ? nil : URL(fileURLWithPath: coverPath)
    }
}

public struct MoonEpubCoreError: Error, LocalizedError, Sendable {
    public let code: String
    public let message: String

    public var errorDescription: String? { message }
}

private struct NativeError: Codable {
    let code: String
    let message: String
}

private struct NativeEnvelope<Value: Codable>: Codable {
    let ok: Bool
    let value: Value?
    let error: NativeError?
}

/// Synchronous native operations intended to be called from a background task.
public enum MoonEpubCore {
    public static func inspect(
        epubURL: URL,
        coverDirectory: URL,
        bookID: String
    ) throws -> MoonEpubMetadata {
        let data = try consume(
            epubURL.path.withCString { epubPath in
                coverDirectory.path.withCString { coverRoot in
                    bookID.withCString { bookID in
                        moon_epub_inspect_json(epubPath, coverRoot, bookID)
                    }
                }
            }
        )
        return try decode(data, as: MoonEpubMetadata.self)
    }

    public static func prepareForReading(
        epubURL: URL,
        artifactsDirectory: URL,
        bookID: String
    ) throws -> URL {
        let data = try consume(
            epubURL.path.withCString { epubPath in
                artifactsDirectory.path.withCString { artifactsRoot in
                    bookID.withCString { bookID in
                        moon_epub_prepare_json(epubPath, artifactsRoot, bookID)
                    }
                }
            }
        )
        let path = try decode(data, as: String.self)
        return URL(fileURLWithPath: path)
    }

    public static func removeArtifacts(
        artifactsDirectory: URL,
        coverDirectory: URL,
        bookID: String
    ) throws {
        let data = try consume(
            artifactsDirectory.path.withCString { artifactsRoot in
                coverDirectory.path.withCString { coverRoot in
                    bookID.withCString { bookID in
                        moon_epub_remove_artifacts_json(artifactsRoot, coverRoot, bookID)
                    }
                }
            }
        )
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard object?["ok"] as? Bool == true else {
            throw nativeError(from: object)
        }
    }

    private static func consume(_ pointer: UnsafeMutablePointer<CChar>?) throws -> Data {
        guard let pointer else {
            throw MoonEpubCoreError(code: "ffi_error", message: "Rust EPUB core returned no data")
        }
        defer { moon_epub_string_free(pointer) }
        guard let data = String(validatingCString: pointer)?.data(using: .utf8) else {
            throw MoonEpubCoreError(code: "ffi_error", message: "Rust EPUB core returned invalid UTF-8")
        }
        return data
    }

    private static func decode<Value: Codable>(
        _ data: Data,
        as type: Value.Type
    ) throws -> Value {
        let envelope = try JSONDecoder().decode(NativeEnvelope<Value>.self, from: data)
        if envelope.ok, let value = envelope.value {
            return value
        }
        throw MoonEpubCoreError(
            code: envelope.error?.code ?? "native_error",
            message: envelope.error?.message ?? "Rust EPUB core failed"
        )
    }

    private static func nativeError(from object: [String: Any]?) -> MoonEpubCoreError {
        let error = object?["error"] as? [String: Any]
        return MoonEpubCoreError(
            code: error?["code"] as? String ?? "native_error",
            message: error?["message"] as? String ?? "Rust EPUB core failed"
        )
    }
}

