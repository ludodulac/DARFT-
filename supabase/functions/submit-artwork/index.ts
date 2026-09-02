import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const form = await req.formData();
    const files = form.getAll('images').filter((value): value is File => value instanceof File);
    if (files.length < 3 || files.length > 8) return json({ error: 'Entre 3 et 8 images sont requises.' }, 400);

    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    for (const file of files) {
      if (!allowed.has(file.type)) return json({ error: `Format non autorisé : ${file.type}` }, 400);
      if (file.size > 10 * 1024 * 1024) return json({ error: 'Une image dépasse 10 Mo.' }, 400);
    }

    const artistName = required(form, 'artist_name');
    const email = required(form, 'email');
    const location = required(form, 'location');
    const title = required(form, 'title');
    const medium = required(form, 'medium');
    const dimensions = required(form, 'dimensions');
    const story = required(form, 'story');
    if (text(form, 'rights') !== 'true') throw new Error('La confirmation des droits est obligatoire.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    const { data: artist, error: artistError } = await db.from('darft_artists').insert({
      name: artistName,
      email,
      phone: text(form, 'phone'),
      location,
      bio: text(form, 'artist_bio')
    }).select('id').single();
    if (artistError) throw artistError;

    const yearRaw = text(form, 'year');
    const priceRaw = text(form, 'price_eur');
    const { data: artwork, error: artworkError } = await db.from('darft_artworks').insert({
      artist_id: artist.id,
      title,
      year: yearRaw ? Number(yearRaw) : null,
      medium,
      dimensions,
      price_eur: priceRaw ? Number(priceRaw) : null,
      availability: text(form, 'availability') || 'available',
      story,
      process: text(form, 'process')
    }).select('id').single();
    if (artworkError) throw artworkError;

    const { data: submission, error: submissionError } = await db.from('darft_submissions').insert({
      artwork_id: artwork.id,
      archive_consent: text(form, 'archive_consent') === 'true',
      rights_confirmed: true
    }).select('id, reference').single();
    if (submissionError) throw submissionError;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = extensionFor(file.type);
      const path = `${submission.id}/${String(i + 1).padStart(2, '0')}-${crypto.randomUUID()}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await db.storage.from('darft-submission-images').upload(path, bytes, {
        contentType: file.type,
        upsert: false
      });
      if (uploadError) throw uploadError;

      const { error: imageError } = await db.from('darft_submission_images').insert({
        submission_id: submission.id,
        storage_path: path,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        sort_order: i
      });
      if (imageError) throw imageError;
    }

    return json({ submission_id: submission.id, reference: submission.reference }, 201);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Erreur de soumission.' }, 500);
  }
});

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() || null : null;
}
function required(form: FormData, key: string) {
  const value = text(form, key);
  if (!value) throw new Error(`Champ requis : ${key}`);
  return value;
}
function extensionFor(type: string) {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
