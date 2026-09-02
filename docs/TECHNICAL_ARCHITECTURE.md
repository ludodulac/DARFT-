# DARFT — Architecture technique

## Frontend actuel

Le site est un frontend statique déployé sur GitHub Pages.

Pages principales :

- `index.html` — sélection et univers DARFT ;
- `how-it-works.html` — philosophie, méthode et transparence ;
- `submit.html` — candidature artiste / œuvre ;
- `admin.html` — back office privé ;
- `ludovic-dulac.html` — exemple de fiche œuvre/artiste réelle.

Styles partagés : `assets/darft.css`.

## Backend cible : Supabase

DARFT utilise Supabase pour quatre fonctions :

1. PostgreSQL — artistes, œuvres, candidatures, décisions et historique ;
2. Storage — images originales des candidatures dans un bucket privé ;
3. Auth — connexion du comité et des administrateurs ;
4. Edge Functions — réception sécurisée des candidatures publiques.

## Pourquoi la candidature publique passe par une Edge Function

Il ne faut pas autoriser un visiteur anonyme à écrire librement dans toutes les tables ou dans le stockage. Le formulaire appelle `submit-artwork`, qui valide les champs et les fichiers puis utilise les droits serveur pour créer les lignes nécessaires.

Les visiteurs ne peuvent pas lire les candidatures des autres.

Le bucket `submission-images` reste privé.

## Schéma

Tables :

- `profiles` — rôle des comptes authentifiés ;
- `artists` — identité et parcours ;
- `artworks` — informations sur l'œuvre ;
- `submissions` — état curatorial et review ;
- `submission_images` — chemins et métadonnées des images ;
- `submission_status_history` — historique de décision.

Vue :

- `submissions_admin` — vue de travail du back office.

Migration source : `supabase/migrations/001_darft_core.sql`.

## Rôles

- `member` — compte standard futur ;
- `reviewer` — peut consulter et travailler les candidatures ;
- `admin` — même accès curatorial + administration future.

Le frontend ne doit jamais contenir de clé `service_role`.

Seule la clé publique/publishable Supabase est configurée dans `assets/supabase-config.js`. La sécurité réelle repose sur RLS et les fonctions serveur.

## Parcours d'une candidature

1. L'artiste remplit `submit.html`.
2. 3 à 8 images sont envoyées à `submit-artwork`.
3. La fonction valide format et taille.
4. Elle crée l'artiste, l'œuvre et la candidature.
5. Les fichiers sont stockés dans un bucket privé.
6. La candidature apparaît dans `admin.html`.
7. Le comité modifie l'état et rédige sa review.
8. Chaque changement de statut est historisé.
9. Si l'œuvre est sélectionnée, elle pourra ensuite être publiée dans le catalogue public.

## Sécurité à conserver

- RLS activé sur toutes les tables sensibles ;
- aucun SELECT anonyme sur les candidatures ;
- bucket de soumission privé ;
- limites de taille et MIME côté serveur ;
- vérification des rôles côté base, pas uniquement dans l'interface ;
- ne jamais mettre `SUPABASE_SERVICE_ROLE_KEY` dans GitHub Pages ;
- prévoir anti-spam/rate limiting/CAPTCHA avant ouverture publique large ;
- journaliser les changements de statut.

## Étapes après création du projet Supabase

1. appliquer `001_darft_core.sql` ;
2. déployer la fonction `submit-artwork` ;
3. récupérer l'URL du projet et sa clé publishable ;
4. remplir `assets/supabase-config.js` ;
5. créer le premier compte Auth administrateur ;
6. insérer son `user id` dans `profiles` avec `role = 'admin'` ;
7. tester une candidature complète ;
8. vérifier les advisors de sécurité Supabase ;
9. ajouter l'affichage signé des images dans l'admin.
