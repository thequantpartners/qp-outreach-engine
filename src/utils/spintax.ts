/**
 * Motor de Spintax y Humanización Dinámica Anti-Ban (Reglas Meta 2026)
 * Evita la detección algorítmica de plantillas idénticas repetidas alternando
 * expresiones, aperturas, cierres y micro-variaciones léxicas.
 */
export class SpintaxEngine {
  /**
   * Resuelve expresiones spintax estándar en formato {opción1|opción2|opción3}
   */
  public static parse(text: string): string {
    if (!text) return '';

    // Proteger etiquetas dobles tipo {{variable}} para no confundirlas con spintax
    let protectedText = text.replace(/\{\{([^{}]+)\}\}/g, '___VAR_$1___');

    const spintaxRegex = /\{([^{}]+)\}/g;
    let result = protectedText;

    while (spintaxRegex.test(result)) {
      result = result.replace(spintaxRegex, (_, match) => {
        if (!match.includes('|')) return match;
        const options = match.split('|');
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex];
      });
    }

    // Restaurar etiquetas dobles {{variable}}
    result = result.replace(/___VAR_([^{}]+)___/g, '{{$1}}');
    return result;
  }

  /**
   * Humaniza dinámicamente cualquier plantilla agregando variaciones naturales
   * de saludos y cierres consultivos en caso no contenga spintax explícito.
   */
  public static humanize(template: string, lead: any): string {
    if (!template) return '';

    // Si la plantilla ya tiene spintax explícito, solo parsear
    if (template.includes('{') && template.includes('|') && template.includes('}')) {
      return this.parse(template);
    }

    let modified = template;

    // 1. Variaciones de saludo inicial
    const greetings = [
      'Buenas tardes al equipo de {{name}}, un gusto saludarlos.',
      'Hola al equipo de {{name}}, un cordial saludo.',
      'Buenas tardes, un gusto saludar al equipo de {{name}}.',
      'Hola equipo de {{name}}, espero que se encuentren muy bien.',
      'Estimado equipo de {{name}}, un saludo con mucho respeto por su tiempo.'
    ];

    // Reemplazar la primera línea de saludo común si coincide
    const standardGreetingRegex = /^(Buenas tardes|Buenos días|Buenas noches|Hola)[\s\S]*?(un gusto saludarlos|un cordial saludo|saludos)\.?/i;
    if (standardGreetingRegex.test(modified)) {
      const chosenGreeting = greetings[Math.floor(Math.random() * greetings.length)];
      modified = modified.replace(standardGreetingRegex, chosenGreeting);
    }

    // 2. Variaciones de pregunta de cierre con permiso en 2 pasos
    const closingQuestions = [
      '¿Me permite compartirle un breve resumen por aquí para ver si tendría sentido evaluar esta integración para {{name}}?',
      '¿Tendría sentido que le comparta una ficha de 2 minutos por este medio para que su equipo técnico lo revise?',
      '¿Me permite enviarle un resumen rápido por aquí para evaluar si tendría valor coordinar una breve llamada?',
      '¿Le parece bien si le comparto un documento conciso por aquí para que determinen si les aportaría valor?'
    ];

    const standardClosingRegex = /¿Me permite compartirle[\s\S]*?\?\s*$/i;
    if (standardClosingRegex.test(modified)) {
      const chosenClosing = closingQuestions[Math.floor(Math.random() * closingQuestions.length)];
      modified = modified.replace(standardClosingRegex, chosenClosing);
    }

    return modified;
  }
}
