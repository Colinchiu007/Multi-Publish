// monitor.js — 轮询已启动的流水线 runId，检查完成状态
const http = require('http');
const WebSocket = require('ws');

const CDP = 'http://127.0.0.1:10914';
const RUN_ID = 'mtn5pbr3_f0qk';
let pollCount = 0;
const MAX_POLLS = 180; // 30 min

function connect() {
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
        
        if (p.id === 1) {
          // 查询状态
          send('Runtime.evaluate', {
            expression: `(async function(){
              try { var ctx = await window.electronAPI.pipelineGetRunContext('${RUN_ID}'); return JSON.stringify(ctx); }
              catch(e) { return JSON.stringify({ error: e.message }); }
            })()`,
            returnByValue: true,
            awaitPromise: true
          });
        }
        
        if (p.id >= 2) {
          pollCount++;
          try {
            const outer = JSON.parse(v);
            const ctx = outer?.data || outer;
            const status = outer?.data?.status || ctx?.status;
            const stages = outer?.data?.stages || ctx?.stages;
            const error = outer?.data?.error || ctx?.error;
            const currentStage = outer?.data?.currentStage;
            const progress = outer?.data?.progress;
            
            console.log(`[${new Date().toISOString().substring(11, 19)}] #${pollCount} status=${status} stage=${currentStage} progress=${progress}`);
            
            if (stages && Array.isArray(stages)) {
              stages.forEach(s => {
                const icon = s.status === 'completed' ? '✅' : s.status === 'running' ? '🔄' : s.status === 'failed' ? '❌' : '⏳';
                console.log(`  ${icon} ${s.name}: ${s.status}`);
              });
            }
            
            if (status === 'completed') {
              console.log('\n✅ 流水线完成！');
              // 获取输出
              send('Runtime.evaluate', {
                expression: `(async function(){
                  try {
                    var ctx = await window.electronAPI.pipelineGetRunContext('${RUN_ID}');
                    var dd = ctx?.data || ctx;
                    var c = dd.context || {};
                    var output = c?.compose || c?.publish || {};
                    return JSON.stringify({ outputPath: output.outputPath || output.videoPath || 'unknown', compose: JSON.stringify(output).substring(0, 300) });
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
            
            if (pollCount >= MAX_POLLS) {
              console.log('轮询超时');
              ws.close(); process.exit(1);
              return;
            }
            
            // 继续轮询
            setTimeout(() => send('Runtime.evaluate', {
              expression: `(async function(){
                try { var ctx = await window.electronAPI.pipelineGetRunContext('${RUN_ID}'); return JSON.stringify(ctx); }
                catch(e) { return JSON.stringify({ error: e.message }); }
              })()`,
              returnByValue: true,
              awaitPromise: true
            }), 10000);
            
          } catch(e) {
            console.log('解析失败:', e.message);
            setTimeout(() => send('Runtime.evaluate', {
              expression: `(async function(){
                try { var ctx = await window.electronAPI.pipelineGetRunContext('${RUN_ID}'); return JSON.stringify(ctx); }
                catch(e) { return JSON.stringify({ error: e.message }); }
              })()`,
              returnByValue: true,
              awaitPromise: true
            }), 10000);
          }
        }
        
        // 输出结果
        if (p.id > 1000) {
          console.log('输出:', d);
          ws.close(); process.exit(0);
        }
      });
      
      ws.on('open', () => {
        console.log('Connected, monitoring run:', RUN_ID);
        send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
      });
      ws.on('error', e => { console.error('WS Error:', e.message); process.exit(1); });
      setTimeout(() => { console.log('TIMEOUT 30min'); process.exit(1); }, 1800000);
    });
  }).on('error', e => console.error('HTTP Error:', e.message));
}

connect();