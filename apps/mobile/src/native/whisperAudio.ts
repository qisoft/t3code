import { requireOptionalNativeModule } from "expo";
import { File, Paths } from "expo-file-system";
import { TurboModuleRegistry } from "react-native";

import { throwIfVoiceTranscriptionAborted } from "@t3tools/client-runtime/voice-input";
import { uuidv4 } from "../lib/uuid";

const converter = requireOptionalNativeModule<{
  convertToWav(source: string, destination: string): Promise<void>;
}>("T3WhisperAudio");

export function isWhisperAvailable(): boolean {
  return converter !== null && TurboModuleRegistry.get("RNWhisper") !== null;
}

/** Keeps the converted file alive only while the native recognizer is reading it. */
export async function withWhisperAudio<T>(
  uri: string,
  signal: AbortSignal,
  useAudio: (wavUri: string) => Promise<T>,
): Promise<T> {
  if (!converter) throw new Error("This build does not include Whisper audio support.");
  const wav = new File(Paths.cache, `whisper-${uuidv4()}.wav`);
  try {
    throwIfVoiceTranscriptionAborted(signal);
    await converter.convertToWav(uri, wav.uri);
    throwIfVoiceTranscriptionAborted(signal);
    return await useAudio(wav.uri);
  } finally {
    if (wav.exists) wav.delete();
  }
}
