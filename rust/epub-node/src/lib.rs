//! Minimal N-API adapter for Electron's main process.
//!
//! No EPUB behavior lives here. Every operation delegates to `moon-epub-ffi`,
//! which is also the implementation used by Android JNI and Apple's C ABI.

use moon_epub_ffi::{inspect_json as inspect, prepare_json as prepare, remove_json as remove};
use napi::{bindgen_prelude::AsyncTask, Env, Result, Task};
use napi_derive::napi;

enum Operation {
    Inspect {
        epub_path: String,
        cover_root: String,
        book_id: String,
    },
    Prepare {
        epub_path: String,
        artifacts_root: String,
        book_id: String,
    },
    Remove {
        artifacts_root: String,
        cover_root: String,
        book_id: String,
    },
}

pub struct EpubTask(Operation);

impl Task for EpubTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        Ok(match &self.0 {
            Operation::Inspect {
                epub_path,
                cover_root,
                book_id,
            } => inspect(epub_path, cover_root, book_id),
            Operation::Prepare {
                epub_path,
                artifacts_root,
                book_id,
            } => prepare(epub_path, artifacts_root, book_id),
            Operation::Remove {
                artifacts_root,
                cover_root,
                book_id,
            } => remove(artifacts_root, cover_root, book_id),
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn inspect_json(epub_path: String, cover_root: String, book_id: String) -> AsyncTask<EpubTask> {
    AsyncTask::new(EpubTask(Operation::Inspect {
        epub_path,
        cover_root,
        book_id,
    }))
}

#[napi]
pub fn prepare_json(
    epub_path: String,
    artifacts_root: String,
    book_id: String,
) -> AsyncTask<EpubTask> {
    AsyncTask::new(EpubTask(Operation::Prepare {
        epub_path,
        artifacts_root,
        book_id,
    }))
}

#[napi]
pub fn remove_artifacts_json(
    artifacts_root: String,
    cover_root: String,
    book_id: String,
) -> AsyncTask<EpubTask> {
    AsyncTask::new(EpubTask(Operation::Remove {
        artifacts_root,
        cover_root,
        book_id,
    }))
}
