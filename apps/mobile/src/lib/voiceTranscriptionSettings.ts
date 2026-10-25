export const WHISPER_LANGUAGES = [
  { id: "auto", label: "Detect language" },
  { id: "ru", label: "Russian" },
  { id: "en", label: "English" },
  { id: "uk", label: "Ukrainian" },
  { id: "de", label: "German" },
  { id: "fr", label: "French" },
  { id: "es", label: "Spanish" },
] as const;

export type WhisperLanguage = (typeof WHISPER_LANGUAGES)[number]["id"];
export type WhisperModelId = "base" | "small" | "large-v3-turbo-q5_0";
export type VoiceTranscriptionSettings = {
  readonly engine: "apple" | "whisper";
  readonly model: WhisperModelId;
  readonly language: WhisperLanguage;
};

export function defaultVoiceTranscriptionSettings(platform: string): VoiceTranscriptionSettings {
  return { engine: platform === "ios" ? "apple" : "whisper", model: "base", language: "auto" };
}

export function parseVoiceTranscriptionSettings(
  value: unknown,
): VoiceTranscriptionSettings | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if (!("engine" in value) || (value.engine !== "apple" && value.engine !== "whisper")) {
    return undefined;
  }
  if (
    !("model" in value) ||
    (value.model !== "base" && value.model !== "small" && value.model !== "large-v3-turbo-q5_0")
  )
    return undefined;
  if (!("language" in value)) return undefined;
  const language = WHISPER_LANGUAGES.find((entry) => entry.id === value.language)?.id;
  return language ? { engine: value.engine, model: value.model, language } : undefined;
}
