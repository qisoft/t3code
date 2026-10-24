import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  available: true,
  model: "file:///models/base.bin" as string | null,
  convert: vi.fn(),
  deleted: vi.fn(),
  init: vi.fn(),
  release: vi.fn(),
  transcribe: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("expo", () => ({
  requireOptionalNativeModule: () => ({ convertToWav: mocks.convert }),
}));
vi.mock("react-native", () => ({
  TurboModuleRegistry: { get: () => (mocks.available ? {} : null) },
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  File: class {
    uri = "file:///cache/converted.wav";
    exists = true;
    delete = mocks.deleted;
  },
}));
vi.mock("../lib/uuid", () => ({ uuidv4: () => "test" }));
vi.mock("./whisperModels", () => ({ getWhisperModelUri: () => mocks.model }));
vi.mock("whisper.rn", () => ({ initWhisper: mocks.init }));

import { getWhisperVoiceTranscriber } from "./whisperTranscription";

const settings = { engine: "whisper", language: "ru", model: "base" } as const;
const transcript = {
  result: " A Russian transcript. ",
  language: "ru",
  isAborted: false,
  segments: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.available = true;
  mocks.model = "file:///models/base.bin";
  mocks.init.mockResolvedValue({ transcribe: mocks.transcribe, release: mocks.release });
  mocks.transcribe.mockImplementation(() => ({
    stop: mocks.stop,
    promise: Promise.resolve(transcript),
  }));
  mocks.stop.mockResolvedValue(undefined);
});

describe("local Whisper dictation", () => {
  it("requires a native Whisper build", () => {
    mocks.available = false;
    expect(getWhisperVoiceTranscriber(settings)).toBeNull();
  });

  it("requires an explicit model download before recording", async () => {
    mocks.model = null;
    await expect(
      getWhisperVoiceTranscriber(settings)!.prepare({ signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "model-missing" });
    expect(mocks.init).not.toHaveBeenCalled();
  });

  it("transcribes converted audio in Russian without translation and releases temporary resources", async () => {
    const options = { signal: new AbortController().signal };
    const prepared = await getWhisperVoiceTranscriber(settings)!.prepare(options);
    expect(mocks.init).not.toHaveBeenCalled();
    await expect(prepared.transcribe("file:///recording.m4a", options)).resolves.toBe(
      "A Russian transcript.",
    );
    expect(mocks.convert).toHaveBeenCalledWith(
      "file:///recording.m4a",
      "file:///cache/converted.wav",
    );
    expect(mocks.transcribe).toHaveBeenCalledWith("file:///cache/converted.wav", {
      language: "ru",
      translate: false,
    });
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.deleted).toHaveBeenCalledOnce();
  });

  it("cleans up a converted file when conversion fails", async () => {
    mocks.convert.mockRejectedValue(new Error("bad audio"));
    const options = { signal: new AbortController().signal };
    const prepared = await getWhisperVoiceTranscriber(settings)!.prepare(options);
    await expect(prepared.transcribe("file:///broken.m4a", options)).rejects.toThrow("bad audio");
    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.deleted).toHaveBeenCalledOnce();
  });

  it("uses the detected language when inserting an automatically recognized transcript", async () => {
    const options = { signal: new AbortController().signal };
    const prepared = await getWhisperVoiceTranscriber({ ...settings, language: "auto" })!.prepare(
      options,
    );
    await prepared.transcribe("file:///recording.m4a", options);
    expect(mocks.transcribe).toHaveBeenCalledWith("file:///cache/converted.wav", {
      language: "auto",
      translate: false,
    });
    expect(prepared.locale).toBe("ru");
  });

  it("releases the context and audio when recognition fails", async () => {
    mocks.transcribe.mockImplementation(() => ({
      stop: mocks.stop,
      promise: Promise.reject(new Error("failed")),
    }));
    const options = { signal: new AbortController().signal };
    const prepared = await getWhisperVoiceTranscriber(settings)!.prepare(options);
    await expect(prepared.transcribe("file:///recording.m4a", options)).rejects.toThrow("failed");
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.deleted).toHaveBeenCalledOnce();
  });

  it("stops native recognition on cancellation and waits before releasing the context", async () => {
    const entered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<typeof transcript>();
    const controller = new AbortController();
    mocks.transcribe.mockImplementation(() => {
      entered.resolve();
      return { stop: mocks.stop, promise: finish.promise };
    });
    const options = { signal: controller.signal };
    const prepared = await getWhisperVoiceTranscriber(settings)!.prepare(options);
    const result = expect(
      prepared.transcribe("file:///recording.m4a", options),
    ).rejects.toMatchObject({ code: "cancelled" });
    await entered.promise;
    controller.abort();
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.deleted).not.toHaveBeenCalled();
    finish.resolve(transcript);
    await result;
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.deleted).toHaveBeenCalledOnce();
  });

  it("discards cancellation during model initialization and frees the newly loaded context", async () => {
    const entered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<{
      transcribe: typeof mocks.transcribe;
      release: typeof mocks.release;
    }>();
    mocks.init.mockImplementation(() => {
      entered.resolve();
      return finish.promise;
    });
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const prepared = await getWhisperVoiceTranscriber(settings)!.prepare(options);
    const result = expect(
      prepared.transcribe("file:///recording.m4a", options),
    ).rejects.toMatchObject({ code: "cancelled" });
    await entered.promise;
    controller.abort();
    finish.resolve({ transcribe: mocks.transcribe, release: mocks.release });
    await result;
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.deleted).toHaveBeenCalledOnce();
  });
});
