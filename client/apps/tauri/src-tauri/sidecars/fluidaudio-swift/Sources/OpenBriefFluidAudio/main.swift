import Foundation
import FluidAudio

private let protocolVersion = 1
private let parakeetModelId = "parakeet-tdt-0.6b-v3"

@main
struct OpenBriefFluidAudio {
    static func main() async {
        do {
            let request = try readRequest()
            try await run(request)
            exit(EXIT_SUCCESS)
        } catch {
            writeEvent(
                event: "job_failed",
                jobId: "unknown",
                command: nil,
                error: ["message": String(describing: error)]
            )
            exit(EXIT_FAILURE)
        }
    }

    private static func readRequest() throws -> FluidAudioRequest {
        let args = CommandLine.arguments.dropFirst()
        let requestJson: String

        if args.count == 2 && args.first == "--json" {
            requestJson = args.last ?? ""
        } else if args.isEmpty {
            requestJson = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
        } else {
            throw SidecarError.invalidArguments
        }

        return try JSONDecoder().decode(FluidAudioRequest.self, from: Data(requestJson.utf8))
    }

    private static func run(_ request: FluidAudioRequest) async throws {
        guard request.protocolVersion == protocolVersion else {
            throw SidecarError.unsupportedProtocol(request.protocolVersion)
        }

        let jobId = request.jobId ?? "unknown"
        writeEvent(event: "job_started", jobId: jobId, command: request.command)

        do {
            let result: [String: Any]
            switch request.command {
            case "health":
                result = [
                    "command": "health",
                    "engine": "fluidaudio",
                    "modelId": parakeetModelId
                ]
            case "download_model":
                result = try await downloadModel(request, jobId: jobId)
            case "transcribe_audio":
                result = try await transcribeAudio(request, jobId: jobId)
            default:
                throw SidecarError.unsupportedCommand(request.command)
            }

            writeEvent(
                event: "job_completed",
                jobId: jobId,
                command: request.command,
                progress: 1.0,
                result: result
            )
        } catch {
            writeEvent(
                event: "job_failed",
                jobId: jobId,
                command: request.command,
                error: ["message": String(describing: error)]
            )
            throw error
        }
    }

    private static func downloadModel(_ request: FluidAudioRequest, jobId: String) async throws -> [String: Any] {
        let modelDirectory = try request.requiredModelDirectory()
        try FileManager.default.createDirectory(at: modelDirectory, withIntermediateDirectories: true)

        writeProgress(jobId: jobId, command: request.command, progress: 0.05, message: "preparing FluidAudio model")
        _ = try await AsrModels.download(
            to: modelDirectory,
            force: false,
            version: .v3,
            encoderPrecision: .int8,
            progressHandler: progressHandler(jobId: jobId, command: request.command, base: 0.05, span: 0.9)
        )

        let sizeBytes = directorySize(modelDirectory.deletingLastPathComponent())
        return [
            "command": "download_model",
            "engine": "fluidaudio",
            "modelId": parakeetModelId,
            "modelDirectory": modelDirectory.path,
            "downloaded": true,
            "sha1": "directory-managed-by-fluidaudio",
            "sizeBytes": sizeBytes
        ]
    }

    private static func transcribeAudio(_ request: FluidAudioRequest, jobId: String) async throws -> [String: Any] {
        let audioPath = try request.requiredAudioPath()
        let outputPath = try request.requiredOutputPath()
        let modelDirectory = try request.requiredModelDirectory()

        guard FileManager.default.fileExists(atPath: audioPath.path) else {
            throw SidecarError.inputNotFound(audioPath.path)
        }

        try FileManager.default.createDirectory(
            at: outputPath.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try FileManager.default.createDirectory(at: modelDirectory, withIntermediateDirectories: true)

        writeProgress(jobId: jobId, command: request.command, progress: 0.1, message: "loading Parakeet v3")
        let models = try await AsrModels.downloadAndLoad(
            to: modelDirectory,
            version: .v3,
            encoderPrecision: .int8,
            progressHandler: progressHandler(jobId: jobId, command: request.command, base: 0.1, span: 0.35)
        )

        let manager = AsrManager(config: .default)
        try await manager.loadModels(models)

        writeProgress(jobId: jobId, command: request.command, progress: 0.5, message: "transcribing audio")
        var decoderState = TdtDecoderState.make(decoderLayers: await manager.decoderLayerCount)
        let language = request.normalizedLanguage.flatMap(Language.init(rawValue:))
        let result = try await manager.transcribe(audioPath, decoderState: &decoderState, language: language)

        let segments = transcriptSegments(from: result)
        let transcript = TranscriptDocument(
            sourceKind: "local-stt",
            engine: "fluidaudio",
            modelId: parakeetModelId,
            language: request.normalizedLanguage,
            text: result.text,
            segments: segments,
            durationSeconds: result.duration,
            processingTimeSeconds: result.processingTime,
            confidence: result.confidence
        )
        let data = try JSONEncoder().encode(transcript)
        try data.write(to: outputPath, options: [.atomic])

        return [
            "command": "transcribe_audio",
            "transcriptPath": outputPath.path,
            "text": result.text,
            "segments": transcript.segments.map { $0.dictionary },
            "engine": "fluidaudio",
            "modelId": parakeetModelId,
            "language": request.normalizedLanguage ?? NSNull(),
            "durationSeconds": result.duration,
            "processingTimeSeconds": result.processingTime,
            "confidence": result.confidence
        ]
    }
}

private struct FluidAudioRequest: Decodable {
    let protocolVersion: Int
    let command: String
    let jobId: String?
    let audioPath: String?
    let outputPath: String?
    let modelDirectory: String?
    let language: String?

