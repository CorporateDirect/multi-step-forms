#!/usr/bin/env node
/**
 * Very naive build script: concatenates all .js files under src into one bundle,
 * strips import/export statements, and wraps the result in an IIFE.
 * For demo/POC purposes only – use real bundler for production.
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');
const outFile = path.join(distDir, 'multi-step.js');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const res = path.resolve(dir, entry.name);
    return entry.isDirectory() ? walk(res) : [res];
  });
}

const files = walk(srcDir).filter(f => f.endsWith('.js'));
let bundle = '';

files.forEach(file => {
  let code = fs.readFileSync(file, 'utf8');
  // Remove simple import/export lines (very simplistic)
  code = code
    // strip ES module imports
    .replace(/^\s*import .*?;$/gm, '')
    // transform various export forms into vanilla declarations
    .replace(/^\s*export default /gm, '')
    .replace(/^\s*export\s+function\s+/gm, 'function ') // export function foo -> function foo
    .replace(/^\s*export\s+class\s+/gm, 'class ')       // export class Foo -> class Foo
    .replace(/^\s*export\s+const\s+/gm, 'const ')       // export const BAR = -> const BAR =
    .replace(/^\s*export\s+let\s+/gm, 'let ')
    .replace(/^\s*export\s+var\s+/gm, 'var ');
  bundle += `\n// ---- ${path.relative(srcDir, file)} ----\n` + code + '\n';
});

const wrapped = `(function(){\n${bundle}\n})();`;

// Async wrapper to handle terser promise-based API
(async () => {
  let minified = null;
  try {
    const terser = require('terser');
    const result = await terser.minify(wrapped, {
      ecma: 2020,
      format: { comments: false }
    });
    if (result.code) {
      minified = result.code;
    }
  } catch (e) {
    console.warn('Terser not available or minification failed:', e && e.message ? e.message : e);
  }

  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
  fs.writeFileSync(outFile, wrapped, 'utf8');
  console.log('Built', outFile);

  if (minified) {
    const minFile = path.join(distDir, 'multi-step.min.js');
    fs.writeFileSync(minFile, minified, 'utf8');
    console.log('Minified build', minFile);
  }
})(); 