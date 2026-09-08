import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const assetsDir = 'c:/Users/Ken Ryzen/Documents/proyectos-sass/qp-outreach-engine/demo-video/assets';
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

async function captureScreens() {
  console.log('🚀 Iniciando Puppeteer para capturar el sistema real...');
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 }
  });

  const page = await browser.newPage();
  
  // 1. Pantalla de Login
  console.log('📸 Capturando 1: Pantalla de Login...');
  await page.goto('https://qp-outreach-engine.vercel.app', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(assetsDir, '01_login.png') });

  // Iniciar Sesión con PIN Maestro
  console.log('🔑 Ingresando PIN maestro...');
  await page.type('#pinInput', 'KennethQP#2026');
  await page.click('#pinBtn');
  await new Promise(r => setTimeout(r, 4000));

  // 2. Pantalla de Workspace (3 Columnas)
  console.log('📸 Capturando 2: Workspace de 3 Columnas...');
  await page.screenshot({ path: path.join(assetsDir, '02_workspace.png') });

  // 3. Pantalla de Campañas & Prospección
  console.log('📸 Capturando 3: Campañas & Prospección...');
  const tabDiscovery = await page.$('#tabBtnDiscovery');
  if (tabDiscovery) {
    await tabDiscovery.click();
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(assetsDir, '03_campaigns.png') });
  }

  // 4. Pantalla de Métricas SaaR
  console.log('📸 Capturando 4: Métricas SaaR...');
  const tabMetrics = await page.$('#tabBtnMetrics');
  if (tabMetrics) {
    await tabMetrics.click();
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(assetsDir, '04_metrics.png') });
  }

  // 5. Configuración del Sistema (Finanzas SaaR)
  console.log('📸 Capturando 5: Configuración Finanzas SaaR...');
  const btnSettings = await page.$('#btnOpenSettings');
  if (btnSettings) {
    await btnSettings.click();
    await new Promise(r => setTimeout(r, 1500));
    
    const tabFinances = await page.$('#settingsTabBtn_finances');
    if (tabFinances) {
      await tabFinances.click();
      await new Promise(r => setTimeout(r, 1500));
    }
    await page.screenshot({ path: path.join(assetsDir, '05_finances_modal.png') });
  }

  // Volver a Workspace y capturar zoom del Co-Piloto
  console.log('📸 Capturando 6: Zoom a Co-Pilot...');
  const btnCloseModal = await page.$('#settingsModal button');
  if (btnCloseModal) await btnCloseModal.click().catch(() => {});
  const tabWorkspace = await page.$('#tabBtnWorkspace');
  if (tabWorkspace) {
    await tabWorkspace.click();
    await new Promise(r => setTimeout(r, 2000));
  }
  await page.screenshot({ path: path.join(assetsDir, '06_workspace_detail.png') });

  await browser.close();
  console.log('✅ Todas las capturas del sistema real fueron guardadas en /assets!');
}

captureScreens().catch(err => {
  console.error('Error en captura:', err);
  process.exit(1);
});
