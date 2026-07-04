export type AlertLevel = "info" | "success" | "warning" | "error";

export interface Alert { id: string; level: AlertLevel; title: string; message: string; timestamp: number; read: boolean }

const alerts: Alert[] = [];

let _counter = 0;

export function addAlert(level: AlertLevel, title: string, message: string): Alert {
  const alert: Alert = { id: `alert-${++_counter}`, level, title, message, timestamp: Date.now(), read: false };
  alerts.unshift(alert);
  if (alerts.length > 100) alerts.pop();
  return alert;
}

export function getAlerts(): Alert[] { return [...alerts]; }

export function markRead(id: string): void { const a = alerts.find(a => a.id === id); if (a) a.read = true; }

export function clearAll(): void { alerts.length = 0; }