#ifndef MOON_EPUB_FFI_H
#define MOON_EPUB_FFI_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Every operation returns a heap-allocated UTF-8 JSON envelope:
 *   {"ok":true,"value":...}
 *   {"ok":false,"error":{"code":"...","message":"..."}}
 * Release every non-null result with moon_epub_string_free.
 */
char *moon_epub_inspect_json(
    const char *epub_path,
    const char *cover_root,
    const char *book_id);

char *moon_epub_prepare_json(
    const char *epub_path,
    const char *artifacts_root,
    const char *book_id);

char *moon_epub_remove_artifacts_json(
    const char *artifacts_root,
    const char *cover_root,
    const char *book_id);

void moon_epub_string_free(char *value);

#ifdef __cplusplus
}
#endif

#endif

