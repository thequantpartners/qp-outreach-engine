import pg from 'pg';
const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  const templateA = `Buenas tardes al equipo de *{{name}}* 👋\n\nLes escribe el equipo de Kenneth Herrera en The Quant Partners.\n\nUna consulta rápida: en su empresa en {{city}}, ¿suelen hacerle seguimiento por WhatsApp a los prospectos que piden precio y luego dejan en visto, o esa venta se da por perdida?`;
  
  const templateB = `Buenas tardes al equipo de *{{name}}* 👋\n\nLes escribe el equipo de Kenneth Herrera en The Quant Partners.\n\nUna consulta breve: cuando un cliente o paciente les pide información por WhatsApp y los deja en visto, ¿tienen un sistema para reactivarlo automáticamente o esa venta suele perderse?`;
  
  const fu1 = `Buenas tardes al equipo de *{{name}}* 👋 Les escribe el equipo de Kenneth Herrera nuevamente. Quería consultarles con total respeto si pudieron revisar la consulta anterior sobre las ventas que quedan en visto en su WhatsApp, o si los agarro en una semana complicada. ¡Un saludo!`;
  
  const fu2 = `Hola al equipo de *{{name}}*, solo para no insistir y cerrar este contacto con respeto: si en algún momento desean blindar su captación y reactivar prospectos en WhatsApp, quedo a su disposición por aquí. ¡Saludos cordiales!`;

  const promptAddition = `
0. MANEJO DE LA PREGUNTA INICIAL ("¿suelen hacerle seguimiento a los que dejan en visto o se da por perdida?"):
- Si dicen "se pierde", "no nos da el tiempo", "la recepcionista no alcanza", "a veces":
"Justo por eso les escribía 🙌. En The Quant Partners implementamos una infraestructura en WhatsApp que recontacta automáticamente a los que dejan en visto y rescata entre el 20% y 35% de esas ventas perdidas sin que su personal gaste tiempo manual. ¿Cuántas consultas o pacientes al mes reciben aproximadamente por WhatsApp para ver si califican?"
- Si dicen "sí hacemos seguimiento":
"¡Excelente que lo tengan mapeado! 🙌 Lo que hacemos nosotros es automatizarlo al 100% con un reactivador con IA en WhatsApp para que no dependa de tiempo manual y triplique la tasa de recuperación. ¿Cuántas consultas al mes manejan aproximadamente por WhatsApp?"
- Si preguntan "¿Quiénes son?", "¿De qué se trata?", "Información":
"Implementamos una infraestructura comercial con 2 agentes de IA en su propio WhatsApp: un Setter que atiende y califica en 5 segundos día y noche, y un Reactivador que recupera automáticamente a los prospectos que dejan en visto. ¿Cuántas consultas al mes reciben por WhatsApp aproximadamente?"
`;

  const curr = await pool.query("SELECT ai_system_prompt FROM services WHERE id = 'infraestructura-comercial-peru'");
  let prompt = curr.rows[0]?.ai_system_prompt || '';
  if (!prompt.includes('MANEJO DE LA PREGUNTA INICIAL')) {
    prompt = prompt.replace(
      'COMPUERTA DE CALIFICACIÓN (CÓMO RESPONDER SEGÚN LA ETAPA):',
      'COMPUERTA DE CALIFICACIÓN (CÓMO RESPONDER SEGÚN LA ETAPA):\n' + promptAddition
    );
  }

  await pool.query(
    `UPDATE services SET 
      outreach_template = $1, 
      outreach_template_b = $2, 
      follow_up_template_1 = $3, 
      follow_up_template_2 = $4, 
      ai_system_prompt = $5 
    WHERE id = 'infraestructura-comercial-peru'`,
    [templateA, templateB, fu1, fu2, prompt]
  );

  console.log('✅ Base de datos actualizada con éxito para infraestructura-comercial-peru (Opción 1 activa).');
  await pool.end();
}

main().catch(err => {
  console.error('❌ Error al actualizar campaña:', err);
  process.exit(1);
});
