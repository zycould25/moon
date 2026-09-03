//! Platform-neutral EPUB parsing and extraction.
//!
//! This crate deliberately contains no Android, Apple, React Native, or UI
//! types. Platform adapters can consume paths and the serializable result
//! structures without pulling platform concerns into the reader core.

use percent_encoding::percent_decode_str;
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use quick_xml::XmlVersion;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use zip::ZipArchive;

pub const MAX_XML_BYTES: u64 = 4 * 1024 * 1024;
pub const MAX_COVER_BYTES: u64 = 16 * 1024 * 1024;
pub const MAX_UNPACKED_BYTES: u64 = 1536 * 1024 * 1024;
pub const MAX_ARCHIVE_ENTRIES: usize = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RenditionLayout {
    Fixed,
    Reflowable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubResource {
    pub path: String,
    pub media_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubMetadata {
    pub title: String,
    pub author: String,
    pub cover: Option<EpubResource>,
    pub rendition_layout: RenditionLayout,
    pub page_count: usize,
    pub file_size: u64,
    pub package_path: String,
}

#[derive(Debug, thiserror::Error)]
pub enum EpubError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid ZIP archive: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("invalid EPUB XML: {0}")]
    Xml(String),
    #[error("EPUB package document was not found")]
    PackageNotFound,
    #[error("missing EPUB entry: {0}")]
    MissingEntry(String),
    #[error("EPUB XML entry exceeds the safe size limit")]
    XmlTooLarge,
    #[error("EPUB cover exceeds the safe size limit")]
    CoverTooLarge,
    #[error("EPUB contains too many archive entries")]
    TooManyEntries,
    #[error("EPUB expands beyond the safe size limit")]
    ExpandedTooLarge,
    #[error("unsafe EPUB archive path: {0}")]
    UnsafePath(String),
    #[error("unsupported symbolic link in EPUB: {0}")]
    SymbolicLink(String),
}

#[derive(Debug, Clone)]
struct ManifestItem {
    id: String,
    href: String,
    media_type: String,
    properties: String,
}

#[derive(Debug)]
struct PackageMetadata {
    title: String,
    author: String,
    cover_href: Option<String>,
    cover_media_type: String,
    rendition_layout: RenditionLayout,
    page_count: usize,
}

/// Inspect an EPUB without unpacking it.
pub fn inspect_path(path: impl AsRef<Path>) -> Result<EpubMetadata, EpubError> {
    let path = path.as_ref();
    let file_size = path.metadata()?.len();
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    inspect_archive(&mut archive, file_size)
}

/// Extract one resource returned by [`inspect_path`] to a caller-owned path.
pub fn extract_resource_to(
    epub_path: impl AsRef<Path>,
    resource: &EpubResource,
    destination: impl AsRef<Path>,
) -> Result<(), EpubError> {
    let file = File::open(epub_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut entry = archive
        .by_name(&resource.path)
        .map_err(|_| EpubError::MissingEntry(resource.path.clone()))?;
    if entry.size() > MAX_COVER_BYTES {
        return Err(EpubError::CoverTooLarge);
    }
    let destination = destination.as_ref();
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut output = File::create(destination)?;
    copy_with_limit(
        &mut entry,
        &mut output,
        MAX_COVER_BYTES,
        EpubError::CoverTooLarge,
    )?;
    Ok(())
}

/// Safely unpack an EPUB into an existing or new destination directory.
pub fn extract_all_to(
    epub_path: impl AsRef<Path>,
    destination: impl AsRef<Path>,
) -> Result<(), EpubError> {
    let file = File::open(epub_path)?;
    let mut archive = ZipArchive::new(file)?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(EpubError::TooManyEntries);
    }

    let destination = destination.as_ref();
    fs::create_dir_all(destination)?;
    let mut total_written = 0_u64;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let entry_name = entry.name().replace('\\', "/");
        let relative = safe_relative_path(&entry_name)?;
        let output_path = destination.join(relative);

        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(EpubError::SymbolicLink(entry_name));
        }
        if entry.is_dir() {
            fs::create_dir_all(&output_path)?;
            continue;
        }

        if total_written
            .checked_add(entry.size())
            .is_none_or(|size| size > MAX_UNPACKED_BYTES)
        {
            return Err(EpubError::ExpandedTooLarge);
        }
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let remaining = MAX_UNPACKED_BYTES - total_written;
        let mut output = File::create(output_path)?;
        let written = copy_with_limit(
            &mut entry,
            &mut output,
            remaining,
            EpubError::ExpandedTooLarge,
        )?;
        total_written += written;
    }
    Ok(())
}

