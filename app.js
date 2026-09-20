import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

console.log("🚀 AURA 3D Layout platform engine boot sequence initiated.");

const container = document.getElementById('canvas-3d-stage');
let scene, camera, renderer, controls, gridHelper;

function init3DStage() {
    // 1. Create Scene & Dark Atmosphere Environment
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Deep blue-gray palette match

    // 2. Camera Setup 
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 5, 8);

    // 3. WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 4. Interactive Mouse Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // 5. Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0x3b82f6, 1.2); // Sleek cyber blue tone light
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // 6. Base Central Grid Floor 
    gridHelper = new THREE.GridHelper(12, 24, 0x3b82f6, 0x334155);
    scene.add(gridHelper);

    // Handle Window Resizing Automatically
    window.addEventListener('resize', onWindowResize);

    // Execute Frame Render Loop
    animate();
}

function onWindowResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Smooth out mouse drag movement physics
    renderer.render(scene, camera);
}

// Fire up 3D Canvas initialization once container settles layout
window.addEventListener('DOMContentLoaded', () => {
    init3DStage();
    console.log("AURA Stage Canvas verified. 3D Render viewport active.");
});
