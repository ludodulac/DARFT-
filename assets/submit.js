import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUBMISSION_FUNCTION } from './supabase-config.js';

const form = document.getElementById('submissionForm');
const images = document.getElementById('images');
const imageList = document.getElementById('imageList');
const status = document.getElementById('formStatus');

images?.addEventListener('change', () => {
  const files = [...images.files];
  imageList.textContent = files.length ? `${files.length} image${files.length > 1 ? 's' : ''} sélectionnée${files.length > 1 ? 's' : ''}.` : '';
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = '';
  const files = [...images.files];
  if (files.length < 3 || files.length > 8) {
    status.textContent = 'Ajoutez entre 3 et 8 images.';
    return;
  }
  if (files.some(file => file.size > 10 * 1024 * 1024)) {
    status.textContent = 'Chaque image doit peser moins de 10 Mo.';
    return;
  }

  const data = new FormData(form);
  data.delete('images');
  files.forEach(file => data.append('images', file, file.name));
  data.set('archive_consent', document.getElementById('archiveConsent').checked ? 'true' : 'false');

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const preview = Object.fromEntries([...data.entries()].filter(([key]) => key !== 'images'));
    localStorage.setItem('darft_submission_draft', JSON.stringify(preview));
    status.textContent = 'Le formulaire est prêt. Le backend DARFT n’est pas encore connecté : vos données textuelles ont été conservées localement dans ce navigateur, mais aucune candidature n’a été envoyée.';
    return;
  }

  try {
    status.textContent = 'Envoi en cours…';
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${SUBMISSION_FUNCTION}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
      },
      body: data
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Impossible d’envoyer la candidature.');
    form.reset();
    imageList.textContent = '';
    status.textContent = `Candidature reçue. Référence DARFT : ${payload.reference || payload.submission_id || 'enregistrée'}.`;
  } catch (error) {
    status.textContent = error.message;
  }
});
