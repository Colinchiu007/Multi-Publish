// diagnose-split.js — 获取 split 失败的详细错误
const http = require('http');
const WebSocket = require('ws');

const CDP = 'http://127.0.0.1:10914';
const RUN_ID = 'mtn5pbr3_f0qk';

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
      console.log(`[${p.id}] ${v !== undefined ? (typeof v === 'string' ? v.substring(0, 1000) : JSON.stringify(v).substring(0, 1000)) : '-'}`);
      
      if (p.id === 1) {
        send('Runtime.evaluate', {
          expression: `(async function(){
            try {
              var ctx = await window.electronAPI.pipelineGetRunContext('${RUN_ID}');
              var data = ctx?.data || ctx;
              var status = data.status;
              var error = data.error;
              var stages = data.stages;
              var context = data.context;
              return JSON.stringify({
                status: status,
                error: error,
                stages: stages,
                contextKeys: context ? Object.keys(context) : [],
                splitContext: context?.split ? JSON.stringify(context.split).substring(0, 500) : 'none',
                allContext: JSON.stringify(context).substring(0, 1000)
              });
            } catch(e) { return JSON.stringify({ error: e.message }); }
          })()`,
          returnByValue: true,
          awaitPromise: true
        });
      }
      if (p.id === 2) {
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