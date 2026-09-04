// dump-dom.js - 导航到创作页后 dump DOM 结构
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
    
    function next(id, delay, fn) {
      setTimeout(() => fn(), delay);
    }
    
    ws.on('message', (msg) => {
      const p = JSON.parse(msg);
      const val = p.result?.result?.value;
      const desc = val !== undefined ? (typeof val === 'string' ? val.substring(0, 500) : JSON.stringify(val).substring(0, 500)) : 'no value';
      console.log(`[${p.id}] ${desc}`);
      
      if (p.id === 1) {
        console.log('  Navigating to /#/create ...');
        send('Page.navigate', { url: VITE + '/#/create' });
      }
      if (p.id === 2) {
        next(2, 3000, () => send('Runtime.evaluate', {
          expression: 'window.location.href',
          returnByValue: true
        }));
      }
      if (p.id === 3) {
        next(3, 1000, () => send('Runtime.evaluate', {
          expression: `(function(){
            var r = { url: window.location.href };
            // 查找所有含"故事讲述"的元素及其父元素
            var all = document.querySelectorAll('*');
            var matches = [];
            for (var i = 0; i < all.length; i++) {
              if (all[i].textContent && all[i].textContent.includes('故事讲述') && all[i].children.length === 0 && all[i].offsetParent) {
                var parent = all[i].parentElement;
                matches.push({
                  tag: all[i].tagName,
                  parentTag: parent ? parent.tagName : 'none',
                  parentClass: parent ? (parent.className || '').substring(0, 40) : '',
                  grandparentTag: parent && parent.parentElement ? parent.parentElement.tagName : 'none',
                  text: all[i].textContent.trim().substring(0, 50),
                  hasClick: typeof parent.click === 'function'
                });
              }
            }
            r.matches = matches.slice(0, 5);
            // 也查找 data-testid 元素
            var testids = document.querySelectorAll('[data-testid]');
            var s2vTestids = [];
            testids.forEach(function(el) {
              if (el.getAttribute('data-testid').includes('story') || el.getAttribute('data-testid').includes('pipeline')) {
                s2vTestids.push(el.getAttribute('data-testid'));
              }
            });
            r.s2vTestids = s2vTestids;
            return JSON.stringify(r);
          })()`,
          returnByValue: true
        }));
      }
      if (p.id === 4) { console.log('\n=== DONE ==='); ws.close(); process.exit(0); }
    });
    
    ws.on('open', () => {
      console.log('Connected');
      send('Runtime.evaluate', { expression: 'window.location.href', returnByValue: true });
    });
    ws.on('error', (e) => { console.error('WS Error:', e.message); process.exit(1); });
    setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 30000);
  });
}).on('error', e => console.error('HTTP Error:', e.message));