import * as THREE from "three";

// Restyles the stock character: skin tone, beard, glasses, blazer over a shirt.
// All coordinates below are in the model's bind pose (head spans y 11.9 - 14).

const COLORS = {
  skin: "#b9805c",
  beard: "#151417",
  frame: "#1b1c20",
  lens: "#cfd8ff",
  blazer: "#b07a45",
  lapel: "#94623a",
  shirt: "#f1f1f1",
  pants: "#262830",
  shoes: "#2e211a",
};

const glslColor = (hex: string) => {
  const color = new THREE.Color(hex);
  return `vec3(${color.r.toFixed(4)}, ${color.g.toFixed(4)}, ${color.b.toFixed(4)})`;
};

const BEARD_GLSL = /* glsl */ `
  float beardMask(vec3 p) {
    float ax = abs(p.x);
    float cheekLine = mix(13.02, 12.72, smoothstep(0.35, 0.92, p.z));
    float sideburn = 1.0 - smoothstep(0.3, 0.46, p.z);
    float top = mix(cheekLine, 13.45, sideburn);
    float mask = 1.0 - smoothstep(top - 0.05, top + 0.05, p.y);
    float moustache = (1.0 - smoothstep(0.4, 0.55, ax))
      * smoothstep(12.62, 12.66, p.y)
      * (1.0 - smoothstep(12.76, 12.81, p.y));
    mask = max(mask, moustache);
    float lips = (1.0 - smoothstep(0.26, 0.36, ax))
      * smoothstep(12.5, 12.54, p.y)
      * (1.0 - smoothstep(12.61, 12.65, p.y))
      * smoothstep(0.6, 0.7, p.z);
    mask *= 1.0 - lips;
    return mask * smoothstep(0.02, 0.2, p.z);
  }
`;

const FACE_GLSL = /* glsl */ `
  ${BEARD_GLSL}
  vec3 paint(vec3 p, vec3 base) {
    return mix(base, ${glslColor(COLORS.beard)}, beardMask(p));
  }
  float bulge(vec3 p) {
    return beardMask(p) * 0.035;
  }
`;

const JACKET_GLSL = /* glsl */ `
  vec3 paint(vec3 p, vec3 base) {
    float ax = abs(p.x);
    float front = smoothstep(0.0, 0.1, p.z);
    float t = clamp((p.y - 9.6) / 2.3, 0.0, 1.0);
    float opening = 0.6 * t;
    float shirt = front * step(9.6, p.y) * (1.0 - smoothstep(opening - 0.012, opening + 0.012, ax));
    float lapelWidth = 0.34 * smoothstep(0.0, 0.25, t) * (1.0 - 0.35 * t);
    float lapel = front * step(9.6, p.y)
      * (1.0 - smoothstep(opening + lapelWidth - 0.012, opening + lapelWidth + 0.012, ax));
    float collar = smoothstep(11.9, 11.93, p.y);
    vec3 color = mix(${glslColor(COLORS.blazer)}, ${glslColor(COLORS.lapel)}, lapel);
    color = mix(color, ${glslColor(COLORS.shirt)}, max(shirt, collar));
    return base * color;
  }
`;

