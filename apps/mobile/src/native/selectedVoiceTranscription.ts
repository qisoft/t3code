import type { VoiceTranscriptionSettings } from "../lib/voiceTranscriptionSettings";
import { getLocalVoiceTranscriber } from "./voiceTranscription";
import { getWhisperVoiceTranscriber } from "./whisperTranscription";

export function getSelectedVoiceTranscriber(settings: VoiceTranscriptionSettings) {
  return settings.engine === "whisper"
    ? getWhisperVoiceTranscriber(settings)
    : getLocalVoiceTranscriber();
}
