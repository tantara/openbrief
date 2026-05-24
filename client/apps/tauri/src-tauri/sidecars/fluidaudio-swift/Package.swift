// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "OpenBriefFluidAudio",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "openbrief-fluidaudio", targets: ["OpenBriefFluidAudio"])
    ],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.14.7")
    ],
    targets: [
        .executableTarget(
            name: "OpenBriefFluidAudio",
            dependencies: [
                .product(name: "FluidAudio", package: "FluidAudio")
            ]
        )
    ]
)
