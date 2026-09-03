import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const $ = id => document.getElementById(id);
const loginView = $('loginView');
const adminView = $('adminView');
const loginForm = $('loginForm');
const loginStatus = $('loginStatus');
const adminStatus = $('adminStatus');
const rows = $('submissionRows');
const drawer = $('drawer');
let currentSubmission = null;
let supabase = null;
let tasks = [];
let journal = [];

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  loginStatus.textContent = 'Le back office est construit mais Supabase n’est pas encore connecté au front DARFT.';
  loginForm.querySelector('button').disabled = true;
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await openAdmin();

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    loginStatus.textContent = 'Connexion…';
    const { error } = await supabase.auth.signInWithPassword({ email: $('loginEmail').value, password: $('loginPassword').value });
    if (error) return loginStatus.textContent = error.message;
    await openAdmin();
  });

  $('logoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); location.reload(); });
  $('taskFilter').addEventListener('change', renderTasks);
  $('addTaskBtn').addEventListener('click', addTask);
  $('addJournalBtn').addEventListener('click', addJournal);
}

async function openAdmin() {
  const { data: me, error } = await supabase.from('darft_profiles').select('role').single();
  if (error || !['admin','reviewer'].includes(me?.role)) {
    loginStatus.textContent = 'Ce compte n’a pas les droits DARFT.';
    await supabase.auth.signOut();
    return;
  }
  loginView.hidden = true;
  adminView.hidden = false;
  await Promise.all([loadTasks(), loadJournal(), loadSubmissions()]);
}

async function loadTasks() {
  $('projectStatus').textContent = 'Chargement du cockpit…';
  const { data, error } = await supabase.from('darft_project_tasks').select('*').order('sort_order').order('created_at');
  if (error) return $('projectStatus').textContent = error.message;
  tasks = data || [];
  $('projectStatus').textContent = `${tasks.length} tâches suivies · sauvegarde Supabase active.`;
  updateTaskCounts();
  renderTasks();
}

function updateTaskCounts() {
  const count = s => tasks.filter(t => t.status === s).length;
  $('countTodo').textContent = count('todo');
  $('countProgress').textContent = count('in_progress');
  $('countWaiting').textContent = count('waiting');
  $('countDone').textContent = count('done');
}

function renderTasks() {
  const filter = $('taskFilter').value;
  let visible = [...tasks];
  if (filter === 'active') visible = visible.filter(t => t.status !== 'done');
  else if (filter === 'done') visible = visible.filter(t => t.status === 'done');
  else if (['now','next','later'].includes(filter)) visible = visible.filter(t => t.priority === filter && t.status !== 'done');
  const groups = ['now','next','later'];
  const labels = {now:'Maintenant',next:'Ensuite',later:'Plus tard'};
  const list = $('taskList'); list.innerHTML = '';
  groups.forEach(priority => {
    const group = visible.filter(t => t.priority === priority);
    if (!group.length) return;
    const section = document.createElement('section'); section.className = 'task-group';
    section.innerHTML = `<div class="task-group-head"><span>${labels[priority]}</span><span>${group.length}</span></div>`;
    group.forEach(task => section.appendChild(taskCard(task)));
    list.appendChild(section);
  });
  if (!visible.length) list.innerHTML = '<p class="status">Aucune tâche dans ce filtre.</p>';
}

