#!/usr/bin/env node
// Usage: node generate-data.mjs [--snapshot] [--write]
// Default: shallow-clone current Express, emit JSON to stdout. --write inlines it.
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
let snapshot;
if (args.has('--snapshot')) {
  snapshot = JSON.parse(readFileSync(path.join(projectDir, 'source-snapshot.json'), 'utf8'));
} else {
  const temporary = mkdtempSync(path.join(tmpdir(), 'floorplan-'));
  try {
    const checkout = path.join(temporary, 'express');
    execFileSync('git', ['clone', '--depth', '1', 'https://github.com/expressjs/express.git', checkout], { stdio: ['ignore', 'ignore', 'inherit'] });
    const commit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const files = [];
    function walk(relative) {
      for (const entry of readdirSync(path.join(checkout, relative), { withFileTypes: true })) {
        const next = path.posix.join(relative, entry.name);
        if (entry.isDirectory()) walk(next);
        else if (entry.isFile() && /\.(?:js|cjs|mjs|json)$/.test(next)) files.push(next);
      }
    }
    walk('lib'); walk('examples'); files.push('index.js');
    snapshot = { repo: 'expressjs/express', commit, provenance: 'Verified shallow checkout', files: files.sort().map(file => ({ path: file, source: readFileSync(path.join(checkout, file), 'utf8') })) };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
function classify(file) {
  if (file.startsWith('lib/router/') || /^examples\/(multi-router|route-map|route-separation)\//.test(file)) return 'router';
  if (file.startsWith('lib/middleware/') || /^examples\/(route-middleware|error|cookie-sessions)\//.test(file)) return 'middleware';
  return file.startsWith('examples/') ? 'example' : 'core';
}
const known = new Set(snapshot.files.map(file => file.path));
const edges = [], unresolved = [];
const nodes = snapshot.files.map(file => {
  // Literal requires only; strip block comments so documentation examples aren't imports.
  const source = file.source.replace(/\/\*[\s\S]*?\*\//g, '');
  const requires = [...new Set([...source.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map(match => match[2]))];
  const external = [];
  for (const specifier of requires) {
    if (!specifier.startsWith('.')) { external.push(specifier); continue; }
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), specifier));
    const target = [base, base + '.js', base + '.cjs', base + '.mjs', base + '.json', path.posix.join(base, 'index.js')].find(candidate => known.has(candidate));
    if (target) { if (!edges.some(edge => edge.source === file.path && edge.target === target)) edges.push({ source: file.path, target }); }
    else unresolved.push({ source: file.path, specifier });
  }
  return { id: file.path, path: file.path, type: classify(file.path), external, snippet: file.preview || file.source.split('\n').slice(0,12).join('\n'), normalized: !!file.normalized };
});
const data = { repo: snapshot.repo, commit: snapshot.commit, provenance: snapshot.provenance, nodes, edges, unresolved };
if (nodes.length < 25 || edges.length < 15 || new Set(nodes.map(n => n.type)).size < 4) throw new Error('Source graph does not meet the minimum graph contract');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
if (args.has('--write')) {
  const file = path.join(projectDir, 'index.html');
  const html = readFileSync(file, 'utf8');
  if (!html.includes('<script id="graph-data" type="application/json">')) throw new Error('Missing graph-data block');
  writeFileSync(file, html.replace(/(<script id="graph-data" type="application\/json">)[\s\S]*?(<\/script>)/, (_, start, end) => start + json + end));
  process.stderr.write(`Inlined ${nodes.length} files and ${edges.length} edges; ${unresolved.length} unresolved imports.\n`);
} else process.stdout.write(json + '\n');
