import type { IpcMain } from "electron";

interface UploadDeps {
  _chunkedUploader: {
    upload: (filePath: string, uploadChunkFn: unknown) => Promise<{ success: boolean; [key: string]: unknown }>;
    cancel: () => void;
  };
}

export default function registerHandlers(ipcMain: IpcMain, deps: UploadDeps): void {
  const { _chunkedUploader } = deps;

  ipcMain.handle("upload:chunked", async (_, { filePath, uploadChunkFn }: { filePath: string; uploadChunkFn: unknown }) => {
    try {
      const result = await _chunkedUploader.upload(filePath, uploadChunkFn);
      return { code: result.success ? 0 : -1, data: result };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { code: -1, message: msg };
    }
  });

  ipcMain.handle("upload:cancel", async () => {
    _chunkedUploader.cancel();
    return { code: 0 };
  });
}