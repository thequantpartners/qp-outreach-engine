import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.join(__dirname, 'bin');
const env = { ...process.env, PATH: binDir + ';' + (process.env.PATH || '') };

const args = ['hyperframes', 'render', ...process.argv.slice(2)];
console.log('Running hyperframes render with local ffmpeg...');
const child = spawn('npx', args, { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code || 0));
