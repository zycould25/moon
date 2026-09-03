#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <jniLibs-output-directory>" >&2
  exit 2
fi

output_directory=$1
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
rust_directory=$(CDPATH= cd -- "$script_directory/.." && pwd)
android_abis=${MOON_ANDROID_ABIS:-arm64-v8a,armeabi-v7a,x86,x86_64}

command -v cargo-ndk >/dev/null 2>&1 || {
  echo "Error: cargo-ndk is required. Install it with: cargo install cargo-ndk --locked" >&2
  exit 1
}

set -- cargo ndk -P 24 -o "$output_directory"
old_ifs=$IFS
IFS=,
for android_abi in $android_abis; do
  set -- "$@" -t "$android_abi"
done
IFS=$old_ifs
set -- "$@" build --release -p moon-epub-ffi

cd "$rust_directory"
exec "$@"

