# Spotify Stats

Explore tout ton historique d'écoute Spotify, depuis la création de ton compte, directement
dans ton navigateur. Tu déposes le zip que Spotify t'envoie, et le site calcule tout.

**Tes données ne quittent jamais ton appareil.** Le fichier est lu et analysé dans la page :
il n'y a pas de serveur, rien n'est envoyé nulle part.

> Projet indépendant, non affilié à Spotify.

## Ce que tu y trouves

- **Vue d'ensemble** : temps d'écoute, streams, artistes et titres différents, comparaison avec
  la période précédente, écoute mois par mois colorée par artiste dominant, tops 10, carte
  jour × heure, habitudes (bouton Suivant, aléatoire, appareils), découvertes.
- **Classements** : tous tes artistes, titres et albums, triables et filtrables.
- **Explorer** et **pages artiste / album / titre** : courbe d'écoute, première écoute, heures
  préférées, plus grosses journées, ce que tu écoutes avant et après un titre.
- **Chronologie** : tes ères musicales, une carte par année, ton n°1 mois par mois.
- **Calendrier** : une case par jour, et le détail de chaque journée.
- **Ce jour-là** : ce que tu écoutais à la même date les années précédentes.
- **Sessions** : durée de tes sessions, titres de démarrage, plus longues sessions.
- **Wrapped** : un récap animé façon story pour chaque année, exportable en image.

Une barre en haut de page permet de choisir la période : tout l'historique, une année, les
30 derniers jours ou des dates libres.

## Obtenir ton export Spotify

1. Va sur [spotify.com/account/privacy](https://www.spotify.com/account/privacy/) depuis un navigateur.
2. Coche **« Historique de streaming étendu »** et demande les données.
3. Confirme via l'e-mail de Spotify.
4. Quelques jours plus tard (jusqu'à 30), télécharge le zip et dépose-le sur le site.

L'export « Données du compte » (fichiers `StreamingHistory_music_*.json`) fonctionne aussi,
mais il ne couvre que la dernière année et ne contient ni albums, ni appareils, ni pays.

## Utiliser le site

En ligne : ouvre la page GitHub Pages du dépôt.

En local : le site utilise des modules JavaScript, qui ne se chargent pas en ouvrant
`index.html` directement. Lance un petit serveur dans le dossier :

```bash
python -m http.server 8000
```

puis ouvre http://localhost:8000.

## Mettre en ligne avec GitHub Pages

Dans le dépôt sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a
branch**, branche `main`, dossier `/ (root)`. Le site est publié à
`https://<ton-pseudo>.github.io/<nom-du-dépôt>/` après une minute ou deux.

## Comment c'est fait

HTML, CSS et JavaScript sans framework ni étape de build.

```
index.html          écran d'import + interface
css/                styles et polices
fonts/              Bricolage Grotesque, Figtree, JetBrains Mono (licence OFL)
js/importer.js      lecture du zip / des JSON et conversion en format compact
js/store.js         copie locale facultative dans le navigateur (IndexedDB)
js/data.js          calcul de toutes les statistiques
js/charts.js        graphiques SVG
js/views/           une vue par page
js/vendor/fflate.js décompression du zip (fflate, licence MIT)
```

### Définitions

- **Stream** : une écoute de 30 secondes ou plus, comme Spotify.
- **Passé** : un titre interrompu avec le bouton Suivant.
- **Session** : des écoutes séparées de moins de 30 minutes de silence.
- **Heures** : fuseau horaire du navigateur au moment de l'import.
- Un même titre présent sur plusieurs albums (single, deluxe…) est regroupé par nom et artiste.

## Licence

MIT — voir [LICENSE](LICENSE).
