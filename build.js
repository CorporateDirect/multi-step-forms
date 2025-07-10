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
  code = code.replace(/^\s*import .*?;$/gm, '')
             .replace(/^\s*export .*?$/gm, '')
             .replace(/^\s*export default /gm, '');
  bundle += `\n// ---- ${path.relative(srcDir, file)} ----\n` + code + '\n';
});

const wrapped = `(function(){\n${bundle}\n})();`;

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
fs.writeFileSync(outFile, wrapped, 'utf8');
console.log('Built', outFile); 