fn inspect_archive<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    file_size: u64,
) -> Result<EpubMetadata, EpubError> {
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(EpubError::TooManyEntries);
    }
    let package_path = find_package_path(archive)?;
    let package_xml = read_entry_limited(archive, &package_path, MAX_XML_BYTES)?;
    let package = parse_package(&package_xml)?;
    let cover = package
        .cover_href
        .as_deref()
        .map(|href| resolve_archive_path(&package_path, href))
        .transpose()?
        .map(|path| EpubResource {
            path,
            media_type: package.cover_media_type,
        });

    Ok(EpubMetadata {
        title: package.title,
        author: package.author,
        cover,
        rendition_layout: package.rendition_layout,
        page_count: package.page_count,
        file_size,
        package_path,
    })
}

fn find_package_path<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<String, EpubError> {
    if archive.by_name("META-INF/container.xml").is_ok() {
        let xml = read_entry_limited(archive, "META-INF/container.xml", MAX_XML_BYTES)?;
        let mut reader = Reader::from_reader(xml.as_slice());
        reader.config_mut().trim_text(true);
        loop {
            match reader.read_event().map_err(xml_error)? {
                Event::Start(start) | Event::Empty(start)
                    if start.local_name().as_ref() == "rootfile" =>
                {
                    if let Some(path) = attribute_value(&start, "full-path")? {
                        return normalize_entry_reference(&path);
                    }
                }
                Event::Eof => break,
                _ => {}
            }
        }
    }

    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        if !entry.is_dir() && entry.name().to_ascii_lowercase().ends_with(".opf") {
            return normalize_entry_reference(entry.name());
        }
    }
    Err(EpubError::PackageNotFound)
}

fn parse_package(xml: &[u8]) -> Result<PackageMetadata, EpubError> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut manifest = Vec::new();
    let mut title = String::new();
    let mut author = String::new();
    let mut cover_id = None;
    let mut layout = String::new();
    let mut book_type = String::new();
    let mut fixed_layout_flag = false;
    let mut page_count = 0;

    loop {
        match reader.read_event().map_err(xml_error)? {
            Event::Start(start) => match start.local_name().as_ref() {
                "title" if title.is_empty() => {
                    title = decoded_text(&mut reader, start.name())?;
                }
                "creator" if author.is_empty() => {
                    author = decoded_text(&mut reader, start.name())?;
                }
                "meta" => {
                    let name = attribute_value(&start, "name")?.unwrap_or_default();
                    let property = attribute_value(&start, "property")?.unwrap_or_default();
                    let content = attribute_value(&start, "content")?.unwrap_or_default();
                    if name.eq_ignore_ascii_case("cover") {
                        cover_id = Some(content);
                    } else if name.eq_ignore_ascii_case("book-type") {
                        book_type = content;
                    } else if name.eq_ignore_ascii_case("fixed-layout") {
                        fixed_layout_flag = content.eq_ignore_ascii_case("true")
                            || content.eq_ignore_ascii_case("yes");
                    } else if property.eq_ignore_ascii_case("rendition:layout") {
                        layout = decoded_text(&mut reader, start.name())?;
                    }
                }
                "item" => manifest.push(manifest_item(&start)?),
                "itemref" => page_count += 1,
                _ => {}
            },
            Event::Empty(start) => match start.local_name().as_ref() {
                "meta" => {
                    let name = attribute_value(&start, "name")?.unwrap_or_default();
                    let content = attribute_value(&start, "content")?.unwrap_or_default();
                    if name.eq_ignore_ascii_case("cover") {
                        cover_id = Some(content);
                    } else if name.eq_ignore_ascii_case("book-type") {
                        book_type = content;
                    } else if name.eq_ignore_ascii_case("fixed-layout") {
                        fixed_layout_flag = content.eq_ignore_ascii_case("true")
                            || content.eq_ignore_ascii_case("yes");
                    }
                }
                "item" => manifest.push(manifest_item(&start)?),
                "itemref" => page_count += 1,
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
    }

    let cover_item = manifest
        .iter()
        .find(|item| cover_id.as_deref().is_some_and(|id| item.id == id))
        .or_else(|| {
            manifest.iter().find(|item| {
                item.properties
                    .split_ascii_whitespace()
                    .any(|property| property == "cover-image")
            })
        })
        .or_else(|| {
            manifest.iter().find(|item| {
                item.media_type.starts_with("image/")
                    && item.id.to_ascii_lowercase().contains("cover")
            })
        });
    let rendition_layout = if layout.eq_ignore_ascii_case("pre-paginated")
        || fixed_layout_flag
        || book_type.eq_ignore_ascii_case("comic")
    {
        RenditionLayout::Fixed
    } else {
        RenditionLayout::Reflowable
    };

    Ok(PackageMetadata {
        title,
        author,
        cover_href: cover_item
            .map(|item| item.href.clone())
            .filter(|href| !href.is_empty()),
        cover_media_type: cover_item
            .map(|item| item.media_type.clone())
            .unwrap_or_default(),
        rendition_layout,
        page_count,
    })
}

fn manifest_item(start: &BytesStart<'_>) -> Result<ManifestItem, EpubError> {
    Ok(ManifestItem {
        id: attribute_value(start, "id")?.unwrap_or_default(),
        href: attribute_value(start, "href")?.unwrap_or_default(),
        media_type: attribute_value(start, "media-type")?.unwrap_or_default(),
        properties: attribute_value(start, "properties")?.unwrap_or_default(),
    })
}

fn attribute_value(start: &BytesStart<'_>, name: &str) -> Result<Option<String>, EpubError> {
    for attribute in start.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| EpubError::Xml(error.to_string()))?;
        if attribute.key.local_name().as_ref() == name {
            return attribute
                .normalized_value(XmlVersion::Implicit1_0)
                .map(|value| Some(value.into_owned()))
                .map_err(xml_error);
        }
    }
    Ok(None)
}

