import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// --- BASIC SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- GLOBALS ---
const models = {
  follower: null,
  leader: null
};
let wireframeMode = false;
const jointAxisConfigs = {
  follower: null,
  leader: null
};

// Separate tracking for each model
const bonesByModelName = {
  follower: new Map(),
  leader: new Map()
};
const initialRotationsByModelName = {
  follower: new Map(),
  leader: new Map()
};

const outlineMap = new WeakMap(); // mesh -> lineSegments

const OUTLINE_COLOR = 0x000000;
const EDGE_THRESHOLD_ANGLE = 15; // degrees; increase to show fewer edges

const outlineMaterial = new THREE.LineBasicMaterial({
  color: OUTLINE_COLOR,
  transparent: true,
  opacity: 1,
});

const wireframeOutlineMaterial = new THREE.LineBasicMaterial({
  color: 0x00ff00,
  transparent: true,
  opacity: 1,
});

// --- LOADING MODELS ---

// Load joint axis configuration from JSON file
async function loadJointConfig(configPath, modelName) {
  try {
    const response = await fetch(configPath);
    if (!response.ok) {
      console.warn(`Joint config not found: ${configPath} (status: ${response.status})`);
      return false;
    }
    jointAxisConfigs[modelName] = await response.json();
    return true;
  } catch (error) {
    console.error("Error loading joint config:", error);
    return false;
  }
}

// Add the outlines for our ghost mesh
function addOutlineForMesh(mesh, material = outlineMaterial, edgeThresholdAngle = EDGE_THRESHOLD_ANGLE) {
  // Extract edges from the mesh where adjacent faces meet at an angle > EDGE_THRESHOLD_ANGLE
  // This creates a cartoon-style outline by only drawing significant edges (not every triangle edge)
  const edgesGeom = new THREE.EdgesGeometry(mesh.geometry, edgeThresholdAngle);
  const lines = new THREE.LineSegments(edgesGeom, material);

  // Make it follow the mesh (including skinning transforms) by parenting it to the mesh
  mesh.add(lines);

  // Push it slightly outward to reduce z-fighting.
  lines.scale.setScalar(1.001);

  // draw lines after the ghost surface
  lines.renderOrder = 10;

  outlineMap.set(mesh, lines);
}

function getMaterial() {
  if (!wireframeMode) {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,

      // Stop objects behind the model showing through
      blending: THREE.NoBlending,
    });
  } else {
    return new THREE.MeshBasicMaterial({
      colorWrite: false,
    });
  }
}

function loadModel(modelBasePath, modelName = 'follower') {
  const loader = new GLTFLoader();

  // Validate modelName
  if (modelName !== 'follower' && modelName !== 'leader') {
    console.error(`Invalid modelName: ${modelName}. Must be 'follower' or 'leader'`);
    return Promise.resolve(false);
  }

  // Add extensions for model and config files
  const modelPath = modelBasePath + '.glb';
  const configPath = modelBasePath + '.json';

  return new Promise((resolve, _reject) => {
    // Load joint config first
    loadJointConfig(configPath, modelName).then(() => {
      // Check if model exists first
      fetch(modelPath, { method: 'HEAD' })
        .then(response => {
          if (!response.ok) {
            console.warn(`Model not found: ${modelPath} (status: ${response.status})`);
            resolve(false);
            return;
          }

          // Model exists, proceed with loading
          loader.load(
            modelPath,
            (gltf) => {
            const model = gltf.scene;
            models[modelName] = model;

            // Slightly scale the leader model to reduce z-fighting when both models overlap
            if (modelName === 'leader') {
              model.scale.multiplyScalar(1.01);
            }

            // Get material (wireframe or ghost)
            const material = getMaterial();
            material.side = THREE.DoubleSide; // Ensure both sides are rendered

            // Apply materials + collect bones
            const meshesFound = [];
            model.traverse((child) => {
              if (child.isMesh) {
                child.material = material.clone(); // Clone material for independent color control

                // Add outlines (green for wireframe mode, black for ghost mode)
                if (wireframeMode) {
                  addOutlineForMesh(child, wireframeOutlineMaterial);
                } else {
                  addOutlineForMesh(child);
                }

                meshesFound.push(child);
              }

              if (child.isBone) {
                const lowerName = child.name.toLowerCase();
                bonesByModelName[modelName].set(lowerName, child);
                // Store the initial rotation as the "rest position"
                initialRotationsByModelName[modelName].set(lowerName, {
                  x: child.rotation.x,
                  y: child.rotation.y,
                  z: child.rotation.z
                });
              }
            });

            scene.add(model);

            // TEMP CONSOLE LOG SO I CAN SEE WHAT BONE/MESH NAMES MY GLB HAS
            console.log(
              `Bones for ${modelName}:`,
              Array.from(bonesByModelName[modelName].entries()).map(([name, bone]) => ({
                name,
                parent: bone.parent?.name ?? null,
                localPosition: bone.position.toArray().map((n) => +n.toFixed(4)),
                worldPosition: bone.getWorldPosition(new THREE.Vector3()).toArray().map((n) => +n.toFixed(4)),
              }))
            );
            console.log(
              `Meshes for ${modelName}:`,
              meshesFound.map((mesh) => ({
                name: mesh.name,
                parent: mesh.parent?.name ?? null,
                parentIsBone: !!mesh.parent?.isBone,
                localPosition: mesh.position.toArray().map((n) => +n.toFixed(4)),
                worldPosition: mesh.getWorldPosition(new THREE.Vector3()).toArray().map((n) => +n.toFixed(4)),
              }))
            );

            resolve(true);
          },
          undefined,
          (error) => {
            console.error(`Error loading model: ${modelPath}`, error);
            resolve(false);
          }
        );
      })
      .catch(error => {
        console.warn(`Failed to check model existence: ${modelPath}`, error);
        resolve(false);
      });
    });
  });
}

