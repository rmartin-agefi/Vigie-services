import { Router } from 'express';
import { getUserPermissions } from '../../lib/firestore.js';
import { checkQuota, incrementUsage } from '../../lib/surfe-quota.js';

const router = Router();

const SURFE_ENRICH_URL  = 'https://api.surfe.com/v2/people/enrich';
const SURFE_CREDITS_URL = 'https://api.surfe.com/v1/credits';
const POLL_ATTEMPTS    = 10;
const POLL_DELAY_MS    = 2000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll le callbackURL Surfe jusqu'à obtenir un résultat ou épuiser les tentatives.
 * Retourne les données Surfe ou null.
 */
async function pollCallback(callbackUrl, apiKey) {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await delay(POLL_DELAY_MS);

    const res = await fetch(callbackUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      console.warn(`[surfe-search] Poll ${i + 1} — HTTP ${res.status}`);
      continue;
    }

    const data = await res.json();
    const status = data?.people?.[0]?.emails?.[0]?.validationStatus;

    // Surfe retourne "PENDING" tant que l'enrichissement n'est pas fini
    if (status && status !== 'PENDING') return data;

    console.log(`[surfe-search] Poll ${i + 1} — status: ${status ?? 'no data yet'}`);
  }

  return null;
}

// GET /webhook/surfe-search?linkedinUrl=...
router.get('/', async (req, res) => {
  const { linkedinUrl } = req.query;
  if (!linkedinUrl) {
    return res.status(400).json({ error: 'linkedinUrl requis' });
  }

  const apiKey = process.env.SURFE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'SURFE_API_KEY non configuré' });
  }

  // Vérification + réservation quota journalier (skip en dev bypass)
  const email = req.user?.email;
  if (!req.user?.authBypass && email) {
    try {
      const perms = await getUserPermissions(email); // déjà cachée par requirePermission
      const quota = await checkQuota(email, perms.surfeLimit);
      if (!quota.allowed) {
        console.warn(`[surfe-search] Quota dépassé (${email}) — ${quota.used}/${quota.limit}`);
        return res.status(429).json({ error: 'daily_limit_reached', used: quota.used, limit: quota.limit });
      }
      await incrementUsage(email); // réserve le slot avant d'appeler Surfe — si ça échoue, on bloque
      console.log(`[surfe-search] Slot réservé (${email}) — ${quota.used + 1}/${quota.limit}`);
    } catch (err) {
      console.error('[surfe-search] Erreur quota:', err.message);
      return res.status(503).json({ error: 'Service de quota indisponible' });
    }
  }

  try {
    // 1. Lancer l'enrichissement
    const enrichRes = await fetch(SURFE_ENRICH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        people: [{ linkedinUrl }],
        include: { email: true },
      }),
    });

    if (!enrichRes.ok) {
      const err = await enrichRes.text();
      console.error('[surfe-search] Enrich error:', enrichRes.status, err);
      return res.status(502).json({ error: 'Surfe API error', detail: err });
    }

    const enrichData = await enrichRes.json();
    const callbackUrl = enrichData?.enrichmentCallbackURL;

    if (!callbackUrl) {
      console.error('[surfe-search] Pas de callbackURL dans la réponse Surfe:', enrichData);
      return res.status(502).json({ error: 'Surfe: enrichmentCallbackURL manquant' });
    }

    // 2. Poller le callback jusqu'au résultat
    const result = await pollCallback(callbackUrl, apiKey);

    if (!result) {
      console.warn('[surfe-search] Timeout polling Surfe pour', linkedinUrl);
      return res.status(204).send();
    }

    // 3. Vérifier la validité de l'email + récupérer les crédits restants (en parallèle)
    const emailEntry = result?.people?.[0]?.emails?.[0];

    const creditsRes = await fetch(SURFE_CREDITS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => null);
    const credits = creditsRes?.ok ? await creditsRes.json().catch(() => null) : null;

    if (emailEntry?.validationStatus === 'VALID') {
      return res.json({ email: emailEntry.email, credits });
    }

    return res.status(204).send();

  } catch (err) {
    console.error('[surfe-search] Erreur inattendue:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
