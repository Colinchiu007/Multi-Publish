// check-models.js — 检查所有模型配置和流水线状态
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
      const d = v !== undefined ? (typeof v === 'string' ? v.substring(0, 1000) : JSON.stringify(v).substring(0, 1000)) : '-';
      console.log(`[${p.id}] ${d}`);
      
      if (p.id === 1) {
        send('Runtime.evaluate', {
          expression: `(async function(){
            try {
              var providers = await window.electronAPI.modelProviderList();
              var list = (providers?.data || []);
              // 按类别分组
              var byCategory = {};
              list.forEach(function(p) {
                var cat = p.category || 'other';
                if (!byCategory[cat]) byCategory[cat] = [];
                byCategory[cat].push({ id: p.id, name: p.name, enabled: p.enabled, hasKey: !!p.api_key, hasUsableKey: p.api_key ? 'YES' : 'NO' });
              });
              return JSON.stringify(byCategory, null, 2);
            } catch(e) { return JSON.stringify({ error: e.message }); }
          })()`,
          returnByValue: true,
          awaitPromise: true
        });
      }
      if (p.id === 2) {
        // 检查默认图片/语音/LLM provider
        send('Runtime.evaluate', {
          expression: `(async function(){
            try {
              var imgDefault = await window.electronAPI.modelProviderGetDefault('image');
              var ttsDefault = await window.electronAPI.modelProviderGetDefault('tts');
              var llmDefault = await window.electronAPI.modelProviderGetDefault('llm');
              return JSON.stringify({ image: imgDefault, tts: ttsDefault, llm: llmDefault });
            } catch(e) { return JSON.stringify({ error: e.message }); }
          })()`,
          returnByValue: true,
          awaitPromise: true
        });
      }
      if (p.id === 3) {
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