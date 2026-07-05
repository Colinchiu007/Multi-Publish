/**
 * PaymentManager — unit tests
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("path", () => ({
  join: vi.fn((...args) => args.join("/")),
  dirname: vi.fn((p) => p.split("/").slice(0, -1).join("/")),
}));

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/mock/userData") },
}));

vi.mock("./logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("./license-manager", () => ({
  getInstance: vi.fn(() => ({
    activate: vi.fn(),
    isPro: vi.fn(() => true),
  })),
}));

let PaymentManager;

beforeAll(() => {
  PaymentManager = require("./payment-manager");
});

describe("PaymentManager", () => {
  let pm;

  beforeEach(() => {
    pm = new PaymentManager();
    pm._orders = [];
  });

  describe("createOrder", () => {
    it("creates a pending order for pro plan with alipay", () => {
      const order = pm.createOrder("pro", { method: "alipay" });
      expect(order.plan).toBe("pro");
      expect(order.method).toBe("alipay");
      expect(order.amount).toBe(99);
      expect(order.status).toBe("pending");
      expect(order.id).toBeTruthy();
    });

    it("creates a pending order for pro plan with wechat", () => {
      const order = pm.createOrder("pro", { method: "wechat" });
      expect(order.plan).toBe("pro");
      expect(order.method).toBe("wechat");
      expect(order.status).toBe("pending");
    });

    it("throws for unknown plan", () => {
      expect(() => pm.createOrder("enterprise", { method: "alipay" })).toThrow("Unknown plan");
    });

    it("throws for unsupported payment method", () => {
      expect(() => pm.createOrder("pro", { method: "credit_card" })).toThrow("Unsupported payment method");
    });
  });

  describe("getOrder", () => {
    it("returns order when found", () => {
      const created = pm.createOrder("pro", { method: "alipay" });
      const found = pm.getOrder(created.id);
      expect(found).toBeTruthy();
      expect(found.id).toBe(created.id);
    });

    it("returns null when not found", () => {
      expect(pm.getOrder("nonexistent")).toBeNull();
    });
  });

  describe("listOrders", () => {
    it("returns all orders as a copy", () => {
      pm.createOrder("pro", { method: "alipay" });
      pm.createOrder("pro", { method: "wechat" });
      const orders = pm.listOrders();
      expect(orders).toHaveLength(2);
      // Verify it's a copy
      orders.push({ fake: true });
      expect(pm.listOrders()).toHaveLength(2);
    });
  });

  describe("getOrderStatus", () => {
    it("returns status of existing order", () => {
      const order = pm.createOrder("pro", { method: "alipay" });
      expect(pm.getOrderStatus(order.id)).toBe("pending");
    });

    it("returns null for non-existent order", () => {
      expect(pm.getOrderStatus("nonexistent")).toBeNull();
    });
  });

  describe("completePayment", () => {
    it("completes a pending order and sets txnId", () => {
      const order = pm.createOrder("pro", { method: "alipay" });
      const result = pm.completePayment(order.id, "TXN-123");
      expect(result).toBe(true);
      const updated = pm.getOrder(order.id);
      expect(updated.status).toBe("paid");
      expect(updated.txnId).toBe("TXN-123");
      expect(updated.completedAt).toBeTruthy();
    });

    it("generates txnId when not provided", () => {
      const order = pm.createOrder("pro", { method: "alipay" });
      pm.completePayment(order.id);
      const updated = pm.getOrder(order.id);
      expect(updated.txnId).toMatch(/^txn_/);
    });

    it("returns false for non-existent order", () => {
      expect(pm.completePayment("ghost", "TXN-1")).toBe(false);
    });

    it("returns false if order is not pending", () => {
      const order = pm.createOrder("pro", { method: "alipay" });
      pm.completePayment(order.id, "TXN-1");
      expect(pm.completePayment(order.id, "TXN-2")).toBe(false);
    });
  });

  describe("failPayment", () => {
    it("fails a pending order with error message", () => {
      const order = pm.createOrder("pro", { method: "alipay" });
      const result = pm.failPayment(order.id, "余额不足");
      expect(result).toBe(true);
      const updated = pm.getOrder(order.id);
      expect(updated.status).toBe("failed");
      expect(updated.error).toBe("余额不足");
    });

    it("returns false for non-pending order", () => {
      const order = pm.createOrder("pro", { method: "alipay" });
      pm.completePayment(order.id, "TXN-1");
      expect(pm.failPayment(order.id, "已支付不能失败")).toBe(false);
    });
  });

  describe("cancelPayment", () => {
    it("cancels a pending order", () => {
      const order = pm.createOrder("pro", { method: "alipay" });
      const result = pm.cancelPayment(order.id);
      expect(result).toBe(true);
      const updated = pm.getOrder(order.id);
      expect(updated.status).toBe("cancelled");
    });

    it("returns false for non-pending order", () => {
      const order = pm.createOrder("pro", { method: "alipay" });
      pm.completePayment(order.id, "TXN-1");
      expect(pm.cancelPayment(order.id)).toBe(false);
    });
  });

  describe("simulatePayment", () => {
    it("completes order with simulated txnId", () => {
      const order = pm.createOrder("pro", { method: "alipay" });
      const result = pm.simulatePayment(order.id);
      expect(result).toBe(true);
      const updated = pm.getOrder(order.id);
      expect(updated.status).toBe("paid");
      expect(updated.txnId).toMatch(/^sim_/);
    });
  });
});