// @ts-check
/**
 * model-provider-seeds — 预设模型服务商种子数据
 *
 * 5 类模型：llm / tts / speech_recognition / image / video
 * 初始化时通过 INSERT OR IGNORE 写入 model_providers 表
 */

const CATEGORIES = {
  LLM: 'llm',
  TTS: 'tts',
  SPEECH_RECOGNITION: 'speech_recognition',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
};

const CATEGORY_LABELS = {
  llm: '推理模型',
  tts: 'TTS语音',
  speech_recognition: '语音识别',
  image: '图片生成',
  video: '视频模型',
  audio: '音频生成',
};

/**
 * 预设服务商列表
 * is_preset = 1 表示预设，不允许删除，只能禁用
 */
const PRESET_PROVIDERS = [
  // ─── 推理模型 (LLM) ──────────────────────────
  {
    id: 'anthropic', name: 'Anthropic', category: 'llm',
    base_url: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku', 'claude-3-opus'],
    is_preset: 1,
  },
  {
    id: 'openai', name: 'OpenAI', category: 'llm',
    base_url: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
    is_preset: 1,
  },
  {
    id: 'gemini', name: 'Gemini', category: 'llm',
    base_url: 'https://generativelanguage.googleapis.com',
    models: ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro'],
    is_preset: 1,
  },
  {
    id: 'openrouter', name: 'OpenRouter', category: 'llm',
    base_url: 'https://openrouter.ai/api/v1',
    models: ['auto', 'anthropic/claude-sonnet-4-20250514', 'openai/gpt-4o'],
    is_preset: 1,
  },
  {
    id: 'ollama', name: 'Ollama (本地)', category: 'llm',
    base_url: 'http://localhost:11434',
    models: ['llama3', 'qwen2', 'mistral', 'gemma2'],
    is_preset: 1,
  },
  {
    id: 'doubao-llm', name: '豆包', category: 'llm',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-pro-128k', 'doubao-pro-32k', 'doubao-lite-32k'],
    is_preset: 1,
  },
  {
    id: 'deepseek', name: 'DeepSeek', category: 'llm',
    base_url: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    is_preset: 1,
  },

  // ─── TTS 语音合成 ────────────────────────────
  {
    id: 'elevenlabs', name: 'ElevenLabs', category: 'tts',
    base_url: 'https://api.elevenlabs.io/v1',
    models: ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_monolingual_v1'],
    is_preset: 1,
  },
  {
    id: 'openai-tts', name: 'OpenAI TTS', category: 'tts',
    base_url: 'https://api.openai.com/v1',
    models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'],
    is_preset: 1,
  },
  {
    id: 'doubao-tts', name: '豆包 TTS', category: 'tts',
    base_url: 'https://openspeech.bytedance.com/api/v1/tts',
    models: ['doubao-tts', 'doubao-streaming-tts'],
    is_preset: 1,
  },
  {
    id: 'google-tts', name: 'Google TTS', category: 'tts',
    base_url: 'https://texttospeech.googleapis.com/v1',
    models: ['google-tts', 'waveNet', 'neural2'],
    is_preset: 1,
  },
  {
    id: 'piper', name: 'Piper (本地)', category: 'tts',
    base_url: '',
    models: ['piper'],
    is_preset: 1,
  },

  // ─── 语音识别 ────────────────────────────────
  {
    id: 'whisper', name: 'OpenAI Whisper', category: 'speech_recognition',
    base_url: 'https://api.openai.com/v1',
    models: ['whisper-1'],
    is_preset: 1,
  },
  {
    id: 'google-stt', name: 'Google Speech-to-Text', category: 'speech_recognition',
    base_url: 'https://speech.googleapis.com/v1',
    models: ['google-stt', 'google-stt-long'],
    is_preset: 1,
  },
  {
    id: 'doubao-stt', name: '豆包语音识别', category: 'speech_recognition',
    base_url: 'https://openspeech.bytedance.com/api/v2/asr',
    models: ['doubao-asr', 'doubao-streaming-asr'],
    is_preset: 1,
  },
  {
    id: 'baidu-stt', name: '百度语音识别', category: 'speech_recognition',
    base_url: 'https://vop.baidu.com/server_api',
    models: ['baidu-asr'],
    is_preset: 1,
  },
  {
    id: 'local-whisper', name: '本地 Whisper', category: 'speech_recognition',
    base_url: '',
    models: ['whisper-cpp', 'whisper-large-v3'],
    is_preset: 1,
  },

  // ─── 图片生成 ────────────────────────────────
  {
    id: 'flux', name: 'Flux', category: 'image',
    base_url: 'https://api.bfl.ml/v1',
    models: ['flux-pro', 'flux-dev', 'flux-schnell'],
    is_preset: 1,
  },
  {
    id: 'dall-e', name: 'DALL-E', category: 'image',
    base_url: 'https://api.openai.com/v1',
    models: ['gpt-image-1', 'dall-e-3', 'dall-e-2'],
    is_preset: 1,
  },
  {
    id: 'recraft', name: 'Recraft', category: 'image',
    base_url: 'https://external.api.recraft.ai/v1',
    models: ['recraft-v3', 'recraft-20b'],
    is_preset: 1,
  },
  {
    id: 'imagen', name: 'Imagen', category: 'image',
    base_url: 'https://generativelanguage.googleapis.com',
    models: ['imagen-3'],
    is_preset: 1,
  },
  {
    id: 'grok-image', name: 'Grok Image', category: 'image',
    base_url: 'https://api.x.ai/v1',
    models: ['grok-image'],
    is_preset: 1,
  },
  {
    id: 'pixabay', name: 'Pixabay', category: 'image',
    base_url: 'https://pixabay.com/api/',
    models: ['pixabay'],
    is_preset: 1,
  },
  {
    id: 'pexels', name: 'Pexels', category: 'image',
    base_url: 'https://api.pexels.com/v1',
    models: ['pexels'],
    is_preset: 1,
  },
  {
    id: 'local-diffusion', name: '本地扩散', category: 'image',
    base_url: '',
    models: ['sd-1.5', 'sdxl', 'sd3'],
    is_preset: 1,
  },
  {
    id: 'comfyui', name: 'ComfyUI', category: 'image',
    base_url: 'http://localhost:8188',
    models: ['comfyui'],
    is_preset: 1,
  },

  // ─── 视频模型 ────────────────────────────────
  {
    id: 'hunyuan', name: '腾讯混元', category: 'video',
    base_url: 'https://hunyuan.tencentcloudapi.com',
    models: ['hunyuan-video'],
    is_preset: 1,
  },
  {
    id: 'cogvideo', name: 'CogVideo', category: 'video',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['cogvideo'],
    is_preset: 1,
  },
  {
    id: 'grok-video', name: 'Grok Video', category: 'video',
    base_url: 'https://api.x.ai/v1',
    models: ['grok-video'],
    is_preset: 1,
  },
  {
    id: 'heygen', name: 'HeyGen', category: 'video',
    base_url: 'https://api.heygen.com/v2',
    models: ['heygen-video'],
    is_preset: 1,
  },
  {
    id: 'kling', name: 'Kling', category: 'video',
    base_url: 'https://api.klingai.com/v1',
    models: ['kling-video'],
    is_preset: 1,
  },
  {
    id: 'runway', name: 'Runway', category: 'video',
    base_url: 'https://api.runwayml.com/v1',
    models: ['runway-gen3', 'runway-gen4'],
    is_preset: 1,
  },
  {
    id: 'veo', name: 'Veo', category: 'video',
    base_url: 'https://generativelanguage.googleapis.com',
    models: ['veo'],
    is_preset: 1,
  },
  {
    id: 'wan', name: 'Wan (万相)', category: 'video',
    base_url: 'https://dashscope.aliyuncs.com/api/v1',
    models: ['wan-video'],
    is_preset: 1,
  },
  {
    id: 'minimax', name: 'MiniMax', category: 'video',
    base_url: 'https://api.minimax.chat/v1',
    models: ['minimax-video'],
    is_preset: 1,
  },
  {
    id: 'ltx', name: 'LTX Video', category: 'video',
    base_url: '',
    models: ['ltx-video'],
    is_preset: 1,
  },
  {
    id: 'seedance', name: 'Seedance', category: 'video',
    base_url: 'https://api.seedance.ai/v1',
    models: ['seedance'],
    is_preset: 1,
  },
  {
    id: 'higgsfield', name: 'Higgsfield', category: 'video',
    base_url: 'https://api.higgsfield.ai/v1',
    models: ['higgsfield-video'],
    is_preset: 1,
  },
  // ─── 音频生成 ────────────────────────────────
  {
    id: 'suno', name: 'Suno', category: 'audio',
    base_url: 'https://api.suno.ai/v1',
    models: ['suno-v4'],
    is_preset: 1,
  },
  {
    id: 'musicgen', name: 'MusicGen', category: 'audio',
    base_url: '',
    models: ['musicgen'],
    is_preset: 1,
  },
  {
    id: 'pixabay-music', name: 'Pixabay Music', category: 'audio',
    base_url: 'https://pixabay.com/api/',
    models: ['pixabay-music'],
    is_preset: 1,
  },
  {
    id: 'freesound', name: 'Freesound', category: 'audio',
    base_url: 'https://freesound.org/apiv2',
    models: ['freesound'],
    is_preset: 1,
  },
  {
    id: 'music-library', name: '本地音乐库', category: 'audio',
    base_url: '',
    models: ['local-library'],
    is_preset: 1,
  },
];

module.exports = { CATEGORIES, CATEGORY_LABELS, PRESET_PROVIDERS };
