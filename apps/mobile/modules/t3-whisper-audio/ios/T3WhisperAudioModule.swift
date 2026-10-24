import ExpoModulesCore

public final class T3WhisperAudioModule: Module {
  public func definition() -> ModuleDefinition {
    Name("T3WhisperAudio")

    AsyncFunction("convertToWav") { (source: URL, destination: URL) in
      try WhisperAudioConverter.convert(source: source, destination: destination)
    }
  }
}