function taskCard(task) {
  const article = document.createElement('article'); article.className = `task-card status-${task.status}`;
  const draftKey = `darft-task-${task.id}`;
  const draft = localStorage.getItem(draftKey);
  article.innerHTML = `<div class="task-card-head"><div><span class="task-code">${escapeHtml(task.code)} · ${escapeHtml(task.section)}</span><h3>${escapeHtml(task.title)}</h3></div><div class="task-controls"><select class="priority" aria-label="Priorité"><option value="now">Maintenant</option><option value="next">Ensuite</option><option value="later">Plus tard</option></select><select class="task-status" aria-label="État"><option value="todo">À faire</option><option value="in_progress">En cours</option><option value="waiting">Bloqué / j’attends</option><option value="done">Terminé</option></select></div></div><p>${escapeHtml(task.brief)}</p>${task.why_it_matters ? `<p class="task-why"><strong>Pourquoi :</strong> ${escapeHtml(task.why_it_matters)}</p>` : ''}<div class="field task-answer"><label>Ma réponse / ce que j’ai fait / ce que je ne comprends pas</label><textarea>${escapeHtml(draft !== null ? draft : task.owner_answer || '')}</textarea></div><div class="task-save-row"><button class="btn save-task" type="button">Enregistrer</button><span class="save-state small">${draft !== null && draft !== (task.owner_answer || '') ? 'Brouillon local non enregistré' : lastSaved(task.updated_at)}</span></div>`;
  const priority = article.querySelector('.priority'); priority.value = task.priority;
  const status = article.querySelector('.task-status'); status.value = task.status;
  const textarea = article.querySelector('textarea');
  textarea.addEventListener('input', () => { localStorage.setItem(draftKey, textarea.value); article.querySelector('.save-state').textContent = 'Brouillon local non enregistré'; });
  article.querySelector('.save-task').addEventListener('click', () => saveTask(task, article));
  return article;
}

async function saveTask(task, article) {
  const button = article.querySelector('.save-task'); const state = article.querySelector('.save-state');
  button.disabled = true; state.textContent = 'Enregistrement…';
  const payload = { priority: article.querySelector('.priority').value, status: article.querySelector('.task-status').value, owner_answer: article.querySelector('textarea').value.trim() };
  const { data, error } = await supabase.from('darft_project_tasks').update(payload).eq('id', task.id).select().single();
  button.disabled = false;
  if (error) return state.textContent = `Erreur : ${error.message}`;
  localStorage.removeItem(`darft-task-${task.id}`);
  Object.assign(task, data); state.textContent = 'Enregistré.'; updateTaskCounts(); renderTasks();
}

async function addTask() {
  const title = $('newTaskTitle').value.trim(); const brief = $('newTaskBrief').value.trim();
  if (!title || !brief) return $('projectStatus').textContent = 'Ajoute au moins un titre et ce qu’il faut faire.';
  const code = `USR-${Date.now().toString().slice(-7)}`;
  const payload = { code, section: $('newTaskSection').value.trim() || 'À classer', title, brief, priority:'now', status:'todo', sort_order:9000 };
  const { error } = await supabase.from('darft_project_tasks').insert(payload);
  if (error) return $('projectStatus').textContent = error.message;
  $('newTaskTitle').value = ''; $('newTaskSection').value = ''; $('newTaskBrief').value = '';
  await loadTasks();
}

async function loadJournal() {
  const { data, error } = await supabase.from('darft_project_journal').select('*').order('created_at', {ascending:false});
  if (error) return $('journalList').innerHTML = `<p class="status">${escapeHtml(error.message)}</p>`;
  journal = data || []; renderJournal();
}

function renderJournal() {
  const list = $('journalList'); list.innerHTML = '';
  journal.forEach(item => {
    const card = document.createElement('article'); card.className = `journal-card ${item.is_resolved ? 'resolved' : ''}`;
    card.innerHTML = `<div class="task-card-head"><div><span class="task-code">${escapeHtml(item.kind)} · ${formatDate(item.created_at)}</span><input class="journal-title-edit" value="${escapeAttr(item.title)}"></div><label class="journal-check"><input type="checkbox" ${item.is_resolved ? 'checked' : ''}> traité</label></div><textarea class="journal-body-edit">${escapeHtml(item.body || '')}</textarea><button class="btn journal-save" type="button">Enregistrer les modifications</button><span class="small journal-state">${lastSaved(item.updated_at)}</span>`;
    card.querySelector('.journal-save').addEventListener('click', () => saveJournal(item, card));
    list.appendChild(card);
  });
}