fn decoded_text(
    reader: &mut Reader<&[u8]>,
    end: quick_xml::name::QName<'_>,
) -> Result<String, EpubError> {
    let text = reader.read_text(end).map_err(xml_error)?;
    quick_xml::escape::unescape(text.as_ref())
        .map(|text| text.trim().to_owned())
        .map_err(|error| EpubError::Xml(error.to_string()))
}

fn read_entry_limited<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
    limit: u64,
) -> Result<Vec<u8>, EpubError> {
    let mut entry = archive
        .by_name(name)
        .map_err(|_| EpubError::MissingEntry(name.to_owned()))?;
    if entry.size() > limit {
        return Err(EpubError::XmlTooLarge);
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    copy_with_limit(&mut entry, &mut bytes, limit, EpubError::XmlTooLarge)?;
    Ok(bytes)
}

fn copy_with_limit<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    limit: u64,
    overflow_error: EpubError,
) -> Result<u64, EpubError> {
    let mut buffer = [0_u8; 64 * 1024];
    let mut written = 0_u64;
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            return Ok(written);
        }
        if count as u64 > limit.saturating_sub(written) {
            return Err(overflow_error);
        }
        written += count as u64;
        writer.write_all(&buffer[..count])?;
    }
}

fn resolve_archive_path(package_path: &str, href: &str) -> Result<String, EpubError> {
    let href = href.split(['#', '?']).next().unwrap_or_default();
    let decoded = percent_decode_str(href)
        .decode_utf8_lossy()
        .replace('\\', "/");
    if decoded.starts_with('/') {
        return Err(EpubError::UnsafePath(decoded));
    }
    let base = package_path.rsplit_once('/').map_or("", |(base, _)| base);
    normalize_entry_reference(&format!("{base}/{decoded}"))
}

fn normalize_entry_reference(path: &str) -> Result<String, EpubError> {
    let mut parts: Vec<&str> = Vec::new();
    let normalized = path.replace('\\', "/");
    for part in normalized.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if parts.pop().is_none() {
                    return Err(EpubError::UnsafePath(path.to_owned()));
                }
            }
            value if value.contains('\0') => return Err(EpubError::UnsafePath(path.to_owned())),
            value => parts.push(value),
        }
    }
    if parts.is_empty() {
        return Err(EpubError::UnsafePath(path.to_owned()));
    }
    Ok(parts.join("/"))
}

