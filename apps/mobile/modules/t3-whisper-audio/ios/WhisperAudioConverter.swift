import AVFoundation

enum WhisperAudioConverter {
  /// Whisper expects PCM16 WAV; expo-audio records compressed AAC.
  static func convert(source: URL, destination: URL) throws {
    guard source.isFileURL, destination.isFileURL else {
      throw ConversionError.invalidFile
    }
    let input = try AVAudioFile(forReading: source)
    guard Double(input.length) / input.processingFormat.sampleRate <= 301 else {
      throw ConversionError.tooLong
    }
    guard let format = AVAudioFormat(
      commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true
    ), let converter = AVAudioConverter(from: input.processingFormat, to: format),
       let outputBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096),
       let inputBuffer = AVAudioPCMBuffer(pcmFormat: input.processingFormat, frameCapacity: 65_536) else {
      throw ConversionError.unsupportedFormat
    }
    let output = try AVAudioFile(
      forWriting: destination, settings: format.settings,
      commonFormat: .pcmFormatInt16, interleaved: true
    )
    var readError: Error?
    while true {
      var conversionError: NSError?
      let status = converter.convert(to: outputBuffer, error: &conversionError) { count, status in
        do {
          let remaining = input.length - input.framePosition
          guard remaining > 0 else {
            status.pointee = .endOfStream
            return nil
          }
          try input.read(into: inputBuffer, frameCount: min(count, inputBuffer.frameCapacity, AVAudioFrameCount(remaining)))
          status.pointee = inputBuffer.frameLength == 0 ? .endOfStream : .haveData
          return inputBuffer.frameLength == 0 ? nil : inputBuffer
        } catch {
          readError = error
          status.pointee = .endOfStream
          return nil
        }
      }
      if let readError { throw readError }
      if let conversionError { throw conversionError }
      if status == .error { throw ConversionError.unsupportedFormat }
      if outputBuffer.frameLength > 0 { try output.write(from: outputBuffer) }
      if status == .endOfStream { break }
    }
    guard output.length > 0 else { throw ConversionError.emptyAudio }
  }

  enum ConversionError: Error {
    case invalidFile, tooLong, unsupportedFormat, emptyAudio
  }
}
