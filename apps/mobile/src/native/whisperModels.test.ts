import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  files: new Map<string, number>(),
  download: vi.fn(),
  move: vi.fn(),
  digest: vi.fn(),
}));

vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((part) => (typeof part === "string" ? part : part.uri)).join("/");
    }
    create() {}
  }
  class File extends Directory {
    static downloadFileAsync = mocks.download;
    get exists() {
      return mocks.files.has(this.uri);
    }
    get size() {
      return mocks.files.get(this.uri) ?? 0;
    }
    delete() {
      mocks.files.delete(this.uri);
    }
    digest = mocks.digest;
    async move(destination: File) {
      await mocks.move();
      mocks.files.set(destination.uri, this.size);
      mocks.files.delete(this.uri);
      this.uri = destination.uri;
    }
  }
  return { File, Directory, Paths: { document: "file:///documents" } };
});

import {
  deleteWhisperModel,
  downloadWhisperModel,
  getWhisperModelUri,
  WHISPER_MODELS,
} from "./whisperModels";

const bytes = WHISPER_MODELS[0].bytes;
const partialUri = "file:///documents/whisper-models/ggml-base.download";
const finalUri = "file:///documents/whisper-models/ggml-base.bin";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.files.clear();
  mocks.digest.mockResolvedValue(WHISPER_MODELS[0].sha256);
  mocks.download.mockImplementation(async (_url, file) => {
    mocks.files.set(file.uri, bytes);
    return file;
  });
});

describe("Whisper model storage", () => {
  it("exposes the model only after the completed file has moved into place", async () => {
    const moving = Promise.withResolvers<void>();
    const finishMove = Promise.withResolvers<void>();
    mocks.move.mockImplementation(() => {
      moving.resolve();
      return finishMove.promise;
    });
    const download = downloadWhisperModel("base", new AbortController().signal, vi.fn());
    await moving.promise;
    expect(getWhisperModelUri("base")).toBeNull();
    expect(() => deleteWhisperModel("base")).toThrow("download");
    finishMove.resolve();
    await download;
    expect(getWhisperModelUri("base")).toBe(finalUri);
    expect(mocks.files.has(partialUri)).toBe(false);
    deleteWhisperModel("base");
    expect(getWhisperModelUri("base")).toBeNull();
  });

  it("keeps a valid existing model without downloading again", async () => {
    mocks.files.set(finalUri, bytes);
    await downloadWhisperModel("base", new AbortController().signal, vi.fn());
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("removes partial files on a network failure and allows retry", async () => {
    mocks.download.mockImplementationOnce(async (_url, file) => {
      mocks.files.set(file.uri, 17);
      throw new Error("offline");
    });
    await expect(
      downloadWhisperModel("base", new AbortController().signal, vi.fn()),
    ).rejects.toThrow("offline");
    expect(mocks.files.size).toBe(0);
    await downloadWhisperModel("base", new AbortController().signal, vi.fn());
    expect(getWhisperModelUri("base")).toBe(finalUri);
  });

  it("rejects truncated downloads instead of publishing an unusable model", async () => {
    mocks.download.mockImplementationOnce(async (_url, file) => {
      mocks.files.set(file.uri, bytes - 1);
      return file;
    });
    await expect(
      downloadWhisperModel("base", new AbortController().signal, vi.fn()),
    ).rejects.toThrow("incomplete");
    expect(mocks.files.size).toBe(0);
  });

  it("does not publish a download that finishes after cancellation", async () => {
    const entered = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<void>();
    mocks.download.mockImplementationOnce(async (_url, file) => {
      entered.resolve();
      await finished.promise;
      mocks.files.set(file.uri, bytes);
      return file;
    });
    const controller = new AbortController();
    const operation = downloadWhisperModel("base", controller.signal, vi.fn());
    const result = expect(operation).rejects.toMatchObject({ code: "cancelled" });
    await entered.promise;
    await expect(
      downloadWhisperModel("small", new AbortController().signal, vi.fn()),
    ).rejects.toThrow("Another");
    controller.abort();
    finished.resolve();
    await result;
    expect(mocks.files.size).toBe(0);
  });

  it("rejects a corrupt full-size model", async () => {
    mocks.digest.mockResolvedValue("wrong-hash");
    await expect(
      downloadWhisperModel("base", new AbortController().signal, vi.fn()),
    ).rejects.toThrow("corrupt");
    expect(mocks.files.size).toBe(0);
  });
});
