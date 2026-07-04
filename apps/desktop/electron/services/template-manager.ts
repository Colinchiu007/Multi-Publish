import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { default as logger } from "./logger";

interface Template {
  id: string;
  name: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
  coverUrl?: string;
  createdAt: string;
  updatedAt: string;
}

let _counter = 0;
function _uid(): string {
  _counter++;
  return "tpl_" + Date.now() + "_" + _counter;
}

function getDataPath(): string {
  return path.join(app.getPath("userData"), "templates.json");
}

export class TemplateManager {
  private dataPath: string;
  private templates: Template[] = [];
  private loaded: boolean = false;

  constructor(dataPath?: string) {
    this.dataPath = dataPath || getDataPath();
  }

  private _ensureLoaded(): void {
    if (this.loaded) return;
    try {
      if (fs.existsSync(this.dataPath)) {
        const raw = fs.readFileSync(this.dataPath, "utf-8");
        this.templates = JSON.parse(raw);
      }
    } catch (e: unknown) {
      logger.warn("TemplateManager", `Load failed: ${(e as Error).message}`);
      this.templates = [];
    }
    this.loaded = true;
  }

  private _save(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dataPath, JSON.stringify(this.templates, null, 2), "utf-8");
    } catch (e: unknown) {
      logger.error("TemplateManager", `Save failed: ${(e as Error).message}`);
    }
  }

  list(category?: string): Template[] {
    this._ensureLoaded();
    if (category) return this.templates.filter((t) => t.category === category);
    return [...this.templates];
  }

  get(id: string): Template | undefined {
    this._ensureLoaded();
    return this.templates.find((t) => t.id === id);
  }

  add(tmpl: Omit<Template, "id" | "createdAt" | "updatedAt">): string {
    this._ensureLoaded();
    const now = new Date().toISOString();
    const tpl: Template = { ...tmpl, id: _uid(), createdAt: now, updatedAt: now };
    this.templates.push(tpl);
    this._save();
    return tpl.id;
  }

  update(id: string, fields: Partial<Omit<Template, "id" | "createdAt">>): boolean {
    this._ensureLoaded();
    const idx = this.templates.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.templates[idx] = { ...this.templates[idx], ...fields, updatedAt: new Date().toISOString() };
    this._save();
    return true;
  }

  delete(id: string): boolean {
    this._ensureLoaded();
    const idx = this.templates.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.templates.splice(idx, 1);
    this._save();
    return true;
  }

  getCategories(): string[] {
    this._ensureLoaded();
    return [...new Set(this.templates.map((t) => t.category))];
  }

  importFromJson(json: string): number {
    this._ensureLoaded();
    try {
      const items: any[] = JSON.parse(json);
      let count = 0;
      for (const item of items) {
        if (item.title && item.content) {
          this.add({ name: item.name || "", category: item.category || "imported", title: item.title, content: item.content, tags: item.tags || [] });
          count++;
        }
      }
      return count;
    } catch (_e) { return 0; }
  }
}