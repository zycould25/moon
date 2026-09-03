#!/bin/sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
rust_directory=$(CDPATH= cd -- "$script_directory/.." && pwd)
output_path=${1:-"$rust_directory/apple/MoonEpubFFI.xcframework"}
temporary_directory=$(mktemp -d "${TMPDIR:-/tmp}/moon-epub-apple.XXXXXX")
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM

for apple_target in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  rustup target list --installed | grep -qx "$apple_target" || {
    echo "Error: missing Rust target $apple_target. Run: rustup target add $apple_target" >&2
    exit 1
  }
done

cd "$rust_directory"
cargo build --release -p moon-epub-ffi --target aarch64-apple-ios
cargo build --release -p moon-epub-ffi --target aarch64-apple-ios-sim
cargo build --release -p moon-epub-ffi --target x86_64-apple-ios

mkdir -p "$temporary_directory/simulator"
lipo -create \
  "$rust_directory/target/aarch64-apple-ios-sim/release/libmoon_epub_ffi.a" \
  "$rust_directory/target/x86_64-apple-ios/release/libmoon_epub_ffi.a" \
  -output "$temporary_directory/simulator/libmoon_epub_ffi.a"

if [ -e "$output_path" ]; then
  rm -rf "$output_path"
fi
xcodebuild -create-xcframework \
  -library "$rust_directory/target/aarch64-apple-ios/release/libmoon_epub_ffi.a" \
  -headers "$rust_directory/epub-ffi/include" \
  -library "$temporary_directory/simulator/libmoon_epub_ffi.a" \
  -headers "$rust_directory/epub-ffi/include" \
  -output "$output_path"

