import fs from 'fs';
import { spawn, execSync } from 'child_process';
import path from 'path';

const assetsDir = path.resolve('storage/assets');
if (!fs.existsSync(assetsDir)) {
  console.error('No se encontro el directorio storage/assets');
  process.exit(1);
}

// 1. Crear directorio en Railway si no existe
console.log('📁 Creando directorio /app/storage/assets en Railway...');
try {
  execSync('railway ssh "mkdir -p /app/storage/assets"', { stdio: 'inherit' });
} catch (e) {
  console.error('Aviso mkdir:', e.message);
}

// 2. Empaquetar y transferir
const archivePath = path.resolve('storage/assets.tar.gz');
execSync(`tar -czf "${archivePath}" -C "${assetsDir}" .`);
console.log('📦 Empaquetado assets.tar.gz');

const readStream = fs.createReadStream(archivePath);
const proc = spawn('cmd.exe', ['/c', 'railway', 'ssh', 'tar', '-xzf', '-', '-C', '/app/storage/assets'], {
  stdio: ['pipe', 'inherit', 'inherit']
});

readStream.pipe(proc.stdin);

proc.on('close', (code) => {
  if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  if (code === 0) {
    console.log('✅ Archivos de assets transferidos exitosamente a /app/storage/assets en Railway.');
  } else {
    console.error('❌ Error transfiriendo assets. Codigo:', code);
  }
  process.exit(code || 0);
});
