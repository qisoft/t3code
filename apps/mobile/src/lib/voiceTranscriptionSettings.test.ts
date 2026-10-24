import { describe, expect, it } from "vite-plus/test";

import {
  defaultVoiceTranscriptionSettings,
  parseVoiceTranscriptionSettings,
} from "./voiceTranscriptionSettings";

describe("voice transcription preferences", () => {
  it("preserves Apple's existing iPhone default and offers Whisper on Android", () => {
    expect(defaultVoiceTranscriptionSettings("ios").engine).toBe("apple");
    expect(defaultVoiceTranscriptionSettings("android").engine).toBe("whisper");
  });

  it("retains an explicit Russian language independently of the device locale", () => {
    const value = { engine: "whisper", model: "small", language: "ru" };
    expect(parseVoiceTranscriptionSettings(value)).toEqual(value);
  });

  it("ignores invalid persisted settings", () => {
    expect(parseVoiceTranscriptionSettings(null)).toBeUndefined();
    expect(
      parseVoiceTranscriptionSettings({ engine: "cloud", model: "base", language: "ru" }),
    ).toBeUndefined();
    expect(
      parseVoiceTranscriptionSettings({ engine: "whisper", model: "base.en", language: "ru" }),
    ).toBeUndefined();
    expect(
      parseVoiceTranscriptionSettings({ engine: "whisper", model: "base", language: {} }),
    ).toBeUndefined();
  });
});
