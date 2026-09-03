//! Stable platform adapters for `moon-epub-core`.
//!
//! The C ABI is consumable by Swift and other native clients. Android's JNI
//! exports call the exact same implementation and only translate strings.

use moon_epub_core::{
    extract_all_to, extract_resource_to, inspect_path, EpubMetadata, RenditionLayout,
};
use serde::Serialize;
use std::ffi::{c_char, CStr, CString};
use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InspectValue {
    title: String,
    author: String,
    cover_path: String,
    rendition_layout: RenditionLayout,
    page_count: usize,
    file_size: u64,
}

#[derive(Serialize)]
struct Success<T> {
    ok: bool,
    value: T,
}

#[derive(Serialize)]
struct Failure {
    ok: bool,
    error: ErrorValue,
}

#[derive(Serialize)]
struct ErrorValue {
    code: &'static str,
    message: String,
}

fn success<T: Serialize>(value: T) -> String {
    serde_json::to_string(&Success { ok: true, value })
        .unwrap_or_else(|_| internal_failure("unable to serialize native result"))
}

fn failure(code: &'static str, message: impl Into<String>) -> String {
    serde_json::to_string(&Failure {
        ok: false,
        error: ErrorValue {
            code,
            message: message.into(),
        },
    })
    .unwrap_or_else(|_| internal_failure("unable to serialize native error"))
}

fn internal_failure(message: &str) -> String {
    format!(
        "{{\"ok\":false,\"error\":{{\"code\":\"internal\",\"message\":{}}}}}",
        serde_json::to_string(message).unwrap_or_else(|_| "\"internal error\"".to_owned())
    )
}

fn validate_book_id(book_id: &str) -> Result<(), String> {
    if !book_id.is_empty()
        && book_id.len() <= 128
        && book_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        Ok(())
    } else {
        Err("invalid book id".to_owned())
    }
}

/// Inspect an EPUB using the shared platform contract.
///
/// This safe Rust entry point is used by JNI and the Electron N-API adapter;
/// the exported C ABI below delegates to it as well.
pub fn inspect_json(epub_path: &str, cover_root: &str, book_id: &str) -> String {
    if let Err(message) = validate_book_id(book_id) {
        return failure("invalid_argument", message);
    }
    let metadata = match inspect_path(epub_path) {
        Ok(metadata) => metadata,
        Err(error) => return failure("epub_error", error.to_string()),
    };
    let cover_path = match materialize_cover(epub_path, cover_root, book_id, &metadata) {
        Ok(path) => path
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
        Err(error) => return failure("epub_error", error),
    };

    success(InspectValue {
        title: metadata.title,
        author: metadata.author,
        cover_path,
        rendition_layout: metadata.rendition_layout,
        page_count: metadata.page_count,
        file_size: metadata.file_size,
    })
}

fn materialize_cover(
    epub_path: &str,
    cover_root: &str,
    book_id: &str,
    metadata: &EpubMetadata,
) -> Result<Option<PathBuf>, String> {
    let Some(cover) = metadata.cover.as_ref() else {
        return Ok(None);
    };
    let cover_root = Path::new(cover_root);
    fs::create_dir_all(cover_root).map_err(|error| error.to_string())?;
    remove_covers(cover_root, book_id).map_err(|error| error.to_string())?;
    let extension = cover_extension(&cover.path, &cover.media_type);
    let destination = cover_root.join(format!("{book_id}.{extension}"));
    let temporary = cover_root.join(format!(".{book_id}.{extension}.tmp"));
    let _ = fs::remove_file(&temporary);
    extract_resource_to(epub_path, cover, &temporary).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &destination).map_err(|error| error.to_string())?;
    Ok(Some(destination))
}

fn cover_extension(path: &str, media_type: &str) -> &'static str {
    match media_type.to_ascii_lowercase().as_str() {
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/avif" => "avif",
        _ if path.to_ascii_lowercase().ends_with(".png") => "png",
        _ if path.to_ascii_lowercase().ends_with(".gif") => "gif",
        _ if path.to_ascii_lowercase().ends_with(".webp") => "webp",
        _ if path.to_ascii_lowercase().ends_with(".svg") => "svg",
        _ if path.to_ascii_lowercase().ends_with(".avif") => "avif",
        _ => "jpg",
    }
}

