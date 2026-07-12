/**
 * AI视觉识别提供者 - 支持 OpenAI 兼容协议（OpenAI / SenseNova / DeepSeek 等）
 * 及 Anthropic Claude Vision
 *
 * 配置方式（环境变量）:
 *   AI_PROVIDER       openai | sensenova | claude  (默认: openai)
 *   SENSENOVA_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
 *   SENSENOVA_BASE_URL / OPENAI_BASE_URL  (可选，覆盖默认)
 *   SENSENOVA_MODEL   / OPENAI_MODEL      (可选，覆盖默认)
 *
 * 使用方式:
 *   const ai = new VisionProvider({ provider: 'sensenova' });
 *   const result = await ai.analyzeImage(screenshotPath, '检查登录按钮');
 */

const fs = require('fs');
const path = require('path');

// 尝试加载 .env 文件（不依赖 dotenv）
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 去除引号
    value = value.replace(/^['\"]|['\"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv(path.join(__dirname, '..', '.env'));

let OpenAI, Anthropic;
try { OpenAI = require('openai').OpenAI || require('openai'); } catch {}
try { Anthropic = require('@anthropic-ai/sdk'); } catch {}

class VisionProvider {
  constructor(options = {}) {
    this.provider = (options.provider || process.env.AI_PROVIDER || 'openai').toLowerCase();
    this.timeout = options.timeout || 30000;

    // OpenAI 兼容协议（OpenAI / SenseNova / DeepSeek / 任何兼容 /v1/chat/completions 的服务）
    this.openaiApiKey = options.apiKey
      || process.env.SENSENOVA_API_KEY
      || process.env.OPENAI_API_KEY
      || '';
    this.openaiBaseUrl = options.baseUrl
      || process.env.SENSENOVA_BASE_URL
      || process.env.OPENAI_BASE_URL
      || '';
    this.openaiModel = options.model
      || process.env.SENSENOVA_MODEL
      || process.env.OPENAI_MODEL
      || (this.provider === 'sensenova' ? 'deepseek-v4-flash' : 'gpt-4o');

    // Anthropic（消息格式不同，单独处理）
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
    this.anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

    if (this.provider === 'claude' || this.provider === 'anthropic') {
      if (Anthropic && this.anthropicApiKey) {
        this.client = new Anthropic({ apiKey: this.anthropicApiKey });
      }
    } else if (OpenAI && this.openaiApiKey) {
      const opts = { apiKey: this.openaiApiKey, timeout: this.timeout };
      if (this.openaiBaseUrl) opts.baseURL = this.openaiBaseUrl;
      this.client = new OpenAI(opts);
    }
  }

  /**
   * 判断是否已正确配置
   */
  isConfigured() {
    if (this.provider === 'claude' || this.provider === 'anthropic') {
      return !!(Anthropic && this.anthropicApiKey);
    }
    return !!(OpenAI && this.openaiApiKey);
  }

  /**
   * 分析图片内容
   */
  async analyzeImage(image, prompt) {
    if (!this.isConfigured()) {
      throw new Error(`AI 服务未配置 (provider=${this.provider})。请在 .env 文件中设置 API Key`);
    }
    const imageData = this._getImageData(image);

    if (this.provider === 'claude' || this.provider === 'anthropic') {
      return this._analyzeWithClaude(imageData, prompt);
    }
    return this._analyzeWithOpenAICompatible(imageData, prompt);
  }

  /**
   * 检查图片中是否包含指定内容
   */
  async contains(image, expectedText) {
    const result = await this.analyzeImage(image, `图片中是否包含"${expectedText}"？只回答"是"或"否"。`);
    return /是|Yes|yes|包含|存在/i.test(result);
  }

  /**
   * 检查图片中是否存在某个UI元素
   */
  async elementExists(image, elementName) {
    const result = await this.analyzeImage(image,
      `分析截图，判断是否存在"${elementName}"元素（如按钮、输入框、导航菜单等）？只回答"存在"或"不存在"。`
    );
    return /存在|是|Yes|yes/i.test(result);
  }

  _getImageData(image) {
    if (Buffer.isBuffer(image)) return image;
    if (typeof image === 'string') {
      if (fs.existsSync(image)) return fs.readFileSync(image);
      return image; // 假设是 URL
    }
    throw new Error('Invalid image format');
  }

  /**
   * 调用 OpenAI 兼容协议（适用于 sensenova、openai、deepseek 等）
   */
  async _analyzeWithOpenAICompatible(imageData, prompt) {
    const base64Data = imageData.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Data}`;

    const response = await this.client.chat.completions.create({
      model: this.openaiModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }],
      max_tokens: 1024
    });

    return response.choices[0].message.content;
  }

  async _analyzeWithClaude(imageData, prompt) {
    const base64Data = imageData.toString('base64');
    const response = await this.client.messages.create({
      model: this.anthropicModel,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Data } }
        ]
      }]
    });
    return response.content[0].text;
  }
}

module.exports = { VisionProvider };
