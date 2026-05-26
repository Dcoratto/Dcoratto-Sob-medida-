import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const TARGETS = ['src', 'api', 'scripts', 'index.html', 'package.json', 'server.js', 'vite.config.mjs'];
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.jsx', '.json', '.mjs', '.ts', '.tsx']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'Marmoraria']);
const IGNORED_PREFIXES = ['dist-verify', 'exports', path.join('supabase', 'imports')];

const suspiciousPatterns = [
  {name: 'mojibake UTF-8/Latin1', pattern: /\u00c3[\u0080-\u00bf]/u},
  {name: 'mojibake Latin1 prefix', pattern: /\u00c2[\u0080-\u00bf]/u},
  {name: 'replacement character', pattern: /\ufffd/u},
  {name: 'encoded replacement marker', pattern: /\u00ef\u00bf\u00bd/u},
];

const shouldIgnore = (relativePath) => {
  const normalized = relativePath.split(path.sep).join('/');
  return IGNORED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
};

const walk = (entry) => {
  const absolute = path.join(ROOT, entry);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  const relative = path.relative(ROOT, absolute);

  if (stat.isFile()) {
    return TEXT_EXTENSIONS.has(path.extname(absolute)) && !shouldIgnore(relative) ? [absolute] : [];
  }

  if (!stat.isDirectory()) return [];
  if (IGNORED_DIRS.has(path.basename(absolute)) || shouldIgnore(relative)) return [];

  return fs.readdirSync(absolute, {withFileTypes: true}).flatMap((item) => walk(path.join(relative, item.name)));
};

const files = TARGETS.flatMap(walk);
const findings = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) {
    findings.push({
      file: path.relative(ROOT, file),
      line: 1,
      name: 'UTF-8 BOM',
      text: 'Arquivo salvo com BOM; salve como UTF-8 sem BOM.',
    });
  }
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const {name, pattern} of suspiciousPatterns) {
      if (!pattern.test(line)) continue;
      findings.push({
        file: path.relative(ROOT, file),
        line: index + 1,
        name,
        text: line.trim().slice(0, 180),
      });
    }
  });
}

if (findings.length) {
  console.error('Foram encontrados possíveis problemas de codificação:');
  findings.slice(0, 80).forEach((finding) => {
    console.error(`${finding.file}:${finding.line} [${finding.name}] ${finding.text}`);
  });
  if (findings.length > 80) {
    console.error(`... mais ${findings.length - 80} ocorrência(s).`);
  }
  process.exit(1);
}

console.log('Codificação OK: nenhum mojibake encontrado nos arquivos do app.');
