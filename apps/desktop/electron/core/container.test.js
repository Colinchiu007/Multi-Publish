const Container = require("./container");

describe("Container (DI)", () => {
  test("register and get value", () => {
    const c = new Container();
    c.register("config", { port: 3000 });
    expect(c.get("config")).toEqual({ port: 3000 });
  });

  test("register factory and lazy init", () => {
    const c = new Container();
    let inited = false;
    c.register("db", (container) => {
      inited = true;
      return { url: container.get("config").url };
    });
    c.register("config", { url: "sqlite://test" });
    expect(inited).toBe(false);
    const db = c.get("db");
    expect(inited).toBe(true);
    expect(db.url).toBe("sqlite://test");
  });

  test("factory creates singleton", () => {
    const c = new Container();
    let count = 0;
    c.register("svc", () => { count++; return { id: count }; });
    const a = c.get("svc");
    const b = c.get("svc");
    expect(a).toBe(b);
    expect(count).toBe(1);
  });

  test("registerMany registers all", () => {
    const c = new Container();
    c.registerMany({ a: 1, b: 2, c: 3 });
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });

  test("get throws on unregistered", () => {
    const c = new Container();
    expect(() => c.get("nonexistent")).toThrow("Service not registered: nonexistent");
  });

  test("assertRequired passes when all exist", () => {
    const c = new Container();
    c.register("a", 1);
    c.register("b", 2);
    expect(() => c.assertRequired(["a", "b"])).not.toThrow();
  });

  test("assertRequired throws when missing", () => {
    const c = new Container();
    c.register("a", 1);
    expect(() => c.assertRequired(["a", "b"])).toThrow();
  });
});