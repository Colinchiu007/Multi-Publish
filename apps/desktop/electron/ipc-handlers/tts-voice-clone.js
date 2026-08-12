// @ts-check
"use strict";

const path = require("node:path");

const { TtsVoiceCloneService } = require("../services/tts-voice-clone-service");
const { withSenderCheck, EC } = require("./helpers");

function isSafeIdentifier(value, maxLength = 256) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^[a-zA-Z0-9._-]+$/.test(value)
  );
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function isSafeName(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 128 &&
    !hasControlCharacter(value)
  );
}

function hasOnlyAllowedKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function normalizeBaseValues(args) {
  if (!isSafeIdentifier(args.providerId, 128) || !isSafeIdentifier(args.model, 128)) return null;
  return { providerId: args.providerId, model: args.model };
}

function normalizeBaseArgs(args) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    !hasOnlyAllowedKeys(args, ["providerId", "model"])
  )
    return null;
  return normalizeBaseValues(args);
}

function normalizeAddArgs(args) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    !hasOnlyAllowedKeys(args, ["providerId", "model", "name", "selectionId", "consent"])
  )
    return null;
  const base = normalizeBaseValues(args);
  if (
    !base ||
    !isSafeName(args.name) ||
    !isSafeIdentifier(args.selectionId, 128) ||
    args.consent !== true
  )
    return null;
  return { ...base, name: args.name.trim(), selectionId: args.selectionId, consent: true };
}

function normalizeDeleteArgs(args) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    !hasOnlyAllowedKeys(args, ["providerId", "model", "voiceId"])
  )
    return null;
  const base = normalizeBaseValues(args);
  if (!base || !isSafeIdentifier(args.voiceId)) return null;
  return { ...base, voiceId: args.voiceId };
}

function normalizeRenameArgs(args) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    !hasOnlyAllowedKeys(args, ["providerId", "model", "voiceId", "name"])
  )
    return null;
  const base = normalizeBaseValues(args);
  if (!base || !isSafeIdentifier(args.voiceId) || !isSafeName(args.name)) return null;
  return { ...base, voiceId: args.voiceId, name: args.name.trim() };
}

function invalidArguments() {
  return { code: EC.VALIDATION_ERROR, message: "VOICE_CLONE_INVALID_ARGUMENTS" };
}

function getDialog(deps) {
  if (deps.dialog && typeof deps.dialog.showOpenDialog === "function") return deps.dialog;
  try {
    return require("electron").dialog;
  } catch (_) {
    return null;
  }
}

function sampleDialogOptions(requirements) {
  const extensions = Array.isArray(requirements && requirements.allowedExtensions)
    ? requirements.allowedExtensions
        .filter((value) => typeof value === "string" && /^\.[a-z0-9]+$/i.test(value))
        .map((value) => value.slice(1))
    : [];
  return {
    title: "Choose voice samples",
    properties: ["openFile", "multiSelections"],
    filters: extensions.length > 0 ? [{ name: "Audio samples", extensions }] : [],
  };
}

function senderKey(event) {
  if (!event || !event.sender || !Number.isInteger(event.sender.id) || event.sender.id < 0)
    return null;
  return `webcontents:${event.sender.id}`;
}

function registerTtsVoiceCloneHandlers(ipcMain, deps = {}) {
  const service =
    deps.ttsVoiceCloneService ||
    new TtsVoiceCloneService({
      store: deps.store,
      modelProviderManager: deps.modelProviderManager,
      app: deps.app,
    });
  const dialog = getDialog(deps);

  ipcMain.handle(
    "tts-voice-clone:requirements",
    withSenderCheck((_event, args) => {
      const input = normalizeBaseArgs(args);
      if (!input) return invalidArguments();
      try {
        return service.getRequirements(input);
      } catch (_) {
        return { code: EC.REQUEST_ERROR, message: "VOICE_CLONE_UNAVAILABLE" };
      }
    }),
  );

  ipcMain.handle(
    "tts-voice-clone:choose-samples",
    withSenderCheck(async (event, args) => {
      const input = normalizeBaseArgs(args);
      if (!input) return invalidArguments();
      let requirements;
      try {
        requirements = service.getRequirements(input);
      } catch (_) {
        return { code: EC.REQUEST_ERROR, message: "VOICE_CLONE_UNAVAILABLE" };
      }
      if (!requirements || requirements.code !== 0)
        return requirements || { code: EC.REQUEST_ERROR, message: "VOICE_CLONE_UNAVAILABLE" };
      if (!dialog) return { code: EC.REQUEST_ERROR, message: "VOICE_CLONE_DIALOG_UNAVAILABLE" };
      try {
        const result = await dialog.showOpenDialog(sampleDialogOptions(requirements.data));
        if (!result || result.canceled === true) return { code: 0, data: { paths: [] } };
        const paths =
          Array.isArray(result.filePaths) &&
          result.filePaths.every((value) => typeof value === "string" && path.isAbsolute(value))
            ? [...result.filePaths]
            : null;
        const key = senderKey(event);
        return paths && key
          ? service.createSampleSelection(input, paths, key)
          : { code: EC.REQUEST_ERROR, message: "VOICE_CLONE_DIALOG_UNAVAILABLE" };
      } catch (_) {
        return { code: EC.REQUEST_ERROR, message: "VOICE_CLONE_DIALOG_UNAVAILABLE" };
      }
    }),
  );

  ipcMain.handle(
    "tts-voice-clone:list",
    withSenderCheck(async (_event, args) => {
      const input = normalizeBaseArgs(args);
      if (!input) return invalidArguments();
      try {
        return await service.listClones(input);
      } catch (_) {
        return { code: EC.REQUEST_ERROR, message: "VOICE_CLONE_UNAVAILABLE" };
      }
    }),
  );

  ipcMain.handle(
    "tts-voice-clone:add",
    withSenderCheck(async (event, args) => {
      const input = normalizeAddArgs(args);
      const key = senderKey(event);
      if (!input || !key) return invalidArguments();
      try {
        return await service.addCloneFromSelection(input, key);
      } catch (_) {
        return { code: EC.REQUEST_ERROR, message: "VOICE_CLONE_UNAVAILABLE" };
      }
    }),
  );

  ipcMain.handle(
    "tts-voice-clone:delete",
    withSenderCheck(async (_event, args) => {
      const input = normalizeDeleteArgs(args);
      if (!input) return invalidArguments();
      try {
        return await service.deleteClone(input);
      } catch (_) {
        return { code: EC.REQUEST_ERROR, message: "VOICE_CLONE_UNAVAILABLE" };
      }
    }),
  );

  ipcMain.handle(
    "tts-voice-clone:rename",
    withSenderCheck(async (_event, args) => {
      const input = normalizeRenameArgs(args);
      if (!input) return invalidArguments();
      try {
        return await service.renameClone(input);
      } catch (_) {
        return { code: EC.REQUEST_ERROR, message: "VOICE_CLONE_UNAVAILABLE" };
      }
    }),
  );
}

module.exports = registerTtsVoiceCloneHandlers;
module.exports.normalizeAddArgs = normalizeAddArgs;
module.exports.normalizeBaseArgs = normalizeBaseArgs;
module.exports.normalizeDeleteArgs = normalizeDeleteArgs;
module.exports.normalizeRenameArgs = normalizeRenameArgs;
module.exports.senderKey = senderKey;
