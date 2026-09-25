/* =====================================================================
   TP02 - Web3D : composants A-Frame partagés par les exercices 2 à 6
   ---------------------------------------------------------------------
   keyboard (objet global)  état des touches, par code PHYSIQUE (e.code)
   player-move              Ex2/Ex4 : déplacement cinématique + saut
   orbit-follow             Ex3     : caméra orbitale qui suit le joueur
   physics-player           Ex5/Ex6 : déplacement via aframe-physics-system
   hit-flash                Ex6     : flash visuel quand un cube est percuté
   scenery                  décor (arbres) autour de la zone de jeu
   ===================================================================== */

/* ---------------------------------------------------------------------
   Clavier. On utilise e.code (position physique de la touche) :
   "KeyW" = W sur QWERTY = Z sur AZERTY -> ZQSD fonctionne tout seul
   sur un clavier français. Les flèches sont aussi acceptées.
   --------------------------------------------------------------------- */
const keyboard = (() => {
  const down = new Set();
  const isTyping = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
  window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    down.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); // pas de scroll de la page
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear()); // évite les touches "collées" en changeant de fenêtre
  const any = (...codes) => codes.some((c) => down.has(c));
  return {
    /** axes d'entrée : forward (W/S) et strafe (D/A) dans [-1, 1] */
    axes() {
      return {
        forward: (any('KeyW', 'ArrowUp') ? 1 : 0) - (any('KeyS', 'ArrowDown') ? 1 : 0),
        strafe: (any('KeyD', 'ArrowRight') ? 1 : 0) - (any('KeyA', 'ArrowLeft') ? 1 : 0)
      };
    },
    jump: () => down.has('Space')
  };
})();

/* ---------------------------------------------------------------------
   Outils communs
   --------------------------------------------------------------------- */
const _tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), box: new THREE.Box3() };

/**
 * Calcule la direction de déplacement horizontale (XZ) à partir des touches.
 * - sans caméra : axes du monde (W = -Z, D = +X)
 * - avec caméra : "avant" = direction caméra -> joueur projetée sur le sol,
 *                 "droite" = avant x haut
 * Retourne un vecteur de longueur <= 1 (les diagonales ne vont pas plus vite).
 */
function inputDirection(playerObj, cameraEl, out) {
  const { forward, strafe } = keyboard.axes();
  let fx = 0, fz = -1; // avant par défaut : -Z
  if (cameraEl) {
    cameraEl.object3D.getWorldPosition(_tmp.a);
    playerObj.getWorldPosition(_tmp.b);
    fx = _tmp.b.x - _tmp.a.x;
    fz = _tmp.b.z - _tmp.a.z;
    const len = Math.hypot(fx, fz);
    if (len < 1e-4) { fx = 0; fz = -1; } else { fx /= len; fz /= len; }
  }
  const rx = -fz, rz = fx; // droite = avant x (0,1,0)
  out.set(fx * forward + rx * strafe, 0, fz * forward + rz * strafe);
  if (out.lengthSq() > 1) out.normalize();
  return out;
}

/**
 * Fait tendre la vitesse horizontale (vx, vz) vers la cible avec une
 * accélération bornée : accel si une touche est enfoncée, decel sinon.
 * => accélération / décélération progressives, pas de démarrage ou d'arrêt brutal.
 */
function approachVelocity(v, target, hasInput, accel, decel, dt) {
  const dx = target.x - v.x, dz = target.z - v.z;
  const dist = Math.hypot(dx, dz);
  const maxStep = (hasInput ? accel : decel) * dt;
  if (dist <= maxStep || dist < 1e-6) { v.x = target.x; v.z = target.z; }
  else { v.x += (dx / dist) * maxStep; v.z += (dz / dist) * maxStep; }
}

/* ---------------------------------------------------------------------
   Ex2 / Ex4 : player-move (sans moteur physique)
   - Le cube est posé EXACTEMENT sur le plan quelle que soit sa taille :
     demi-hauteur calculée depuis la boîte englobante (géométrie x échelle).
   - Saut uniquement au sol, gravité appliquée à la main.
   - camera : sélecteur optionnel -> déplacement relatif à la caméra (Ex4).
   --------------------------------------------------------------------- */
