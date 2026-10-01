import * as THREE from 'three';

const TWO_PI = Math.PI * 2;
const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => 1 - (1 - clamp(value)) ** 3;

function doughGeometry() {
  const geometry = new THREE.BufferGeometry();
  const rings = [0, .2, .4, .6, .72, .8, .87, .93, .98, 1];
  const segments = 96;
  const position = [];
  const uv = [];
  const indices = [];

  rings.forEach((fraction, ring) => {
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * TWO_PI;
      const irregularity = 1 + .014 * Math.sin(angle * 11 + 1.2) + .009 * Math.sin(angle * 23 - .6);
      const radius = 2.9 * fraction * irregularity;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      const rim = Math.exp(-(((fraction - .89) / .105) ** 2));
      const surface = .11 + .31 * rim - .015 * fraction;
      const blister = rim * (.028 * Math.sin(angle * 17 + ring) + .017 * Math.sin(angle * 29 - ring));
      position.push(x, y, surface + blister);
      uv.push(.5 + x / 5.8, .5 + y / 5.8);
      if (ring && segment) {
        const current = ring * (segments + 1) + segment;
        const previous = current - segments - 1;
        indices.push(previous - 1, current - 1, previous, current - 1, current, previous);
      }
    }
  });

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function contactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 56, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(13, 6, 2, .38)');
  gradient.addColorStop(.65, 'rgba(13, 6, 2, .27)');
  gradient.addColorStop(1, 'rgba(13, 6, 2, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

function tiledTopping(parent, texture, { name, width, z, start, fold }) {
  const tiles = [];
  const tileSize = width / 3;
  const arrivalOrder = [4, 0, 8, 2, 6, 1, 7, 3, 5];

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const geometry = new THREE.PlaneGeometry(tileSize, tileSize, 8, 8);
      const positions = geometry.attributes.position;
      const uvs = geometry.attributes.uv;
      for (let vertex = 0; vertex < positions.count; vertex += 1) {
        const x = positions.getX(vertex) / tileSize + .5;
        const y = positions.getY(vertex) / tileSize + .5;
        positions.setZ(vertex, fold * Math.sin(x * Math.PI) * Math.sin(y * Math.PI) * Math.cos((row + column + 1) * 1.7));
        uvs.setXY(vertex, (column + uvs.getX(vertex)) / 3, (2 - row + uvs.getY(vertex)) / 3);
      }
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        map: texture, transparent: true, alphaTest: .045, side: THREE.DoubleSide,
        roughness: name === 'albahaca' ? .37 : .68, metalness: 0, depthWrite: false, opacity: 0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = name === 'mozzarella' ? 3 : name === 'jamon-cocido' ? 4 : 5;
      const x = (column - 1) * tileSize;
      const y = (1 - row) * tileSize;
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.visible = false;
      mesh.name = `${name}-${row}-${column}`;
      parent.add(mesh);
      tiles.push({
        mesh, x, y, z,
        start: start + arrivalOrder[row * 3 + column] * .048,
        scatterX: ((row * 7 + column * 11) % 5 - 2) * .22,
        scatterY: ((row * 13 + column * 3) % 5 - 2) * .18,
        tilt: ((row * 3 + column) % 2 ? 1 : -1) * (.42 + column * .1),
      });
    }
  }
  return tiles;
}

function dustCloud(scene) {
  const count = 520;
  const positions = new Float32Array(count * 3);
  const origins = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399963;
    const radius = Math.sqrt((index + .5) / count) * 2.85;
    const at = index * 3;
    origins[at] = Math.cos(angle) * radius;
    origins[at + 1] = Math.sin(angle) * radius;
    origins[at + 2] = .38 + (index % 13) * .025;
    velocity[at] = Math.cos(angle) * (1.3 + (index % 9) * .15);
    velocity[at + 1] = Math.sin(angle) * (1.3 + (index % 11) * .12);
    velocity[at + 2] = .75 + (index % 7) * .15;
    positions.set(origins.subarray(at, at + 3), at);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xffeac2, size: .055, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  points.visible = false;
  scene.add(points);
  return { points, origins, velocity, positions };
}

