/**
 * Web Audio API 音频混音工具
 * 将语音音频和背景音乐混音，支持音量调整和循环播放
 */

export async function mixAudio(
  voiceUrl: string,
  bgmUrl: string,
  bgmVolumeLevel: number, // 1-10
  targetDurationSeconds: number,
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('mixAudio 需要浏览器环境 (AudioContext 不可用)');
  }
  const audioCtx = new (window.AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext)();

  // Load both audio files as AudioBuffers
  const [voiceBuffer, bgmBuffer] = await Promise.all([
    loadAudioBuffer(audioCtx, voiceUrl),
    loadAudioBuffer(audioCtx, bgmUrl),
  ]);

  const targetDuration = targetDurationSeconds * audioCtx.sampleRate;
  const numberOfChannels = Math.max(voiceBuffer.numberOfChannels, bgmBuffer.numberOfChannels);

  // Create offline context for rendering
  const offlineCtx = new OfflineAudioContext(
    numberOfChannels,
    Math.max(targetDuration, voiceBuffer.length),
    audioCtx.sampleRate,
  );

  // Voice track (full volume)
  const voiceSource = offlineCtx.createBufferSource();
  voiceSource.buffer = voiceBuffer;
  voiceSource.connect(offlineCtx.destination);
  voiceSource.start(0);

  // BGM track with volume adjustment
  const bgmGain = bgmVolumeLevel / 10; // 0.1 ~ 1.0
  const bgmSource = offlineCtx.createBufferSource();
  bgmSource.buffer = createLoopedBuffer(offlineCtx, bgmBuffer, targetDuration);
  const gainNode = offlineCtx.createGain();
  gainNode.gain.value = bgmGain;
  bgmSource.connect(gainNode);
  gainNode.connect(offlineCtx.destination);
  bgmSource.start(0);

  // Render
  const renderedBuffer = await offlineCtx.startRendering();

  // Convert to WAV blob and return URL
  const wavBlob = bufferToWavBlob(renderedBuffer);
  return URL.createObjectURL(wavBlob);
}

function loadAudioBuffer(ctx: AudioContext | OfflineAudioContext, url: string): Promise<AudioBuffer> {
  return fetch(url)
    .then((res) => res.arrayBuffer())
    .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer));
}

/**
 * 创建循环播放的音频 buffer
 */
function createLoopedBuffer(
  ctx: AudioContext | OfflineAudioContext,
  sourceBuffer: AudioBuffer,
  targetSamples: number,
): AudioBuffer {
  if (sourceBuffer.length >= targetSamples) {
    // BGM is longer than target, just slice it
    const sliced = ctx.createBuffer(
      sourceBuffer.numberOfChannels,
      targetSamples,
      sourceBuffer.sampleRate,
    );
    for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) {
      const srcData = sourceBuffer.getChannelData(ch);
      const dstData = sliced.getChannelData(ch);
      for (let i = 0; i < targetSamples; i++) {
        dstData[i] = srcData[i];
      }
    }
    return sliced;
  }

  // Need to loop BGM
  const looped = ctx.createBuffer(
    sourceBuffer.numberOfChannels,
    targetSamples,
    sourceBuffer.sampleRate,
  );
  for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) {
    const srcData = sourceBuffer.getChannelData(ch);
    const dstData = looped.getChannelData(ch);
    for (let i = 0; i < targetSamples; i++) {
      dstData[i] = srcData[i % sourceBuffer.length];
    }
  }
  return looped;
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function bufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChannels = buffer.numberOfChannels;
  const length = buffer.length * numOfChannels * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;

  // Write WAV header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChannels);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChannels); // avg. bytes/sec
  setUint16(numOfChannels * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this demo)
  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // Write interleaved data
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length - 44) {
    for (let i = 0; i < numOfChannels; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });

  function setUint16(value: number) {
    view.setUint16(pos, value, true);
    pos += 2;
  }
  function setUint32(value: number) {
    view.setUint32(pos, value, true);
    pos += 4;
  }
}

/**
 * 上传混音后的音频到存储服务（原 Supabase Storage，已解耦为通用上传回调）
 */
export async function uploadMixedAudio(
  blobUrl: string,
  supabaseUpload: (file: File, bucket: string) => Promise<string>,
): Promise<string> {
  if (typeof fetch === 'undefined' || typeof File === 'undefined') {
    throw new Error('uploadMixedAudio 需要浏览器环境 (fetch/File 不可用)');
  }
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  const file = new File([blob], `mixed-audio-${Date.now()}.wav`, { type: 'audio/wav' });
  return supabaseUpload(file, 'generated-audio');
}
