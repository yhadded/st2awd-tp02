# ST2AWD — TP02 — Web3D (clavier + souris)

Site statique : ouvrir `index.html` (liste des exercices). Bibliothèques via CDN, versions figées :

| Lib | Version | Utilisée dans |
|---|---|---|
| A-Frame | 1.6.0 (TP01, la version recommandée par AR.js 3.4.8) · 1.7.0 (TP02, TP03) | tout |
| AR.js (build A-Frame) | 3.4.8 | TP01 |
| @c-frame/aframe-physics-system (driver Cannon / cannon-es) | 4.2.4 | TP02 ex5-6, TP03 ex2-4 |
| qrcode-generator | 1.4.4 | TP01 `qr.html` |


## Publier sur GitHub Pages (obligatoire pour la caméra sur mobile : HTTPS)

```bash
git init && git add . && git commit -m "TPs ST2AWD"
git branch -M main
git remote add origin https://github.com/<user>/st2awd-tp02.git
git push -u origin main
```
Sur GitHub : **Settings → Pages → Source : Deploy from a branch → `main` / `/ (root)`**.
Le site est ensuite en ligne à `https://<user>.github.io/st2awd-tp02/`.

En local (desktop uniquement ; la caméra marche sur `localhost`) :
```bash
python -m http.server 8000     # puis http://localhost:8000
```
N'ouvrez pas les fichiers en `file://` : les textures, le `.patt` et le `.glb` seraient bloqués par le navigateur.

---


## Exercices

Les touches sont lues avec `e.code`, c'est-à-dire la **position physique** de la touche : **ZQSD sur AZERTY = WASD sur QWERTY**. Les flèches marchent aussi.

| Ex | Page | Ce qui est fait |
|---|---|---|
| 1 | `ex1.html` | Plan de 200×200 avec la texture herbe répétée (`repeat: 50 50`, texture sans raccord) et `<a-sky>` avec un panorama équirectangulaire 2:1. |
| 2 | `ex2.html` | `player-move` : **accélération et décélération bornées** (18 et 12 m/s²), diagonales normalisées (pas plus rapides), saut **seulement au sol**, gravité appliquée manuellement. Le cube est posé sur le plan grâce à sa boîte englobante, **quelle que soit sa taille** : touche `R` pour changer de taille. |
| 3 | `ex3.html` | `orbit-follow` en coordonnées sphériques (azimut, élévation, distance). Orbite au clic gauche, zoom à la molette entre **3 et 20 m**, élévation limitée à **[5°, 89°]** (jamais sous le plan, jamais au-delà de 90°). Chaque valeur suit sa cible avec un **amortissement exponentiel** `1 - e^(-k·dt)`, ce qui rend le mouvement fluide quel que soit le framerate. |
| 4 | `ex4.html` | « Avant » = vecteur caméra → joueur projeté sur le sol ; « droite » = avant × haut. `W` avance donc toujours vers là où regarde la caméra. |
| 5 | `ex5.html` | `dynamic-body` + `physics-player` : on pilote **la vitesse horizontale** et cannon gère la gravité et les collisions. Le saut n'est possible que si un **contact a une normale vers le haut** (sol ou dessus d'une caisse). **Stabilité de la rotation** : `angularFactor = (0,0,0)`, `angularDamping` élevé et redressement progressif. Touche `L` : désactive le verrou pour voir la différence. |
| 6 | `ex6.html` | 16 cubes dynamiques (anneau, pyramide, deux tailles différentes avec une masse ∝ volume). Un cube percuté s'illumine (événement `collide` + `getImpactVelocityAlongNormal`). `R` remet la scène à zéro. |

**Réglage important (Ex5-6) :** le joueur a un **matériau physique sans frottement** (`ContactMaterial` avec friction 0). Sans ça, le frottement de cannon (appliqué à chacun des 4 points de contact d'une boîte) retirait environ 90 % de la vitesse à chaque pas, et le cube avançait au ralenti. Pour la même raison, le frottement global est à 0,06.

---

