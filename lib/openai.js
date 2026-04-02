const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Appel simple à l'API OpenAI Chat Completions.
 * @param {string} prompt  - Message utilisateur (ou prompt complet)
 * @param {object} opts    - { model, system, temperature }
 * @returns {Promise<string>} - Texte de la réponse
 */
export async function callChat(prompt, { model, system, temperature = 0.3 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY non configuré');

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model ?? process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      messages,
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}
