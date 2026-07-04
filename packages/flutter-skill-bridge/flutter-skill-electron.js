const { WebSocketServer } = require('ws');
const { BrowserWindow } = require('electron');
const http = require('http');

const DEFAULT_PORT = 18118;
const SDK_VERSION = '1.0.0';

class FlutterSkillElectron {
  constructor(options = {}) {
    this.port = options.port || DEFAULT_PORT;
    this.appName = options.appName || 'electron-app';
    this.wss = null;
    this.httpServer = null;
    this.window = options.window || null;
    this.logs = [];
    this.maxLogs = 500;
    this.navigationHistory = ['home'];
    this._registeredTools = [];
  }

  // --------------- AppMCP Tool Registration ---------------
  registerTool(name, description, params, handler) {
    const tool = { name, description: description || '', params: params || {}, handler, source: 'js-registered' };
    const idx = this._registeredTools.findIndex(t => t.name === name);
    if (idx !== -1) this._registeredTools[idx] = tool;
    else this._registeredTools.push(tool);
    return tool;
  }

  async _handleCallTool(p) {
    const toolName = p.name || '';
    const toolParams = p.params || p.args || {};
    const tool = this._registeredTools.find(t => t.name === toolName);
    if (!tool) return { success: false, error: `Tool not found: ${toolName}` };
    if (!tool.handler) return { success: false, error: `Tool has no handler: ${toolName}` };
    try {
      const result = await tool.handler(toolParams);
      return { success: true, result, source: 'js-registered' };
    } catch (e) {
      return { success: false, error: e.message, source: 'js-registered' };
    }
  }

