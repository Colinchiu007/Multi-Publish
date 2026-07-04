import type { IpcMain } from "electron";
interface AnalyticsDeps { publishImpactTracker?: { getStats: () => Promise<unknown> }; usageTracker?: { getUsage: () => Promise<unknown> } }
export default function registerHandlers(ipcMain: IpcMain, deps: AnalyticsDeps): void {
  const { publishImpactTracker, usageTracker } = deps;
  ipcMain.handle("analytics:stats", async () => { try { return { code: 0, data: await publishImpactTracker?.getStats() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("analytics:usage", async () => { try { return { code: 0, data: await usageTracker?.getUsage() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}