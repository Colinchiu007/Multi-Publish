// e2e-verify2.js - 先导航到创作页，再测试启动流水线
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
      return id;
    }
    
    function next(id, delay, fn) {
      setTimeout(() => fn(), delay);
    }
    
    ws.on('message', (msg) => {
      const p = JSON.parse(msg);
      const val = p.result?.result?.value;
      const desc = val !== undefined ? (typeof val === 'string' ? val.substring(0, 300) : JSON.stringify(val).substring(0, 300)) : 'no value';
      console.log(`[${p.id}] ${desc}`);
      
      if (p.id === 1) {
        // Navigate to create page
        console.log('  Navigating to create page...');
        send('Page.navigate', { url: VITE + '/#/create' });
      }
      if (p.id === 2) {
        // Wait for page load, then check URL
        next(2, 3000, () => send('Runtime.evaluate', {
          expression: 'window.location.href',
          returnByValue: true
        }));
      }
      if (p.id === 3) {
        console.log('  Current URL:', val);
        // Click story2video card
        next(3, 1000, () => send('Runtime.evaluate', {
          expression: `(function(){var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){if(all[i].textContent&&all[i].textContent.includes('故事讲述')&&all[i].children.length<=2&&all[i].offsetParent){all[i].click();return'clicked '+all[i].tagName;}}return'not found';})()`,
          returnByValue: true
        }));
      }
      if (p.id === 4) {
        next(4, 3000, () => send('Runtime.evaluate', {
          expression: `(function(){var r={};var ta=document.querySelector('textarea');if(ta&&ta.offsetParent)r.textarea={placeholder:ta.placeholder||'',len:(ta.value||'').length};var btn=Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.includes('启动流水线')});if(btn&&btn.offsetParent)r.startBtn={text:btn.textContent.trim().substring(0,20),disabled:btn.disabled};return JSON.stringify(r);})()`,
          returnByValue: true
        }));
      }
      if (p.id === 5) {
        const ui = JSON.parse(val || '{}');
        if (ui.textarea) {
          next(5, 1000, () => send('Runtime.evaluate', {
            expression: `(function(){var ta=document.querySelector('textarea');if(!ta)return'no ta';var ns=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;ns.call(ta,'长安城的灯火在暮色中次第亮起。');ta.dispatchEvent(new Event('input',{bubbles:true}));return'ok len='+ta.value.length;})()`,
            returnByValue: true
          }));
        } else if (ui.startBtn) {
          next(5, 500, () => send('Runtime.evaluate', {
            expression: `(function(){var btn=Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.includes('启动流水线')});if(btn&&!btn.disabled){btn.click();return'clicked';}return'disabled or not found';})()`,
            returnByValue: true
          }));
        } else { console.log('NO textarea or startBtn'); done(); }
      }
      if (p.id === 6) {
        next(6, 1500, () => send('Runtime.evaluate', {
          expression: `(function(){var btn=Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.includes('启动流水线')});if(btn&&!btn.disabled){btn.click();return'clicked';}return'disabled or not found';})()`,
          returnByValue: true
        }));
      }
      if (p.id === 7) {
        next(7, 6000, () => send('Runtime.evaluate', {
          expression: `(function(){var r=[];var msg=document.querySelector('.story2video-error-dialog-message');if(msg&&msg.offsetParent)r.push({type:'error-msg',text:msg.textContent.trim()});var hints=document.querySelectorAll('[class*="hint"]');hints.forEach(function(h){if(h.offsetParent)r.push({type:'hint',text:h.textContent.trim().substring(0,200)});});var modals=document.querySelectorAll('.ui-modal');modals.forEach(function(m){if(m.offsetParent)r.push({type:'modal',text:m.textContent.trim().substring(0,300)});});return JSON.stringify(r);})()`,
          returnByValue: true
        }));
      }
      if (p.id === 8) { done(); }
    });
    
    function done() {
      console.log('\n=== DONE ===');
      ws.close();
      process.exit(0);
    }
    
    ws.on('open', () => {
      console.log('Connected');
      send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
    });
    ws.on('error', (e) => { console.error('WS Error:', e.message); process.exit(1); });
    setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 60000);
  });
}).on('error', e => console.error('HTTP Error:', e.message));