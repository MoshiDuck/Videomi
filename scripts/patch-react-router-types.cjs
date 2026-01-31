#!/usr/bin/env node
/**
 * Patch .react-router/types:
 * 1. Add second type argument to GetAnnotations (typegen generates 1-arg, library expects 2).
 * 2. Align property names: library has MiddlewareFunction/ClientMiddlewareFunction,
 *    generated files reference unstable_MiddlewareFunction/unstable_ClientMiddlewareFunction.
 */
const fs = require('fs');
const path = require('path');

const typesDir = path.join(__dirname, '..', '.react-router', 'types');

const replacements = [
  ['type Annotations = GetAnnotations<Info & { module: Module, matches: Matches }>;', 'type Annotations = GetAnnotations<Info & { module: Module, matches: Matches }, true>;'],
  ['Annotations["unstable_MiddlewareFunction"]', 'Annotations["MiddlewareFunction"]'],
  ['Annotations["unstable_ClientMiddlewareFunction"]', 'Annotations["ClientMiddlewareFunction"]'],
];

function walk(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) walk(full);
    else if (f.name.endsWith('.ts')) {
      let content = fs.readFileSync(full, 'utf8');
      let changed = false;
      for (const [oldStr, newStr] of replacements) {
        if (content.includes(oldStr)) {
          content = content.split(oldStr).join(newStr);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(full, content);
        console.log('Patched:', full);
      }
    }
  }
}

if (fs.existsSync(typesDir)) {
  walk(typesDir);
}