// Colours a material from the bind-pose position, so edges stay crisp at any
// mesh resolution and follow the skeleton and morph targets.
const applyPaint = (
  material: THREE.MeshStandardMaterial,
  key: string,
  glsl: string,
  hasBulge = false
) => {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vBindPosition;\n${hasBulge ? glsl : ""}`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nvBindPosition = position;\n${
          hasBulge ? "transformed += normalize(normal) * bulge(position);" : ""
        }`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vBindPosition;\n${glsl}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\ndiffuseColor.rgb = paint(vBindPosition, diffuseColor.rgb);`
      );
  };
  material.customProgramCacheKey = () => key;
};

const roundedRect = <T extends THREE.Path>(
  path: T,
  width: number,
  height: number,
  radius: number
) => {
  const w = width / 2;
  const h = height / 2;
  path.moveTo(-w + radius, -h);
  path.lineTo(w - radius, -h);
  path.quadraticCurveTo(w, -h, w, -h + radius);
  path.lineTo(w, h - radius);
  path.quadraticCurveTo(w, h, w - radius, h);
  path.lineTo(-w + radius, h);
  path.quadraticCurveTo(-w, h, -w, h - radius);
  path.lineTo(-w, -h + radius);
  path.quadraticCurveTo(-w, -h, -w + radius, -h);
  return path;
};

const createGlasses = () => {
  const lensWidth = 0.66;
  const lensHeight = 0.4;
  const rim = 0.048;
  const depth = 0.05;
  const eyeX = 0.45;
  const eyeY = 13.24;
  const frontZ = 1.02;
  const templeX = 1.03;

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.frame,
    roughness: 0.5,
    metalness: 0.1,
  });
  const lensMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.lens,
    roughness: 0.05,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });

  const rimShape = roundedRect(
    new THREE.Shape(),
    lensWidth + rim * 2,
    lensHeight + rim * 2,
    0.14
  );
  rimShape.holes.push(roundedRect(new THREE.Path(), lensWidth, lensHeight, 0.1));
  const rimGeometry = new THREE.ExtrudeGeometry(rimShape, {
    depth,
    bevelEnabled: false,
    curveSegments: 8,
  });
  const lensGeometry = new THREE.ShapeGeometry(
    roundedRect(new THREE.Shape(), lensWidth, lensHeight, 0.1),
    8
  );

  const glasses = new THREE.Group();
  glasses.name = "glasses";
  const outerX = eyeX + lensWidth / 2 + rim;
  const hingeY = eyeY + lensHeight / 2 - 0.05;
  const templeLength = frontZ - 0.12;

  [-1, 1].forEach((side) => {
    const rimMesh = new THREE.Mesh(rimGeometry, frameMaterial);
    rimMesh.position.set(side * eyeX, eyeY, frontZ);
    const lens = new THREE.Mesh(lensGeometry, lensMaterial);
    lens.position.set(side * eyeX, eyeY, frontZ + depth / 2);

    const hinge = new THREE.Mesh(
      new THREE.BoxGeometry(templeX - outerX + 0.06, 0.07, depth),
      frameMaterial
    );
    hinge.position.set(
      (side * (templeX + 0.03 + outerX - 0.03)) / 2,
      hingeY,
      frontZ + depth / 2
    );
    const temple = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.06, templeLength),
      frameMaterial
    );
    temple.position.set(side * (templeX + 0.01), hingeY, frontZ - templeLength / 2 + depth);
    glasses.add(rimMesh, lens, hinge, temple);
  });

  const bridgeWidth = (eyeX - lensWidth / 2) * 2;
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(bridgeWidth, 0.06, depth),
    frameMaterial
  );
  bridge.position.set(0, eyeY + 0.08, frontZ + depth / 2);
  glasses.add(bridge);
  return glasses;
};

const customizeCharacter = (character: THREE.Object3D) => {
  const meshes: Record<string, THREE.Mesh> = {};
  character.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes[child.name] = child as THREE.Mesh;
  });
  const recolor = (names: string[], color?: string) => {
    const source = meshes[names[0]]?.material as THREE.MeshStandardMaterial;
    if (!source) return null;
    const material = source.clone();
    if (color) material.color.set(color);
    names.forEach((name) => meshes[name] && (meshes[name].material = material));
    return material;
  };

  recolor(["Ear001", "Neck", "Hand"], COLORS.skin);
  recolor(["Pant"], COLORS.pants);
  recolor(["Shoe"], COLORS.shoes);

  const face = recolor(["Plane007"], COLORS.skin);
  if (face) {
    face.vertexColors = false;
    applyPaint(face, "face-beard", FACE_GLSL, true);
  }
  const jacket = recolor(["BODYSHIRT"]);
  if (jacket) applyPaint(jacket, "jacket", JACKET_GLSL);

  const headBone = character.getObjectByName("spine006");
  if (headBone) {
    character.updateMatrixWorld(true);
    const glasses = createGlasses();
    character.add(glasses);
    glasses.updateMatrixWorld(true);
    headBone.attach(glasses);
  }
};

export default customizeCharacter;
