// verify-fix2.js - 从首页出发，点视频创作tab → 故事讲述卡片 → 输入文案 → 启动
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
    
    const send = (method, params) => {
      const id = ++step;
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    };
    const later = (id, ms, fn) => setTimeout(fn, ms);
    
    ws.on('message', (msg) => {
      const p = JSON.parse(msg);
      const v = p.result?.result?.value;
      const d = v !== undefined ? (typeof v === 'string' ? v.substring(0, 400) : JSON.stringify(v).substring(0, 400)) : '-';
      console.log(`[${p.id}] ${d}`);
      
      if (p.id === 1) {
        // 当前在首页，点击"视频创作" tab
        send('Runtime.evaluate', {
          expression: `(function(){var el=document.querySelector('[data-testid="yixiaoer-primary-create"]');if(el){el.click();return'clicked create tab';}return'not found';})()`,
          returnByValue: true
        });
      }
      if (p.id === 2) later(2, 2000, () => send('Runtime.evaluate', {
        expression: `(function(){var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){if(all[i].textContent&&all[i].textContent.includes('故事讲述')&&all[i].children.length<=2&&all[i].offsetParent){all[i].click();return'clicked '+all[i].tagName;}}return'not found';})()`,
        returnByValue: true
      }));
      if (p.id === 3) later(3, 3000, () => send('Runtime.evaluate', {
        expression: `(function(){var r={};var ta=document.querySelector('textarea');if(ta&&ta.offsetParent)r.textarea={placeholder:ta.placeholder||'',len:(ta.value||'').length};var btn=Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.includes('启动流水线')});if(btn&&btn.offsetParent)r.startBtn={text:btn.textContent.trim().substring(0,20),disabled:btn.disabled};return JSON.stringify(r);})()`,
        returnByValue: true
      }));
      if (p.id === 4) {
        const ui = JSON.parse(v || '{}');
        if (ui.textarea) {
          later(4, 1000, () => send('Runtime.evaluate', {
            expression: `(function(){var ta=document.querySelector('textarea');if(!ta)return'no ta';var ns=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;ns.call(ta,'长安城的灯火在暮色中次第亮起。');ta.dispatchEvent(new Event('input',{bubbles:true}));return'ok';})()`,
            returnByValue: true
          }));
        } else { console.log('NO textarea'); done(); }
      }
      if (p.id === 5) later(5, 1500, () => send('Runtime.evaluate', {
        expression: `(function(){var btn=Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.includes('启动流水线')});if(btn&&!btn.disabled){btn.click();return'clicked';}return'disabled';})()`,
        returnByValue: true
      }));
      if (p.id === 6) later(6, 6000, () => send('Runtime.evaluate', {
        expression: `(function(){var r=[];var msg=document.querySelector('.story2video-error-dialog-message');if(msg&&msg.offsetParent)r.push({type:'error-msg',text:msg.textContent.trim()});var hints=document.querySelectorAll('[class*="hint"]');hints.forEach(function(h){if(h.offsetParent&&h.textContent.trim().length>5)r.push({type:'hint',text:h.textContent.trim().substring(0,200)});});return JSON.stringify(r);})()`,
        returnByValue: true
      }));
      if (p.id === 7) done();
    });
    
    function done() { console.log('\n=== DONE ==='); ws.close(); process.exit(0); }
    
    ws.on('open', () => {
      console.log('Connected');
      send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
    });
    ws.on('error', e => { console.error('WS Error:', e.message); process.exit(1); });
    setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 45000);
  });
}).on('error', e => console.error('HTTP Error:', e.message));