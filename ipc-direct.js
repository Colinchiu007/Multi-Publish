// ipc-direct-test.js — 直接调用 IPC 测试流水线启动，捕获完整返回值
const http = require('http');
const WebSocket = require('ws');

const CDP = 'http://127.0.0.1:10914';
const VITE = 'http://127.0.0.1:6866';

http.get(CDP + '/json', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const pages = JSON.parse(d);
    const main = pages.find(p => p.title === '社媒管家');
    if (!main) { console.log('page not found'); process.exit(1); }
    const ws = new WebSocket(main.webSocketDebuggerUrl);
    let step = 0;
    
    function send(method, params) {
      const id = ++step;
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    }
    
    ws.on('message', (msg) => {
      const p = JSON.parse(msg);
      const val = p.result?.result?.value;
      const desc = val !== undefined ? (typeof val === 'string' ? val.substring(0, 500) : JSON.stringify(val).substring(0, 500)) : 'no value';
      console.log(`[${p.id}] ${desc}`);
      
      if (p.id === 1) {
        // 导航到创作页
        send('Page.navigate', { url: VITE + '/#/create' });
      }
      if (p.id === 2) {
        // 等待页面加载，然后直接调用 IPC
        setTimeout(() => send('Runtime.evaluate', {
          expression: `(async function(){
            try {
              // 先点击故事讲述卡片进入编辑页
              var all = document.querySelectorAll('*');
              for (var i = 0; i < all.length; i++) {
                if (all[i].textContent && all[i].textContent.includes('故事讲述') && all[i].children.length <= 2 && all[i].offsetParent) {
                  all[i].click();
                  break;
                }
              }
              await new Promise(r => setTimeout(r, 3000));
              
              // 检查是否成功进入编辑页
              var ta = document.querySelector('textarea');
              if (!ta || !ta.offsetParent) {
                return 'editor not loaded after click';
              }
              
              // 输入文案
              var ns = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
              ns.call(ta, '长安城的灯火在暮色中次第亮起。');
              ta.dispatchEvent(new Event('input', { bubbles: true }));
              await new Promise(r => setTimeout(r, 1000));
              
              // 直接调用 IPC
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
        }), 3000);
      }
      if (p.id === 3) {
        console.log('\n=== IPC RESULT ===');
        console.log(val);
        console.log('\n=== DONE ===');
        ws.close();
        process.exit(0);
      }
    });
    
    ws.on('open', () => {
      console.log('Connected');
      send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
    });
    ws.on('error', (e) => { console.error('WS Error:', e.message); process.exit(1); });
    setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 60000);
  });
}).on('error', e => console.error('HTTP Error:', e.message));