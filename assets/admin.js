import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const loginView = document.getElementById('loginView');
const adminView = document.getElementById('adminView');
const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const adminStatus = document.getElementById('adminStatus');
const rows = document.getElementById('submissionRows');
const drawer = document.getElementById('drawer');
let currentSubmission = null;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  loginStatus.textContent = 'Le back office est construit mais Supabase n’est pas encore connecté au front DARFT.';
  loginForm.querySelector('button').disabled = true;
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const { data: { session } } = await supabase.auth.getSession();
  if (session) openAdmin(supabase);

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginStatus.textContent = 'Connexion…';
    const { error } = await supabase.auth.signInWithPassword({
      email: document.getElementById('loginEmail').value,
      password: document.getElementById('loginPassword').value
    });
    if (error) return loginStatus.textContent = error.message;
    await openAdmin(supabase);
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });
}

async function openAdmin(supabase) {
  const { data: me, error: profileError } = await supabase.from('darft_profiles').select('role').single();
  if (profileError || !['admin', 'reviewer'].includes(me?.role)) {
    loginStatus.textContent = 'Ce compte n’a pas les droits comité DARFT.';
    await supabase.auth.signOut();
    return;
  }
  loginView.hidden = true;
  adminView.hidden = false;
  await loadSubmissions(supabase);
}

async function loadSubmissions(supabase) {
  adminStatus.textContent = 'Chargement…';
  const { data, error } = await supabase
    .from('darft_submissions_admin')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return adminStatus.textContent = error.message;
  adminStatus.textContent = `${data.length} candidature${data.length > 1 ? 's' : ''}.`;
  const count = status => data.filter(item => item.status === status).length;
  document.getElementById('countReceived').textContent = count('received');
  document.getElementById('countReview').textContent = count('in_review');
  document.getElementById('countSelected').textContent = count('selected');
  document.getElementById('countArchive').textContent = count('archive');
  rows.innerHTML = '';
  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(item.reference || '')}</td><td>${escapeHtml(item.artist_name || '')}</td><td>${escapeHtml(item.title || '')}</td><td>${escapeHtml(item.medium || '')}</td><td>${item.price_eur ? Number(item.price_eur).toLocaleString('fr-FR') + ' €' : '—'}</td><td><span class="pill">${labelStatus(item.status)}</span></td><td><button class="textbtn" type="button">Ouvrir</button></td>`;
    tr.querySelector('button').addEventListener('click', () => showSubmission(item, supabase));
    rows.appendChild(tr);
  });
}

function showSubmission(item, supabase) {
  currentSubmission = item;
  drawer.hidden = false;
  document.getElementById('detailTitle').textContent = item.title || 'Sans titre';
  document.getElementById('detailArtist').textContent = `${item.artist_name || ''} · ${item.location || ''}`;
  document.getElementById('detailFacts').innerHTML = `<p>${escapeHtml(item.medium || '')}<br>${escapeHtml(item.dimensions || '')}<br>${escapeHtml(item.story || '')}</p>`;
  document.getElementById('detailStatus').value = item.status;
  document.getElementById('reviewPositive').value = item.review_positive || '';
  document.getElementById('reviewReserve').value = item.review_reserve || '';
  document.getElementById('reviewMessage').value = item.review_message || '';
  document.getElementById('saveReview').onclick = () => saveReview(supabase);
  drawer.scrollIntoView({ behavior: 'smooth' });
}

async function saveReview(supabase) {
  if (!currentSubmission) return;
  const payload = {
    status: document.getElementById('detailStatus').value,
    review_positive: document.getElementById('reviewPositive').value.trim(),
    review_reserve: document.getElementById('reviewReserve').value.trim(),
    review_message: document.getElementById('reviewMessage').value.trim(),
    reviewed_at: new Date().toISOString()
  };
  adminStatus.textContent = 'Enregistrement…';
  const { error } = await supabase.from('darft_submissions').update(payload).eq('id', currentSubmission.id);
  if (error) return adminStatus.textContent = error.message;
  adminStatus.textContent = 'Décision enregistrée.';
  await loadSubmissions(supabase);
}

function labelStatus(value) {
  return ({received:'Reçue',needs_info:'À compléter',in_review:'En examen',selected:'Sélectionnée',revisit:'À revoir',archive:'Archive',rejected:'Non retenue'})[value] || value;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}