// --- CONFIGURE LOADED MODELS ---

// Unload a specific model
function unloadModel(modelName) {
  if (modelName !== 'follower' && modelName !== 'leader') {
    console.error(`Invalid modelName: ${modelName}. Must be 'follower' or 'leader'`);
    return false;
  }

  const model = models[modelName];
  if (!model) {
    console.warn(`No model loaded for ${modelName}`);
    return false;
  }

  // Remove from scene
  scene.remove(model);

  // Clear tracking data
  bonesByModelName[modelName].clear();
  initialRotationsByModelName[modelName].clear();
  jointAxisConfigs[modelName] = null;
  models[modelName] = null;

  renderScene();
  return true;
}

// Set joint angles for a specific model
function setJointAngles(jointAngles, modelName) {
  if (modelName !== 'follower' && modelName !== 'leader') {
    console.error(`Invalid modelName: ${modelName}. Must be 'follower' or 'leader'`);
    return;
  }

  if (!models[modelName]) {
    console.warn(`No model loaded for ${modelName}`);
    return;
  }

  const jointAxisConfig = jointAxisConfigs[modelName];
  
  // If no joint config loaded, fall back to old behavior
  if (!jointAxisConfig || !jointAxisConfig.joints) {
    console.warn(`No joint configuration loaded for ${modelName}, using fallback method`);
    for (const jointName in jointAngles) {
      const axes = jointAngles[jointName];
      for (const axis in axes) {
        setRotation(jointName, axis, axes[axis], modelName);
      }
    }
  } else {
    // Use joint config to automatically determine axis
    for (const jointName in jointAngles) {
      // Strip .pos suffix if present
      const cleanName = jointName.endsWith(".pos") ? jointName.slice(0, -4) : jointName;
      
      // Get the axis for this joint from config
      const axis = jointAxisConfig.joints[cleanName];
      if (!axis) {
        console.warn(`No axis configuration found for joint: ${cleanName}`);
        continue;
      }
      
      // Get the angle value
      let angle = jointAngles[jointName];
      
      // Special handling for gripper: convert from 0-100 normalized to 0 to -127 degrees
      if (cleanName === "gripper") {
        angle = -((angle / 100) * 127);
      }
      else if (cleanName === "wrist_roll") {
        angle = -angle-90;  // -90 TEMP FIX to align wrist_roll to correct rest position.
                            // This should be fixed properly by correcting the .glb at some point
      }
      
      // Set the rotation
      setRotation(cleanName, axis, angle, modelName);
    }
  }
  
  // Render the scene after updating joint angles
  renderer.render(scene, camera);
}

// Set rotation of a named bone
function setRotation(jointName, axis, valueDeg, modelName) {
  // Strip ".pos" suffix if present
  if (jointName.endsWith(".pos")) {
    jointName = jointName.slice(0, -4);
  }
  
  // Bones only (models always have bones)
  const bone = bonesByModelName[modelName].get(jointName);
  if (!bone) {
    console.warn(`No bone found for jointName: ${jointName} in model ${modelName}`);
    return;
  }

  if (axis !== "x" && axis !== "y" && axis !== "z") return;

  // Get the initial/rest rotation for this bone
  const initialRot = initialRotationsByModelName[modelName].get(jointName);
  if (!initialRot) {
    console.warn(`No initial rotation found for: ${jointName} in model ${modelName}`);
    return;
  }

  // Negate Y-axis rotations
  const value = axis === "y" ? -valueDeg : valueDeg;
  
  // Apply rotation relative to the initial/rest position
  bone.rotation[axis] = initialRot[axis] + THREE.MathUtils.degToRad(value);
  bone.updateMatrixWorld(true);
}

// Look up a joint's bone directly (e.g. to read its world position/orientation
// for placing an external gizmo) without exposing the whole bonesByModelName map.
function getBone(jointName, modelName) {
  return bonesByModelName[modelName]?.get(jointName.toLowerCase()) || null;
}

// Look up which local axis (x/y/z) a joint rotates around, per the loaded joint config.
function getJointAxis(jointName, modelName) {
  return jointAxisConfigs[modelName]?.joints?.[jointName] || null;
}

