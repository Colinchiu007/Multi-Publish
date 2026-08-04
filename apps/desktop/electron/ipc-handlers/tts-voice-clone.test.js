import { describe, expect, it, vi } from "vitest";
import path from "node:path";

import registerTtsVoiceCloneHandlers from "./tts-voice-clone";

function createIpcMain() {
  const handlers = new Map();
  return {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    handlers,
  };
}

function validEvent(senderId = 1) {
  return {
    sender: { id: senderId },
    senderFrame: { url: "app://localhost/" },
  };
}

function trustedEventWithoutSenderId() {
  return { senderFrame: { url: "app://localhost/" } };
}

describe("TTS 音色克隆 IPC", () => {
  it("注册固定克隆通道，样本只通过主进程 dialog 转为一次性令牌", async () => {
    const ipcMain = createIpcMain();
    const samplePath = path.resolve("samples", "voice.wav");
    const dialog = {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [samplePath] })),
    };
    const ttsVoiceCloneService = {
      getRequirements: vi.fn(() => ({
        code: 0,
        data: { allowedExtensions: [".wav"], maxSampleCount: 5 },
      })),
      listClones: vi.fn(async (input) => ({ code: 0, data: input })),
      createSampleSelection: vi.fn((_input, paths, senderKey) => ({
        code: 0,
        data: {
          selectionId: "selection-a",
          samples: paths.map(() => ({ name: "sample-01.wav", contentType: "audio/wav" })),
        },
      })),
      addCloneFromSelection: vi.fn(async (input, senderKey) => ({
        code: 0,
        data: { ...input, senderKey },
      })),
      deleteClone: vi.fn(async (input) => ({ code: 0, data: input })),
    };

    registerTtsVoiceCloneHandlers(ipcMain, { ttsVoiceCloneService, dialog });

    expect([...ipcMain.handlers.keys()]).toEqual([
      "tts-voice-clone:requirements",
      "tts-voice-clone:choose-samples",
      "tts-voice-clone:list",
      "tts-voice-clone:add",
      "tts-voice-clone:delete",
    ]);
    await expect(
      ipcMain.handlers.get("tts-voice-clone:requirements")(validEvent(), {
        providerId: "elevenlabs",
        model: "eleven_multilingual_v2",
      }),
    ).resolves.toMatchObject({ code: 0, data: { maxSampleCount: 5 } });
    await expect(
      ipcMain.handlers.get("tts-voice-clone:choose-samples")(validEvent(), {
        providerId: "elevenlabs",
        model: "eleven_multilingual_v2",
      }),
    ).resolves.toEqual({
      code: 0,
      data: {
        selectionId: "selection-a",
        samples: [{ name: "sample-01.wav", contentType: "audio/wav" }],
      },
    });
    expect(ttsVoiceCloneService.getRequirements).toHaveBeenCalledWith({
      providerId: "elevenlabs",
      model: "eleven_multilingual_v2",
    });
    expect(ttsVoiceCloneService.createSampleSelection).toHaveBeenCalledWith(
      {
        providerId: "elevenlabs",
        model: "eleven_multilingual_v2",
      },
      [samplePath],
      "webcontents:1",
    );
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "Audio samples", extensions: ["wav"] }],
      }),
    );
  });

  it("拒绝 renderer 额外传入的路径、Buffer、base64、Blob 或音频字节，且不调用服务或 dialog", async () => {
    const ipcMain = createIpcMain();
    const dialog = { showOpenDialog: vi.fn() };
    const ttsVoiceCloneService = {
      getRequirements: vi.fn(),
      listClones: vi.fn(),
      createSampleSelection: vi.fn(),
      addCloneFromSelection: vi.fn(),
      deleteClone: vi.fn(),
    };
    registerTtsVoiceCloneHandlers(ipcMain, { ttsVoiceCloneService, dialog });
    const base = { providerId: "elevenlabs", model: "eleven_multilingual_v2" };

    await expect(
      ipcMain.handlers.get("tts-voice-clone:requirements")(validEvent(), {
        ...base,
        base64: "RIFF",
      }),
    ).resolves.toMatchObject({ code: -2, message: "VOICE_CLONE_INVALID_ARGUMENTS" });
    await expect(
      ipcMain.handlers.get("tts-voice-clone:choose-samples")(validEvent(), {
        ...base,
        audio: new Uint8Array([1, 2, 3]),
      }),
    ).resolves.toMatchObject({ code: -2, message: "VOICE_CLONE_INVALID_ARGUMENTS" });
    await expect(
      ipcMain.handlers.get("tts-voice-clone:add")(validEvent(), {
        ...base,
        name: "Voice",
        selectionId: "selection-a",
      }),
    ).resolves.toMatchObject({ code: -2, message: "VOICE_CLONE_INVALID_ARGUMENTS" });
    await expect(
      ipcMain.handlers.get("tts-voice-clone:add")(validEvent(), {
        ...base,
        name: "Voice",
        selectionId: "selection-a",
        consent: false,
      }),
    ).resolves.toMatchObject({ code: -2, message: "VOICE_CLONE_INVALID_ARGUMENTS" });
    await expect(
      ipcMain.handlers.get("tts-voice-clone:add")(validEvent(), {
        ...base,
        name: "Voice",
        selectionId: "selection-a",
        consent: "true",
      }),
    ).resolves.toMatchObject({ code: -2, message: "VOICE_CLONE_INVALID_ARGUMENTS" });
    await expect(
      ipcMain.handlers.get("tts-voice-clone:add")(validEvent(), {
        ...base,
        name: "Voice",
        selectionId: "selection-a",
        consent: true,
        paths: [path.resolve("sample.wav")],
        buffer: Buffer.from("audio"),
        blob: new Blob(["audio"]),
      }),
    ).resolves.toMatchObject({ code: -2, message: "VOICE_CLONE_INVALID_ARGUMENTS" });
    await expect(
      ipcMain.handlers.get("tts-voice-clone:delete")(validEvent(), {
        ...base,
        voiceId: "voice-a",
        samples: [{ bytes: "audio" }],
      }),
    ).resolves.toMatchObject({ code: -2, message: "VOICE_CLONE_INVALID_ARGUMENTS" });

    expect(ttsVoiceCloneService.getRequirements).not.toHaveBeenCalled();
    expect(ttsVoiceCloneService.createSampleSelection).not.toHaveBeenCalled();
    expect(ttsVoiceCloneService.addCloneFromSelection).not.toHaveBeenCalled();
    expect(ttsVoiceCloneService.deleteClone).not.toHaveBeenCalled();
    expect(dialog.showOpenDialog).not.toHaveBeenCalled();
  });

  it("仅把同一受信 WebContents 的一次性选择令牌交给克隆服务", async () => {
    const ipcMain = createIpcMain();
    const ttsVoiceCloneService = {
      getRequirements: vi.fn(),
      listClones: vi.fn(),
      createSampleSelection: vi.fn(),
      addCloneFromSelection: vi.fn(async (input, senderKey) => ({
        code: 0,
        data: { input, senderKey },
      })),
      deleteClone: vi.fn(),
    };
    registerTtsVoiceCloneHandlers(ipcMain, {
      ttsVoiceCloneService,
      dialog: { showOpenDialog: vi.fn() },
    });

    const addRequest = {
      providerId: "elevenlabs",
      model: "eleven_multilingual_v2",
      name: "Voice",
      selectionId: "selection-a",
      consent: true,
    };
    await expect(
      ipcMain.handlers.get("tts-voice-clone:add")(validEvent(9), addRequest),
    ).resolves.toMatchObject({ code: 0 });

    expect(ttsVoiceCloneService.addCloneFromSelection).toHaveBeenCalledWith(
      {
        providerId: "elevenlabs",
        model: "eleven_multilingual_v2",
        name: "Voice",
        selectionId: "selection-a",
        consent: true,
      },
      "webcontents:9",
    );
    expect(ttsVoiceCloneService.addCloneFromSelection.mock.calls[0][0]).not.toBe(addRequest);
  });

  it("缺失 WebContents 身份时 fail closed，不交给克隆服务", async () => {
    const ipcMain = createIpcMain();
    const ttsVoiceCloneService = {
      getRequirements: vi.fn(),
      listClones: vi.fn(),
      createSampleSelection: vi.fn(),
      addCloneFromSelection: vi.fn(),
      deleteClone: vi.fn(),
    };
    registerTtsVoiceCloneHandlers(ipcMain, {
      ttsVoiceCloneService,
      dialog: { showOpenDialog: vi.fn() },
    });

    await expect(
      ipcMain.handlers.get("tts-voice-clone:add")(trustedEventWithoutSenderId(), {
        providerId: "elevenlabs",
        model: "eleven_multilingual_v2",
        name: "Voice",
        selectionId: "selection-a",
        consent: true,
      }),
    ).resolves.toMatchObject({ code: -2, message: "VOICE_CLONE_INVALID_ARGUMENTS" });
    expect(ttsVoiceCloneService.addCloneFromSelection).not.toHaveBeenCalled();
  });
});
