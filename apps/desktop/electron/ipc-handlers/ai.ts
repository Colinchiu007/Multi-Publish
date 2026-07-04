import type { IpcMain } from "electron";
interface AiDeps { aiWriter: { isConfigured: () => Promise<boolean>; generateTitles: (t: string) => Promise<string[]>; enhanceContent: (c: string, s: string) => Promise<string>; generateSummary: (c: string) => Promise<string> } }
export default function registerHandlers(ipcMain: IpcMain, deps: AiDeps): void {
  const { aiWriter } = deps;
  ipcMain.handle("ai:is-configured", async () => { try { return { code: 0, data: await aiWriter.isConfigured() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("ai:generate-titles", async (_, topic: string) => { try { return { code: 0, data: await aiWriter.generateTitles(topic) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("ai:enhance-content", async (_, { content, style }: { content: string; style: string }) => { try { return { code: 0, data: await aiWriter.enhanceContent(content, style) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("ai:generate-summary", async (_, content: string) => { try { return { code: 0, data: await aiWriter.generateSummary(content) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}