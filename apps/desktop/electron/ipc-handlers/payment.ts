import type { IpcMain } from "electron";
interface PaymentDeps { paymentManager: { createOrder: (p: unknown) => Promise<unknown>; verify: (id: string) => Promise<unknown>; getPlans: () => Promise<unknown[]> } }
export default function registerHandlers(ipcMain: IpcMain, deps: PaymentDeps): void {
  const { paymentManager } = deps;
  ipcMain.handle("payment:create-order", async (_, params: unknown) => { try { return { code: 0, data: await paymentManager.createOrder(params) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("payment:verify", async (_, id: string) => { try { return { code: 0, data: await paymentManager.verify(id) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("payment:plans", async () => { try { return { code: 0, data: await paymentManager.getPlans() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}