/// Extract an EPUB into the reusable reading cache using the shared contract.
pub fn prepare_json(epub_path: &str, artifacts_root: &str, book_id: &str) -> String {
    if let Err(message) = validate_book_id(book_id) {
        return failure("invalid_argument", message);
    }
    let metadata = match inspect_path(epub_path) {
        Ok(metadata) => metadata,
        Err(error) => return failure("epub_error", error.to_string()),
    };
    let signature = match cache_signature(epub_path, &metadata.package_path) {
        Ok(signature) => signature,
        Err(error) => return failure("io_error", error.to_string()),
    };
    let artifacts_root = Path::new(artifacts_root);
    let destination = artifacts_root.join(book_id);
    let package_file = destination.join(&metadata.package_path);
    let marker = destination.join(".moon-ready");
    if package_file.is_file() && fs::read_to_string(&marker).ok().as_deref() == Some(&signature) {
        return success(package_file.to_string_lossy().into_owned());
    }

    if let Err(error) = fs::create_dir_all(artifacts_root) {
        return failure("io_error", error.to_string());
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let staging = artifacts_root.join(format!(".{book_id}.tmp-{}-{nonce}", std::process::id()));
    let _ = fs::remove_dir_all(&staging);
    if let Err(error) = extract_all_to(epub_path, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return failure("epub_error", error.to_string());
    }
    let staged_package = staging.join(&metadata.package_path);
    if !staged_package.is_file() {
        let _ = fs::remove_dir_all(&staging);
        return failure("epub_error", "unpacked EPUB package document is missing");
    }
    if let Err(error) = fs::write(staging.join(".moon-ready"), signature) {
        let _ = fs::remove_dir_all(&staging);
        return failure("io_error", error.to_string());
    }
    if let Err(error) = fs::remove_dir_all(&destination) {
        if error.kind() != std::io::ErrorKind::NotFound {
            let _ = fs::remove_dir_all(&staging);
            return failure("io_error", error.to_string());
        }
    }
    if let Err(error) = fs::rename(&staging, &destination) {
        let _ = fs::remove_dir_all(&staging);
        return failure("io_error", error.to_string());
    }
    success(package_file.to_string_lossy().into_owned())
}

fn cache_signature(epub_path: &str, package_path: &str) -> Result<String, std::io::Error> {
    let metadata = fs::metadata(epub_path)?;
    let modified = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    Ok(format!("{}:{modified}:{package_path}", metadata.len()))
}

/// Remove all native artifacts for one book using the shared contract.
pub fn remove_json(artifacts_root: &str, cover_root: &str, book_id: &str) -> String {
    if let Err(message) = validate_book_id(book_id) {
        return failure("invalid_argument", message);
    }
    let artifacts = Path::new(artifacts_root).join(book_id);
    if let Err(error) = fs::remove_dir_all(artifacts) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return failure("io_error", error.to_string());
        }
    }
    if let Err(error) = remove_covers(Path::new(cover_root), book_id) {
        return failure("io_error", error.to_string());
    }
    success(())
}