AFRAME.registerComponent('player-move', {
  schema: {
    speed: { default: 6 },        // m/s max
    accel: { default: 18 },       // m/s² quand on appuie
    decel: { default: 12 },       // m/s² quand on relâche
    jumpSpeed: { default: 7.5 },  // m/s vertical au décollage
    gravity: { default: 22 },     // m/s²
    groundY: { default: 0 },      // hauteur du plan
    camera: { type: 'selector' }  // vide = axes du monde
  },
  init() {
    this.vel = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.grounded = true;
    this.halfHeight = 0.5;
    this.el.addEventListener('componentchanged', (e) => {
      if (e.detail.name === 'geometry' || e.detail.name === 'scale') this.snapToGround();
    });
    this.el.sceneEl.addEventListener('loaded', () => this.snapToGround());
    this.snapToGround();
  },
  /** demi-hauteur réelle (boîte englobante monde) -> face inférieure sur le plan */
  snapToGround() {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) return;
    this.el.object3D.updateMatrixWorld(true);
    _tmp.box.setFromObject(mesh);
    this.halfHeight = (_tmp.box.max.y - _tmp.box.min.y) / 2;
    this.el.object3D.position.y = this.data.groundY + this.halfHeight;
    this.vel.y = 0; this.grounded = true;
  },
  tick(t, dtMs) {
    if (!dtMs) return;
    const dt = Math.min(dtMs / 1000, 0.05);
    const d = this.data, pos = this.el.object3D.position;

    // 1) horizontal : direction voulue -> vitesse cible -> accélération progressive
    inputDirection(this.el.object3D, d.camera, this.dir);
    const hasInput = this.dir.lengthSq() > 0;
    this.target.copy(this.dir).multiplyScalar(d.speed);
    approachVelocity(this.vel, this.target, hasInput, d.accel, d.decel, dt);

    // 2) vertical : saut seulement si au sol, puis gravité
    if (this.grounded && keyboard.jump()) { this.vel.y = d.jumpSpeed; this.grounded = false; }
    if (!this.grounded) this.vel.y -= d.gravity * dt;

    pos.x += this.vel.x * dt;
    pos.z += this.vel.z * dt;
    pos.y += this.vel.y * dt;

    // 3) contact avec le sol
    const floor = d.groundY + this.halfHeight;
    if (pos.y <= floor) { pos.y = floor; this.vel.y = 0; this.grounded = true; }
  }
});

/* ---------------------------------------------------------------------
   Ex3 : orbit-follow (à mettre sur l'entité caméra)
   Coordonnées sphériques autour de la cible :
     theta  = azimut (tour horizontal)
     phi    = élévation au-dessus de l'horizon, bornée [minPolar, maxPolar]
              -> jamais sous le plan, jamais au-delà de 90° (au-dessus du cube)
     radius = distance, bornée [minDistance, maxDistance] (zoom molette)
   Toutes les valeurs "courantes" suivent les valeurs "désirées" avec un
   amortissement exponentiel => mouvement fluide, indépendant du framerate.
   --------------------------------------------------------------------- */
