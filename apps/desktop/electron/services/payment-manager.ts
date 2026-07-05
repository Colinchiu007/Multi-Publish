/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 payment-manager.js (JS 版) 替代。
 */

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { default as logger } from "./logger";

interface Order {
  id: string;
  plan: string;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  paymentMethod: string;
  createdAt: string;
  completedAt?: string;
}

function getOrdersPath(): string {
  return path.join(app.getPath("userData"), "orders.json");
}

let _orders: Order[] = [];

function _load(): void {
  try {
    const p = getOrdersPath();
    if (fs.existsSync(p)) {
      _orders = JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch (e: unknown) {
    logger.warn("PaymentManager", `Load failed: ${(e as Error).message}`);
    _orders = [];
  }
}

function _save(): void {
  try {
    const p = getOrdersPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(_orders, null, 2), "utf-8");
  } catch (e: unknown) {
    logger.error("PaymentManager", `Save failed: ${(e as Error).message}`);
  }
}

export function createOrder(plan: string, amount: number, currency: string = "CNY"): Order {
  _load();
  const order: Order = {
    id: `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    plan, amount, currency,
    status: "pending",
    paymentMethod: "simulate",
    createdAt: new Date().toISOString(),
  };
  _orders.push(order);
  _save();
  logger.info("PaymentManager", `Order created: ${order.id} (${plan}, ${amount}${currency})`);
  return order;
}

export async function simulatePayment(orderId: string): Promise<boolean> {
  _load();
  const order = _orders.find((o) => o.id === orderId);
  if (!order) { logger.warn("PaymentManager", `Order not found: ${orderId}`); return false; }
  if (order.status !== "pending") return false;

  await new Promise((r) => setTimeout(r, 2000));
  order.status = "completed";
  order.completedAt = new Date().toISOString();
  _save();

  const { activatePro } = require("./license-manager");
  activatePro(orderId);

  logger.info("PaymentManager", `Payment simulated: ${orderId}`);
  return true;
}

export function getOrders(): Order[] {
  _load();
  return [..._orders];
}

export function getOrder(id: string): Order | undefined {
  _load();
  return _orders.find((o) => o.id === id);
}