fn remove_covers(cover_root: &Path, book_id: &str) -> Result<(), std::io::Error> {
    let entries = match fs::read_dir(cover_root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    for entry in entries {
        let entry = entry?;
        if entry.path().file_stem().and_then(|stem| stem.to_str()) == Some(book_id) {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

fn ffi_result(operation: impl FnOnce() -> String) -> *mut c_char {
    let json = catch_unwind(AssertUnwindSafe(operation))
        .unwrap_or_else(|_| internal_failure("native EPUB core panicked"));
    CString::new(json)
        .unwrap_or_else(|_| CString::new(internal_failure("native result contained NUL")).unwrap())
        .into_raw()
}

unsafe fn required_string(pointer: *const c_char, name: &str) -> Result<String, String> {
    if pointer.is_null() {
        return Err(format!("{name} must not be null"));
    }
    // SAFETY: The public C contract requires a valid NUL-terminated UTF-8 string.
    let value = unsafe { CStr::from_ptr(pointer) };
    value
        .to_str()
        .map(str::to_owned)
        .map_err(|_| format!("{name} must be UTF-8"))
}

#[no_mangle]
/// Inspect an EPUB and optionally materialize its cover as a JSON envelope.
///
/// # Safety
///
/// All input pointers must be non-null, valid NUL-terminated UTF-8 strings.
/// The returned pointer must be released exactly once with [`moon_epub_string_free`].
pub unsafe extern "C" fn moon_epub_inspect_json(
    epub_path: *const c_char,
    cover_root: *const c_char,
    book_id: *const c_char,
) -> *mut c_char {
    ffi_result(|| {
        let values = unsafe {
            (
                required_string(epub_path, "epub_path"),
                required_string(cover_root, "cover_root"),
                required_string(book_id, "book_id"),
            )
        };
        match values {
            (Ok(epub_path), Ok(cover_root), Ok(book_id)) => {
                inspect_json(&epub_path, &cover_root, &book_id)
            }
            values => failure(
                "invalid_argument",
                [values.0.err(), values.1.err(), values.2.err()]
                    .into_iter()
                    .flatten()
                    .next()
                    .unwrap_or_else(|| "invalid arguments".to_owned()),
            ),
        }
    })
}

#[no_mangle]
/// Prepare an EPUB for reading and return its unpacked package path as JSON.
///
/// # Safety
///
/// All input pointers must be non-null, valid NUL-terminated UTF-8 strings.
/// The returned pointer must be released exactly once with [`moon_epub_string_free`].
pub unsafe extern "C" fn moon_epub_prepare_json(
    epub_path: *const c_char,
    artifacts_root: *const c_char,
    book_id: *const c_char,
) -> *mut c_char {
    ffi_result(|| {
        let values = unsafe {
            (
                required_string(epub_path, "epub_path"),
                required_string(artifacts_root, "artifacts_root"),
                required_string(book_id, "book_id"),
            )
        };
        match values {
            (Ok(epub_path), Ok(artifacts_root), Ok(book_id)) => {
                prepare_json(&epub_path, &artifacts_root, &book_id)
            }
            values => failure(
                "invalid_argument",
                [values.0.err(), values.1.err(), values.2.err()]
                    .into_iter()
                    .flatten()
                    .next()
                    .unwrap_or_else(|| "invalid arguments".to_owned()),
            ),
        }
    })
}

#[no_mangle]
/// Remove cache and cover artifacts associated with a book ID.
///
/// # Safety
///
/// All input pointers must be non-null, valid NUL-terminated UTF-8 strings.
/// The returned pointer must be released exactly once with [`moon_epub_string_free`].
pub unsafe extern "C" fn moon_epub_remove_artifacts_json(
    artifacts_root: *const c_char,
    cover_root: *const c_char,
    book_id: *const c_char,
) -> *mut c_char {
    ffi_result(|| {
        let values = unsafe {
            (
                required_string(artifacts_root, "artifacts_root"),
                required_string(cover_root, "cover_root"),
                required_string(book_id, "book_id"),
            )
        };
        match values {
            (Ok(artifacts_root), Ok(cover_root), Ok(book_id)) => {
                remove_json(&artifacts_root, &cover_root, &book_id)
            }
            values => failure(
                "invalid_argument",
                [values.0.err(), values.1.err(), values.2.err()]
                    .into_iter()
                    .flatten()
                    .next()
                    .unwrap_or_else(|| "invalid arguments".to_owned()),
            ),
        }
    })
}

#[no_mangle]
/// Release a string returned by another `moon_epub_*_json` function.
///
/// # Safety
///
/// `pointer` must be null or a live pointer returned by this library. A non-null
/// pointer may be passed to this function only once.
pub unsafe extern "C" fn moon_epub_string_free(pointer: *mut c_char) {
    if !pointer.is_null() {
        // SAFETY: The pointer must have been returned by this library and freed once.
        drop(unsafe { CString::from_raw(pointer) });
    }
}

#[cfg(target_os = "android")]
mod android {
    use super::{inspect_json, prepare_json, remove_json};
    use jni::errors::ThrowRuntimeExAndDefault;
    use jni::objects::{JObject, JString};
    use jni::sys::jstring;
    use jni::EnvUnowned;

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_moonepub_MoonEpubNative_inspectJson<'local>(
        mut unowned_env: EnvUnowned<'local>,
        _receiver: JObject<'local>,
        epub_path: JString<'local>,
        cover_root: JString<'local>,
        book_id: JString<'local>,
    ) -> jstring {
        unowned_env
            .with_env(|env| -> jni::errors::Result<jstring> {
                let epub_path = epub_path.try_to_string(env)?;
                let cover_root = cover_root.try_to_string(env)?;
                let book_id = book_id.try_to_string(env)?;
                Ok(env
                    .new_string(inspect_json(&epub_path, &cover_root, &book_id))?
                    .into_raw())
            })
            .resolve::<ThrowRuntimeExAndDefault>()
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_moonepub_MoonEpubNative_prepareJson<'local>(
        mut unowned_env: EnvUnowned<'local>,
        _receiver: JObject<'local>,
        epub_path: JString<'local>,
        artifacts_root: JString<'local>,
        book_id: JString<'local>,
    ) -> jstring {
        unowned_env
            .with_env(|env| -> jni::errors::Result<jstring> {
                let epub_path = epub_path.try_to_string(env)?;
                let artifacts_root = artifacts_root.try_to_string(env)?;
                let book_id = book_id.try_to_string(env)?;
                Ok(env
                    .new_string(prepare_json(&epub_path, &artifacts_root, &book_id))?
                    .into_raw())
            })
            .resolve::<ThrowRuntimeExAndDefault>()
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_moonepub_MoonEpubNative_removeArtifactsJson<'local>(
        mut unowned_env: EnvUnowned<'local>,
        _receiver: JObject<'local>,
        artifacts_root: JString<'local>,
        cover_root: JString<'local>,
        book_id: JString<'local>,
    ) -> jstring {
        unowned_env
            .with_env(|env| -> jni::errors::Result<jstring> {
                let artifacts_root = artifacts_root.try_to_string(env)?;
                let cover_root = cover_root.try_to_string(env)?;
                let book_id = book_id.try_to_string(env)?;
                let result = remove_json(&artifacts_root, &cover_root, &book_id);
                Ok(env.new_string(result)?.into_raw())
            })
            .resolve::<ThrowRuntimeExAndDefault>()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    #[test]
    fn validates_ids_used_as_directory_names() {
        assert!(validate_book_id("abc-123_xyz").is_ok());
        assert!(validate_book_id("../book").is_err());
        assert!(validate_book_id("").is_err());
    }

    #[test]
    fn emits_a_stable_error_envelope() {
        let value: serde_json::Value = serde_json::from_str(&failure("test", "message")).unwrap();
        assert_eq!(value["ok"], false);
        assert_eq!(value["error"]["code"], "test");
        assert_eq!(value["error"]["message"], "message");
    }

    #[test]
    fn inspect_prepare_and_remove_share_one_platform_contract() {
        let directory = tempdir().unwrap();
        let epub_path = directory.path().join("book.epub");
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();
        writer
            .start_file("META-INF/container.xml", options)
            .unwrap();
        writer
            .write_all(
                br#"<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>"#,
            )
            .unwrap();
        writer.start_file("OPS/book.opf", options).unwrap();
        writer
            .write_all(
                br#"<package><metadata><title>Reusable Core</title><creator>Moon</creator></metadata><manifest><item id="page" href="page.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="page"/></spine></package>"#,
            )
            .unwrap();
        writer.start_file("OPS/page.xhtml", options).unwrap();
        writer.write_all(b"<html/>").unwrap();
        fs::write(&epub_path, writer.finish().unwrap().into_inner()).unwrap();

        let cover_root = directory.path().join("covers");
        let artifacts_root = directory.path().join("artifacts");
        let inspected: serde_json::Value = serde_json::from_str(&inspect_json(
            epub_path.to_str().unwrap(),
            cover_root.to_str().unwrap(),
            "book-1",
        ))
        .unwrap();
        assert_eq!(inspected["ok"], true);
        assert_eq!(inspected["value"]["title"], "Reusable Core");
        assert_eq!(inspected["value"]["renditionLayout"], "reflowable");

        let prepared: serde_json::Value = serde_json::from_str(&prepare_json(
            epub_path.to_str().unwrap(),
            artifacts_root.to_str().unwrap(),
            "book-1",
        ))
        .unwrap();
        assert_eq!(prepared["ok"], true);
        assert!(artifacts_root.join("book-1/OPS/book.opf").is_file());

        let removed: serde_json::Value = serde_json::from_str(&remove_json(
            artifacts_root.to_str().unwrap(),
            cover_root.to_str().unwrap(),
            "book-1",
        ))
        .unwrap();
        assert_eq!(removed["ok"], true);
        assert!(!artifacts_root.join("book-1").exists());
    }
}
