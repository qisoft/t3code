package expo.modules.t3whisperaudio

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class T3WhisperAudioModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3WhisperAudio")

    AsyncFunction("convertToWav") { source: String, destination: String ->
      WhisperAudioConverter.convert(source, destination)
    }
  }
}
