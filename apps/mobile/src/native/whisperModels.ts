import { Directory, File, Paths } from "expo-file-system";

import { throwIfVoiceTranscriptionAborted } from "@t3tools/client-runtime/voice-input";
import type { WhisperModelId } from "../lib/voiceTranscriptionSettings";

const MODEL_REVISION = "5359861c739e955e79d9a303bcbc70fb988958b1";
export const WHISPER_MODELS = [
  {
    id: "base",
    label: "Base",
    bytes: 147_951_465,
    sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    description: "148 MB · Faster, uses less memory",
  },
  {
    id: "small",
    label: "Small",
    bytes: 487_601_967,
    sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    description: "488 MB · More accurate, slower",
  },
] as const;

function modelFile(id: WhisperModelId) {
  return new File(Paths.document, "whisper-models", `ggml-${id}.bin`);
}

export function getWhisperModelUri(id: WhisperModelId): string | null {
  const model = WHISPER_MODELS.find((entry) => entry.id === id)!;
  const file = modelFile(id);
  return file.exists && file.size === model.bytes ? file.uri : null;
}

let downloading = false;

/** Publishes a complete model atomically; a failed or cancelled download is never usable. */
export async function downloadWhisperModel(
  id: WhisperModelId,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<void> {
  throwIfVoiceTranscriptionAborted(signal);
  if (downloading) throw new Error("Another Whisper model is downloading.");
  if (getWhisperModelUri(id)) return;
  downloading = true;
  const directory = new Directory(Paths.document, "whisper-models");
  const partial = new File(directory, `ggml-${id}.download`);
  const model = WHISPER_MODELS.find((entry) => entry.id === id)!;
  try {
    directory.create({ idempotent: true, intermediates: true });
    if (partial.exists) partial.delete();
    await File.downloadFileAsync(
      `https://huggingface.co/ggerganov/whisper.cpp/resolve/${MODEL_REVISION}/ggml-${id}.bin`,
      partial,
      {
        signal,
        onProgress: ({ bytesWritten }) => onProgress(Math.min(1, bytesWritten / model.bytes)),
      },
    );
    throwIfVoiceTranscriptionAborted(signal);
    if (partial.size !== model.bytes)
      throw new Error("The model download was incomplete. Try again.");
    if ((await partial.digest("SHA-256")) !== model.sha256) {
      throw new Error("The model download is corrupt. Try again.");
    }
    throwIfVoiceTranscriptionAborted(signal);
    await partial.move(modelFile(id), { overwrite: true });
  } finally {
    try {
      // File.move changes its URI, so inspect the original temporary path.
      const abandoned = new File(directory, `ggml-${id}.download`);
      if (abandoned.exists) abandoned.delete();
    } finally {
      downloading = false;
    }
  }
}

export function deleteWhisperModel(id: WhisperModelId): void {
  if (downloading) throw new Error("Wait for the model download to finish.");
  const file = modelFile(id);
  if (file.exists) file.delete();
}