AFRAME.registerComponent('orbit-follow', {
  schema: {
    target: { type: 'selector' },
    distance: { default: 9 },
    minDistance: { default: 3 },
    maxDistance: { default: 20 },
    minPolar: { default: 5 },       // degrés au-dessus de l'horizon
    maxPolar: { default: 89 },      // < 90 : évite la singularité de lookAt pile au-dessus
    azimuth: { default: 0 },        // degrés
    elevation: { default: 25 },     // degrés
    rotateSpeed: { default: 0.3 },  // degrés par pixel
    zoomSpeed: { default: 0.0012 },
    damping: { default: 10 },       // plus grand = plus réactif
    followDamping: { default: 14 },
    lookOffset: { type: 'vec3', default: { x: 0, y: 0.5, z: 0 } }
  },
  init() {
    const d = this.data;
    this.want = { theta: THREE.MathUtils.degToRad(d.azimuth), phi: THREE.MathUtils.degToRad(d.elevation), r: d.distance };
    this.cur = { ...this.want };
    this.focus = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.m = new THREE.Matrix4();
    this.up = new THREE.Vector3(0, 1, 0);
    this.dragging = false;
    this.initialized = false;

    const canvasReady = () => {
      const c = this.el.sceneEl.canvas;
      c.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;                 // bouton gauche uniquement
        this.dragging = true; c.setPointerCapture(e.pointerId);
      });
      const stop = (e) => {
        this.dragging = false;
        if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      };
      c.addEventListener('pointerup', stop);
      c.addEventListener('pointercancel', stop);
      c.addEventListener('pointermove', (e) => {
        if (!this.dragging) return;
        const k = THREE.MathUtils.degToRad(this.data.rotateSpeed);
        this.want.theta -= e.movementX * k;
        this.want.phi += e.movementY * k;
        this.clamp();
      });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.want.r *= Math.exp(e.deltaY * this.data.zoomSpeed);
        this.clamp();
      }, { passive: false });
      c.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    if (this.el.sceneEl.canvas) canvasReady(); else this.el.sceneEl.addEventListener('render-target-loaded', canvasReady);
  },
  clamp() {
    const d = this.data, D = THREE.MathUtils.degToRad;
    this.want.phi = THREE.MathUtils.clamp(this.want.phi, D(d.minPolar), D(d.maxPolar));
    this.want.r = THREE.MathUtils.clamp(this.want.r, d.minDistance, d.maxDistance);
  },
  tick(t, dtMs) {
    if (!this.data.target || !dtMs) return;
    const dt = Math.min(dtMs / 1000, 0.1);
    const d = this.data;

    // point visé = position du joueur (+ petit décalage vertical)
    this.data.target.object3D.getWorldPosition(this.tmp).add(d.lookOffset);
    if (!this.initialized) { this.focus.copy(this.tmp); this.initialized = true; }
    this.focus.lerp(this.tmp, 1 - Math.exp(-d.followDamping * dt));

    // amortissement exponentiel vers les valeurs désirées
    const k = 1 - Math.exp(-d.damping * dt);
    this.cur.theta += (this.want.theta - this.cur.theta) * k;
    this.cur.phi += (this.want.phi - this.cur.phi) * k;
    this.cur.r += (this.want.r - this.cur.r) * k;

    // sphérique -> cartésien
    const { theta, phi, r } = this.cur;
    const o = this.el.object3D;
    o.position.set(
      this.focus.x + r * Math.cos(phi) * Math.sin(theta),
      this.focus.y + r * Math.sin(phi),
      this.focus.z + r * Math.cos(phi) * Math.cos(theta)
    );
    // sécurité : la caméra ne passe jamais sous le plan (même pendant un saut)
    o.position.y = Math.max(o.position.y, 0.2);

    // orientation : Matrix4.lookAt(eye, target) oriente l'axe -Z vers la cible (convention caméra)
    this.m.lookAt(o.position, this.focus, this.up);
    o.quaternion.setFromRotationMatrix(this.m);
  }
});

/* ---------------------------------------------------------------------
   Ex5 / Ex6 : physics-player (sur une entité avec dynamic-body)
   - Le moteur (cannon-es) gère gravité et collisions ; on ne pilote que la
     VITESSE horizontale (accélération/décélération progressives).
   - Saut : seulement si un contact avec une normale orientée vers le haut
     existe (le cube repose sur le sol OU sur un autre cube).
   - Stabilité en rotation (demandé par l'Ex5) :
       angularFactor = (0, 0, 0)  -> les chocs ne peuvent plus faire basculer
                                     le cube (le couple est annulé sur X/Y/Z)
       angularDamping élevé       -> toute rotation résiduelle s'éteint vite
       redressement doux          -> si le cube est quand même incliné, on le
                                     ramène à plat (slerp vers l'identité)
   --------------------------------------------------------------------- */
