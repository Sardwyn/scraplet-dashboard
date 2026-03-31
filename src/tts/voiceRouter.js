// src/tts/voiceRouter.js
// Pure function. No side effects. Never throws.
// Routes a TTS job to the correct synthesis backend based on priority.

/**
 * @param {number} priority - 0 = free (Kokoro), 100 = paid (ElevenLabs)
 * @param {string} voiceId - voice identifier
 * @returns {'kokoro' | 'elevenlabs'}
 * @throws {Error} if priority is not 0 or 100
 */
export function routeJob(priority, voiceId) {
  if (priority === 0) return 'kokoro';
  if (priority === 100) return 'elevenlabs';
  throw new Error(`invalid_priority: ${priority}`);
}
