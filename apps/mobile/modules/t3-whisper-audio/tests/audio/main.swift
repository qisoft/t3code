import AVFoundation
import Foundation

let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: directory) }

let source = directory.appendingPathComponent("recording.m4a")
let destination = directory.appendingPathComponent("recording.wav")
do {
  let recording = try AVAudioFile(forWriting: source, settings: [
    AVFormatIDKey: kAudioFormatMPEG4AAC,
    AVSampleRateKey: 44_100,
    AVNumberOfChannelsKey: 2,
    AVEncoderBitRateKey: 128_000,
  ])
  let buffer = AVAudioPCMBuffer(pcmFormat: recording.processingFormat, frameCapacity: 44_100)!
  buffer.frameLength = 44_100
  for channel in 0..<2 {
    for sample in 0..<44_100 {
      buffer.floatChannelData![channel][sample] = 0.2 * sin(Float(sample) * 2 * .pi * 440 / 44_100)
    }
  }
  try recording.write(from: buffer)
}

try WhisperAudioConverter.convert(source: source, destination: destination)
let converted = try AVAudioFile(forReading: destination)
precondition(converted.fileFormat.sampleRate == 16_000)
precondition(converted.fileFormat.channelCount == 1)
precondition(converted.fileFormat.commonFormat == .pcmFormatInt16)
precondition(abs(Double(converted.length) / 16_000 - 1) < 0.1)
let audio = AVAudioPCMBuffer(pcmFormat: converted.processingFormat, frameCapacity: 4096)!
try converted.read(into: audio)
precondition((0..<Int(audio.frameLength)).contains { abs(audio.floatChannelData![0][$0]) > 0.05 })

do {
  try WhisperAudioConverter.convert(
    source: URL(string: "https://example.com/audio.m4a")!, destination: destination
  )
  preconditionFailure("Remote audio must be rejected.")
} catch WhisperAudioConverter.ConversionError.invalidFile {}

do {
  try WhisperAudioConverter.convert(source: directory.appendingPathComponent("missing.m4a"), destination: destination)
  preconditionFailure("A missing recording must be rejected.")
} catch {}

print("PASS: AAC stereo → PCM16 mono 16 kHz WAV, duration and audio preserved; invalid inputs rejected")
