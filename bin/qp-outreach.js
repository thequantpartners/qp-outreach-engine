#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Asegurar que el directorio de trabajo y env apunten al engine
if (process.cwd() !== projectRoot) {
  process.chdir(projectRoot);
}

// En modo MCP por stdio, stdout es exclusivo para JSON-RPC
if (process.argv.includes('mcp')) {
  console.log = (...args) => console.error(...args);
  console.info = (...args) => console.error(...args);
}

// Si existe dist/cli/index.js correrlo, sino usar tsx para desarrollo
const distPath = path.resolve(projectRoot, 'dist/cli/index.js');

if (fs.existsSync(distPath)) {
  const { runCli } = await import(pathToFileURL(distPath).href);
  await runCli();
} else {
  // En desarrollo local
  const localPath = path.resolve(__dirname, '../src/cli/index.js');
  const { runCli } = await import(pathToFileURL(localPath).href);
  await runCli();
}