// Inverse of the per-joint transform setJointAngles applies before calling
// setRotation (the y-axis negation, plus gripper's 0-100->degrees scaling and
// wrist_roll's offset). Given a rotation delta measured directly around a
// joint's own bone-local axis (e.g. from an external gizmo already aligned to
// that axis), returns the equivalent delta in that joint's own value
// convention (the same units setJointAngles/callers store), so a delta
// measured in 3D space can be added straight onto a stored joint value.
function jointValueDeltaFromAxisDelta(jointName, axisDeltaRad, modelName) {
  const axis = getJointAxis(jointName, modelName);
  if (!axis) return 0;

  let valueDegDelta = THREE.MathUtils.radToDeg(axisDeltaRad);
  if (axis === "y") valueDegDelta = -valueDegDelta;

  if (jointName === "gripper") {
    return valueDegDelta / -1.27; // inverse of angle = -((raw/100)*127)
  } else if (jointName === "wrist_roll") {
    return -valueDegDelta; // inverse of angle = -raw - 90
  }
  return valueDegDelta;
}

// Inverse of jointValueDeltaFromAxisDelta: given a delta in a joint's own
// value convention (e.g. a JOINT_RANGES min/max bound relative to some
// reference value), returns the equivalent rotation delta in radians around
// that joint's bone-local axis — used to place a valid-range indicator on an
// external gizmo in the same coordinate space setRotation itself operates in.
function axisDeltaFromJointValueDelta(jointName, valueDelta, modelName) {
  const axis = getJointAxis(jointName, modelName);
  if (!axis) return 0;

  let valueDegDelta = valueDelta;
  if (jointName === "gripper") {
    valueDegDelta = valueDelta * -1.27;
  } else if (jointName === "wrist_roll") {
    valueDegDelta = -valueDelta;
  }

  const axisDegDelta = axis === "y" ? -valueDegDelta : valueDegDelta;
  return THREE.MathUtils.degToRad(axisDegDelta);
}

// Set render mode to wireframe
function setRenderMode(wireframe = false) {
  if(wireframe)
  {
    wireframeMode = true;
  }
}

// Set the color of a specific model (hex color)
function setModelColor(modelName, color) {
  if (modelName !== 'follower' && modelName !== 'leader') {
    console.error(`Invalid modelName: ${modelName}. Must be 'follower' or 'leader'`);
    return;
  }

  const model = models[modelName];
  if (!model) {
    console.warn(`No model loaded for ${modelName}`);
    return;
  }

  model.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.color.setHex(color);
    }
  });

  renderScene();
}

// Set the transparency of a specific model (opacity 0.0 - 1.0)
function setModelTransparency(modelName, opacity) {
  if (modelName !== 'follower' && modelName !== 'leader') {
    console.error(`Invalid modelName: ${modelName}. Must be 'follower' or 'leader'`);
    return;
  }

  const model = models[modelName];
  if (!model) {
    console.warn(`No model loaded for ${modelName}`);
    return;
  }

  model.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.opacity = Math.max(0, Math.min(1, opacity));
      child.material.transparent = opacity < 1.0;
    }
  });

  renderScene();
}

// --- CAMERA AND LIGHTING ---

const cameraTarget = new THREE.Vector3(0, 0, 0);

// Lighting setup
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(-1, 2, 4);
scene.add(light);

// Configure lighting (color in hex, intensity, and position)
function setLighting(color = 0xffffff, intensity = 3, x = -1, y = 2, z = 4) {
  light.color.setHex(color);
  light.intensity = intensity;
  light.position.set(x, y, z);
}

function renderScene() {
  // Make the light follow the camera position
  light.position.copy(camera.position);
  renderer.render(scene, camera);
}

function setCameraTarget(x = 0, y = 0, z = 0, render = true) {
  cameraTarget.set(x, y, z);
  camera.lookAt(cameraTarget);
  if (render) {
    renderScene();
  }
}

function setCameraPose(x = 0, y = 0, z = 1, targetX = 0, targetY = 0, targetZ = 0) {
  cameraTarget.set(targetX, targetY, targetZ);
  camera.position.set(x, y, z);
  camera.lookAt(cameraTarget);
  renderScene();
}

// Resizes the renderer/camera to the given CSS pixel dimensions and repaints.
// The renderer is only ever sized once, at module load, to the full window —
// callers that reserve screen space for their own UI (a sidebar, a docked
// panel, etc.) are responsible for computing the right dimensions and wiring
// up their own window resize listener; this just applies whatever they pass.
function resizeRenderer(width, height) {
  renderer.setSize(width, height);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  renderScene();
}

// Export what your HTML needs
export {
  loadModel,
  unloadModel,
  loadJointConfig,
  setJointAngles,
  setRenderMode,
  setCameraTarget,
  setCameraPose,
  setModelColor,
  setModelTransparency,
  setLighting,
  renderScene,
  resizeRenderer,
  getBone,
  getJointAxis,
  jointValueDeltaFromAxisDelta,
  axisDeltaFromJointValueDelta,
  camera,
  renderer,
  scene
};
