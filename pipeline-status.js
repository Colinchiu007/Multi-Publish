// pipeline-status.js — 检查之前启动的流水线状态 + 模型配置
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
      const d = v !== undefined ? (typeof v === 'string' ? v.substring(0, 800) : JSON.stringify(v).substring(0, 800)) : '-';
      console.log(`[${p.id}] ${d}`);
      
      if (p.id === 1) {
        // 检查历史记录中的流水线状态
        send('Runtime.evaluate', {
          expression: `(async function(){
            try {
              // 获取历史记录
              var history = await window.electronAPI.pipelineHistory();
              var runs = await window.electronAPI.pipelineListRuns();
              return JSON.stringify({ history: history, runs: runs });
            } catch(e) {
              return JSON.stringify({ error: e.message });
            }
          })()`,
          returnByValue: true,
          awaitPromise: true
        });
      }
      if (p.id === 2) {
        // 检查模型配置
        send('Runtime.evaluate', {
          expression: `(async function(){
            try {
              var providers = await window.electronAPI.modelProviderList();
              // 只返回关键字段
              var summary = (providers?.data || []).map(function(p) {
                return { id: p.id, name: p.name, category: p.category, enabled: p.enabled, hasApiKey: !!p.api_key };
              });
              return JSON.stringify(summary);
            } catch(e) {
              return JSON.stringify({ error: e.message });
            }
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