// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MoonEpubCore",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "MoonEpubCore", targets: ["MoonEpubCore"]),
    ],
    targets: [
        .binaryTarget(name: "MoonEpubFFI", path: "MoonEpubFFI.xcframework"),
        .target(
            name: "MoonEpubCore",
            dependencies: ["MoonEpubFFI"],
            path: "Sources/MoonEpubCore"
        ),
    ]
)
