import { Lead } from '../types/index.js';

export interface DemoStepResponse {
  shouldReply: boolean;
  replyText?: string;
  nextStep?: number | 'COMPLETED';
  isCompleted?: boolean;
}

export class InteractiveDemoEngine {
  public static isTriggerWord(text: string): boolean {
    const clean = text.trim();
    return (
      /^(DEMO|PRUEBA|SI|SÍ|CLARO|ADELANTE|A VER|MANDALO|MÁNDALO|ENVIALO|ENVÍALO|COMPARTE|COMPARTELO|COMPÁRTELO|COMO FUNCIONA|CÓMO FUNCIONA|QUIERO VER|QUIERO PROBAR|INFO|INFORMACION|INFORMACIÓN)$/i.test(clean) ||
      /\b(DEMO|PRUEBA)\b/i.test(clean) ||
      /\b(C[OÓ]MO FUNCIONA|COMO FUNCIONA)\b/i.test(clean)
    );
  }

  public static getStepResponse(lead: Lead, incomingText: string): DemoStepResponse {
    const currentStep = lead.customFields?.demoStep;
    const clean = incomingText.trim();
    const serviceId = lead.serviceId || '';
    const company = lead.companyName || 'su equipo';

    if (currentStep === 'COMPLETED') {
      return { shouldReply: false };
    }

    // PASO 1: Activación inicial de la demo
    if (!currentStep) {
      if (!this.isTriggerWord(clean)) {
        return { shouldReply: false };
      }

      if (serviceId === 'clinicas-medspas-usa') {
        return {
          shouldReply: true,
          nextStep: 1,
          replyText: '✨ *[DEMO INTERACTIVA - ASISTENTE ESTÉTICO 24/7]*\n\nBienvenido a la prueba rápida. Para coordinar su consulta de valoración con la especialista:\n\n¿Qué procedimiento desea cotizar:\n1️⃣ Rejuvenecimiento facial (Botox / Ácido Hialurónico)\n2️⃣ Contorno corporal (Lipoescultura / Morpheus8 / BBL)\n3️⃣ Odontología Estética / Diseño de Sonrisa?\n\n*(Responda con el número 1, 2 o 3 para ver cómo califica el asistente).*'
        };
      }

      if (serviceId === 'realtors-inmobiliarias-usa') {
        return {
          shouldReply: true,
          nextStep: 1,
          replyText: '🏡 *[DEMO INTERACTIVA - ASISTENTE INMOBILIARIO 24/7]*\n\nBienvenido a la prueba rápida. Para mostrarle opciones de propiedades en inventario:\n\n¿Qué tipo de inmueble está buscando:\n1️⃣ Casa unifamiliar (Single Family)\n2️⃣ Apartamento / Condominio de inversión\n3️⃣ Terreno o desarrollo en pre-construcción?\n\n*(Responda con el número 1, 2 o 3 para ver cómo precalifica el asistente).*'
        };
      }

      if (serviceId === 'abogados-inmigracion-usa') {
        return {
          shouldReply: true,
          nextStep: 1,
          replyText: '🏛️ *[DEMO INTERACTIVA - ASISTENTE LEGAL 24/7]*\n\nBienvenido a la prueba rápida. Para evaluar la viabilidad de su caso con el Licenciado:\n\n¿Cuál de estos trámites necesita:\n1️⃣ Petición Familiar / Residencia (Green Card)\n2️⃣ Visa de Trabajo / Inversión (EB-2, H-1B, E-2)\n3️⃣ Asilo o Defensa de Deportación?\n\n*(Responda con el número 1, 2 o 3 para ver cómo califica el asistente).*'
        };
      }

      return { shouldReply: false };
    }

    // PASO 2: El usuario respondió con su opción
    if (currentStep === 1) {
      if (serviceId === 'clinicas-medspas-usa') {
        return {
          shouldReply: true,
          nextStep: 2,
          replyText: 'Excelente elección. Para validar disponibilidad en la agenda médica:\n\n¿Para qué mes o fecha aproximada le gustaría programar su valoración presencial o por videollamada con la doctora?'
        };
      }

      if (serviceId === 'realtors-inmobiliarias-usa') {
        return {
          shouldReply: true,
          nextStep: 2,
          replyText: 'Excelente. Para filtrar las opciones correctas del MLS:\n\n¿La compra se realizaría al contado (Cash) o requiere financiamiento con préstamo hipotecario tradicional / préstamo para extranjeros?'
        };
      }

      if (serviceId === 'abogados-inmigracion-usa') {
        return {
          shouldReply: true,
          nextStep: 2,
          replyText: 'Excelente. Para avanzar con la calificación legal:\n\n¿Se encuentra actualmente dentro de Estados Unidos o en su país de origen? ¿Y tiene alguna fecha límite o cita con corte pendiente?'
        };
      }
    }

    // PASO 3: Cierre de la demo y entrega a Kenneth
    if (currentStep === 2) {
      let closingNotice = '';
      if (serviceId === 'clinicas-medspas-usa') {
        closingNotice = '¡Perfecto! Con estos datos el asistente valida cupos en la agenda y solicita el depósito de reserva de cita.\n\n🎯 *[FIN DE LA DEMO]*\nEstimado equipo de *' + company + '*, así es exactamente como su clínica filtraría consultas fuera de horario y agendaría pacientes en automático 24/7 sin perder citas.\n\nLe paso de inmediato con Kenneth para coordinar los detalles de activación con su equipo. ¡Un saludo!';
      } else if (serviceId === 'realtors-inmobiliarias-usa') {
        closingNotice = '¡Perfecto! Con estos datos el asistente perfila presupuesto y coordina el recorrido únicamente con compradores con fondos listos.\n\n🎯 *[FIN DE LA DEMO]*\nEstimado equipo de *' + company + '*, así es como su equipo filtraría a decenas de personas que escriben por redes sin gastar horas al volante con clientes no calificados.\n\nLe paso de inmediato con Kenneth para coordinar su implementación. ¡Un saludo!';
      } else if (serviceId === 'abogados-inmigracion-usa') {
        closingNotice = '¡Perfecto! Con estos datos el caso queda calificado como viable y se habilita el cobro de la consulta legal con el Licenciado.\n\n🎯 *[FIN DE LA DEMO]*\nEstimado equipo de *' + company + '*, así es como su despacho filtraría a los curiosos y cobraría las consultas legales en automático.\n\nLe paso de inmediato con Kenneth para coordinar su puesta en marcha. ¡Un saludo!';
      } else {
        closingNotice = '🎯 *[FIN DE LA DEMO]*\nAsí es como nuestro asistente califica y agenda clientes en tiempo real. Le transfiero de inmediato con Kenneth para coordinar su activación.';
      }

      return {
        shouldReply: true,
        nextStep: 'COMPLETED',
        isCompleted: true,
        replyText: closingNotice
      };
    }

    return { shouldReply: false };
  }
}
