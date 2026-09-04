// capture-ui-params.js — 拦截 UI 的 IPC 调用，捕获实际参数
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
      const d = v !== undefined ? (typeof v === 'string' ? v.substring(0, 800) : JSON.stringify(v).substring(0, 800)) : '-';
      console.log(`[${p.id}] ${d}`);
      
      if (p.id === 1) {
        // 1. 拦截 IPC 调用
        send('Runtime.evaluate', {
          expression: `(function(){
            if (!window.electronAPI) return 'no electronAPI';
            var origFn = window.electronAPI.pipelineStartOrchestrated;
            window.__capturedParams = null;
            window.__capturedResult = null;
            window.electronAPI.pipelineStartOrchestrated = async function(name, params) {
              window.__capturedParams = params;
              window.__capturedResult = await origFn.call(window.electronAPI, name, params);
              return window.__capturedResult;
            };
            return 'IPC interceptor installed';
          })()`,
          returnByValue: true
        });
      }
      if (p.id === 2) {
        // 2. 点击故事讲述卡片
        later(2, 1000, () => send('Runtime.evaluate', {
          expression: `(function(){
            var all = document.querySelectorAll('*');
            for (var i = 0; i < all.length; i++) {
              if (all[i].textContent && all[i].textContent.includes('故事讲述') && all[i].children.length <= 3 && all[i].offsetParent) {
                all[i].click(); return 'clicked ' + all[i].tagName;
              }
            }
            return 'not found';
          })()`,
          returnByValue: true
        }));
      }
      if (p.id === 3) {
        // 3. 等待编辑器加载，然后输入文案
        later(3, 3000, () => send('Runtime.evaluate', {
          expression: `(function(){
            var ta = document.querySelector('textarea');
            if (!ta) return 'no textarea';
            var ns = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
            ns.call(ta, '长安城的灯火在暮色中次第亮起。');
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            return 'text set, len=' + ta.value.length;
          })()`,
          returnByValue: true
        }));
      }
      if (p.id === 4) {
        // 4. 点击启动按钮
        later(4, 1500, () => send('Runtime.evaluate', {
          expression: `(function(){
            var btn = Array.from(document.querySelectorAll('button')).find(function(b) { return b.textContent.includes('启动流水线'); });
            if (btn && !btn.disabled) { btn.click(); return 'clicked'; }
            return 'disabled or not found';
          })()`,
          returnByValue: true
        }));
      }
      if (p.id === 5) {
        // 5. 读取捕获的 IPC 参数和结果
        later(5, 5000, () => send('Runtime.evaluate', {
          expression: `(function(){
            var r = { params: window.__capturedParams, result: window.__capturedResult };
            var msg = document.querySelector('.story2video-error-dialog-message');
            if (msg && msg.offsetParent) r.errorDialog = msg.textContent.trim();
            if (window.__capturedParams) {
              var cfg = window.__capturedParams.story2videoTextConfig;
              if (cfg) {
                r.paramSummary = {
                  subtitleSize: cfg.subtitle?.size,
                  contentType: cfg.contentType,
                  sceneDurationMode: cfg.sceneDurationMode,
                  imageProvider: cfg.image?.provider,
                  videoMode: cfg.video?.mode,
                  voiceProvider: cfg.voice?.provider
                };
              }
            }
            return JSON.stringify(r);
          })()`,
          returnByValue: true
        }));
      }
      if (p.id === 6) {
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
    setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 45000);
  });
}).on('error', e => console.error('HTTP Error:', e.message));