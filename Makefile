SHELL := /bin/sh

.DEFAULT_GOAL := android

JAVA_HOME := $(shell /usr/libexec/java_home -v 17 2>/dev/null)
ADB := $(shell command -v adb 2>/dev/null || { sdk="$${ANDROID_HOME:-$${ANDROID_SDK_ROOT:-$$HOME/Library/Android/sdk}}"; printf '%s/platform-tools/adb' "$$sdk"; })
PNPM := pnpm
NODE_ENV := production

MOBILE_DIR := mobile
RUST_DIR := rust
RUST_JNI_DIR := $(CURDIR)/$(MOBILE_DIR)/modules/moon-epub/android/build/generated/rustJniLibs
APK := $(CURDIR)/$(MOBILE_DIR)/android/app/build/outputs/apk/release/app-release.apk
APP_COMPONENT := com.moon.epubreader/.MainActivity

# Use the explicitly supplied serial, or automatically select the only
# authorized Android device connected over ADB.
DEVICE_SERIAL = $(if $(strip $(DEVICE)),$(strip $(DEVICE)),$(shell "$(ADB)" devices 2>/dev/null | awk 'NR > 1 && $$2 == "device" { print $$1; exit }'))

export JAVA_HOME NODE_ENV

.PHONY: help devices check-adb check-rust check-rust-android check-android-tools check-android-device android android-build android-install android-launch electron rust-test rust-android rust-apple rust-desktop

help:
	@echo "Moon Android targets"
	@echo "  make / make android          Build, install, and launch the Release APK"
	@echo "  make android DEVICE=<serial> Use a specific device when several are connected"
	@echo "  make android-build           Build the Release APK only"
	@echo "  make android-install         Install the existing APK only"
	@echo "  make android-launch          Launch the installed application"
	@echo "  make devices                 List connected Android devices"
	@echo "  make rust-test               Run reusable EPUB core tests"
	@echo "  make rust-android            Build Rust JNI libraries for all Android ABIs"
	@echo "  make rust-apple              Build the Rust XCFramework for Swift / SwiftUI"
	@echo "  make rust-desktop            Build the Rust N-API module for Electron"
	@echo "  make electron                Build an unpacked Electron app for this platform"

check-rust:
	@command -v cargo >/dev/null 2>&1 || { echo "Error: Rust is required. Install it from https://rustup.rs."; exit 1; }

check-rust-android: check-rust
	@command -v cargo-ndk >/dev/null 2>&1 || { echo "Error: cargo-ndk is required. Run cargo install cargo-ndk --locked."; exit 1; }

check-adb:
	@{ command -v "$(ADB)" >/dev/null 2>&1 || test -x "$(ADB)"; } || { echo "Error: adb was not found. Install Android platform-tools or set ADB=<path>."; exit 1; }

check-android-tools: check-adb check-rust-android
	@test -n "$(JAVA_HOME)" && test -x "$(JAVA_HOME)/bin/java" || { echo "Error: JDK 17 is required. Install it or run make with JAVA_HOME=<jdk-17-path>."; exit 1; }
	@command -v "$(PNPM)" >/dev/null 2>&1 || { echo "Error: pnpm was not found in PATH."; exit 1; }

check-android-device: check-adb
	@if test -n "$(strip $(DEVICE))"; then \
		state=$$("$(ADB)" -s "$(strip $(DEVICE))" get-state 2>/dev/null || true); \
		test "$$state" = "device" || { echo "Error: device $(strip $(DEVICE)) is not connected and authorized."; "$(ADB)" devices -l; exit 1; }; \
	else \
		devices=$$("$(ADB)" devices | awk 'NR > 1 && $$2 == "device" { print $$1 }'); \
		count=$$(printf '%s\n' "$$devices" | awk 'NF { count++ } END { print count + 0 }'); \
		test "$$count" -gt 0 || { echo "Error: no authorized Android device is connected."; "$(ADB)" devices -l; exit 1; }; \
		test "$$count" -eq 1 || { echo "Error: multiple devices are connected. Use make android DEVICE=<serial>."; "$(ADB)" devices -l; exit 1; }; \
	fi

devices: check-adb
	@"$(ADB)" devices -l

android: check-android-device
	@$(MAKE) --no-print-directory android-build
	@$(MAKE) --no-print-directory android-install DEVICE="$(DEVICE_SERIAL)"
	@$(MAKE) --no-print-directory android-launch DEVICE="$(DEVICE_SERIAL)"
	@echo "Moon has been installed and launched on $(DEVICE_SERIAL)."

android-build: check-android-tools
	@echo "Building Android Release APK with Java 17..."
	@"$(PNPM)" --dir "$(MOBILE_DIR)" build:android:release
	@test -f "$(APK)" || { echo "Error: APK was not generated at $(APK)."; exit 1; }
	@ls -lh "$(APK)"

android-install: check-android-device
	@test -f "$(APK)" || { echo "Error: APK not found. Run make android-build first."; exit 1; }
	@echo "Installing on $(DEVICE_SERIAL)..."
	@echo "If ColorOS shows an installation protection screen, confirm it on the device."
	@"$(ADB)" -s "$(DEVICE_SERIAL)" install -r "$(APK)"

android-launch: check-android-device
	@echo "Launching Moon on $(DEVICE_SERIAL)..."
	@"$(ADB)" -s "$(DEVICE_SERIAL)" shell am start -W -n "$(APP_COMPONENT)"

rust-test: check-rust
	@cargo test --manifest-path "$(RUST_DIR)/Cargo.toml" --workspace

rust-android: check-rust-android
	@sh "$(RUST_DIR)/scripts/build-android.sh" "$(RUST_JNI_DIR)"

rust-apple: check-rust
	@sh "$(RUST_DIR)/scripts/build-apple.sh"

rust-desktop: check-rust
	@"$(PNPM)" build:rust:desktop

electron: rust-desktop
	@"$(PNPM)" build:renderer
	@"$(PNPM)" exec electron-builder --dir
