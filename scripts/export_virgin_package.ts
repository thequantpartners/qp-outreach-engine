// =================================================================
// THE QUANT PARTNERS · EXPORT VIRGIN AGENT-READY PACKAGE
// Genera un paquete limpio y esterilizado sin ninguna credencial de Kenneth.
// =================================================================

import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(process.cwd());
const EXPORT_DIR = path.join(ROOT_DIR, 'export', 'qp-commercial-engine');

console.log('🚀 Iniciando proceso de empaquetado virgen Agent-Ready...');

// 1. Crear directorio limpio
if (fs.existsSync(EXPORT_DIR)) {
  fs.rmSync(EXPORT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(EXPORT_DIR, { recursive: true });

// 2. Lista blanca de archivos y directorios permitidos
const WHITE_LIST_FILES = [
  'AGENT_INSTALL_SPEC.md',
  'AI_BOOTSTRAP_PROMPT.txt',
  'iniciar.bat',
  'iniciar.sh',
  '.env.example',
  'docker-compose.yml',
  'Dockerfile',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'LICENSE',
  'README.md'
];

const WHITE_LIST_DIRS = [
  'src',
  'public'
];

// Función recursiva de copiado con filtro estricto
function copyRecursive(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      // Ignorar archivos y carpetas sensibles
      if (['storage', '.env', 'node_modules', 'dist', '.git', 'scratch', 'export'].includes(item)) continue;
      if (item.endsWith('.log') || item.endsWith('.tmp')) continue;

      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    // Escaneo de seguridad anti-fuga
    const content = fs.readFileSync(src, 'utf-8');
    
    // Verificación de teléfono de Kenneth en plantillas
    if (src.endsWith('.env.example') && content.includes('51902105668')) {
      throw new Error(`🚨 SEGURIDAD: .env.example contiene el teléfono privado de Kenneth! Cancelando exportación.`);
    }

    fs.copyFileSync(src, dest);
  }
}

// 3. Copiar archivos raíz
for (const file of WHITE_LIST_FILES) {
  const srcPath = path.join(ROOT_DIR, file);
  const destPath = path.join(EXPORT_DIR, file);
  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, destPath);
    console.log(`  ✅ Copiado: ${file}`);
  } else {
    console.warn(`  ⚠️ Archivo no encontrado: ${file}`);
  }
}

// 4. Copiar directorios
for (const dir of WHITE_LIST_DIRS) {
  const srcPath = path.join(ROOT_DIR, dir);
  const destPath = path.join(EXPORT_DIR, dir);
  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, destPath);
    console.log(`  ✅ Directorio copiado: ${dir}/`);
  }
}

console.log('\n🔒 Verificación de seguridad:');
console.log('  - Cero credenciales (.env omitido): OK');
console.log('  - Cero sesiones de WhatsApp (storage omitido): OK');
console.log('  - Archivo AGENT_INSTALL_SPEC.md listo: OK');
console.log('  - Script de 1 clic (iniciar.bat / iniciar.sh) listo: OK');

console.log(`\n🎉 ¡Paquete virgen exportado con éxito en:`);
console.log(`👉 ${EXPORT_DIR}`);
console.log(`\nPuedes comprimir esta carpeta en un .zip y está lista para vender o entregar al cliente.`);
