import * as THREE from 'three';

const clamp = (value) => Math.max(0, Math.min(1, value));

function flourTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const halo = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(.3, 'rgba(255,255,255,.9)');
  halo.addColorStop(.72, 'rgba(255,255,255,.32)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function flourLayer(scene, texture, { count, size, color, speed }) {
  const positions = new Float32Array(count * 3);
  const origins = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399963 + Math.random() * .4;
    const radius = Math.sqrt(Math.random()) * 2.25;
    const offset = index * 3;
    origins[offset] = Math.cos(angle) * radius;
    origins[offset + 1] = Math.sin(angle) * radius;
    origins[offset + 2] = Math.random() * 1.8 - .9;
    const force = speed * (.62 + Math.random() * .75);
    velocities[offset] = Math.cos(angle) * force + (Math.random() - .5) * .75;
    velocities[offset + 1] = Math.sin(angle) * force + (Math.random() - .5) * .75;
    velocities[offset + 2] = (Math.random() - .5) * 3;
    positions.set(origins.subarray(offset, offset + 3), offset);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ map: texture, color, size, sizeAttenuation: true, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return { geometry, material, positions, origins, velocities };
}

export function mountFlourBurst(container) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 30);
  camera.position.z = 10;
  const texture = flourTexture();
  const layers = [
    flourLayer(scene, texture, { count: 1350, size: .075, color: 0xd9c8a7, speed: 2.5 }),
    flourLayer(scene, texture, { count: 1700, size: .055, color: 0xfff7df, speed: 5.8 }),
    flourLayer(scene, texture, { count: 390, size: .16, color: 0xf1e2c5, speed: 5.1 }),
    flourLayer(scene, texture, { count: 95, size: .36, color: 0xfff9ec, speed: 4.3 }),
  ];

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const halfWidth = 5 * width / height;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  let frame = 0;
  let disposed = false;
  const start = performance.now();
  function animate(now) {
    if (disposed) return;
    const seconds = (now - start) / 1000;
    const progress = clamp(seconds / 2.7);
    const outward = Math.min(seconds, 1.1);
    const travel = outward * (1 + outward * .42) + Math.max(0, seconds - 1.1) * .16;
    for (const layer of layers) {
      for (let index = 0; index < layer.positions.length; index += 3) {
        layer.positions[index] = layer.origins[index] + layer.velocities[index] * travel;
        layer.positions[index + 1] = layer.origins[index + 1] + layer.velocities[index + 1] * travel;
        layer.positions[index + 2] = layer.origins[index + 2] + layer.velocities[index + 2] * travel;
      }
      layer.geometry.attributes.position.needsUpdate = true;
      layer.material.opacity = Math.min(1, seconds * 4) * (1 - .72 * clamp((seconds - .6) / 1.5)) * (1 - clamp((seconds - 2.1) / .6));
    }
    renderer.render(scene, camera);
    if (progress < 1) frame = window.requestAnimationFrame(animate);
  }
  frame = window.requestAnimationFrame(animate);

  return () => {
    disposed = true;
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    layers.forEach(({ geometry, material }) => { geometry.dispose(); material.dispose(); });
    texture.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
