import * as T from 'three';
import { maps, enemies, type MapId, type EnemyId } from '../simulation/data';
import type { State, Battle, Actor } from '../simulation/state';
import { AwakeningEffects } from './awakening-effects';
import { PartyPlacement } from './party-placement';
export class World {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.OrthographicCamera(-14, 14, 10, -10, 0.1, 150);
  environment = new T.Group();
  battleStage = new T.Group();
  actors = new T.Group();
  player: T.Sprite;
  companion: T.Sprite;
  enemySprites = new Map<EnemyId, T.Sprite>();
  textures = new Map<string, T.Texture>();
  map: MapId | null = null;
  zoom = 1;
  moving = false;
  direction = 3;
  action = 'walk';
  guardUntil: Record<Actor, number> = { hero: 0, lilia: 0 };
  actingActor: Actor = 'hero';
  effectTarget: Actor = 'hero';
  actionUntil = 0;
  fx: T.Sprite;
  time = 0;
  obstacles: {
    x: number;
    z: number;
    r: number;
  }[] = [];
  placement = new PartyPlacement();
  awakeningEffects = new AwakeningEffects();
  cinematicPhase = 0;
  cinematicStarted = 0;
  relic: T.Sprite;
  pendantLight = new T.PointLight(0x9ae4ff, 0, 12);
  cameraTarget = new T.Vector3();
  constructor(host: HTMLElement) {
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.setClearColor('#122526');
    host.append(this.renderer.domElement);
    this.scene.add(this.environment, this.battleStage, this.actors);
    this.scene.add(new T.HemisphereLight(0xb2d8de, 0x142c29, 0.85));
    const sun = new T.DirectionalLight(0xffe0b1, 2.5);
    sun.position.set(-14, 28, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -24,
      right: 24,
      top: 30,
      bottom: -30,
    });
    this.scene.add(sun);
    this.player = this.actor('yuu', 3.4);
    this.companion = this.actor('lilia', 3.6);
    this.fx = this.actor('fx', 5);
    this.fx.visible = false;
    this.relic = this.actor('sword', 2.3);
    this.relic.visible = false;
    this.scene.add(this.pendantLight);
    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      document.getElementById('ui')!.innerHTML =
        '<div class="fatal">描画が中断されました。ページを再読み込みして、つづきから再開してください。</div>';
    });
    this.resize();
  }
  async load() {
    const loader = new T.TextureLoader();
    const specs: Record<string, string> = {
      keeper: 'chapter-01/keeper.png',
      bellKeeper: 'chapter-01/bell-keeper.png',
      villagerAdult: 'chapter-01/villager-adult.png',
      villagerChild: 'chapter-01/villager-child.png',
      heroGuard: 'chapter-01/hero-guard.png',
      liliaGuard: 'chapter-01/lilia-guard.png',
      bellkeeper: 'chapter-01/bellkeeper.png',
      spirit: 'chapter-01/spirit.png',
      tower: 'chapter-01/tower.png',
      cottage: 'chapter-01/cottage.png',
      yuu: 'yuu/sheet-transparent.png',
      lilia: 'lilia/sheet-transparent.png',
      attack: 'attack/sheet-transparent.png',
      hurt: 'hurt/sheet-transparent.png',
      star: 'star/sheet-transparent.png',
      heal: 'heal/sheet-transparent.png',
      wolf: 'wolf/sheet-transparent.png',
      moth: 'moth/sheet-transparent.png',
      boss: 'boss/sheet-transparent.png',
      fx: 'fx/sheet-transparent.png',
      props: 'props/sheet-transparent.png',
      sword: 'sword/sheet-transparent.png',
      mural: 'mural.png',
      tree: 'tree/sheet-transparent.png',
      ground: 'ground.png',
      path: 'path.png',
    };
    await Promise.all(
      Object.entries(specs).map(async ([id, path]) => {
        const texture = await loader.loadAsync(`/assets/${path}`);
        texture.colorSpace = T.SRGBColorSpace;
        texture.magFilter = T.NearestFilter;
        texture.minFilter = ['ground', 'path'].includes(id)
          ? T.LinearMipmapLinearFilter
          : T.NearestFilter;
        if (['ground', 'path'].includes(id)) texture.magFilter = T.LinearFilter;
        this.textures.set(id, texture);
      }),
    );
  }
  actor(id: string, size: number) {
    const sprite = new T.Sprite(
      new T.SpriteMaterial({
        transparent: true,
        alphaTest: 0.1,
        depthWrite: false,
      }),
    );
    sprite.userData.asset = id;
    sprite.scale.set(size, size, 1);
    sprite.center.set(0.5, 0.07);
    this.actors.add(sprite);
    return sprite;
  }
  frame(
    sprite: T.Sprite,
    id: string,
    index: number,
    cols: number,
    rows: number,
  ) {
    const master = this.textures.get(id);
    if (!master) return;
    let tex = sprite.material.map;
    if (sprite.userData.current !== id) {
      tex?.dispose();
      tex = master.clone();
      sprite.material.map = tex;
      sprite.userData.current = id;
      sprite.material.needsUpdate = true;
    }
    tex!.repeat.set(1 / cols, 1 / rows);
    tex!.offset.set(
      (index % cols) / cols,
      1 - (Math.floor(index / cols) + 1) / rows,
    );
  }
  mesh(
    geometry: T.BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
  ) {
    const mesh = new T.Mesh(
      geometry,
      new T.MeshStandardMaterial({ color, roughness: 1 }),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.environment.add(mesh);
    return mesh;
  }
  box(
    w: number,
    h: number,
    d: number,
    c: number,
    x: number,
    y: number,
    z: number,
  ) {
    return this.mesh(new T.BoxGeometry(w, h, d), c, x, y, z);
  }
  build(map: MapId) {
    this.map = map;
    this.placement.reset();
    this.awakeningEffects.reset();
    this.guardUntil = { hero: 0, lilia: 0 };
    this.release(this.environment);
    this.release(this.battleStage);
    this.obstacles = [];
    this.enemySprites.forEach((s) => {
      this.actors.remove(s);
      s.material.map?.dispose();
      s.material.dispose();
    });
    this.enemySprites.clear();
    if (['village', 'belfry', 'undercroft', 'sanctum', 'road'].includes(map)) {
      this.buildChapter(map);
      return;
    }
    const temple = map === 'temple';
    this.scene.fog = new T.FogExp2(
      temple ? 0x182629 : 0x254e4c,
      temple ? 0.023 : 0.019,
    );
    this.renderer.setClearColor(temple ? 0x182629 : 0x254e4c);
    const len = maps[map].length;
    const ground = this.box(
      70,
      0.8,
      len + 35,
      temple ? 0x303d3d : 0xffffff,
      0,
      -0.5,
      0,
    );
    if (!temple) {
      const t = this.textures.get('ground')!.clone();
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(18, (len + 35) / 4);
      (ground.material as T.MeshStandardMaterial).map = t;
    }
    let seed = map === 'entrance' ? 12 : map === 'depths' ? 24 : 36;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let z = -len / 2; z < len / 2; z += 2) {
      const width = temple ? 12 : 6 + Math.sin(z * 0.17) * 0.6;
      const path = this.box(
        width,
        0.13,
        2.1,
        temple ? (Math.round(z) % 4 ? 0x657071 : 0x778080) : 0x8b8262,
        0,
        0.01,
        z,
      );
      if (!temple) {
        const t = this.textures.get('path')!.clone();
        t.wrapS = t.wrapT = T.RepeatWrapping;
        t.repeat.set(2, 1);
        (path.material as T.MeshStandardMaterial).map = t;
        (path.material as T.MeshStandardMaterial).color.set(0xd2c6ad);
      }
      if (temple) {
        for (let x = -5; x <= 5; x += 2)
          this.box(
            1.8,
            0.04,
            1.8,
            random() > 0.6 ? 0x798382 : 0x5d6b6a,
            x,
            0.1,
            z,
          );
      }
    }
    if (!temple) {
      for (let i = 0; i < 72; i++) {
        const side = i % 2 ? 1 : -1;
        const x = side * (5.8 + random() * 16),
          z = (random() - 0.5) * (len + 10),
          h = 8 + random() * 4;
        const tree = this.actor('tree', h);
        tree.position.set(x, 0, z);
        tree.material.depthWrite = true;
        this.frame(tree, 'tree', 0, 1, 1);
        this.environment.add(tree);
        if (i % 3 === 0)
          this.mesh(
            new T.CylinderGeometry(0.28, 0.6, h * 0.5, 6),
            0x324132,
            x,
            h * 0.25,
            z,
          );
      }
      for (let i = 0; i < 40; i++) {
        const x = (i % 2 ? 1 : -1) * (4.8 + random() * 3),
          z = (random() - 0.5) * len;
        const rock = this.mesh(
          new T.DodecahedronGeometry(0.3 + random() * 0.6),
          0x668075,
          x,
          0.3,
          z,
        );
        rock.scale.y = 0.7;
        this.obstacles.push({ x, z, r: 0.5 });
      }
      for (let i = 0; i < 36; i++) {
        const x = (i % 2 ? 1 : -1) * (3.7 + random() * 3),
          z = (random() - 0.5) * len;
        const fern = this.actor('props', 1.8);
        fern.position.set(x, 0, z);
        this.frame(fern, 'props', i % 4 === 0 ? 4 : 3, 3, 3);
        this.environment.add(fern);
      }
    } else {
      for (let z = -30; z <= 30; z += 8) {
        for (const x of [-7, 7]) {
          this.box(2, 0.5, 2, 0x788787, x, 0.3, z);
          this.mesh(
            new T.CylinderGeometry(0.65, 0.85, 7, 8),
            0x788383,
            x,
            3.7,
            z,
          );
          this.box(2, 0.5, 2, 0x8d9690, x, 7.2, z);
          this.box(0.3, 0.7, 0.3, 0x92d6d2, x, 4, z + 1);
          const light = new T.PointLight(0x78d9ed, 12, 9);
          light.position.set(x, 4, z + 1);
          this.environment.add(light);
        }
      }
      this.box(17, 8, 1, 0x465758, 0, 4, -34);
      this.box(7, 0.5, 5, 0x929a94, 0, 0.25, -29);
      this.box(4, 0.8, 2, 0x6d7b77, 0, 1, -29);
      const mural = this.mesh(
        new T.TorusGeometry(2.4, 0.12, 6, 32),
        0x9bacaa,
        0,
        4.3,
        -33.35,
      );
      mural.rotation.x = 0;
      this.mesh(new T.OctahedronGeometry(0.8), 0x9dc5c1, 0, 4.4, -33.2);
    }
    for (const landmark of maps[map].landmarks) {
      const sprite = new T.Sprite(
        new T.SpriteMaterial({
          transparent: true,
          alphaTest: 0.1,
          depthWrite: false,
        }),
      );
      sprite.scale.set(
        landmark.id === 'mural' ? 3 : 1.8,
        landmark.id === 'mural' ? 3 : 1.8,
        1,
      );
      sprite.center.set(0.5, 0.1);
      sprite.position.set(landmark.x, 0.1, landmark.z);
      this.environment.add(sprite);
      const index =
        (
          { stone: 0, bag: 1, spring: 5, herbs: 2, ruins: 6 } as Record<
            string,
            number
          >
        )[landmark.id] ?? 0;
      if (landmark.id === 'sword' || landmark.id === 'altar') {
        this.frame(sprite, 'sword', 0, 1, 1);
        sprite.userData.landmark = landmark.id;
        if (landmark.id === 'altar') sprite.position.y = 1.2;
      } else if (landmark.id === 'mural') {
        sprite.visible = false;
      } else this.frame(sprite, 'props', index, 3, 3);
    }
    if (temple) {
      const relief = new T.Mesh(
        new T.PlaneGeometry(11, 7),
        new T.MeshStandardMaterial({
          map: this.textures.get('mural'),
          roughness: 0.85,
          emissive: 0x163b44,
          emissiveIntensity: 0.4,
        }),
      );
      relief.position.set(0, 4.4, -33.3);
      this.environment.add(relief);
    }
    for (const e of maps[map].encounters) {
      const s = this.actor(enemies[e.id].art, e.id === 'boss' ? 5.8 : 2.8);
      s.position.set(e.x, 0.1, e.z);
      this.enemySprites.set(e.id, s);
    }
    this.battleStage.clear();
    const arena = this.box(
      24,
      0.3,
      28,
      temple ? 0x3d5358 : 0xffffff,
      0,
      -0.3,
      0,
    );
    this.battleStage.add(arena);
    if (!temple) {
      const t = this.textures.get('path')!.clone();
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(6, 7);
      (arena.material as T.MeshStandardMaterial).map = t;
      for (let i = 0; i < 8; i++) {
        const tree = this.actor('tree', 9);
        tree.position.set(-14 + i * 4, 0, -13);
        this.frame(tree, 'tree', 0, 1, 1);
        this.battleStage.add(tree);
      }
    } else {
      for (const x of [-10, 10]) {
        const column = this.mesh(
          new T.CylinderGeometry(0.7, 0.9, 8, 8),
          0x718184,
          x,
          4,
          -5,
        );
        this.battleStage.add(column);
      }
      const relief = new T.Mesh(
        new T.PlaneGeometry(17, 9),
        new T.MeshStandardMaterial({
          map: this.textures.get('mural'),
          emissive: 0x296a78,
          emissiveIntensity: 0.55,
        }),
      );
      relief.position.set(0, 5, -13);
      this.battleStage.add(relief);
    }
    this.cameraTarget.set(0, 0, maps[map].spawn[1]);
  }

  release(group: T.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((o) => {
        if (o instanceof T.Mesh || o instanceof T.Sprite) {
          if (o instanceof T.Mesh) o.geometry.dispose();
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          for (const material of materials) {
            const map = (material as T.SpriteMaterial).map;
            if (map && ![...this.textures.values()].includes(map))
              map.dispose();
            material.dispose();
          }
        }
      });
    }
  }
  decor(
    asset: string,
    size: number,
    x: number,
    z: number,
    frame = 0,
    cols = 1,
    rows = 1,
  ) {
    const sprite = this.actor(asset, size);
    sprite.position.set(x, 0.06, z);
    this.frame(sprite, asset, frame, cols, rows);
    this.environment.add(sprite);
    return sprite;
  }
  buildChapter(map: MapId) {
    const outside = map === 'village' || map === 'road';
    const len = maps[map].length;
    const bg = outside ? 0x849e97 : 0x15242f;
    this.scene.fog = new T.FogExp2(bg, outside ? 0.013 : 0.024);
    this.renderer.setClearColor(bg);
    const floor = this.box(
      65,
      0.8,
      len + 35,
      outside ? 0xffffff : 0x293847,
      0,
      -0.5,
      0,
    );
    if (outside) {
      const texture = this.textures.get('ground')!.clone();
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.repeat.set(16, (len + 35) / 4);
      (floor.material as T.MeshStandardMaterial).map = texture;
    }
    for (let z = -len / 2; z < len / 2; z += 2) {
      const path = this.box(
        outside ? 7 : 10,
        0.12,
        2.05,
        outside ? 0xffffff : z % 4 ? 0x5a6d73 : 0x64767d,
        0,
        0.02,
        z,
      );
      if (outside) {
        const texture = this.textures.get('path')!.clone();
        texture.wrapS = texture.wrapT = T.RepeatWrapping;
        texture.repeat.set(2, 1);
        (path.material as T.MeshStandardMaterial).map = texture;
        (path.material as T.MeshStandardMaterial).color.set(0xd2c6ad);
      }
      if (!outside) {
        for (const x of [-6.4, 6.4])
          this.box(1.3, 1.1, 2.05, 0x304f59, x, 0.1, z);
        const ward = this.box(0.11, 0.03, 2.05, 0x437b88, -3.2, 0.1, z);
        ward.userData.ward = 'light';
        const mist = this.box(0.18, 0.04, 2.05, 0x443453, 3.2, 0.1, z);
        mist.userData.ward = 'mist';
      }
    }
    if (map === 'village') {
      for (const z of [18, 5, -8]) {
        for (const side of [-1, 1]) {
          const cottage = this.decor('cottage', 10, side * 10, z);
          cottage.material.depthWrite = true;
          this.decor('props', 1.8, side * 5.8, z + 3, 3, 3, 3);
        }
      }
      const tower = this.decor('tower', 19, 0, -29);
      tower.material.depthWrite = true;
      this.decor('props', 2.4, 4, 16, 5, 3, 3);
      for (const z of [-17, -3, 11, 24])
        for (const x of [-17, 17]) this.decor('tree', 9, x, z);
    } else if (map === 'road') {
      for (let z = -20; z <= 20; z += 7)
        for (const x of [-9, 11]) this.decor('tree', 8, x, z);
    } else {
      for (let z = -len / 2 + 4; z < len / 2; z += 8) {
        for (const x of [-7, 7]) {
          this.mesh(new T.CylinderGeometry(0.65, 0.9, 6, 8), 0x4b6169, x, 3, z);
          this.box(1.9, 0.45, 1.9, 0x6d7b7e, x, 6, z);
          const light = new T.PointLight(0x6cb2d8, 9, 11);
          light.position.set(x, 3, z);
          this.environment.add(light);
        }
      }
      this.box(19, 7, 0.8, 0x344551, 0, 3.5, -len / 2 - 1);
      if (map === 'belfry') {
        this.decor('tower', 15, 0, -20);
        // The stairs are environment geometry, with a clear path to the north exit.
        for (let i = 0; i < 5; i++)
          this.box(6, 0.12 * (i + 1), 1.2, 0x7b8281, 0, 0.06 * i, -10 - i);
      }
      if (map === 'sanctum') {
        const ring = this.mesh(
          new T.TorusGeometry(4.5, 0.1, 8, 48),
          0x76a5b2,
          0,
          0.18,
          -9,
        );
        ring.rotation.x = -Math.PI / 2;
        ring.userData.ward = 'light';
      }
    }
    for (const p of maps[map].landmarks) {
      if (['keeper', 'elder', 'baker', 'child'].includes(p.id)) {
        const assets: Record<string, string> = {
          keeper: 'bellKeeper',
          elder: 'keeper',
          baker: 'villagerAdult',
          child: 'villagerChild',
        };
        const npc = this.decor(
          assets[p.id],
          p.id === 'child' ? 2.5 : 3.4,
          p.x,
          p.z,
          0,
          2,
          2,
        );
        npc.userData.npcIdle = assets[p.id];
        npc.userData.npcRole = p.id;
      } else
        this.decor(
          'props',
          1.8,
          p.x,
          p.z,
          p.id === 'supply' ? 1 : p.id === 'ward' ? 5 : 0,
          3,
          3,
        );
    }
    for (const e of maps[map].encounters) {
      const sprite = this.actor(
        enemies[e.id].art,
        e.id === 'bellkeeper' ? 6.7 : 2.8,
      );
      sprite.position.set(e.x, 0.1, e.z);
      this.enemySprites.set(e.id, sprite);
    }
    const arena = this.box(26, 0.3, 28, 0x354b57, 0, -0.3, 0);
    this.battleStage.add(arena);
    for (const x of [-10, 10]) {
      const column = this.mesh(
        new T.CylinderGeometry(0.7, 0.9, 8, 8),
        0x68777b,
        x,
        4,
        -5,
      );
      this.battleStage.add(column);
    }
    const backdrop = this.box(25, 9, 0.5, 0x243944, 0, 4, -14);
    this.battleStage.add(backdrop);
    const halo = this.mesh(
      new T.TorusGeometry(4, 0.1, 8, 48),
      0x5a939d,
      3,
      3.5,
      -13.6,
    );
    this.battleStage.add(halo);
    this.cameraTarget.set(0, 0, maps[map].spawn[1]);
  }

  walkable(x: number, z: number) {
    return (
      Math.abs(x) < 5 &&
      Math.abs(z) < maps[this.map!].length / 2 - 1 &&
      !this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)
    );
  }
  play(
    action: string,
    duration = 1,
    actor: Actor = 'hero',
    target: Actor = 'hero',
  ) {
    this.actingActor = actor;
    this.effectTarget = target;
    this.action = action;
    this.guardUntil[actor] = action === 'guard' ? this.time + duration : 0;
    this.actionUntil = this.time + duration;
  }
  render(s: State, b: Battle | null, dt: number, mode: string) {
    this.time += dt;
    if (this.map !== s.map) this.build(s.map);
    this.environment.children.forEach((o) => {
      if (o instanceof T.Sprite && o.userData.npcIdle)
        this.frame(o, o.userData.npcIdle, Math.floor(this.time * 3) % 4, 2, 2);
      if (o.userData.ward && o instanceof T.Mesh) {
        (o.material as T.MeshStandardMaterial).color.set(
          s.flags.includes('ch01:restored')
            ? 0x6ddccb
            : o.userData.ward === 'mist'
              ? 0x443453
              : 0x437b88,
        );
      }
      if (o.userData.landmark === 'sword') o.visible = !s.sword;
      if (o.userData.landmark === 'altar') o.visible = !s.starSword;
    });
    const inBattle =
      !!b && ['battle', 'turn', 'defeat', 'dialogue'].includes(mode);
    const pose = this.placement.update(s, inBattle, dt);
    this.environment.visible = !inBattle;
    this.battleStage.visible = inBattle;
    this.player.position.set(pose.player.x, pose.player.y, pose.player.z);
    this.companion.position.set(
      pose.companion.x,
      pose.companion.y,
      pose.companion.z,
    );
    const target = new T.Vector3(pose.camera.x, pose.camera.y, pose.camera.z);
    if (pose.snap) this.cameraTarget.copy(target);
    else this.cameraTarget.lerp(target, inBattle ? 0.08 : 0.09);
    this.relic.visible = this.cinematicPhase >= 4;
    this.frame(this.relic, 'sword', 0, 1, 1);
    if (this.relic.visible) {
      const t = Math.min(1, (this.time - this.cinematicStarted) / 1.5);
      this.relic.position.set(3 - 6 * t, 2, 0);
      this.relic.material.color.set(0xbdeeff);
    }
    const glow = this.awakeningEffects.sample(performance.now());
    this.pendantLight.color.set(glow.phase === 'pendant' ? 0x66ff77 : 0x9ae4ff);
    this.pendantLight.distance = glow.phase === 'pendant' ? 3 : 4;
    this.pendantLight.intensity =
      glow.phase === 'pendant'
        ? 14
        : glow.phase === 'awakening'
          ? 20 * (1 - glow.progress)
          : 0;
    this.pendantLight.position
      .copy(this.player.position)
      .add(new T.Vector3(0, 1, 1));
    this.companion.visible = s.lilia || s.map === 'entrance';
    const guardingHero =
      inBattle &&
      (b!.guards.includes('hero') || this.time < this.guardUntil.hero);
    const guardingLilia =
      inBattle &&
      (b!.guards.includes('lilia') || this.time < this.guardUntil.lilia);
    if (guardingHero) {
      this.frame(
        this.player,
        'heroGuard',
        Math.min(3, Math.floor((this.time % 0.8) * 5)),
        2,
        2,
      );
    } else if (
      this.time < this.actionUntil &&
      this.action !== 'guard' &&
      this.action !== 'heal' &&
      this.actingActor === 'hero'
    ) {
      this.frame(this.player, this.action, Math.floor(this.time * 9) % 4, 2, 2);
    } else {
      this.frame(
        this.player,
        'yuu',
        (inBattle ? 2 : this.direction) * 4 +
          (this.moving && !inBattle ? Math.floor(this.time * 7) % 4 : 0),
        4,
        4,
      );
    }
    if (guardingLilia)
      this.frame(
        this.companion,
        'liliaGuard',
        Math.min(3, Math.floor((this.time % 0.8) * 5)),
        2,
        2,
      );
    else if (this.time < this.actionUntil && this.action === 'heal')
      this.frame(this.companion, 'heal', Math.floor(this.time * 7) % 4, 2, 2);
    else
      this.frame(
        this.companion,
        'lilia',
        (inBattle ? 2 : this.direction) * 4 +
          (this.moving && !inBattle ? Math.floor(this.time * 7) % 4 : 0),
        4,
        4,
      );
    this.enemySprites.forEach((sprite, id) => {
      sprite.visible = inBattle ? id === b!.id : !s.defeated.includes(id);
      if (inBattle && id === b!.id) sprite.position.set(3, 0, 0);
      else {
        const p = maps[s.map].encounters.find((e) => e.id === id)!;
        sprite.position.set(p.x, 0.05, p.z);
      }
      if (id === 'bellkeeper') {
        const rescued = s.flags.includes('ch01:boss');
        if (!inBattle && rescued) sprite.visible = true;
        this.frame(
          sprite,
          rescued || (inBattle && !b!.armor) ? 'spirit' : 'bellkeeper',
          Math.floor(this.time * 6) % 9,
          3,
          3,
        );
      } else
        this.frame(
          sprite,
          enemies[id].art,
          Math.floor(this.time * 3) % 4,
          2,
          2,
        );
    });
    if (
      inBattle &&
      this.time < this.actionUntil &&
      this.actingActor === 'lilia' &&
      this.action === 'attack'
    )
      this.companion.position.x +=
        Math.sin(((this.actionUntil - this.time) / 1.1) * Math.PI) * 0.65;
    this.fx.visible =
      (this.time < this.actionUntil &&
        (this.action === 'star' || this.action === 'heal')) ||
      glow.phase === 'awakening';
    if (this.fx.visible) {
      this.fx.position.copy(
        this.effectTarget === 'lilia' && this.action === 'heal'
          ? this.companion.position
          : this.player.position,
      );
      this.frame(this.fx, 'fx', Math.floor(this.time * 8) % 4, 2, 2);
    }
    const aspect = innerWidth / innerHeight;
    const height = (inBattle ? 9 : 10) / this.zoom;
    this.camera.left = -height * aspect;
    this.camera.right = height * aspect;
    this.camera.top = height;
    this.camera.bottom = -height;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.cameraTarget).add(new T.Vector3(0, 19, 24));
    this.camera.lookAt(this.cameraTarget);
    this.renderer.render(this.scene, this.camera);
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
  }
}
