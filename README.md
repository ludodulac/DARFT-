# DARFT

DARFT est une maison numérique de sélection, de découverte et de collection d'art visuel. Le projet ne cherche pas à devenir un catalogue infini : il veut construire un regard auquel collectionneurs et artistes peuvent attribuer de la valeur.

## Mémoire du projet

Les décisions produit importantes sont documentées afin de ne pas dépendre de l'historique d'une conversation :

- [`docs/DARFT_DOCTRINE.md`](docs/DARFT_DOCTRINE.md) — philosophie, business, marque, collectionneurs, commissions, DARFT Private, DARFT Projects, archive invisible et rôle de l'IA ;
- [`docs/SELECTION_SYSTEM.md`](docs/SELECTION_SYSTEM.md) — recevabilité, regard curatorial, états de candidature, DARFT Review, comité et transparence ;
- [`docs/TECHNICAL_ARCHITECTURE.md`](docs/TECHNICAL_ARCHITECTURE.md) — architecture GitHub Pages + Supabase, schéma, sécurité et parcours d'une candidature.

Ces documents font partie du produit : lorsqu'une décision importante est prise, elle doit y être ajoutée.

## Pages du prototype

- `index.html` — sélection, artistes, histoires, collection et accès à la doctrine ;
- `how-it-works.html` — fonctionnement et transparence ;
- `submit.html` — formulaire complet de proposition d'une œuvre avec 3 à 8 images ;
- `admin.html` — espace privé de réception et de décision du comité ;
- `ludovic-dulac.html` — première fiche réelle, La Reine de Verre.

## Backend Supabase préparé

Le dépôt contient déjà le socle du backend :

- `supabase/migrations/001_darft_core.sql` ;
- `supabase/functions/submit-artwork/index.ts` ;
- `assets/supabase-config.js` ;
- `assets/submit.js` ;
- `assets/admin.js`.

Le formulaire et l'administration deviennent réellement actifs dès qu'un projet Supabase DARFT dédié est créé, migré et connecté.

## Principes

- **Œuvre avant CV** : école, galerie, audience et carrière ne sont pas des prérequis.
- **Sélection forte** : tout le monde peut proposer, tout ne peut pas entrer.
- **Histoires** : l'histoire ajoute à l'œuvre mais ne doit pas la sauver.
- **Tous médiums visuels** : peinture, sculpture, verre, vitrail, textile, objets, installations et formes difficiles à classer.
- **Collection plutôt que panier** : l'acheteur construit un patrimoine documenté.
- **Pas de compétition artificielle** : ni classement de popularité ni promesse de découvrir « le prochain grand artiste ».
- **Pas de spéculation comme discours principal** : goût, conviction, conservation et transmission avant performance financière.
- **Pas de placement payé** : la sélection éditoriale ne s'achète pas.
- **Décision humaine** : l'IA peut assister le tri mais ne choisit jamais seule.

## État du projet

Le frontend est déployable sur GitHub Pages avec GitHub Actions. Le schéma Supabase et le back office sont préparés mais nécessitent encore la création et la connexion du projet Supabase DARFT dédié.
