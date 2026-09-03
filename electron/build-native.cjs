const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const rustManifest = path.join(projectRoot, "rust", "Cargo.toml");
const cargo = process.env.CARGO || "cargo";
const requiredPlatform = process.argv
  .find((argument) => argument.startsWith("--require-platform="))
  ?.split("=", 2)[1];

if (requiredPlatform && process.platform !== requiredPlatform) {
  console.error(
    `This package needs a ${requiredPlatform} Rust module, but the current host is ${process.platform}. `
      + "Build the installer on its target operating system.",
  );
  process.exit(1);
}

const build = spawnSync(
  cargo,
  ["build", "--manifest-path", rustManifest, "--release", "-p", "moon-epub-node"],
  { cwd: projectRoot, stdio: "inherit" },
);

if (build.error) {
  console.error(`Unable to start Cargo: ${build.error.message}`);
  process.exit(1);
}
if (build.status !== 0) process.exit(build.status || 1);

const libraryName = process.platform === "win32"
  ? "moon_epub_node.dll"
  : process.platform === "darwin"
    ? "libmoon_epub_node.dylib"
    : "libmoon_epub_node.so";
const source = path.join(projectRoot, "rust", "target", "release", libraryName);
const outputDirectory = path.join(
  projectRoot,
  "electron",
  "native",
  `${process.platform}-${process.arch}`,
);
const destination = path.join(outputDirectory, "moon_epub_node.node");

if (!fs.existsSync(source)) {
  console.error(`Rust native module was not generated at ${source}`);
  process.exit(1);
}

fs.mkdirSync(outputDirectory, { recursive: true });
fs.copyFileSync(source, destination);
console.log(`Electron Rust module: ${destination}`);