async function addJournal() {
  const title = $('journalTitle').value.trim(); const body = $('journalBody').value.trim();
  if (!title || !body) return;
  const { error } = await supabase.from('darft_project_journal').insert({ title, body, kind:$('journalKind').value });
  if (error) return;
  $('journalTitle').value=''; $('journalBody').value=''; await loadJournal();
}

async function saveJournal(item, card) {
  const payload = { title:card.querySelector('.journal-title-edit').value.trim(), body:card.querySelector('.journal-body-edit').value.trim(), is_resolved:card.querySelector('input[type=checkbox]').checked };
  const state = card.querySelector('.journal-state'); state.textContent='Enregistrement…';
  const { data, error } = await supabase.from('darft_project_journal').update(payload).eq('id',item.id).select().single();
  if (error) return state.textContent=error.message;
  Object.assign(item,data); state.textContent='Enregistré.';
}

async function loadSubmissions() {
  adminStatus.textContent = 'Chargement…';
  const { data, error } = await supabase.from('darft_submissions_admin').select('*').order('created_at', {ascending:false});
  if (error) return adminStatus.textContent = error.message;
  adminStatus.textContent = `${data.length} candidature${data.length > 1 ? 's' : ''}.`;
  const count = status => data.filter(item => item.status === status).length;
  $('countReceived').textContent = count('received'); $('countReview').textContent = count('in_review'); $('countSelected').textContent = count('selected'); $('countArchive').textContent = count('archive');
  rows.innerHTML = '';
  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(item.reference || '')}</td><td>${escapeHtml(item.artist_name || '')}</td><td>${escapeHtml(item.title || '')}</td><td>${escapeHtml(item.medium || '')}</td><td>${item.price_eur ? Number(item.price_eur).toLocaleString('fr-FR')+' €':'—'}</td><td><span class="pill">${labelStatus(item.status)}</span></td><td><button class="textbtn" type="button">Ouvrir</button></td>`;
    tr.querySelector('button').addEventListener('click', () => showSubmission(item)); rows.appendChild(tr);
  });
}

function showSubmission(item) {
  currentSubmission = item; drawer.hidden = false;
  $('detailTitle').textContent = item.title || 'Sans titre'; $('detailArtist').textContent = `${item.artist_name || ''} · ${item.location || ''}`;
  $('detailFacts').innerHTML = `<p>${escapeHtml(item.medium || '')}<br>${escapeHtml(item.dimensions || '')}<br>${escapeHtml(item.story || '')}</p>`;
  $('detailStatus').value = item.status; $('reviewPositive').value = item.review_positive || ''; $('reviewReserve').value = item.review_reserve || ''; $('reviewMessage').value = item.review_message || '';
  $('saveReview').onclick = saveReview; drawer.scrollIntoView({behavior:'smooth'});
}

async function saveReview() {
  if (!currentSubmission) return;
  const payload = { status:$('detailStatus').value, review_positive:$('reviewPositive').value.trim(), review_reserve:$('reviewReserve').value.trim(), review_message:$('reviewMessage').value.trim(), reviewed_at:new Date().toISOString() };
  adminStatus.textContent='Enregistrement…';
  const { error } = await supabase.from('darft_submissions').update(payload).eq('id',currentSubmission.id);
  if (error) return adminStatus.textContent=error.message;
  adminStatus.textContent='Décision enregistrée.'; await loadSubmissions();
}

function labelStatus(v){return ({received:'Reçue',needs_info:'À compléter',in_review:'En examen',selected:'Sélectionnée',revisit:'À revoir',archive:'Archive',rejected:'Non retenue'})[v]||v}
function lastSaved(v){return v ? `Dernière sauvegarde ${formatDate(v)}` : 'Pas encore enregistré'}
function formatDate(v){return new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(v){return escapeHtml(v).replace(/`/g,'&#96;')}
