import { downloadContentFromMessage, proto } from '@whiskeysockets/baileys';
import { OutreachRepo } from '../db/repo.js';
import { AudioTranscriptionResult } from '../types/index.js';

/**
 * Módulo VoiceTranscriber (Speech-to-Text / STT)
 * Permite al bot "escuchar" notas de voz y audios de WhatsApp convirtiéndolos
 * en texto literal usando Gemini 2.5 Flash a través de OpenRouter multimodal.
 */
export class VoiceTranscriber {
  private static readonly DEFAULT_MODEL = 'google/gemini-2.5-flash';

  /**
   * Descarga el stream de audio desde Baileys y lo transcribe a texto en español.
   */
  public static async transcribeBaileysAudio(
    audioMessage: proto.Message.IAudioMessage
  ): Promise<string | null> {
    if (!audioMessage) return null;

    try {
      // 1. Descargar buffer de audio nativo desde Baileys sin dependencias externas
      const stream = await downloadContentFromMessage(audioMessage, 'audio');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      if (!buffer || buffer.length < 100) {
        console.warn('[VoiceTranscriber] Buffer de audio vacío o menor a 100 bytes.');
        return null;
      }

      // 2. Determinar formato desde el mimetype
      const mimetype = (audioMessage.mimetype || 'audio/ogg').toLowerCase();
      let format: 'ogg' | 'mp4' | 'wav' | 'mp3' = 'ogg';

      if (mimetype.includes('mp4') || mimetype.includes('m4a')) {
        format = 'mp4';
      } else if (mimetype.includes('wav')) {
        format = 'wav';
      } else if (mimetype.includes('mp3') || mimetype.includes('mpeg')) {
        format = 'mp3';
      } else {
        format = 'ogg';
      }

      const duration = audioMessage.seconds || undefined;
      console.log(`🎙️ [VoiceTranscriber] Procesando audio (${buffer.length} bytes, duracion: ${duration || 0}s, formato: ${format})...`);

      // 3. Transcribir el buffer de audio
      const result = await this.transcribeBuffer(buffer, format);
      return result.text || null;
    } catch (err: any) {
      console.error('[VoiceTranscriber] Error descargando o transcribiendo audio de Baileys:', err.message);
      return null;
    }
  }

  /**
   * Envía el buffer de audio a OpenRouter con Gemini 2.5 Flash para transcripción exacta
   */
  public static async transcribeBuffer(
    buffer: Buffer,
    format: 'ogg' | 'mp4' | 'wav' | 'mp3' = 'ogg'
  ): Promise<AudioTranscriptionResult> {
    const settings = await OutreachRepo.getSettings();
    const apiKey = settings.aiApiKey || process.env.OPENROUTER_API_KEY || '';
    const model = settings.aiModel || process.env.OPENROUTER_MODEL || this.DEFAULT_MODEL;

    if (!apiKey) {
      console.warn('[VoiceTranscriber] OPENROUTER_API_KEY no configurada. No se puede transcribir audio.');
      return { success: false, error: 'API Key no configurada' };
    }

    const base64Audio = buffer.toString('base64');

    const promptText = 
      'Transcribe exactamente el mensaje hablado de esta nota de voz en español de forma literal y completa. ' +
      'Devuelve ÚNICAMENTE la transcripción del audio sin comentarios introductorios, sin explicaciones y sin comillas. ' +
      'Si no hay voz inteligible, está completamente en silencio o solo se escucha estática/ruido de fondo, responde ÚNICAMENTE con "[INAUDIBLE]".';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 segundos timeout

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://thequantpartners.com',
          'X-Title': 'QP Outreach Engine - Voice Transcriber'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'input_audio',
                  input_audio: {
                    data: base64Audio,
                    format
                  }
                }
              ]
            }
          ],
          temperature: 0.1,
          max_tokens: 600
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[VoiceTranscriber] Error en OpenRouter (${response.status}):`, errText);
        return { success: false, error: `OpenRouter error ${response.status}` };
      }

      const data = (await response.json()) as any;
      let rawText = data.choices?.[0]?.message?.content?.trim() || '';

      // Limpiar posibles comillas envolventes
      if (
        (rawText.startsWith('"') && rawText.endsWith('"')) ||
        (rawText.startsWith("'") && rawText.endsWith("'"))
      ) {
        rawText = rawText.slice(1, -1).trim();
      }

      // Normalizar respuestas de silencio o inaudible
      const upper = rawText.toUpperCase();
      if (
        upper === 'SILENCIO' ||
        upper === '[SILENCIO]' ||
        upper === 'INAUDIBLE' ||
        upper === '[INAUDIBLE]' ||
        upper.includes('NO SE ESCUCHA NINGÚN MENSAJE')
      ) {
        return {
          success: true,
          text: '[INAUDIBLE]',
          format
        };
      }

      return {
        success: true,
        text: rawText,
        format
      };
    } catch (err: any) {
      console.error('[VoiceTranscriber] Excepción llamando a OpenRouter:', err.message);
      return { success: false, error: err.message };
    }
  }
}