  start() {
    // Create HTTP server for health check + WebSocket upgrade
    this.httpServer = http.createServer((req, res) => {
      if (req.url === '/.flutter-skill') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          framework: 'electron',
          app_name: this.appName,
          platform: 'electron',
          sdk_version: SDK_VERSION,
          capabilities: [
            'initialize', 'inspect', 'inspect_interactive', 'tap', 'enter_text', 'get_text',
            'find_element', 'wait_for_element', 'scroll', 'swipe',
            'screenshot', 'screenshot_region', 'screenshot_element', 'go_back', 'get_logs', 'clear_logs', 'press_key',
            'get_registered_tools', 'call_tool',
          ],
        }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.wss = new WebSocketServer({ server: this.httpServer });
    this.httpServer.listen(this.port, '127.0.0.1');
    console.log(`[flutter-skill-electron] Bridge on port ${this.port}`);

    this.wss.on('connection', (ws) => {
      // Ping/pong keepalive — every 15s
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      const pingInterval = setInterval(() => {
        if (!ws.isAlive) {
          clearInterval(pingInterval);
          ws.terminate();
          return;
        }
        ws.isAlive = false;
        try { ws.ping(); } catch (_) { clearInterval(pingInterval); }
      }, 15000);

      ws.on('close', () => clearInterval(pingInterval));
      ws.on('error', () => clearInterval(pingInterval));

      ws.on('message', async (data) => {
        const msg = String(data);
        // Handle ping keepalive
        if (msg === 'ping') { try { ws.send('pong'); } catch (_) {} return; }

        let req;
        try {
          req = JSON.parse(msg);
        } catch {
          try { ws.send(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })); } catch (_) {}
          return;
        }

        try {
          const result = await this._handle(req.method, req.params || {});
          try { ws.send(JSON.stringify({ jsonrpc: '2.0', result, id: req.id })); } catch (_) {}
        } catch (err) {
          try {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: err.message || String(err) },
              id: req.id,
            }));
          } catch (_) {}
        }
      });
    });
  }

  stop() {
    if (this.wss) this.wss.close();
    if (this.httpServer) this.httpServer.close();
  }

  log(level, message) {
    this.logs.push(`[${level}] ${message}`);
    if (this.logs.length > this.maxLogs) this.logs.shift();
  }

  _getWindow() {
    return this.window || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  }

  // Resolve a key/selector/text to a CSS selector
  _resolveSelector(params) {
    if (params.selector) return params.selector;
    if (params.key) return `#${params.key}`;
    if (params.element) return params.element;
    return null;
  }

  // Generate JavaScript code to find element by ref ID (semantic fingerprint system)
  _getRefResolutionScript() {
    return `
      function findElementByRef(targetRef) {
        const refCounts = {};
        let foundElement = null;
        
        // Semantic ref generation - generates {role}:{content}[{index}] format
        function generateSemanticRefId(el, elementType) {
          // Map element types to semantic roles
          const roleMap = {
            button: 'button',
            text_field: 'input',
            checkbox: 'toggle',
            switch: 'toggle',
            radio: 'toggle',
            slider: 'slider',
            dropdown: 'select',
            link: 'link',
            list_item: 'item',
            tab: 'item'
          };
          
          const role = roleMap[elementType] || 'element';
          
          // Extract content with priority: id > aria-label > text > placeholder > fallback
          let content = el.id ||
                       el.getAttribute('aria-label') ||
                       (el.textContent && el.textContent.trim()) ||
                       el.getAttribute('placeholder') ||
                       el.getAttribute('title') ||
                       null;
          
          if (content) {
            // Clean and format content
            content = content.replace(/\\s+/g, '_')
                            .replace(/[^\\w]/g, '')
                            .substring(0, 30);
            if (content.length > 27) {
              content = content.substring(0, 27) + '...';
            }
            
            const baseRef = role + ':' + content;
            const count = refCounts[baseRef] || 0;
            refCounts[baseRef] = count + 1;
            
            return count === 0 ? baseRef : baseRef + '[' + count + ']';
          } else {
            // No content - use role + index fallback
            const count = refCounts[role] || 0;
            refCounts[role] = count + 1;
            return role + '[' + count + ']';
          }
        }
        
        // Check if this is a legacy ref format (btn_0, tf_1, etc.)
        function isLegacyRef(ref) {
          return /^[a-z]+_\\d+$/.test(ref);
        }
        
        // Handle legacy ref format for backward compatibility
        function findByLegacyRef(refId) {
          const parts = refId.split('_');
          if (parts.length !== 2) return null;
          
          const prefix = parts[0];
          const index = parseInt(parts[1]);
          
          // Map old prefixes to new roles
          const roleMap = {
            btn: 'button',
            tf: 'input',
            sw: 'toggle',
            sl: 'slider',
            dd: 'select',
            lnk: 'link',
            item: 'item'
          };
          
          const role = roleMap[prefix];
          if (!role) return null;
          
          // Find all elements of matching role and get by index
          const matchingElements = [];
          walk(document.body, (el, ref) => {
            if (ref.startsWith(role + ':')) {
              matchingElements.push(el);
            }
          });
          
          return matchingElements[index] || null;
        }
        
        if (isLegacyRef(targetRef)) {
          return findByLegacyRef(targetRef);
        }
        
        function getElementType(el) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'button' || el.matches('[role="button"]') || el.onclick) return 'button';
          if (tag === 'input') {
            const t = el.type.toLowerCase();
            if (t === 'checkbox') return 'checkbox';
            if (t === 'radio') return 'radio';
            if (['text', 'email', 'password', 'search', 'number', 'tel', 'url'].includes(t)) return 'text_field';
            if (t === 'range') return 'slider';
            return 'button';
          }
          if (tag === 'textarea') return 'text_field';
          if (tag === 'select') return 'dropdown';
          if (tag === 'a' && el.href) return 'link';
          if (el.matches('[role="tab"]') || el.closest('[role="tablist"]')) return 'tab';
          if (el.matches('[role="listitem"]') || el.matches('li')) return 'list_item';
          if (el.matches('[role="switch"]')) return 'switch';
          if (el.matches('[role="slider"]')) return 'slider';
          return 'button';
        }
        
        function walk(el, callback) {
          if (!el || el.nodeType !== 1) return;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return;

          const isInteractive = el.matches('button, input, select, textarea, a[href], [role="button"], [onclick], [role="tab"], [role="switch"], [role="slider"], li[onclick]') || 
                                el.onclick != null;

          if (isInteractive) {
            const type = getElementType(el);
            const ref = generateSemanticRefId(el, type);
            
            if (callback) {
              callback(el, ref);
            } else if (ref === targetRef) {
              foundElement = el;
              return;
            }
          }

          for (const child of el.children) {
            walk(child, callback);
            if (!callback && foundElement) return;
          }
        }

        walk(document.body);
        return foundElement;
      }
    `;
  }

  async _handle(method, params) {
    const win = this._getWindow();

    switch (method) {
      case 'initialize':
        return {
          success: true,
          framework: 'electron',
          sdk_version: SDK_VERSION,
          platform: 'electron',
        };

      case 'inspect':
        return this._inspect(win);

      case 'inspect_interactive':
        return this._inspectInteractive(win);

      case 'tap':
        return this._tap(win, params);

      case 'enter_text':
        return this._enterText(win, params);

      case 'get_text':
        return this._getText(win, params);

      case 'find_element':
        return this._findElement(win, params);

      case 'wait_for_element':
        return this._waitForElement(win, params);

      case 'scroll':
        return this._scroll(win, params);

      case 'swipe':
        return this._swipe(win, params);

      case 'screenshot':
        return this._screenshot(win);

      case 'screenshot_region':
        return this._screenshotRegion(win, params);

      case 'screenshot_element':
        return this._screenshotElement(win, params);

      case 'go_back':
        return this._goBack(win);

      case 'get_logs':
        return { logs: [...this.logs] };

      case 'clear_logs':
        this.logs = [];
        return { success: true };

      case 'press_key':
        return this._pressKey(win, params);

      case 'long_press':
        return this._longPress(win, params);
      case 'double_tap':
        return this._doubleTap(win, params);
      case 'drag':
        return this._drag(win, params);
      case 'tap_at':
        return this._tapAt(win, params);
      case 'long_press_at':
        return this._longPressAt(win, params);
      case 'edge_swipe':
        return this._edgeSwipe(win, params);
      case 'gesture':
        return this._gesture(win, params);
      case 'scroll_until_visible':
        return this._scrollUntilVisible(win, params);
      case 'swipe_coordinates':
        return this._swipeCoordinates(win, params);
      case 'get_checkbox_state':
        return this._getCheckboxState(win, params);
      case 'get_slider_value':
        return this._getSliderValue(win, params);
      case 'get_route':
        return this._getRoute(win);
      case 'get_navigation_stack':
        return this._getNavigationStack(win);
      case 'get_errors':
        return this._getErrors(win);
      case 'get_performance':
        return this._getPerformance(win);
      case 'get_frame_stats':
        return this._getFrameStats(win);
      case 'get_memory_stats':
        return this._getMemoryStats(win);
      case 'wait_for_gone':
        return this._waitForGone(win, params);
      case 'diagnose':
        return this._diagnose(win);
      case 'enable_test_indicators':
        return this._enableTestIndicators(win);
      case 'get_indicator_status':
        return this._getIndicatorStatus(win);
      case 'enable_network_monitoring':
        return this._enableNetworkMonitoring(win);
      case 'get_network_requests':
        return this._getNetworkRequests(win);
      case 'clear_network_requests':
        return this._clearNetworkRequests(win);
      case 'scroll_to':
        return this._scroll(win, params);
      case 'eval':
        return this._eval(win, params);

      case 'get_registered_tools':
        return { tools: this._registeredTools.map(t => ({ name: t.name, description: t.description, params: t.params, source: t.source })), count: this._registeredTools.length };
      case 'call_tool':
        return this._handleCallTool(params);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  async _inspect(win) {
    if (!win) return { elements: [] };
    const elements = await win.webContents.executeJavaScript(`
      (function() {
        const results = [];
        function walk(el) {
          if (!el || el.nodeType !== 1) return;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return;

          const tag = el.tagName.toLowerCase();
          const isInteractive = el.matches('button, input, select, textarea, a, [role="button"], [onclick], label');
          const hasId = !!el.id;
          const hasText = !el.children.length && (el.textContent || '').trim().length > 0;

          if (isInteractive || hasId || hasText) {
            const rect = el.getBoundingClientRect();
            results.push({
              type: _mapType(el),
              key: el.id || null,
              tag: tag,
              text: (el.value || el.textContent || '').trim().slice(0, 200) || null,
              bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
              visible: rect.width > 0 && rect.height > 0,
              enabled: !el.disabled,
              clickable: el.matches('button, a, [role="button"], [onclick]') || el.onclick != null,
            });
          }

          for (const child of el.children) walk(child);
        }

        function _mapType(el) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'button' || el.matches('[role="button"]')) return 'button';
          if (tag === 'input') {
            const t = el.type;
            if (t === 'checkbox') return 'checkbox';
            if (t === 'radio') return 'radio';
            if (t === 'text' || t === 'email' || t === 'password' || t === 'search' || t === 'number') return 'text_field';
            return 'input';
          }
          if (tag === 'textarea') return 'text_field';
          if (tag === 'select') return 'dropdown';
          if (tag === 'a') return 'link';
          if (tag === 'img') return 'image';
          if (tag === 'label') return 'label';
          if (tag === 'h1' || tag === 'h2' || tag === 'h3') return 'heading';
          return 'text';
        }

        walk(document.body);
        return results;
      })();
    `);
    return { elements };
  }

  async _inspectInteractive(win) {
    if (!win) return { elements: [], summary: 'No window available' };
    
    const result = await win.webContents.executeJavaScript(`
      (function() {
        const elements = [];
        const refCounts = {};
        
        // Semantic ref generation - generates {role}:{content}[{index}] format
        function generateSemanticRefId(el, elementType) {
          // Map element types to semantic roles
          const roleMap = {
            button: 'button',
            text_field: 'input',
            checkbox: 'toggle',
            switch: 'toggle',
            radio: 'toggle',
            slider: 'slider',
            dropdown: 'select',
            link: 'link',
            list_item: 'item',
            tab: 'item'
          };
          
          const role = roleMap[elementType] || 'element';
          
          // Extract content with priority: id > aria-label > text > placeholder > fallback
          let content = el.id ||
                       el.getAttribute('aria-label') ||
                       (el.textContent && el.textContent.trim()) ||
                       el.getAttribute('placeholder') ||
                       el.getAttribute('title') ||
                       null;
          
          if (content) {
            // Clean and format content
            content = content.replace(/\\s+/g, '_')
                            .replace(/[^\\w]/g, '')
                            .substring(0, 30);
            if (content.length > 27) {
              content = content.substring(0, 27) + '...';
            }
            
            const baseRef = role + ':' + content;
            const count = refCounts[baseRef] || 0;
            refCounts[baseRef] = count + 1;
            
            return count === 0 ? baseRef : baseRef + '[' + count + ']';
          } else {
            // No content - use role + index fallback
            const count = refCounts[role] || 0;
            refCounts[role] = count + 1;
            return role + '[' + count + ']';
          }
        }
        
        function getElementType(el) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'button' || el.matches('[role="button"]') || el.onclick) return 'button';
          if (tag === 'input') {
            const t = el.type.toLowerCase();
            if (t === 'checkbox') return 'checkbox';
            if (t === 'radio') return 'radio';
            if (['text', 'email', 'password', 'search', 'number', 'tel', 'url'].includes(t)) return 'text_field';
            if (t === 'range') return 'slider';
            return 'button'; // For other input types like submit, button
          }
          if (tag === 'textarea') return 'text_field';
          if (tag === 'select') return 'dropdown';
          if (tag === 'a' && el.href) return 'link';
          if (el.matches('[role="tab"]') || el.closest('[role="tablist"]')) return 'tab';
          if (el.matches('[role="listitem"]') || el.matches('li')) return 'list_item';
          if (el.matches('[role="switch"]')) return 'switch';
          if (el.matches('[role="slider"]')) return 'slider';
          return 'button'; // Fallback for clickable elements
        }
        
        function getActions(el, type) {
          const actions = [];
          if (type === 'text_field') {
            actions.push('tap', 'enter_text');
          } else if (type === 'slider') {
            actions.push('tap', 'swipe');
          } else {
            actions.push('tap');
            if (el.matches('button, [role="button"], a') || el.onclick) {
              actions.push('long_press');
            }
          }
          return actions;
        }
        
        function getValue(el, type) {
          if (type === 'text_field') {
            return el.value || '';
          } else if (type === 'checkbox' || type === 'switch') {
            return el.checked || false;
          } else if (type === 'dropdown') {
            return el.value || el.selectedOptions[0]?.text || '';
          } else if (type === 'slider') {
            return parseFloat(el.value) || 0;
          }
          return undefined;
        }
        
        function walk(el) {
          if (!el || el.nodeType !== 1) return;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return;

          const tag = el.tagName.toLowerCase();
          const isInteractive = el.matches('button, input, select, textarea, a[href], [role="button"], [onclick], [role="tab"], [role="switch"], [role="slider"], li[onclick]') || 
                                el.onclick != null;

          if (isInteractive) {
            const type = getElementType(el);
            const rect = el.getBoundingClientRect();
            const text = (el.textContent || el.value || el.alt || el.title || '').trim();
            const label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '';
            
            // Generate ref ID
            const ref = generateSemanticRefId(el, type);
            
            const element = {
              ref: ref,
              type: el.tagName + (el.type ? '[' + el.type + ']' : ''),
              text: text.slice(0, 100) || null,
              actions: getActions(el, type),
              enabled: !el.disabled && !el.readOnly,
              bounds: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                w: Math.round(rect.width),
                h: Math.round(rect.height)
              }
            };

            // Add optional fields
            if (label) element.label = label;
            const value = getValue(el, type);
            if (value !== undefined) element.value = value;

            elements.push(element);
          }

          // Recursively walk children
          for (const child of el.children) {
            walk(child);
          }
        }

        walk(document.body);
        
        // Generate summary
        const counts = Object.entries(refCounts);
        const summaryParts = counts.map(([prefix, count]) => {
          switch (prefix) {
            case 'btn': return count + ' button' + (count === 1 ? '' : 's');
            case 'tf': return count + ' text field' + (count === 1 ? '' : 's');
            case 'sw': return count + ' switch' + (count === 1 ? '' : 'es');
            case 'sl': return count + ' slider' + (count === 1 ? '' : 's');
            case 'dd': return count + ' dropdown' + (count === 1 ? '' : 's');
            case 'item': return count + ' list item' + (count === 1 ? '' : 's');
            case 'lnk': return count + ' link' + (count === 1 ? '' : 's');
            case 'tab': return count + ' tab' + (count === 1 ? '' : 's');
            default: return count + ' element' + (count === 1 ? '' : 's');
          }
        });
        
        const summary = summaryParts.length === 0 ? 
          'No interactive elements found' : 
          elements.length + ' interactive: ' + summaryParts.join(', ');

        return { elements, summary };
      })();
    `);
    
    return result;
  }

  async _tap(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const sel = this._resolveSelector(params);
    const textMatch = params.text;
    const refId = params.ref;

    const result = await win.webContents.executeJavaScript(`
      (function() {
        let el = null;
        
        // Try ref ID first if provided
        if (${JSON.stringify(refId)}) {
          // Get ref to element mapping from inspect_interactive
          ${this._getRefResolutionScript()}
          el = findElementByRef(${JSON.stringify(refId)});
        }
        
        // Fallback to selector
        if (!el && ${JSON.stringify(sel)}) {
          el = document.querySelector(${JSON.stringify(sel || '')});
        }
        
        // Fallback to text search
        if (!el && ${JSON.stringify(textMatch)}) {
          const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (tw.nextNode()) {
            if (tw.currentNode.textContent.includes(${JSON.stringify(textMatch || '')})) {
              el = tw.currentNode.parentElement;
              break;
            }
          }
        }
        
        if (!el) return { success: false, message: 'Element not found' };
        el.click();
        return { success: true, method: ${JSON.stringify(refId ? 'ref' : sel ? 'selector' : 'text')} };
      })();
    `);
    return result;
  }

  async _enterText(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const sel = this._resolveSelector(params);
    const text = params.text || '';
    const refId = params.ref;
    
    if (!sel && !refId) return { success: false, message: 'Missing key/selector/ref' };

    const result = await win.webContents.executeJavaScript(`
      (function() {
        let el = null;
        
        // Try ref ID first if provided
        if (${JSON.stringify(refId)}) {
          ${this._getRefResolutionScript()}
          el = findElementByRef(${JSON.stringify(refId)});
        }
        
        // Fallback to selector
        if (!el && ${JSON.stringify(sel)}) {
          el = document.querySelector(${JSON.stringify(sel)});
        }
        
        if (!el) return { success: false, message: 'Element not found' };
        
        // Check if element can accept text input
        if (!el.matches('input, textarea, select') && !el.isContentEditable) {
          return { success: false, message: 'Element is not a text input field' };
        }
        
        el.focus();
        if (el.matches('input, textarea')) {
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable) {
          el.textContent = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        return { success: true, method: ${JSON.stringify(refId ? 'ref' : 'selector')} };
      })();
    `);
    return result;
  }

  async _getText(win, params) {
    if (!win) return { text: null };
    const sel = this._resolveSelector(params);
    if (!sel) return { text: null };

    const result = await win.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return { text: null };
        return { text: (el.value || el.textContent || '').trim() };
      })();
    `);
    return result;
  }

  async _findElement(win, params) {
    if (!win) return { found: false };
    const sel = this._resolveSelector(params);
    const textMatch = params.text;

    const result = await win.webContents.executeJavaScript(`
      (function() {
        if (${JSON.stringify(sel)}) {
          const el = document.querySelector(${JSON.stringify(sel || '')});
          if (el) {
            const rect = el.getBoundingClientRect();
            return { found: true, element: {
              tag: el.tagName.toLowerCase(),
              key: el.id || null,
              text: (el.value || el.textContent || '').trim().slice(0, 200),
              bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            }};
          }
        }
        if (${JSON.stringify(textMatch)}) {
          const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (tw.nextNode()) {
            if (tw.currentNode.textContent.includes(${JSON.stringify(textMatch || '')})) {
              const p = tw.currentNode.parentElement;
              return { found: true, element: { tag: p.tagName.toLowerCase(), key: p.id || null, text: tw.currentNode.textContent.trim().slice(0, 200) }};
            }
          }
        }
        return { found: false };
      })();
    `);
    return result;
  }

  async _waitForElement(win, params) {
    if (!win) return { found: false };
    const sel = this._resolveSelector(params);
    const textMatch = params.text;
    const timeout = params.timeout || 5000;

    const result = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
          let found = false;
          if (${JSON.stringify(sel)}) {
            found = !!document.querySelector(${JSON.stringify(sel || '')});
          } else if (${JSON.stringify(textMatch)}) {
            const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (tw.nextNode()) {
              if (tw.currentNode.textContent.includes(${JSON.stringify(textMatch || '')})) { found = true; break; }
            }
          }
          if (found) return resolve({ found: true });
          if (Date.now() - start > ${timeout}) return resolve({ found: false });
          requestAnimationFrame(check);
        };
        check();
      });
    `);
    return result;
  }

  async _scroll(win, params) {
    if (!win) return { success: false };
    const direction = params.direction || 'down';
    const distance = params.distance || 300;
    const sel = this._resolveSelector(params);

    let dx = 0, dy = 0;
    switch (direction) {
      case 'up': dy = -distance; break;
      case 'down': dy = distance; break;
      case 'left': dx = -distance; break;
      case 'right': dx = distance; break;
    }

    await win.webContents.executeJavaScript(`
      (function() {
        const target = ${sel ? `document.querySelector(${JSON.stringify(sel)})` : 'null'} || document.scrollingElement || document.body;
        target.scrollBy(${dx}, ${dy});
      })();
    `);
    return { success: true };
  }

  async _swipe(win, params) {
    // Swipe = scroll for web contexts
    return this._scroll(win, params);
  }

  async _screenshot(win) {
    if (!win) return { success: false, message: 'No window' };
    const image = await win.webContents.capturePage();
    const base64 = image.toPNG().toString('base64');
    return { success: true, image: base64, format: 'png', encoding: 'base64' };
  }

  async _screenshotRegion(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const x = Math.round(params.x || 0);
    const y = Math.round(params.y || 0);
    const width = Math.round(params.width || 300);
    const height = Math.round(params.height || 300);
    const image = await win.webContents.capturePage({ x, y, width, height });
    const base64 = image.toPNG().toString('base64');
    return { success: true, image: base64, format: 'png', encoding: 'base64' };
  }

  async _screenshotElement(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const sel = this._resolveSelector(params);
    const refId = params.ref;

    const bounds = await win.webContents.executeJavaScript(`
      (function() {
        ${refId ? this._getRefResolutionScript() : ''}
        let el = ${refId ? `findElementByRef(${JSON.stringify(refId)})` : 'null'};
        if (!el && ${JSON.stringify(sel)}) el = document.querySelector(${JSON.stringify(sel || '')});
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
      })();
    `);

    if (!bounds) return { success: false, message: 'Element not found' };
    const image = await win.webContents.capturePage(bounds);
    const base64 = image.toPNG().toString('base64');
    return { success: true, image: base64, format: 'png', encoding: 'base64' };
  }

  async _pressKey(win, params) {
    if (!win) return { success: false, error: 'No window' };
    const keyName = params.key;
    if (!keyName) return { success: false, error: 'Missing key parameter' };
    const modifiers = params.modifiers || [];

    const keyMap = {
      'enter': 'Enter', 'tab': 'Tab', 'escape': 'Escape',
      'backspace': 'Backspace', 'delete': 'Delete', 'space': ' ',
      'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
      'home': 'Home', 'end': 'End', 'pageup': 'PageUp', 'pagedown': 'PageDown',
    };
    const mappedKey = keyMap[keyName.toLowerCase()] || keyName;

    const result = await win.webContents.executeJavaScript(`
      (function() {
        try {
          const target = document.activeElement || document.body;
          const opts = {
            key: ${JSON.stringify(mappedKey)},
            code: ${JSON.stringify(mappedKey)},
            bubbles: true,
            cancelable: true,
            ctrlKey: ${modifiers.includes('ctrl')},
            metaKey: ${modifiers.includes('meta')},
            shiftKey: ${modifiers.includes('shift')},
            altKey: ${modifiers.includes('alt')},
          };
          target.dispatchEvent(new KeyboardEvent('keydown', opts));
          if (${JSON.stringify(mappedKey)} === 'Enter') {
            target.dispatchEvent(new KeyboardEvent('keypress', opts));
          }
          target.dispatchEvent(new KeyboardEvent('keyup', opts));
          return { success: true };
        } catch(e) {
          return { success: false, error: e.message };
        }
      })();
    `);
    return result;
  }

  async _goBack(win) {
    if (!win) return { success: false, message: 'No window' };

    // Try app-level back handler first (SPA navigation)
    const handled = await win.webContents.executeJavaScript(`
      (function() {
        // Check for custom back handler
        if (typeof window.__flutterSkillGoBack === 'function') {
          window.__flutterSkillGoBack();
          return true;
        }
        // Try clicking a visible back button
        const backBtns = document.querySelectorAll('[id*="back"], [class*="back"], [aria-label*="back"], [aria-label*="Back"]');
        for (const btn of backBtns) {
          if (btn.offsetParent !== null) { btn.click(); return true; }
        }
        return false;
      })();
    `);

    if (handled) return { success: true };

    // Fall back to browser navigation
    const canGoBack = win.webContents.canGoBack();
    if (canGoBack) {
      win.webContents.goBack();
      return { success: true };
    }

    await win.webContents.executeJavaScript('window.history.back()');
    return { success: true };
  }

  async _longPress(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const sel = this._resolveSelector(params);
    const refId = params.ref;
    const duration = params.duration || 500;
    return win.webContents.executeJavaScript(`
      (function() {
        ${refId ? this._getRefResolutionScript() : ''}
        let el = ${refId ? `findElementByRef(${JSON.stringify(refId)})` : 'null'};
        if (!el && ${JSON.stringify(sel)}) el = document.querySelector(${JSON.stringify(sel || '')});
        if (!el) return { success: false, message: 'Element not found' };
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        return new Promise(r => setTimeout(() => {
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          el.dispatchEvent(new Event('contextmenu', { bubbles: true }));
          r({ success: true });
        }, ${duration}));
      })();
    `);
  }

  async _doubleTap(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const sel = this._resolveSelector(params);
    const refId = params.ref;
    return win.webContents.executeJavaScript(`
      (function() {
        ${refId ? this._getRefResolutionScript() : ''}
        let el = ${refId ? `findElementByRef(${JSON.stringify(refId)})` : 'null'};
        if (!el && ${JSON.stringify(sel)}) el = document.querySelector(${JSON.stringify(sel || '')});
        if (!el) return { success: false, message: 'Element not found' };
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return { success: true };
      })();
    `);
  }

  async _drag(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const { startX = 0, startY = 0, endX = 0, endY = 0 } = params;
    return win.webContents.executeJavaScript(`
      (function() {
        var t = document.elementFromPoint(${startX}, ${startY}) || document.body;
        t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: ${startX}, clientY: ${startY} }));
        t.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: ${endX}, clientY: ${endY} }));
        t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: ${endX}, clientY: ${endY} }));
        return { success: true };
      })();
    `);
  }

  async _tapAt(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const { x = 0, y = 0 } = params;
    return win.webContents.executeJavaScript(`
      (function() {
        var el = document.elementFromPoint(${x}, ${y}) || document.body;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: ${x}, clientY: ${y} }));
        return { success: true };
      })();
    `);
  }

  async _longPressAt(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const { x = 0, y = 0, duration = 500 } = params;
    return win.webContents.executeJavaScript(`
      (function() {
        var el = document.elementFromPoint(${x}, ${y}) || document.body;
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: ${x}, clientY: ${y} }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: ${x}, clientY: ${y} }));
        return new Promise(r => setTimeout(() => {
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: ${x}, clientY: ${y} }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: ${x}, clientY: ${y} }));
          r({ success: true });
        }, ${duration}));
      })();
    `);
  }

  async _edgeSwipe(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const edge = params.edge || 'left';
    const distance = params.distance || 200;
    return win.webContents.executeJavaScript(`
      (function() {
        var w = window.innerWidth, h = window.innerHeight;
        var sx, sy, ex, ey;
        var edge = ${JSON.stringify(edge)}, dist = ${distance};
        if (edge === 'left') { sx = 0; sy = h/2; ex = dist; ey = h/2; }
        else if (edge === 'right') { sx = w; sy = h/2; ex = w - dist; ey = h/2; }
        else if (edge === 'top') { sx = w/2; sy = 0; ex = w/2; ey = dist; }
        else { sx = w/2; sy = h; ex = w/2; ey = h - dist; }
        var t = document.elementFromPoint(sx, sy) || document.body;
        t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: sx, clientY: sy }));
        t.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: ex, clientY: ey }));
        t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: ex, clientY: ey }));
        return { success: true };
      })();
    `);
  }

  async _gesture(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const actions = JSON.stringify(params.actions || []);
    return win.webContents.executeJavaScript(`
      (function() {
        var actions = ${actions};
        return new Promise(function(resolve) {
          var i = 0;
          function next() {
            if (i >= actions.length) return resolve({ success: true });
            var a = actions[i++];
            if (a.type === 'tap') {
              var el = document.elementFromPoint(a.x||0, a.y||0) || document.body;
              el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: a.x||0, clientY: a.y||0 }));
              next();
            } else if (a.type === 'swipe') {
              var t = document.elementFromPoint(a.startX||a.x||0, a.startY||a.y||0) || document.body;
              t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: a.startX||a.x||0, clientY: a.startY||a.y||0 }));
              t.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: a.endX||0, clientY: a.endY||0 }));
              t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: a.endX||0, clientY: a.endY||0 }));
              next();
            } else if (a.type === 'wait') {
              setTimeout(next, a.duration || a.ms || 500);
            } else { next(); }
          }
          next();
        });
      })();
    `);
  }

  async _scrollUntilVisible(win, params) {
    if (!win) return { success: false };
    const sel = this._resolveSelector(params);
    const textMatch = params.text;
    const direction = params.direction || 'down';
    const maxScrolls = params.maxScrolls || 10;
    return win.webContents.executeJavaScript(`
      (function() {
        var maxScrolls = ${maxScrolls}, direction = ${JSON.stringify(direction)};
        var sel = ${JSON.stringify(sel)}, textMatch = ${JSON.stringify(textMatch)};
        return new Promise(function(resolve) {
          var count = 0;
          function attempt() {
            var found = false;
            if (sel) found = !!document.querySelector(sel);
            if (!found && textMatch) {
              var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              while (tw.nextNode()) { if (tw.currentNode.textContent.includes(textMatch)) { found = true; break; } }
            }
            if (found) return resolve({ success: true });
            if (count >= maxScrolls) return resolve({ success: false });
            count++;
            var c = document.scrollingElement || document.body;
            var dy = direction === 'down' ? 300 : direction === 'up' ? -300 : 0;
            var dx = direction === 'right' ? 300 : direction === 'left' ? -300 : 0;
            c.scrollBy(dx, dy);
            setTimeout(attempt, 200);
          }
          attempt();
        });
      })();
    `);
  }

  async _swipeCoordinates(win, params) {
    return this._drag(win, params);
  }

  async _getCheckboxState(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const sel = this._resolveSelector(params);
    if (!sel) return { success: false, message: 'Missing key/selector' };
    return win.webContents.executeJavaScript(`
      (function() {
        var el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return { success: false, message: 'Element not found' };
        if (el.classList && el.classList.contains('toggle')) return { checked: el.classList.contains('on') };
        return { checked: !!el.checked };
      })();
    `);
  }

  async _getSliderValue(win, params) {
    if (!win) return { success: false, message: 'No window' };
    const sel = this._resolveSelector(params);
    if (!sel) return { success: false, message: 'Missing key/selector' };
    return win.webContents.executeJavaScript(`
      (function() {
        var el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return { success: false, message: 'Element not found' };
        return { value: parseFloat(el.value) || 0, min: parseFloat(el.min) || 0, max: parseFloat(el.max) || 100 };
      })();
    `);
  }

  async _getRoute(win) {
    if (!win) return { route: null };
    return win.webContents.executeJavaScript(`({ route: window.location.hash || window.location.pathname })`);
  }

  async _getNavigationStack(win) {
    if (!win) return { stack: [], length: 0 };
    return win.webContents.executeJavaScript(`
      (function() {
        var route = window.location.hash || window.location.pathname;
        return { stack: [route], length: 1 };
      })();
    `);
  }

  async _getErrors(win) {
    if (!win) return { errors: [] };
    return win.webContents.executeJavaScript(`
      (function() {
        return { errors: (window.__flutterSkillErrors || []).slice() };
      })();
    `);
  }

  async _getPerformance(win) {
    if (!win) return { fps: 60, frameTime: 16.6 };
    return win.webContents.executeJavaScript(`
      (function() {
        return { fps: 60, frameTime: 16.6 };
      })();
    `);
  }

  async _getFrameStats(win) {
    if (!win) return { now: 0 };
    return win.webContents.executeJavaScript(`
      (function() {
        var entries = performance.getEntriesByType ? performance.getEntriesByType('navigation') : [];
        var nav = entries[0] || {};
        return { now: performance.now(), navigationStart: nav.startTime || 0, domContentLoaded: nav.domContentLoadedEventEnd || 0, loadComplete: nav.loadEventEnd || 0 };
      })();
    `);
  }

  async _getMemoryStats(win) {
    if (!win) return { usedJSHeapSize: 0, totalJSHeapSize: 0 };
    return win.webContents.executeJavaScript(`
      (function() {
        if (performance.memory) return { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit };
        return { usedJSHeapSize: 0, totalJSHeapSize: 0, jsHeapSizeLimit: 0 };
      })();
    `);
  }

  async _waitForGone(win, params) {
    if (!win) return { success: false };
    const sel = this._resolveSelector(params);
    const textMatch = params.text;
    const timeout = params.timeout || 5000;
    return win.webContents.executeJavaScript(`
      new Promise(function(resolve) {
        var start = Date.now();
        function check() {
          var found = false;
          if (${JSON.stringify(sel)}) found = !!document.querySelector(${JSON.stringify(sel || '')});
          if (!found && ${JSON.stringify(textMatch)}) {
            var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (tw.nextNode()) { if (tw.currentNode.textContent.includes(${JSON.stringify(textMatch || '')})) { found = true; break; } }
          }
          if (!found) return resolve({ success: true });
          if (Date.now() - start > ${timeout}) return resolve({ success: false });
          requestAnimationFrame(check);
        }
        check();
      });
    `);
  }

  async _diagnose(win) {
    if (!win) return { platform: 'electron', elements: 0, url: '' };
    return win.webContents.executeJavaScript(`
      (function() {
        var count = 0;
        document.querySelectorAll('*').forEach(function() { count++; });
        return { platform: 'electron', elements: count, url: window.location.href, userAgent: navigator.userAgent };
      })();
    `);
  }

  async _enableTestIndicators(win) {
    if (!win) return { success: false };
    await win.webContents.executeJavaScript(`
      (function() {
        if (!window.__fsTestIndicators) {
          window.__fsTestIndicators = true;
          document.addEventListener('click', function(e) {
            var dot = document.createElement('div');
            dot.style.cssText = 'position:fixed;left:'+(e.clientX-10)+'px;top:'+(e.clientY-10)+'px;width:20px;height:20px;border-radius:50%;background:rgba(255,0,0,0.5);pointer-events:none;z-index:999999;transition:opacity 0.5s;';
            document.body.appendChild(dot);
            setTimeout(function(){ dot.style.opacity='0'; }, 300);
            setTimeout(function(){ dot.remove(); }, 800);
          }, true);
        }
      })();
    `);
    return { success: true };
  }

  async _getIndicatorStatus(win) {
    if (!win) return { enabled: false };
    return win.webContents.executeJavaScript(`({ enabled: !!window.__fsTestIndicators })`);
  }

  async _enableNetworkMonitoring(win) {
    if (!win) return { success: false };
    await win.webContents.executeJavaScript(`
      (function() {
        if (!window.__fsNetMon) {
          window.__fsNetMon = true;
          window.__fsCapturedRequests = [];
          var origFetch = window.fetch;
          window.fetch = function() {
            var url = arguments[0]; if (typeof url === 'object' && url.url) url = url.url;
            var entry = { type: 'fetch', url: String(url), timestamp: Date.now(), status: null };
            window.__fsCapturedRequests.push(entry);
            return origFetch.apply(window, arguments).then(function(r) { entry.status = r.status; return r; });
          };
        }
      })();
    `);
    return { success: true };
  }

  async _getNetworkRequests(win) {
    if (!win) return { requests: [] };
    return win.webContents.executeJavaScript(`({ requests: (window.__fsCapturedRequests || []).slice() })`);
  }

  async _clearNetworkRequests(win) {
    if (!win) return { success: true };
    await win.webContents.executeJavaScript(`window.__fsCapturedRequests = [];`);
    return { success: true };
  }

  async _eval(win, params) {
    if (!win) return { success: false, message: 'No window' };
    try {
      const result = await win.webContents.executeJavaScript(params.expression || params.code || '');
      return { success: true, result: result !== undefined ? String(result) : null };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = { FlutterSkillElectron };
