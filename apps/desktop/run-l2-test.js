const { spawn } = require('child_process');
const path = require('path');

const electronExe = path.join(process.env.PROJECT003, 'node_modules', 'electron', 'dist', 'electron.exe');
const l2test = path.join(process.env.PROJECT003, 'apps', 'desktop', 'electron', 'l2-test.js');
const desktopDir = path.join(process.env.PROJECT003, 'apps', 'desktop');

console.log('electron:', electronExe);
console.log('l2test:', l2test);

const p = spawn(electronExe, ['--no-sandbox', '--require', l2test, desktopDir], { stdio: 'pipe' });
let out = '';
p.stdout.on('data', d => out += d.toString());
p.stderr.on('data', d => out += d.toString());
p.on('close', code => {
  console.log('CODE:', code);
  console.log(out.slice(0, 3000));
});
setTimeout(() => { if (!p.killed) p.kill(); }, 6000);