    var normalizedLanguage: String? {
        guard let language else { return nil }
        let code = language.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !code.isEmpty && code != "auto" else { return nil }
        return code.split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map(String.init)
    }

    func requiredAudioPath() throws -> URL {
        guard let audioPath, !audioPath.isEmpty else { throw SidecarError.missingField("audioPath") }
        return URL(fileURLWithPath: audioPath)
    }

    func requiredOutputPath() throws -> URL {
        guard let outputPath, !outputPath.isEmpty else { throw SidecarError.missingField("outputPath") }
        return URL(fileURLWithPath: outputPath)
    }

    func requiredModelDirectory() throws -> URL {
        guard let modelDirectory, !modelDirectory.isEmpty else { throw SidecarError.missingField("modelDirectory") }
        return URL(fileURLWithPath: modelDirectory, isDirectory: true)
    }
}

private struct TranscriptDocument: Encodable {
    let sourceKind: String
    let engine: String
    let modelId: String
    let language: String?
    let text: String
    let segments: [TranscriptSegment]
    let durationSeconds: Double
    let processingTimeSeconds: Double
    let confidence: Float
}

private struct TranscriptSegment: Encodable {
    let id: String
    let startSeconds: Double
    let endSeconds: Double
    let text: String
    let sourceKind: String
    let words: [TranscriptWord]

    var dictionary: [String: Any] {
        [
            "id": id,
            "startSeconds": startSeconds,
            "endSeconds": endSeconds,
            "text": text,
            "sourceKind": sourceKind,
            "words": words.map { $0.dictionary }
        ]
    }
}

private struct TranscriptWord: Encodable {
    let text: String
    let startSeconds: Double
    let endSeconds: Double