fn safe_relative_path(name: &str) -> Result<PathBuf, EpubError> {
    let normalized = normalize_entry_reference(name)?;
    let path = Path::new(&normalized);
    if path.components().any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        )
    }) {
        return Err(EpubError::UnsafePath(name.to_owned()));
    }
    Ok(path.to_path_buf())
}

fn xml_error(error: quick_xml::Error) -> EpubError {
    EpubError::Xml(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    const CONTAINER: &str = r#"<?xml version="1.0"?>
      <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles>
      </container>"#;

    const FIXED_OPF: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
      <package xmlns="http://www.idpf.org/2007/opf">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>Moon &amp; Stars</dc:title>
          <dc:creator>Reader Team</dc:creator>
          <meta property="rendition:layout">pre-paginated</meta>
        </metadata>
        <manifest>
          <item id="cover" href="images/cover%20art.jpg" media-type="image/jpeg" properties="cover-image"/>
          <item id="p1" href="page.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine><itemref idref="p1"/></spine>
      </package>"#;

    fn make_epub(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();
        for (name, contents) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(contents).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn inspects_fixed_layout_metadata_and_cover() {
        let bytes = make_epub(&[
            ("META-INF/container.xml", CONTAINER.as_bytes()),
            ("OPS/package.opf", FIXED_OPF.as_bytes()),
            ("OPS/images/cover art.jpg", b"cover"),
            ("OPS/page.xhtml", b"<html/>"),
        ]);
        let mut archive = ZipArchive::new(Cursor::new(&bytes)).unwrap();
        let metadata = inspect_archive(&mut archive, bytes.len() as u64).unwrap();
        assert_eq!(metadata.title, "Moon & Stars");
        assert_eq!(metadata.author, "Reader Team");
        assert_eq!(metadata.rendition_layout, RenditionLayout::Fixed);
        assert_eq!(metadata.page_count, 1);
        assert_eq!(metadata.cover.unwrap().path, "OPS/images/cover art.jpg");
    }

    #[test]
    fn extracts_cover_and_reader_assets() {
        let directory = tempdir().unwrap();
        let epub = directory.path().join("book.epub");
        fs::write(
            &epub,
            make_epub(&[
                ("META-INF/container.xml", CONTAINER.as_bytes()),
                ("OPS/package.opf", FIXED_OPF.as_bytes()),
                ("OPS/images/cover art.jpg", b"cover"),
                ("OPS/page.xhtml", b"<html/>"),
            ]),
        )
        .unwrap();

        let metadata = inspect_path(&epub).unwrap();
        let cover_path = directory.path().join("cover.jpg");
        extract_resource_to(&epub, metadata.cover.as_ref().unwrap(), &cover_path).unwrap();
        assert_eq!(fs::read(cover_path).unwrap(), b"cover");

        let unpacked = directory.path().join("unpacked");
        extract_all_to(&epub, &unpacked).unwrap();
        assert_eq!(
            fs::read(unpacked.join("OPS/page.xhtml")).unwrap(),
            b"<html/>"
        );
    }

    #[test]
    fn rejects_zip_slip_paths() {
        assert!(matches!(
            safe_relative_path("../../outside.txt"),
            Err(EpubError::UnsafePath(_))
        ));
        assert!(matches!(
            resolve_archive_path("OPS/package.opf", "../../cover.jpg"),
            Err(EpubError::UnsafePath(_))
        ));
    }

    #[test]
    fn defaults_to_reflowable_without_fixed_layout_metadata() {
        let opf = FIXED_OPF.replace(
            "<meta property=\"rendition:layout\">pre-paginated</meta>",
            "",
        );
        let bytes = make_epub(&[
            ("META-INF/container.xml", CONTAINER.as_bytes()),
            ("OPS/package.opf", opf.as_bytes()),
        ]);
        let mut archive = ZipArchive::new(Cursor::new(&bytes)).unwrap();
        assert_eq!(
            inspect_archive(&mut archive, bytes.len() as u64)
                .unwrap()
                .rendition_layout,
            RenditionLayout::Reflowable
        );
    }
}