export function mountPizzaScene(container, assets, { reducedMotion, onReady, onError }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    onError(error);
    onReady();
    return () => {};
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'pizza-intro__canvas';
  renderer.domElement.dataset.renderer = 'three';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
  const loader = new THREE.TextureLoader();
  const textures = [];
  let disposed = false;
  let animationFrame = 0;
  let pizzaRoot;
  let sauce;
  let sauceDrops = [];
  let toppingTiles = [];
  let flour;
  let table;
  let woodTexture;
  let startTime = 0;

  const ambient = new THREE.HemisphereLight(0xffe6bf, 0x65402d, 1.8);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xffd8a8, 2.6);
  keyLight.position.set(-4.5, 5.5, 9);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -9;
  keyLight.shadow.camera.right = 9;
  keyLight.shadow.camera.top = 9;
  keyLight.shadow.camera.bottom = -9;
  keyLight.shadow.bias = -.0003;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);
  const fill = new THREE.DirectionalLight(0xc78f62, .5);
  fill.position.set(5, -4, 6);
  scene.add(fill);

  function resize() {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    const verticalView = camera.aspect < 1 ? 5.8 / (.9 * camera.aspect) : 5.8 / .76;
    camera.position.set(0, -.32, verticalView / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (table && woodTexture) {
      const viewHeight = 2 * (camera.position.z + .28) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      table.scale.set(viewHeight * camera.aspect * 1.08, viewHeight * 1.08, 1);
      const imageAspect = woodTexture.image.width / woodTexture.image.height;
      if (camera.aspect < imageAspect) {
        woodTexture.repeat.set(camera.aspect / imageAspect, 1);
        woodTexture.offset.set((1 - woodTexture.repeat.x) / 2, 0);
      } else {
        woodTexture.repeat.set(1, imageAspect / camera.aspect);
        woodTexture.offset.set(0, (1 - woodTexture.repeat.y) / 2);
      }
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  function renderFrame(now) {
    if (disposed || !pizzaRoot) return;
    const time = (now - startTime) / 1000;
    const slide = reducedMotion ? ease((time - .35) / .4) : ease((time - .38) / 1.28);
    const fromX = camera.aspect < 1 ? 10 : 13;
    pizzaRoot.position.x = fromX * (1 - slide) - (slide < 1 ? Math.sin(slide * Math.PI) * .1 : 0);
    pizzaRoot.rotation.z = reducedMotion ? 0 : (1 - slide) * .16;

    const sauceProgress = ease((time - 1.72) / .83);
    sauce.visible = time >= 1.72;
    sauce.material.opacity = sauceProgress;
    sauce.scale.setScalar(reducedMotion ? 1 : .52 + .48 * sauceProgress);
    sauce.position.z = .27 + (reducedMotion ? 0 : (camera.position.z * .47 - .27) * (1 - sauceProgress));
    sauce.rotation.z = reducedMotion ? 0 : (1 - sauceProgress) * -.12;

    sauceDrops.forEach(({ mesh, x, y, delay, size }) => {
      const progress = ease((time - delay) / .63);
      mesh.visible = time >= delay && time < 2.65;
      mesh.position.set(x * progress, y * progress, .34 + (reducedMotion ? 0 : camera.position.z * .58 * (1 - progress)));
      mesh.scale.setScalar(size * (.55 + .45 * progress));
      mesh.material.opacity = Math.min(1, progress * 5) * (1 - ease((time - 2.26) / .39));
    });

    toppingTiles.forEach(({ mesh, x, y, z, start, scatterX, scatterY, tilt }) => {
      const progress = ease((time - start) / .74);
      mesh.visible = time >= start;
      if (!mesh.visible) return;
      mesh.position.set(
        x + (reducedMotion ? 0 : scatterX * (1 - progress)),
        y + (reducedMotion ? 0 : scatterY * (1 - progress)),
        z + (reducedMotion ? 0 : camera.position.z * .69 * (1 - progress)),
      );
      mesh.rotation.set(reducedMotion ? 0 : tilt * (1 - progress), reducedMotion ? 0 : -.37 * (1 - progress), reducedMotion ? 0 : tilt * .65 * (1 - progress));
      mesh.material.opacity = clamp((time - start) / (reducedMotion ? .36 : .15));
    });

    const dustProgress = clamp((time - 6.66) / 1.44);
    flour.points.visible = !reducedMotion && time >= 6.66;
    if (flour.points.visible) {
      const attribute = flour.points.geometry.attributes.position;
      for (let index = 0; index < flour.positions.length; index += 3) {
        flour.positions[index] = flour.origins[index] + flour.velocity[index] * dustProgress;
        flour.positions[index + 1] = flour.origins[index + 1] + flour.velocity[index + 1] * dustProgress;
        flour.positions[index + 2] = flour.origins[index + 2] + flour.velocity[index + 2] * dustProgress;
      }
      attribute.needsUpdate = true;
      flour.points.material.opacity = Math.sin(dustProgress * Math.PI) * .93;
    }
    if (time >= (reducedMotion ? 7.3 : 6.95)) container.classList.add('is-ending');
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(renderFrame);
  }

  const sources = [assets.table, assets.base, assets.tomato, assets.mozzarella, assets.ham, assets.basil];
  Promise.all(sources.map((source) => loader.loadAsync(source))).then(([wood, crust, tomato, cheese, ham, basil]) => {
    textures.push(wood, crust, tomato, cheese, ham, basil);
    if (disposed) { textures.forEach((texture) => texture.dispose()); return; }
    textures.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    });
    woodTexture = wood;
    table = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: wood, roughness: .91, metalness: 0 }));
    table.position.z = -.28;
    table.receiveShadow = true;
    scene.add(table);
    resize();

    pizzaRoot = new THREE.Group();
    pizzaRoot.name = 'pizza-3d';
    scene.add(pizzaRoot);
    const contactTexture = contactShadowTexture();
    textures.push(contactTexture);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 6.8), new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false }));
    contact.position.z = -.265;
    pizzaRoot.add(contact);

    const underside = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.76, .21, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0xa3582e, roughness: .9 }));
    underside.rotation.x = Math.PI / 2;
    underside.position.z = .015;
    underside.castShadow = true;
    pizzaRoot.add(underside);

    const dough = new THREE.Mesh(doughGeometry(), new THREE.MeshStandardMaterial({ map: crust, bumpMap: crust, bumpScale: .028, transparent: true, alphaTest: .08, roughness: .82, side: THREE.DoubleSide }));
    dough.renderOrder = 1;
    dough.name = 'borde-napolitano-con-relieve';
    dough.castShadow = true;
    dough.receiveShadow = true;
    pizzaRoot.add(dough);

    const sauceGeometry = new THREE.PlaneGeometry(5.1, 5.1, 16, 16);
    const saucePosition = sauceGeometry.attributes.position;
    for (let index = 0; index < saucePosition.count; index += 1) {
      const x = saucePosition.getX(index);
      const y = saucePosition.getY(index);
      saucePosition.setZ(index, .012 * Math.sin(x * 4.4) * Math.cos(y * 3.7));
    }
    sauceGeometry.computeVertexNormals();
    sauce = new THREE.Mesh(sauceGeometry, new THREE.MeshStandardMaterial({ map: tomato, bumpMap: tomato, bumpScale: .016, transparent: true, alphaTest: .025, roughness: .57, depthWrite: false, opacity: 0, side: THREE.DoubleSide }));
    sauce.renderOrder = 2;
    sauce.name = 'tomate-3d';
    sauce.castShadow = true;
    pizzaRoot.add(sauce);

    const dropGeometry = new THREE.SphereGeometry(1, 10, 8);
    for (let index = 0; index < 9; index += 1) {
      const angle = index * 2.399963;
      const radius = .3 + (index % 4) * .42;
      const material = new THREE.MeshStandardMaterial({ color: 0xb91910, roughness: .4, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(dropGeometry, material);
      mesh.castShadow = true;
      pizzaRoot.add(mesh);
      sauceDrops.push({ mesh, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, delay: 1.67 + index * .058, size: .065 + (index % 3) * .025 });
    }

    toppingTiles = [
      ...tiledTopping(pizzaRoot, cheese, { name: 'mozzarella', width: 5.12, z: .34, start: 2.74, fold: .055 }),
      ...tiledTopping(pizzaRoot, ham, { name: 'jamon-cocido', width: 5.15, z: .43, start: 3.96, fold: .12 }),
      ...tiledTopping(pizzaRoot, basil, { name: 'albahaca', width: 5.1, z: .52, start: 5.17, fold: .075 }),
    ];
    flour = dustCloud(scene);
    renderer.domElement.dataset.ready = 'true';
    startTime = performance.now();
    onReady();
    animationFrame = window.requestAnimationFrame(renderFrame);
  }).catch((error) => {
    if (disposed) return;
    onError(error);
    onReady();
  });

  return () => {
    disposed = true;
    window.cancelAnimationFrame(animationFrame);
    observer.disconnect();
    scene.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    });
    textures.forEach((texture) => texture.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  };
}
