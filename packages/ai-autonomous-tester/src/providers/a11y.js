let axe;
try { axe = require('axe-core'); } catch (e) { console.warn('[A11y] axe-core not installed'); }

class A11yProvider {
  constructor(o) { this.tags = (o && o.tags) || ['wcag2a','wcag2aa']; this.enabled = !!axe; }
  async inject(page) { if (!this.enabled) return; await page.addScriptTag({ content: axe.source }); }
  async run(page) {
    if (!this.enabled) return { violations: [], passes: [], error: 'axe-core not installed' };
    const result = await page.evaluate(function(opts) {
      return new Promise(function(resolve, reject) {
        window.axe.run(document, { tags: opts.tags }, function(err, data) {
          if (err) reject(err); else resolve(data);
        });
      });
    }, { tags: this.tags });
    const violations = result.violations || [];
    const passes = result.passes || [];
    const summary = { violations: violations.length, passes: passes.length };
    ['critical','serious','moderate','minor'].forEach(function(imp) {
      summary[imp] = violations.filter(function(v) { return v.impact === imp; }).length;
    });
    return { violations: violations, passes: passes, summary: summary };
  }
  formatViolations(violations) {
    if (!violations || !violations.length) return 'No accessibility violations found.\n';
    var md = '## Accessibility Violations\n\n';
    var order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    var sorted = [].concat(violations).sort(function(a, b) { return (order[a.impact] || 4) - (order[b.impact] || 4); });
    sorted.forEach(function(v, i) {
      md += '### ' + (i+1) + '. [' + (v.impact || 'none').toUpperCase() + '] ' + v.id + '\n\n';
      md += '- Description: ' + (v.description || '') + '\n';
      md += '- Help: ' + (v.helpUrl || '') + '\n';
      md += '- Nodes: ' + (v.nodes ? v.nodes.length : 0) + '\n\n';
      if (v.nodes && v.nodes.length > 0) {
        md += '`\n';
        v.nodes.slice(0, 3).forEach(function(n) { md += (n.html || '(no html)').substring(0, 120) + '\n'; });
        if (v.nodes.length > 3) md += '...' + (v.nodes.length - 3) + ' more\n';
        md += '`\n\n';
      }
    });
    return md;
  }
}
module.exports = { A11yProvider };
