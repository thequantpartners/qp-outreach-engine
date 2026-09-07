import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

async function generateDictamenPdf() {
  const outputDir = path.resolve('./storage/assets');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'dictamen_licitaciones_qp_essalud_piura.pdf');
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 45, right: 45 },
    autoFirstPage: false
  });

  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  const colors = {
    navy: '#0f172a',
    gold: '#b45309',
    goldLight: '#fef3c7',
    goldBorder: '#d97706',
    slateDark: '#1e293b',
    slateText: '#334155',
    slateMuted: '#64748b',
    lightBg: '#f8fafc',
    borderLight: '#e2e8f0',
    dangerRed: '#b91c1c',
    dangerBg: '#fef2f2'
  };

  const drawHeader = (pageNum: number) => {
    doc.addPage();
    
    // Top banner
    doc.rect(45, 30, 505, 3).fill(colors.gold);
    
    doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.navy)
      .text('THE QUANT PARTNERS  |  DIVISIÓN DE LICITACIONES QP', 45, 38, { characterSpacing: 1 });
    
    doc.font('Helvetica').fontSize(8).fillColor(colors.slateMuted)
      .text('CONSULTORÍA EN CONTRATACIONES CON EL ESTADO Y BLINDAJE TÉCNICO DE OFERTAS', 45, 52);
    
    doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.gold)
      .text(`DICTAMEN TÉCNICO N° DICT-QP-2026-ESSALUD-003  |  PÁGINA ${pageNum} DE 3`, 45, 52, { align: 'right' });

    doc.moveTo(45, 66).lineTo(550, 66).lineWidth(0.5).strokeColor(colors.borderLight).stroke();
  };

  const drawFooter = () => {
    doc.moveTo(45, 785).lineTo(550, 785).lineWidth(0.5).strokeColor(colors.borderLight).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(colors.slateMuted)
      .text('DOCUMENTO DE CARÁCTER CONFIDENCIAL  ·  THE QUANT PARTNERS S.A.C.  ·  LIMA, PERÚ  ·  WHATSAPP DIRECTO: +51 902 105 668', 45, 793, { align: 'center' });
  };

  // ==========================================
  // PÁGINA 1: CARÁTULA Y RESUMEN EJECUTIVO
  // ==========================================
  drawHeader(1);

  let y = 80;

  // Badge Tipo de Documento
  doc.roundedRect(45, y, 170, 18, 3).fillAndStroke(colors.goldLight, colors.goldBorder);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.gold)
    .text('DICTAMEN PERICIAL PREVENTIVO', 52, y + 5);

  y += 26;

  // Título Principal
  doc.font('Helvetica-Bold').fontSize(16).fillColor(colors.navy)
    .text('DICTAMEN TÉCNICO Y AUDITORÍA DE BASES', 45, y);
  y += 20;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.gold)
    .text('CONCURSO PÚBLICO N° 03-2026-ESSALUD/RAP (PRIMERA CONVOCATORIA)', 45, y);

  y += 24;

  // Ficha Técnica Box
  doc.roundedRect(45, y, 505, 95, 4).fillAndStroke(colors.lightBg, colors.borderLight);

  const drawMetaRow = (label: string, val: string, rowY: number) => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(colors.slateDark).text(label, 55, rowY);
    doc.font('Helvetica').fontSize(8.5).fillColor(colors.slateText).text(val, 175, rowY, { width: 365 });
  };

  drawMetaRow('Entidad Convocante:', 'Seguro Social de Salud - Red Asistencial Piura (EsSalud)', y + 10);
  drawMetaRow('Objeto del Proceso:', 'Servicio de Mantenimiento Preventivo y Correctivo del Parque de Equipamiento Biomédico', y + 26);
  drawMetaRow('Valor Estimado:', 'S/. 2,850,000.00 (Dos Millones Ochocientos Cincuenta Mil Soles)', y + 42);
  drawMetaRow('Plazo de Ejecución:', '365 días calendario  ·  Sistema: Suma Alzada y Precios Unitarios', y + 58);
  drawMetaRow('Estado del Concurso:', 'Etapa de Formulación de Consultas y Observaciones en el SEACE', y + 74);

  y += 110;

  // Sección I: Resumen Ejecutivo
  doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.navy).text('1. RESUMEN EJECUTIVO Y ALERTA DE RIESGO DE CONTINGENCIA', 45, y);
  y += 16;

  doc.font('Helvetica').fontSize(9).fillColor(colors.slateText).text(
    'La División de Licitaciones de The Quant Partners ha realizado un examen pericial minucioso del Pliego de Condiciones Particulares y de las Especificaciones Técnicas (TDR) del Concurso Público N° 03-2026-ESSALUD/RAP. Nuestro equipo de ingenieros biomédicos y abogados especialistas en Contrataciones del Estado ha identificado dos (02) vicios sustanciales que atentan contra la legalidad del procedimiento y representan una contingencia financiera letal para cualquier postor que pretenda ejecutar el servicio bajo las condiciones actuales:',
    45, y, { align: 'justify', lineGap: 3, width: 505 }
  );

  y += 62;

  // Cuadro de Vicios Críticos
  // Vicio 1 Card
  doc.roundedRect(45, y, 505, 75, 4).fillAndStroke(colors.dangerBg, colors.dangerRed);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(colors.dangerRed)
    .text('⚠️  VICIO CRÍTICO 1: Cláusula de Penalidad Operativa Abusiva (5% UIT cada 24h)', 55, y + 10);
  doc.font('Helvetica').fontSize(8.5).fillColor(colors.slateText).text(
    'Se impone una sanción diaria de S/. 267.50 sin contemplar causales de fuerza mayor ni los tiempos reales de importación y desaduanaje de componentes electrónicos críticos. En caso de rotura de stock de repuestos de importación (15 a 25 días), la penalidad consumiría hasta el 100% de la facturación mensual del contratista, forzando la resolución del contrato e inhabilitación temporal ante el RNP.',
    55, y + 26, { width: 485, lineGap: 2.5 }
  );

  y += 85;

  // Vicio 2 Card
  doc.roundedRect(45, y, 505, 75, 4).fillAndStroke(colors.lightBg, colors.goldBorder);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(colors.gold)
    .text('⚠️  VICIO CRÍTICO 2: Exigencia Ilegal de Certificación ISO 13485 al Postor', 55, y + 10);
  doc.font('Helvetica').fontSize(8.5).fillColor(colors.slateText).text(
    'Las bases exigen que la empresa prestadora cuente con ISO 13485 a nombre de su razón social. Dicho estándar está reservado exclusivamente a diseñadores y fabricantes de dispositivos médicos, no a prestadores de servicio de mantenimiento multimarca. Esta restricción vulnera el Principio de Libertad de Concurrencia (Art. 2 de la Ley 30225) y evidencia un claro direccionamiento hacia un único postor.',
    55, y + 26, { width: 485, lineGap: 2.5 }
  );

  y += 90;

  // Dictamen Conclusivo Preliminar
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(colors.navy).text('DICTAMEN PRELIMINAR:', 45, y);
  doc.font('Helvetica').fontSize(8.5).fillColor(colors.slateText).text(
    'No es recomendable presentar oferta sin antes articular formalmente las observaciones técnicas correspondientes en el SEACE o solicitar la Elevación de Bases al OSCE. De lo contrario, el postor queda atado a penalidades automáticas e inexcusables durante los 12 meses de contrato.',
    175, y, { width: 375, lineGap: 2 }
  );

  drawFooter();

  // ==========================================
  // PÁGINA 2: ANÁLISIS JURÍDICO Y TÉCNICO
  // ==========================================
  drawHeader(2);

  y = 80;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.navy).text('2. FUNDAMENTACIÓN TÉCNICO-LEGAL Y PRECEDENTES DEL OSCE', 45, y);
  y += 18;

  // Vicio 1 Desarrollo
  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.gold)
    .text('2.1. Infracción al Principio de Razonabilidad en las Penalidades Operativas (Numeral 8.4)', 45, y);
  y += 15;

  doc.font('Helvetica').fontSize(8.5).fillColor(colors.slateText).text(
    'El Numeral 8.4 de los TDR estipula: "Por cada 24 horas calendario de atraso en el restablecimiento operativo de equipos de soporte de vida o diagnóstico por imágenes, se aplicará una penalidad del 5% de la Unidad Impositiva Tributaria (UIT)".\n\n' +
    'ANÁLISIS DE MERCADO E INGENIERÍA BIOMÉDICA:\n' +
    'Los componentes mayores de equipos de imágenes (magnetrones, tarjetas PCB de radiofrecuencia, detectores digitales y tubos de rayos X) no cuentan con stock permanente en plaza peruana y su importación formal bajo régimen de DIGEMID exige entre 14 y 21 días útiles. La redacción de las bases no distingue entre negligencia del contratista y retrasos derivados de la cadena logística internacional.\n\n' +
    'JURISPRUDENCIA APLICABLE DEL TRIBUNAL DE CONTRATACIONES DEL ESTADO (TCE):\n' +
    'El Tribunal del OSCE ha señalado de manera pacífica mediante la Opinión N° 088-2021/DTN y la Resolución N° 1842-2023-TCE-S2 que "las penalidades distintas a la mora deben ser objetivas, razonables, congruentes y proporcionales con el objeto de la contratación, no pudiendo constituir mecanismos confiscatorios ni imposibles de cumplimiento fáctico". La omisión de un plazo de gracia para repuestos importados convierte a esta cláusula en una penalidad usurera y nula de pleno derecho.',
    45, y, { width: 505, lineGap: 2.8, align: 'justify' }
  );

  y += 185;

  // Vicio 2 Desarrollo
  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.gold)
    .text('2.2. Restricción Ilícita a la Competencia mediante Exigencia de ISO 13485 (Numeral 5.2)', 45, y);
  y += 15;

  doc.font('Helvetica').fontSize(8.5).fillColor(colors.slateText).text(
    'El Numeral 5.2 del Capítulo III (Requisitos de Calificación) requiere acreditar la certificación "ISO 13485: Sistemas de Gestión de la Calidad para Productos Sanitarios" como requisito obligatorio de admisibilidad.\n\n' +
    'ANÁLISIS TÉCNICO NORMATIVO:\n' +
    'De acuerdo con el International Accreditation Forum (IAF) y el alcance formal de la norma ISO 13485, su campo de aplicación está acotado a organizaciones que diseñan, fabrican, ensamblan y colocan en el mercado dispositivos médicos. Un postor dedicado al mantenimiento correctivo y preventivo de diversas marcas (General Electric, Siemens, Philips, Mindray) garantiza su solvencia mediante la certificación ISO 9001:2015 en servicios y la habilitación de sus ingenieros ante el Colegio de Ingenieros del Perú.\n\n' +
    'PRONUNCIAMIENTO VINCULANTE DEL OSCE:\n' +
    'Mediante el Pronunciamiento N° 412-2024/OSCE-DGR (y reiterado en el Pronunciamiento N° 105-2025/OSCE-DGR), la Dirección de Gestión de Riesgos del OSCE dispuso de manera categórica que la exigencia de ISO 13485 en contrataciones de servicios de mantenimiento hospitalario constituye una transgresión al Principio de Libertad de Concurrencia consagrado en el Artículo 2, inciso a, del TUO de la Ley N° 30225, debiendo suprimirse o aceptarse en su defecto la acreditación de ISO 9001.',
    45, y, { width: 505, lineGap: 2.8, align: 'justify' }
  );

  drawFooter();

  // ==========================================
  // PÁGINA 3: ESTRATEGIA PROCESAL Y RECOMENDACIONES
  // ==========================================
  drawHeader(3);

  y = 80;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.navy).text('3. REDACCIÓN OFICIAL DE CONSULTAS Y OBSERVACIONES AL SEACE', 45, y);
  y += 16;

  doc.font('Helvetica').fontSize(8.5).fillColor(colors.slateText).text(
    'A continuación se transcriben las observaciones redactadas bajo estándar procesal del OSCE para ser cargadas directamente en el módulo de consultas del SEACE por su equipo de licitaciones:',
    45, y, { width: 505, lineGap: 2 }
  );

  y += 30;

  // Box Observación 1
  doc.roundedRect(45, y, 505, 95, 4).fillAndStroke(colors.lightBg, colors.borderLight);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.navy)
    .text('TEXTO SUGERIDO - OBSERVACIÓN N° 01 (PENALIDADES OPERATIVAS):', 55, y + 8);
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(colors.slateDark).text(
    '"Se solicita al Comité de Selección modificar el Numeral 8.4 de los TDR, a fin de establecer expresamente que: \'En aquellos casos en los que la restitución operativa demande el reemplazo de componentes de origen importado que no cuenten con disponibilidad inmediata en plaza nacional, el cómputo de las 24 horas se suspenderá desde la acreditación documentada de la orden de compra y guía aérea ante el fabricante o representante oficial, hasta su arribo a sede hospitalaria\', garantizando el Principio de Razonabilidad y la Opinión N° 088-2021/DTN del OSCE."',
    55, y + 24, { width: 485, lineGap: 2.5, align: 'justify' }
  );

  y += 105;

  // Box Observación 2
  doc.roundedRect(45, y, 505, 95, 4).fillAndStroke(colors.lightBg, colors.borderLight);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.navy)
    .text('TEXTO SUGERIDO - OBSERVACIÓN N° 02 (CERTIFICACIÓN ISO 13485):', 55, y + 8);
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(colors.slateDark).text(
    '"Se solicita al Comité de Selección adecuar los Requisitos de Calificación del Numeral 5.2 conforme al Pronunciamiento N° 412-2024/OSCE-DGR, suprimiendo la obligatoriedad de la certificación ISO 13485 o, en su defecto, permitiendo alternativamente la acreditación del Sistema de Gestión de la Calidad bajo norma ISO 9001:2015 con alcance a servicios de mantenimiento de equipamiento biomédico o afines, en estricto resguardo del Principio de Libertad de Concurrencia."',
    55, y + 24, { width: 485, lineGap: 2.5, align: 'justify' }
  );

  y += 115;

  // Sección IV: Próximos Pasos y Asesoría
  doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.navy).text('4. RUTA DE ACCIÓN Y BLINDAJE INTEGRAL CON THE QUANT PARTNERS', 45, y);
  y += 16;

  doc.font('Helvetica').fontSize(8.5).fillColor(colors.slateText).text(
    '• PASO 1 (Inmediato): Subida de las 2 observaciones al SEACE antes del cierre del cronograma de consultas.\n' +
    '• PASO 2 (Contingencia): Si el Comité de Selección no acoge las observaciones en el pliego absolutorio, tramitamos en 48 horas la Solicitud de Elevación de Bases al OSCE para que la Dirección de Riesgos obligue a la Entidad a corregir las bases bajo advertencia de nulidad.\n' +
    '• PASO 3 (Económico): Armado y blindaje de la propuesta económica y técnica para asegurar el puntaje máximo.',
    45, y, { width: 505, lineGap: 3 }
  );

  y += 65;

  // Bloque de Firma y Contacto
  doc.roundedRect(45, y, 505, 75, 4).fillAndStroke('#faf5ff', '#c084fc');
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#6b21a8')
    .text('RESPONSABILIDAD Y CONTACTO TÉCNICO:', 55, y + 8);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(colors.navy)
    .text('Ing. Kenneth | Asesor Principal de Licitaciones Públicas', 55, y + 24);
  doc.font('Helvetica').fontSize(8).fillColor(colors.slateText)
    .text('The Quant Partners  ·  División de Inteligencia y Contrataciones con el Estado\nWhatsApp Directo de Soporte: +51 902 105 668  ·  Correo: licitaciones@quantpartners.pe\nLima, Perú', 55, y + 38, { lineGap: 2 });

  drawFooter();

  doc.end();

  return new Promise<void>((resolve, reject) => {
    writeStream.on('finish', () => {
      console.log(`✅ Dictamen PDF generado exitosamente en: ${outputPath}`);
      resolve();
    });
    writeStream.on('error', reject);
  });
}

generateDictamenPdf().catch(err => {
  console.error('Error generando PDF:', err);
  process.exit(1);
});
