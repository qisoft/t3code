import {
  VoiceTranscriptionError,
  throwIfVoiceTranscriptionAborted,
  type VoiceTranscriber,
} from "@t3tools/client-runtime/voice-input";

import type { VoiceTranscriptionSettings } from "../lib/voiceTranscriptionSettings";
import { isWhisperAvailable, withWhisperAudio } from "./whisperAudio";
import { getWhisperModelUri } from "./whisperModels";

export function getWhisperVoiceTranscriber(
  settings: VoiceTranscriptionSettings,
): VoiceTranscriber | null {
  if (!isWhisperAvailable()) return null;
  return {
    prepare: async ({ signal }) => {
      throwIfVoiceTranscriptionAborted(signal);
      const modelUri = getWhisperModelUri(settings.model);
      if (!modelUri) {
        throw new VoiceTranscriptionError(
          "model-missing",
          "Download the selected Whisper model in Settings → Voice input.",
        );
      }
      let locale: string = settings.language;
      return {
        get locale() {
          return locale;
        },
        transcribe: (uri, { signal }) =>
          withWhisperAudio(uri, signal, async (wavUri) => {
            // Loading after recording avoids retaining model memory while the user speaks.
            const { initWhisper } = await import("whisper.rn");
            throwIfVoiceTranscriptionAborted(signal);
            const context = await initWhisper({ filePath: modelUri, useCoreMLIos: false });
            try {
              throwIfVoiceTranscriptionAborted(signal);
              const job = context.transcribe(wavUri, {
                language: settings.language,
                translate: false,
              });
              let stopping: Promise<void> | undefined;
              const abort = () => {
                stopping ??= job.stop().catch(() => undefined);
              };
              signal.addEventListener("abort", abort, { once: true });
              if (signal.aborted) abort();
              try {
                const result = await job.promise;
                throwIfVoiceTranscriptionAborted(signal);
                if (result.isAborted)
                  throw new VoiceTranscriptionError("cancelled", "Dictation cancelled.");
                if (result.language) locale = result.language;
                return result.result.trim();
              } finally {
                signal.removeEventListener("abort", abort);
                await stopping;
              }
            } finally {
              await context.release();
            }
          }),
      };
    },
  };
}
