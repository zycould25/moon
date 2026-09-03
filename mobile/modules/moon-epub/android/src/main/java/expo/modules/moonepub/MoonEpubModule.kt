package expo.modules.moonepub

import android.net.Uri
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File

/** Thin Android adapter. EPUB parsing, extraction, and cache validation live in Rust. */
class MoonEpubModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MoonEpub")

    AsyncFunction("inspect") Coroutine { fileUri: String, bookId: String ->
      val value = unwrap(
        MoonEpubNative.inspectJson(
          epubPath(fileUri),
          coversRoot().absolutePath,
          bookId,
        ),
      ) as JSONObject
      mapOf(
        "title" to value.getString("title"),
        "author" to value.getString("author"),
        "coverUri" to value.getString("coverPath")
          .takeIf(String::isNotBlank)
          ?.let { Uri.fromFile(File(it)).toString() }
          .orEmpty(),
        "renditionLayout" to value.getString("renditionLayout"),
        "pageCount" to value.getInt("pageCount"),
        "fileSize" to value.getLong("fileSize"),
      )
    }

    AsyncFunction("prepareForReading") Coroutine { fileUri: String, bookId: String ->
      val packagePath = unwrap(
        MoonEpubNative.prepareJson(
          epubPath(fileUri),
          artifactsRoot().absolutePath,
          bookId,
        ),
      ) as String
      Uri.fromFile(File(packagePath)).toString()
    }

    AsyncFunction("removeArtifacts") Coroutine { bookId: String ->
      unwrap(
        MoonEpubNative.removeArtifactsJson(
          artifactsRoot().absolutePath,
          coversRoot().absolutePath,
          bookId,
        ),
      )
    }
  }

  private fun epubPath(fileUri: String): String =
    Uri.parse(fileUri).path ?: throw IllegalArgumentException("Invalid EPUB URI")

  private fun artifactsRoot(): File =
    File(appContext.cacheDirectory, "moon-epub-unpacked")

  private fun coversRoot(): File =
    File(appContext.persistentFilesDirectory, "moon-covers")

  private fun unwrap(json: String): Any {
    val envelope = JSONObject(json)
    if (!envelope.optBoolean("ok")) {
      val error = envelope.optJSONObject("error")
      val code = error?.optString("code").orEmpty()
      val message = error?.optString("message").orEmpty().ifBlank { "Rust EPUB core failed" }
      throw IllegalArgumentException(if (code.isBlank()) message else "$code: $message")
    }
    return envelope.get("value")
  }
}

internal object MoonEpubNative {
  init {
    System.loadLibrary("moon_epub_ffi")
  }

  external fun inspectJson(epubPath: String, coverRoot: String, bookId: String): String

  external fun prepareJson(epubPath: String, artifactsRoot: String, bookId: String): String

  external fun removeArtifactsJson(
    artifactsRoot: String,
    coverRoot: String,
    bookId: String,
  ): String
}
