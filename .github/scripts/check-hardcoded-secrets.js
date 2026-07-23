const fs = require('node:fs');
const path = require('node:path');

const SECRET_ASSIGNMENT = /(api[_-]?key|secret|token|password)(\s*(?:=|:)\s*)['"][a-zA-Z0-9_-]{16,}['"]/i;
const EXCLUDED_DIRECTORIES = new Set(['tests', '__tests__', 'node_modules']);

function isTestFile(filePath) {
  const normalized = filePath.split(path.sep);
  const basename = path.basename(filePath);

  return normalized.some((part) => EXCLUDED_DIRECTORIES.has(part))
    || basename.endsWith('.test.js')
    || basename.endsWith('.spec.js');
}

function listJavaScriptFiles(root) {
  const files = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(...listJavaScriptFiles(filePath));
      }
    } else if (entry.isFile() && entry.name.endsWith('.js') && !isTestFile(filePath)) {
      files.push(filePath);
    }
  }

  return files;
}

function redactSecret(line) {
  return line.replace(SECRET_ASSIGNMENT, (_, name, separator) => `${name}${separator}'<redacted>'`);
}

function findHardcodedSecrets(root) {
  const matches = [];

  for (const file of listJavaScriptFiles(root)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (SECRET_ASSIGNMENT.test(line)) {
        matches.push({
          file,
          line: index + 1,
          text: redactSecret(line.trim()),
        });
      }
    });
  }

  return matches;
}

function run() {
  const root = path.resolve(process.argv[2] || path.join('apps', 'desktop', 'electron'));
  const matches = findHardcodedSecrets(root);

  if (matches.length === 0) {
    console.log('未发现生产代码硬编码密钥');
    return;
  }

  console.error('发现生产代码硬编码密钥：');
  for (const match of matches) {
    console.error(`${path.relative(process.cwd(), match.file)}:${match.line}: ${match.text}`);
  }
  process.exitCode = 1;
}

if (require.main === module) {
  run();
}

module.exports = { findHardcodedSecrets, isTestFile };
