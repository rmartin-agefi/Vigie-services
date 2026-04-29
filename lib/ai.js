// =============================================================
// lib/ai.js — Dispatcher IA multi-provider
// Le modèle utilisé par chaque endpoint est défini dans GCS :
//   Extensions/Vigie/config/endpoints.json  (endpoint → model key)
//   Extensions/Vigie/config/models.json     (model key → config)
// =============================================================

import { getConfig } from './gcs.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Appelle le modèle IA configuré pour l'endpoint donné.
 * @param {string} endpointKey   - Ex : 'vigie.entity-highlighter'
 * @param {string} prompt        - Message utilisateur
 * @param {object} opts          - { system, temperature } — temperature override facultatif
 * @returns {Promise<string>}    - Texte brut de la réponse
 */
export async function callAI(endpointKey, prompt, { system, temperature } = {}) {
  const [models, endpoints] = await Promise.all([
    getConfig('models'),
    getConfig('endpoints'),
  ]);

  if (!endpoints) throw new Error('Config endpoints introuvable (GCS)');
  if (!models)    throw new Error('Config models introuvable (GCS)');

  const modelKey = endpoints[endpointKey];
  if (!modelKey) throw new Error(`Endpoint non configuré : ${endpointKey}`);

  const modelDef = models[modelKey];
  if (!modelDef) throw new Error(`Modèle inconnu : ${modelKey}`);

  const { provider } = modelDef;
  if (provider === 'openai') return _callOpenAI(modelKey, modelDef, prompt, { system, temperature });

  // Providers futurs : 'gemini', 'claude'
  throw new Error(`Provider non supporté : ${provider}`);
}

async function _callOpenAI(modelKey, modelDef, prompt, { system, temperature }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY non configuré');

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const body = { model: modelKey, messages };

  // Les modèles reasoning (o3, gpt-5...) n'acceptent pas temperature
  if (!modelDef.isReasoning) {
    const temp = temperature ?? modelDef.temperature?.default ?? 0.3;
    if (temp !== null) body.temperature = temp;
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}
