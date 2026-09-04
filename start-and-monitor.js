// start-and-monitor.js — 直接 IPC 启动流水线，轮询完成状态，验证视频
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
    const later = (id, ms, fn) => setTimeout(fn, ms);
    
    ws.on('message', (msg) => {
      const p = JSON.parse(msg);
      const v = p.result?.result?.value;
      const d = v !== undefined ? (typeof v === 'string' ? v.substring(0, 600) : JSON.stringify(v).substring(0, 600)) : '-';
      console.log(`[${p.id}] ${d}`);
      
      if (p.id === 1) {
        // 启动流水线
        send('Runtime.evaluate', {
          expression: `(async function(){
            try {
              var params = {
                text: '长安城的灯火在暮色中次第亮起，街道两旁的槐树投下斑驳的影子。',
                inputMode: 'text',
                checkpointPolicy: 'none',
                autoAdvance: true,
                background: true,
                uiLocale: 'zh',
                story2videoTextConfig: {
                  version: 1, mode: 'text', prompt: '长安城的灯火在暮色中次第亮起，街道两旁的槐树投下斑驳的影子。',
                  size: '720x1280', contentType: 'general',
                  split: { language: 'auto', mode: 'balanced', maxSentenceLength: 200, targetSeconds: 6, baseWordsPerSecond: 4.5, minWords: 10, maxWords: 50, enforceSentenceBoundary: true, overflowToNext: true, subtitleMinChars: 8, subtitleMaxChars: 15, subtitleTiming: 'proportional' },
                  optimize: { style: 'realistic', creativeLevel: 5, optimizationStrategy: 'llm', maxLength: 2000, numCandidates: 1, autoDetectStyle: true, negativePrompt: '', context: '' },
                  image: { provider: '', model: '', style: 'cinematic', effect: 'zoom-in', aspectRatio: '9:16' },
                  video: { mode: 'off', shortVideoHandling: 'loop', provider: '', model: '', fixedRatio: 25, minRatio: 20, maxRatio: 40, maxScenes: 3 },
                  creation: { mode: 'auto', materialMode: 'all-images' },
                  voice: { provider: '', model: '', id: 'default', speed: 1, volume: 1 },
                  subtitle: { enabled: true, font: 'Noto Sans SC', size: 'size3', style: 'style1', color: 'white' },
                  bgm: { enabled: false, path: '', volume: 0.3 },
                  transition: 'fade', sceneDurationMode: 'follow-audio', minSceneDuration: 3, templateId: '',
                  watermark: { enabled: false, text: '' },
                  output: { fps: 30, format: 'mp4' },
                  publish: { enabled: false, platforms: [], title: '', content: '', tags: [], coverUrl: '' }
                }
              };
              var result = await window.electronAPI.pipelineStartOrchestrated('story2video-compose', JSON.parse(JSON.stringify(params)));
              window.__s2vRunId = result?.data?.runId || null;
              return JSON.stringify(result);
            } catch(e) { return JSON.stringify({ error: e.message || String(e) }); }
          })()`,
          returnByValue: true,
          awaitPromise: true
        });
      }
      if (p.id === 2) {
        const parsed = JSON.parse(v);
        console.log('启动结果 - success:', parsed.data?.success, 'runId:', parsed.data?.runId, 'errorCode:', parsed.data?.errorCode);
        if (!parsed.data?.success) {
          console.log('流水线启动失败，停止');
          ws.close(); process.exit(1);
        }
        const runId = parsed.data?.runId;
        if (!runId) { console.log('无 runId'); ws.close(); process.exit(1); }
        console.log('流水线已启动，runId:', runId, '开始轮询状态...');
        
        // 轮询流水线状态
        let pollCount = 0;
        const poll = () => {
          pollCount++;
          send('Runtime.evaluate', {
            expression: `(async function(){
              try {
                var ctx = await window.electronAPI.pipelineGetRunContext('${runId}');
                return JSON.stringify(ctx);
              } catch(e) { return JSON.stringify({ error: e.message }); }
            })()`,
            returnByValue: true,
            awaitPromise: true
          });
        };
        
        // 保存 poll 引用
        window.__poll = poll;
        poll();
      }
      // 轮询结果 (id >= 3)
      if (p.id >= 3) {
        try {
          const ctx = JSON.parse(v);
          const status = ctx?.data?.status || ctx?.status;
          const stages = ctx?.data?.stages || ctx?.stages;
          const error = ctx?.data?.error || ctx?.error;
          const currentStage = ctx?.data?.currentStage;
          const progress = ctx?.data?.progress;
          
          console.log(`轮询 #${p.id - 2}: status=${status}, currentStage=${currentStage}, progress=${progress}`);
          
          if (stages) {
            stages.forEach(s => {
              console.log(`  ${s.name}: ${s.status}`);
            });
          }
          
          if (status === 'completed') {
            console.log('\n✅ 流水线完成！');
            // 查找输出视频
            send('Runtime.evaluate', {
              expression: `(async function(){
                try {
                  var ctx = await window.electronAPI.pipelineGetRunContext('${runId}');
                  var d = ctx?.data || ctx;
                  var ctxObj = d.context || d;
                  var output = ctxObj?.compose?.output || ctxObj?.publish?.output || ctxObj?.result;
                  return JSON.stringify({ output: output, fullContext: JSON.stringify(ctxObj).substring(0, 500) });
                } catch(e) { return JSON.stringify({ error: e.message }); }
              })()`,
              returnByValue: true,
              awaitPromise: true
            });
            return;
          }
          
          if (status === 'failed') {
            console.log('\n❌ 流水线失败:', error);
            ws.close(); process.exit(1);
            return;
          }
          
          // 继续轮询
          if (pollCount < 120) {
            later(p.id, 10000, () => window.__poll());
          } else {
            console.log('轮询超时 (20分钟)');
            ws.close(); process.exit(1);
          }
        } catch(e) {
          console.log('解析状态失败:', e.message);
          if (pollCount < 120) later(p.id, 10000, () => window.__poll());
        }
      }
      // 输出视频
      if (p.id > 100) {
        console.log('输出:', v);
        ws.close(); process.exit(0);
      }
    });
    
    ws.on('open', () => {
      console.log('Connected');
      send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
    });
    ws.on('error', e => { console.error('WS Error:', e.message); process.exit(1); });
    setTimeout(() => { console.log('TIMEOUT 20min'); process.exit(1); }, 1200000);
  });
}).on('error', e => console.error('HTTP Error:', e.message));