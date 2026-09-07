import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';

const archivePath = path.resolve('storage/session_auth.tar.gz');
if (!fs.existsSync(archivePath)) {
  console.error('No se encontro el archivo de sesion:', archivePath);
  process.exit(1);
}

const b64 = fs.readFileSync(archivePath).toString('base64');
console.log('📦 Tamaño de la sesión de WhatsApp:', (b64.length / 1024).toFixed(1), 'KB (base64)');
console.log('🚀 Conectando a Railway y desplegando credenciales en /app/storage/whatsapp_auth...');

const readStream = fs.createReadStream(archivePath);
const proc = spawn('cmd.exe', ['/c', 'railway', 'ssh', 'tar', '-xzf', '-', '-C', '/app/storage/whatsapp_auth'], {
  stdio: ['pipe', 'inherit', 'inherit']
});

readStream.pipe(proc.stdin);

proc.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Sesión de WhatsApp transferida y extraída exitosamente en Railway.');
  } else {
    console.error('❌ Error transfiriendo sesión. Código de salida:', code);
  }
  process.exit(code || 0);
});
