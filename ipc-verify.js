// ipc-verify.js — 直接处在前端页面时调用 IPC 验证
const http = require('http');
const WebSocket = require('ws');

const CDP = 'http://127.0.0.1:10914';

http.get(CDP + '/json', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const pages = JSON.parse(d);
    const main = pages.find(p => p.title === '社媒管家');
    if (!main) { console.log('page not found'); process.exit(1); }
    const ws = new WebSocket(main.webSocketDebuggerUrl);
    let step = 0;
    
    const send = (method, params) => {
      const id = ++step;
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    };
    
    ws.on('message', (msg) => {
      const p = JSON.parse(msg);
      const v = p.result?.result?.value;
      const d = v !== undefined ? (typeof v === 'string' ? v.substring(0, 600) : JSON.stringify(v).substring(0, 600)) : '-';
      console.log(`[${p.id}] ${d}`);
      
      if (p.id === 1) {
        // 直接调用 IPC（不先点卡片，直接传参数）
        send('Runtime.evaluate', {
          expression: `(async function(){
            try {
              var params = {
                text: '长安城的灯火在暮色中次第亮起。',
                inputMode: 'text',
                checkpointPolicy: 'none',
                autoAdvance: true,
                background: true,
                uiLocale: 'zh',
                story2videoTextConfig: {
                  version: 1, mode: 'text', prompt: '长安城的灯火在暮色中次第亮起。',
                  size: '1920x1080', contentType: 'auto',
                  split: { language: 'auto', mode: 'balanced', maxSentenceLength: 200, targetSeconds: 6, baseWordsPerSecond: 4.5, minWords: 10, maxWords: 50, enforceSentenceBoundary: true, overflowToNext: true, subtitleMinChars: 8, subtitleMaxChars: 15, subtitleTiming: 'proportional' },
                  optimize: { style: 'realistic', creativeLevel: 5, optimizationStrategy: 'llm', maxLength: 2000, numCandidates: 1, autoDetectStyle: true, negativePrompt: '', context: '' },
                  image: { provider: '', model: '', style: 'cinematic', effect: 'zoom-in', aspectRatio: '16:9' },
                  video: { mode: 'off', shortVideoHandling: 'loop', provider: '', model: '', fixedRatio: 25, minRatio: 20, maxRatio: 40, maxScenes: 3 },
                  creation: { mode: 'auto', materialMode: 'all-images' },
                  voice: { provider: '', model: '', id: 'default', speed: 1, volume: 1 },
                  subtitle: { enabled: true, font: 'Noto Sans SC', size: 'size3', style: 'style1', color: 'white' },
                  bgm: { enabled: false, path: '', volume: 0.3 },
                  transition: 'fade', sceneDurationMode: 'auto', minSceneDuration: 3, templateId: '',
                  watermark: { enabled: false, text: '' },
                  output: { fps: 30, format: 'mp4' },
                  publish: { enabled: false, platforms: [], title: '', content: '', tags: [], coverUrl: '' }
                }
              };
              var result = await window.electronAPI.pipelineStartOrchestrated('story2video-compose', JSON.parse(JSON.stringify(params)));
              return JSON.stringify(result);
            } catch(e) {
              return JSON.stringify({ error: e.message || String(e) });
            }
          })()`,
          returnByValue: true,
          awaitPromise: true
        });
      }
      if (p.id === 2) {
        console.log('\n=== IPC RESULT ===');
        console.log(v);
        console.log('\n=== DONE ===');
        ws.close();
        process.exit(0);
      }
    });
    
    ws.on('open', () => {
      console.log('Connected');
      send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
    });
    ws.on('error', e => { console.error('WS Error:', e.message); process.exit(1); });
    setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 30000);
  });
}).on('error', e => console.error('HTTP Error:', e.message));