    var dictionary: [String: Any] {
        [
            "text": text,
            "startSeconds": startSeconds,
            "endSeconds": endSeconds
        ]
    }
}

private func transcriptSegments(from result: ASRResult) -> [TranscriptSegment] {
    let words = transcriptWords(from: result.tokenTimings ?? [])
    if !words.isEmpty {
        return chunkTranscriptWords(words)
    }

    let fallbackText = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !fallbackText.isEmpty else { return [] }
    let endSeconds = max(result.duration, 0)
    return [
        TranscriptSegment(
            id: "local-stt-1",
            startSeconds: 0,
            endSeconds: endSeconds,
            text: fallbackText,
            sourceKind: "local-stt",
            words: evenlyDistributedWords(fallbackText, startSeconds: 0, endSeconds: endSeconds)
        )
    ]
}

private func transcriptWords(from tokenTimings: [TokenTiming]) -> [TranscriptWord] {
    var words: [TranscriptWord] = []
    var currentText = ""
    var currentStart: Double?
    var currentEnd: Double?

    func flushCurrentWord() {
        let text = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let start = currentStart, let end = currentEnd else {
            currentText = ""
            currentStart = nil
            currentEnd = nil
            return
        }

        words.append(
            TranscriptWord(
                text: text,
                startSeconds: max(start, 0),
                endSeconds: max(end, start)
            )
        )
        currentText = ""
        currentStart = nil
        currentEnd = nil
    }

    for timing in tokenTimings.sorted(by: { $0.startTime < $1.startTime }) {
        let token = timing.token
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { continue }

        let startsNewWord = token.first?.isWhitespace == true
        if startsNewWord && !currentText.isEmpty {
            flushCurrentWord()
        }

        if currentText.isEmpty {
            currentStart = timing.startTime
        }

        currentText += startsNewWord ? trimmed : token
        currentEnd = max(currentEnd ?? timing.endTime, timing.endTime)
    }

    flushCurrentWord()
    return words
}

private func chunkTranscriptWords(_ words: [TranscriptWord]) -> [TranscriptSegment] {
    let maxSegmentDuration = 5.0
    let maxSegmentWords = 18
    let pauseBreakSeconds = 0.8
    var segments: [TranscriptSegment] = []
    var current: [TranscriptWord] = []

    func flushCurrentSegment() {
        guard let first = current.first, let last = current.last else { return }
        let index = segments.count + 1
        segments.append(
            TranscriptSegment(
                id: "local-stt-\(index)",
                startSeconds: first.startSeconds,
                endSeconds: max(last.endSeconds, first.startSeconds),
                text: joinTranscriptWords(current),
                sourceKind: "local-stt",
                words: current
            )
        )
        current = []
    }

    func shouldFlushBeforeAppending(_ word: TranscriptWord) -> Bool {
        guard let first = current.first, let last = current.last else { return false }

        if word.endSeconds - first.startSeconds > maxSegmentDuration {
            return true
        }
        if current.count >= maxSegmentWords {
            return true
        }
        if word.startSeconds - last.endSeconds >= pauseBreakSeconds {
            return true
        }
        if endsSentence(last.text) {
            return true
        }

        return false
    }

    for word in words {
        if shouldFlushBeforeAppending(word) {
            flushCurrentSegment()
        }
        current.append(word)
    }

    flushCurrentSegment()
    return segments
}

private func endsSentence(_ text: String) -> Bool {
    text.hasSuffix(".") || text.hasSuffix("!") || text.hasSuffix("?") || text.hasSuffix("…")
}

private func evenlyDistributedWords(_ text: String, startSeconds: Double, endSeconds: Double) -> [TranscriptWord] {
    let parts = text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    let duration = endSeconds - startSeconds
    guard !parts.isEmpty, duration > 0 else { return [] }

    let wordDuration = duration / Double(parts.count)
    return parts.enumerated().map { index, word in
        let wordStart = startSeconds + Double(index) * wordDuration
        let wordEnd = index + 1 == parts.count ? endSeconds : startSeconds + Double(index + 1) * wordDuration
        return TranscriptWord(text: word, startSeconds: wordStart, endSeconds: max(wordEnd, wordStart))
    }
}

private func joinTranscriptWords(_ words: [TranscriptWord]) -> String {
    words.reduce("") { output, word in
        if output.isEmpty {
            return word.text
        }
        if word.text.range(of: #"^[\.,!\?:;%\)\]\}]"#, options: .regularExpression) != nil {
            return output + word.text
        }
        return output + " " + word.text
    }
}

private enum SidecarError: Error, CustomStringConvertible {
    case invalidArguments
    case unsupportedProtocol(Int)
    case unsupportedCommand(String)
    case missingField(String)
    case inputNotFound(String)

    var description: String {
        switch self {
        case .invalidArguments:
            return "expected a single JSON command via --json <json> or stdin"
        case .unsupportedProtocol(let version):
            return "unsupported protocolVersion \(version); expected \(protocolVersion)"
        case .unsupportedCommand(let command):
            return "unsupported FluidAudio command: \(command)"
        case .missingField(let field):
            return "missing required field: \(field)"
        case .inputNotFound(let path):
            return "transcribe_audio_input_not_found:\(path)"
        }
    }
}

private func progressHandler(jobId: String, command: String, base: Double, span: Double) -> DownloadUtils.ProgressHandler {
    { progress in
        let mapped = min(0.98, max(0, base + (progress.fractionCompleted * span)))
        writeProgress(
            jobId: jobId,
            command: command,
            progress: mapped,
            message: "preparing Parakeet v3"
        )
    }
}

private func writeProgress(jobId: String, command: String, progress: Double, message: String) {
    writeEvent(event: "job_progress", jobId: jobId, command: command, progress: progress, message: message)
}

private func writeEvent(
    event: String,
    jobId: String,
    command: String?,
    progress: Double? = nil,
    message: String? = nil,
    result: [String: Any]? = nil,
    error: [String: Any]? = nil
) {
    var payload: [String: Any] = [
        "protocolVersion": protocolVersion,
        "event": event,
        "jobId": jobId
    ]
    if let command { payload["command"] = command }
    if let progress { payload["progress"] = progress }
    if let message { payload["message"] = message }
    if let result { payload["result"] = result }
    if let error { payload["error"] = error }

    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8)
    else {
        return
    }
    print(line)
    fflush(stdout)
}

private func directorySize(_ url: URL) -> UInt64 {
    guard let enumerator = FileManager.default.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey]) else {
        return 0
    }

    var total: UInt64 = 0
    for case let fileURL as URL in enumerator {
        let values = try? fileURL.resourceValues(forKeys: [.fileSizeKey])
        total += UInt64(values?.fileSize ?? 0)
    }
    return total
}