AFRAME.registerComponent('physics-player', {
  schema: {
    speed: { default: 6 },
    accel: { default: 25 },
    decel: { default: 15 },
    jumpSpeed: { default: 6.5 },
    camera: { type: 'selector' },
    lockRotation: { default: true },
    uprightStrength: { default: 8 }
  },
  init() {
    this.dir = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.v = { x: 0, z: 0 };
    this.jumpCooldown = 0;
    this.grounded = false;
    this.identity = new THREE.Quaternion();
    this.q = new THREE.Quaternion();
    const setup = () => {
      const body = this.el.body;
      // Matériau sans frottement pour le joueur : c'est NOTRE code qui gère
      // l'accélération/décélération ; sans ça le frottement sol/cube "freine"
      // le cube à chaque pas physique et il avance au ralenti.
      const world = this.el.sceneEl.systems.physics.driver.world;
      const playerMat = new CANNON.Material('player');
      world.addContactMaterial(new CANNON.ContactMaterial(playerMat, body.material, {
        friction: 0, restitution: 0
      }));
      body.material = playerMat;
      if (this.data.lockRotation) body.angularFactor.set(0, 0, 0);
      body.angularDamping = 0.95;
      body.allowSleep = false;
      this.el.sceneEl.systems.physics.addComponent(this); // -> beforeStep() avant chaque pas physique
    };
    if (this.el.body) setup(); else this.el.addEventListener('body-loaded', setup, { once: true });
  },
  remove() { this.el.sceneEl.systems.physics.removeComponent(this); },

  /** true si un contact pousse le cube vers le haut (sol ou dessus d'un autre cube) */
  checkGrounded() {
    const body = this.el.body;
    const contacts = this.el.sceneEl.systems.physics.driver.world.contacts;
    for (const c of contacts) {
      // c.ni = normale de bi vers bj
      if (c.bi === body && -c.ni.y > 0.5) return true;
      if (c.bj === body && c.ni.y > 0.5) return true;
    }
    return false;
  },

  beforeStep(t, dtMs) {
    const body = this.el.body;
    if (!body || !dtMs) return;
    const dt = Math.min(dtMs / 1000, 4 / 60);
    const d = this.data;

    this.grounded = this.checkGrounded();
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);

    // vitesse horizontale progressive (même logique que player-move)
    inputDirection(this.el.object3D, d.camera, this.dir);
    const hasInput = this.dir.lengthSq() > 0;
    this.target.copy(this.dir).multiplyScalar(d.speed);
    this.v.x = body.velocity.x; this.v.z = body.velocity.z;
    // en l'air : contrôle réduit (plus réaliste)
    const airFactor = this.grounded ? 1 : 0.35;
    approachVelocity(this.v, this.target, hasInput, d.accel * airFactor, d.decel * airFactor, dt);
    body.velocity.x = this.v.x;
    body.velocity.z = this.v.z;

    // saut uniquement au contact du sol
    if (this.grounded && this.jumpCooldown === 0 && keyboard.jump()) {
      body.velocity.y = d.jumpSpeed;
      this.jumpCooldown = 0.25;
    }

    // redressement doux (utile si lockRotation = false)
    if (d.uprightStrength > 0) {
      this.q.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      this.q.slerp(this.identity, 1 - Math.exp(-d.uprightStrength * dt));
      body.quaternion.set(this.q.x, this.q.y, this.q.z, this.q.w);
    }
  }
});

/* ---------------------------------------------------------------------
   Ex6 : hit-flash — le cube s'illumine brièvement quand il est percuté
   assez fort (visualise que chaque cube réagit aux collisions).
   --------------------------------------------------------------------- */
AFRAME.registerComponent('hit-flash', {
  schema: { color: { default: '#ffffff' }, minSpeed: { default: 1.5 } },
  init() {
    this.level = 0;
    this.el.addEventListener('collide', (e) => {
      const c = e.detail.contact;
      if (!c) return;
      const v = c.getImpactVelocityAlongNormal ? Math.abs(c.getImpactVelocityAlongNormal()) : 0;
      if (v > this.data.minSpeed && e.detail.body.el && !e.detail.body.el.classList.contains('ground')) {
        this.level = Math.min(1, v / 6);
      }
    });
  },
  tick(t, dt) {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh || !dt) return;
    this.level *= Math.exp(-dt / 120);
    mesh.material.emissive.set(this.data.color);
    mesh.material.emissiveIntensity = this.level;
  }
});

/* ---------------------------------------------------------------------
   Décor : arbres low-poly en cercle (repères visuels de déplacement)
   --------------------------------------------------------------------- */
AFRAME.registerComponent('scenery', {
  schema: { count: { default: 28 }, radius: { default: 26 }, seed: { default: 3 } },
  init() {
    let s = this.data.seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < this.data.count; i++) {
      const a = (i / this.data.count) * Math.PI * 2 + rnd() * 0.2;
      const r = this.data.radius + rnd() * 10;
      const h = 2 + rnd() * 2.5;
      const tree = document.createElement('a-entity');
      tree.setAttribute('position', `${Math.cos(a) * r} 0 ${Math.sin(a) * r}`);
      tree.innerHTML =
        `<a-cylinder radius="0.25" height="${h * 0.5}" position="0 ${h * 0.25} 0" color="#6d4c33" shadow="cast: true"></a-cylinder>` +
        `<a-cone radius-bottom="${1 + rnd() * 0.6}" radius-top="0" height="${h}" position="0 ${h * 0.5 + h * 0.45} 0" color="#2e7d32" shadow="cast: true"></a-cone>`;
      this.el.appendChild(tree);
    }
  }
});
