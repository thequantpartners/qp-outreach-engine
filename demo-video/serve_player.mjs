import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const videoPath = path.join(__dirname, 'demo_qp_outreach.mp4');
const PORT = 3005;

const server = http.createServer((req, res) => {
  if (req.url === '/video.mp4' || req.url === '/demo_qp_outreach.mp4') {
    if (!fs.existsSync(videoPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Video not found');
      return;
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
 } else {
 const head = {
 'Content-Length': fileSize,
 'Content-Type': 'video/mp4',
 'Accept-Ranges': 'bytes',
 };
 res.writeHead(200, head);
 fs.createReadStream(videoPath).pipe(res);
 }
 return;
 }

 // HTML Player Page
 const html = <!DOCTYPE html>
<html lang=es>
<head>
 <meta charset=UTF-8>
 <title>QP Outreach Engine · Video Demo Oficial</title>
 <script src=https://cdn.tailwindcss.com></script>
 <link href=https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&family=JetBrains+Mono:wght@500&display=swap rel=stylesheet>
 <style>
 body { font-family: 'Inter', sans-serif; background-color: #030407; }
 .font-serif { font-family: 'Playfair Display', serif; }
 .font-mono { font-family: 'JetBrains Mono', monospace; }
 </style>
</head>
<body class=min-h-screen text-slate-200 flex flex-col items-center justify-center p-6>
 <div class=max-w-4xl w-full space-y-6>
 <!-- Header -->
 <div class=flex items-center justify-between border-b border-white/[0.08] pb-4>
 <div class=flex items-center gap-3>
 <div class=w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-serif font-bold text-lg>
 QP
 </div>
 <div>
 <h1 class=font-serif text-lg text-white font-medium>The Quant Partners</h1>
 <p class=text-xs text-slate-400 font-mono>Demo Oficial · QP Outreach Engine (SaaR)</p>
 </div>
 </div>
 <div class=flex items-center gap-3>
 <span class=text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full>
 ● Full HD 1080p (2.5 MB)
 </span>
 <a href=/video.mp4 download=demo_qp_outreach.mp4 class=px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-mono font-medium transition flex items-center gap-1.5>
 ⬇ Descargar MP4
 </a>
 </div>
 </div>

 <!-- Video Container -->
 <div class=relative rounded-2xl overflow-hidden border border-white/[0.1] bg-black shadow-2xl aspect-video>
 <video id=player controls autoplay class=w-full h-full object-contain preload=auto>
 <source src=/video.mp4 type=video/mp4>
 Tu navegador no soporta reproducción de video MP4.
 </video>
 </div>

 <!-- Footer Specs -->
 <div class=grid grid-cols-3 gap-4 text-xs font-mono text-slate-400 pt-2>
 <div class=p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]>
 <span class=text-slate-500 block text-[10px] uppercase>Duración</span>
 <span class=text-slate-200 font-semibold text-sm>50 segundos</span>
 </div>
 <div class=p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]>
 <span class=text-slate-500 block text-[10px] uppercase>Peso WhatsApp</span>
 <span class=text-amber-400 font-semibold text-sm>2.5 MB (Apto Chat)</span>
 </div>
 <div class=p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]>
 <span class=text-slate-500 block text-[10px] uppercase>Resolución</span>
 <span class=text-slate-200 font-semibold text-sm>1920 × 1080 (30 fps)</span>
 </div>
 </div>
 </div>
</body>
</html>;

 res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
 res.end(html);
});

server.listen(PORT, () => {
 console.log(🎬 Servidor de Video Activo en: http://localhost:);
});
