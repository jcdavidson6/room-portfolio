import "./style.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import gsap from "gsap";

const canvas = document.querySelector(".experience-canvas");
const loadingScreen = document.querySelector(".loading-screen");
const loadingScreenButton = document.querySelector(".loading-screen-button");

// External links for the interactive picture frames.
const socialLinks = {
	Frame_GitHub: "https://github.com/jcdavidson6",
	Frame_LinkedIn: "https://www.linkedin.com/in/jamesdavidsonx",
	Frame_YouTube: "https://youtu.be/uohDMWT1OvI",
};

const scene = new THREE.Scene();
scene.background = new THREE.Color("#2b2638");

const camera = new THREE.PerspectiveCamera(22, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(16.65, 12.05, 17.25);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.target.set(-1, 1.45, -0.4);
controls.enableDamping = true;
controls.minDistance = 10;
controls.maxDistance = 40;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI / 2;
controls.minAzimuthAngle = 0;
controls.maxAzimuthAngle = Math.PI / 2;

// Only affects the photos and glass; the baked objects ignore lights.
scene.add(new THREE.AmbientLight(0xffffff, 1));

const loadingManager = new THREE.LoadingManager();
const dracoLoader = new DRACOLoader(loadingManager);
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");

const loader = new GLTFLoader(loadingManager);
loader.setDRACOLoader(dracoLoader);

// Interaction state and exact model-name mappings.
const interactiveNames = [
	"sign_about",
	"sign_projects",
	"sign_contact",
	"Frame_GitHub",
	"Frame_LinkedIn",
	"Frame_YouTube",
];
const logoToFrame = {
	Logo_GitHub: "Frame_GitHub",
	Logo_LinkedIn: "Frame_LinkedIn",
	Logo_YouTube_Curve: "Frame_YouTube",
};
// How much each kind of object grows on hover, and how far it moves toward the viewer (+X) while hovered.
// The frames are small, so they grow a lot. The signs are already large, so they grow less.
const SIGN_HOVER_SCALE = 1.5;
const SIGN_HOVER_FORWARD = 0.15;
const FRAME_HOVER_SCALE = 2;
const FRAME_HOVER_FORWARD = 0.15;

// Convert a world-space offset into the object's parent space, so it can be added to object.position.
function worldOffsetToLocal(object, worldOffset) {
	const parent = object.parent;
	if (!parent) return worldOffset.clone();
	const start = object.getWorldPosition(new THREE.Vector3());
	const end = start.clone().add(worldOffset);
	return parent.worldToLocal(end).sub(parent.worldToLocal(start));
}
const interactiveObjects = [];
const raycastObjects = [];
const interactiveByName = new Map();
const logoByName = new Map();
const pointer = new THREE.Vector2();
const pointerStart = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let hoveredObject = null;
let currentHit = null;
let pointerDragged = false;
let pointerIsDown = false;
let modalIsOpen = false;
let modelRoot = null;
let experienceStarted = false;
let loadingComplete = false;
let revealStarted = false;

// Loading screen and reveal.
loadingManager.onLoad = () => {
	loadingComplete = true;
	loadingScreenButton.textContent = "Enter!";
	loadingScreenButton.style.background = "#453d59";
	loadingScreenButton.style.color = "#f5f0e8";
	loadingScreenButton.style.border = "8px solid #2b2638";
	loadingScreenButton.style.boxShadow = "rgba(0, 0, 0, 0.24) 0px 3px 8px";
	loadingScreenButton.style.cursor = "pointer";
	loadingScreenButton.style.transition = "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
	loadingScreenButton.addEventListener("mouseenter", () => {
		loadingScreenButton.style.transform = "scale(1.15)";
	});
	loadingScreenButton.addEventListener("mouseleave", () => {
		loadingScreenButton.style.transform = "scale(1)";
	});
};

function finishReveal() {
	loadingScreen.remove();
	experienceStarted = true;
	controls.enabled = true;
}

loadingScreenButton.addEventListener("click", () => {
	if (!loadingComplete || revealStarted) return;
	revealStarted = true;
	loadingScreenButton.disabled = true;

	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		gsap.to(loadingScreen, { opacity: 0, duration: 0.4, onComplete: finishReveal });
		return;
	}

	gsap.timeline({ onComplete: finishReveal })
		.to(loadingScreen, {
			scale: 0.5,
			duration: 1.2,
			delay: 0.25,
			ease: "back.in(1.8)",
		})
		.to(loadingScreen, {
			y: "200vh",
			rotationX: 45,
			rotationY: -35,
			transformPerspective: 1000,
			duration: 1.2,
			ease: "back.in(1.8)",
		}, "-=0.1");
});

// Modal state and shared overlay behavior.
const overlay = document.querySelector(".overlay");
const modalByName = {
	sign_about: document.querySelector("#about-modal"),
	sign_projects: document.querySelector("#projects-modal"),
	sign_contact: document.querySelector("#contact-modal"),
};

function setModal(modal, open) {
	modalIsOpen = open;
	controls.enabled = !open && experienceStarted;
	modal.hidden = !open;
	overlay.classList.toggle("is-visible", open);
	overlay.setAttribute("aria-hidden", String(!open));
	gsap.killTweensOf(modal);
	if (!open) return;
	const body = modal.querySelector(".modal-body");
	if (body) body.scrollTop = 0;
	// Pop the card in, unless the visitor prefers reduced motion.
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.set(modal, { scale: 1, opacity: 1 });
	else gsap.fromTo(modal, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.6)" });
	modal.focus({ preventScroll: true });
}

function closeModal() {
	const openModal = Object.values(modalByName).find((modal) => !modal.hidden);
	if (openModal) setModal(openModal, false);
}

function openModal(target) {
	const modal = modalByName[target.name];
	if (modal) setModal(modal, true);
}

overlay.addEventListener("click", closeModal);
document.querySelectorAll(".modal-close").forEach((button) => {
	button.addEventListener("click", closeModal);
});
window.addEventListener("keydown", (event) => {
	if (event.key === "Escape") closeModal();
});

// Pointer and touch tracking, including a drag guard for OrbitControls.
function updatePointer(event) {
	const bounds = canvas.getBoundingClientRect();
	pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
	pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
}

// Forget the pointer and shrink whatever is hovered. Used when the pointer leaves the canvas,
// the window loses focus, a pop-up opens, a link opens, or a touch ends.
function clearHover() {
	pointer.set(10, 10); // outside the view, so the next raycast hits nothing
	currentHit = null;
	setHoveredObject(null);
	canvas.style.cursor = "default";
}

canvas.addEventListener("pointerleave", clearHover);
window.addEventListener("blur", clearHover);

canvas.addEventListener("pointerdown", (event) => {
	if (!experienceStarted || modalIsOpen) return;
	pointerIsDown = true;
	pointerDragged = false;
	pointerStart.set(event.clientX, event.clientY);
	updatePointer(event);
});

canvas.addEventListener("pointermove", (event) => {
	if (!experienceStarted) return;
	updatePointer(event);
	if (!pointerIsDown) return;
	const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
	if (distance > 6) pointerDragged = true;
});

canvas.addEventListener("pointerup", (event) => {
	if (experienceStarted && !modalIsOpen && pointerIsDown && !pointerDragged) {
		// Raycast now instead of waiting for the next frame, so a quick tap on a phone still registers.
		const target = pickInteractiveObject();
		if (isClickable(target)) {
			if (socialLinks[target.name]) window.open(socialLinks[target.name], "_blank", "noopener,noreferrer");
			else openModal(target);
			clearHover();
		}
	}
	pointerIsDown = false;
	// A finger has no hover state, so nothing should stay enlarged after a touch ends.
	if (event.pointerType !== "mouse") clearHover();
});

canvas.addEventListener("pointercancel", () => {
	pointerIsDown = false;
	pointerDragged = true;
});

// Find the hoverable object under the pointer. The ray is tested against the whole room, and only
// the nearest surface counts, so the chair or desk blocks anything hidden behind it.
function pickInteractiveObject() {
	if (!modelRoot) return null;
	raycaster.setFromCamera(pointer, camera);
	return resolveInteractiveObject(raycaster.intersectObject(modelRoot, true)[0]?.object);
}

// True for the signs and picture frames, which open something when clicked.
function isClickable(object) {
	return Boolean(object && (socialLinks[object.name] || modalByName[object.name]));
}

// Resolve a ray hit to a collected interactive object or its mapped frame.
function resolveInteractiveObject(object) {
	let current = object;
	while (current) {
		if (interactiveByName.has(current.name)) return interactiveByName.get(current.name);
		if (logoByName.has(current.name)) return interactiveByName.get(logoToFrame[current.name]);
		current = current.parent;
	}
	return null;
}

// GSAP hover animation, started only when the hovered target changes.
// Signs grow a little; the small picture frames grow a lot and lift off the wall so the pop is easy to see.
function setHoveredObject(nextObject) {
	if (nextObject === hoveredObject) return;
	if (hoveredObject) {
		const { originalScale, originalPosition } = hoveredObject.userData;
		gsap.to(hoveredObject.scale, { x: originalScale.x, y: originalScale.y, z: originalScale.z, duration: 0.3, ease: "power2.out", overwrite: true });
		gsap.to(hoveredObject.position, { x: originalPosition.x, y: originalPosition.y, z: originalPosition.z, duration: 0.3, ease: "power2.out", overwrite: true });
	}
	if (nextObject) {
		const { originalScale, originalPosition, hoverScale, hoverOffset } = nextObject.userData;
		// overwrite: true stops an older tween on the same object, so a quick in-and-out cannot leave it stuck big.
		const spring = { duration: 0.5, ease: "back.out(2.6)", overwrite: true };
		gsap.to(nextObject.scale, { x: originalScale.x * hoverScale, y: originalScale.y * hoverScale, z: originalScale.z * hoverScale, ...spring });
		gsap.to(nextObject.position, {
			x: originalPosition.x + hoverOffset.x,
			y: originalPosition.y + hoverOffset.y,
			z: originalPosition.z + hoverOffset.z,
			...spring,
		});
	}
	hoveredObject = nextObject;
}

// Decorative objects that pop when hovered. They are not clickable.
// Each entry lists the model objects that move together and how they pop:
//   "grow"  grows upward from its base, for things resting on a surface
//   "slide" slides out toward the viewer, for the stacked storage boxes
//   "wallX" / "wallZ" pops forward off the left wall / the back wall
// Add `scale` to an entry to override the size for that one object.
const HOVER_STYLES = {
	grow: { scale: 1.35, anchor: "base", offset: [0, 0, 0] },
	slide: { scale: 1.12, anchor: "centre", offset: [0.3, 0, 0] },
	wallX: { scale: 1.4, anchor: "centre", offset: [0.1, 0, 0] },
	wallZ: { scale: 1.5, anchor: "centre", offset: [0, 0, 0.1] },
};
const HOVER_PROPS = [
	{ name: "Box_Bottom", style: "slide", parts: ["Box_A", "Box_B", "Box_Label_A"] },
	{ name: "Box_Middle", style: "slide", parts: ["Box_C", "Box_D", "Box_Label_B"] },
	{ name: "Box_Top", style: "slide", parts: ["Box_E", "Box_F", "Box_Label_C"] },
	{ name: "Mug", style: "grow", parts: ["Prop_Mug"] },
	{ name: "Headphones", style: "grow", parts: ["Prop_Headphones", "Prop_Stand_Post", "Prop_Stand_Pin", "Prop_Mat"] },
	{ name: "Desk_Organizer", style: "grow", parts: ["Prop_A", "Prop_B", "Prop_Cup_Holder"] },
	{ name: "Desk_Books", style: "grow", parts: ["Prop_Book_Stack_A", "Prop_Book_Stack_B"] },
	{ name: "Figure_A", style: "grow", parts: ["Prop_Figure_A"] },
	{ name: "Figure_B", style: "grow", parts: ["Prop_Figure_B"] },
	{ name: "Keyboard", style: "grow", scale: 1.2, parts: ["Keyboard_Base", "Keyboard_Deck", "Key_A", "Key_B", "Key_C", "Key_D", "Key_E", "Key_F", "Key_G", "Key_H", "Key_I"] },
	{ name: "Mouse", style: "grow", parts: ["Mouse"] },
	{ name: "Notebook", style: "grow", parts: ["Detail_Notebook_Cover", "Detail_Notebook_Pages", "Detail_Notebook_Band", "Detail_Pencil"] },
	{ name: "Desk_Lamp", style: "grow", scale: 1.25, parts: ["Desk_Lamp"] },
	{ name: "Plant", style: "grow", parts: ["Potted_Plant"] },
	{ name: "Backpack", style: "grow", scale: 1.25, parts: ["Backpack"] },
	{ name: "Candle", style: "grow", parts: ["Detail_Candle_Jar", "Detail_Candle_Wax", "Detail_Candle_Flame"] },
	{ name: "Cabinet_Books", style: "grow", scale: 1.25, parts: ["Prop_Book_C", "Prop_Book_D"] },
	{ name: "Cabinet_Pencils", style: "grow", parts: ["Prop_CabTop_A", "Prop_CabTop_B", "Prop_CabTop_C", "Prop_CabTop_D"] },
	{ name: "Pouf", style: "grow", scale: 1.25, parts: ["Detail_Pouf", "Detail_Pouf_Cushion"] },
	{ name: "Clock", style: "wallX", parts: ["Clock_Face", "Clock_Hand_A", "Clock_Hand_B", "Clock_Pin"] },
	{ name: "Picture_A", style: "wallX", parts: ["Detail_Frame_A", "Detail_Frame_A_Mat", "Detail_Frame_A_Hill", "Detail_Frame_A_Sun"] },
	{ name: "Picture_B", style: "wallX", parts: ["Detail_Frame_B", "Detail_Frame_B_Mat", "Detail_Frame_B_Hill", "Detail_Frame_B_Sun"] },
	{ name: "Photo_A", style: "wallZ", parts: ["Peg_Item_A"] },
	{ name: "Photo_B", style: "wallZ", parts: ["Peg_Item_B"] },
	{ name: "Photo_C", style: "wallZ", parts: ["Peg_Item_C"] },
];

// Group each prop's parts under one pivot, so they scale together from a sensible point.
function setupHoverProps(root) {
	root.updateMatrixWorld(true);
	for (const prop of HOVER_PROPS) {
		const parts = prop.parts.map((name) => root.getObjectByName(name)).filter(Boolean);
		if (!parts.length) continue;
		const style = HOVER_STYLES[prop.style];
		const box = new THREE.Box3();
		for (const part of parts) box.expandByObject(part, true);
		const centre = box.getCenter(new THREE.Vector3());
		const pivot = new THREE.Group();
		pivot.name = "Hover_" + prop.name;
		pivot.position.set(centre.x, style.anchor === "base" ? box.min.y : centre.y, centre.z);
		root.add(pivot);
		pivot.updateMatrixWorld(true);
		for (const part of parts) pivot.attach(part);
		pivot.userData.originalScale = pivot.scale.clone();
		pivot.userData.originalPosition = pivot.position.clone();
		pivot.userData.hoverScale = prop.scale ?? style.scale;
		pivot.userData.hoverOffset = new THREE.Vector3(...style.offset);
		interactiveObjects.push(pivot);
		interactiveByName.set(pivot.name, pivot);
	}
}

// Texture touch-up: the end panel of the bench under the right desk wing sits against the wall,
// but its baked texture caught a patch of warm light. That panel is only ever seen from inside the
// bench, where everything else is dark, so the patch showed as a yellow spot. This repaints that
// panel's part of the shared texture in the dark colour of its surroundings.
function fixBenchLightLeak(root) {
	const bench = root.getObjectByName("Bench_Body");
	const texture = bench?.material?.emissiveMap;
	const image = texture?.image;
	if (!image) return;
	root.updateMatrixWorld(true);
	const canvas = document.createElement("canvas");
	canvas.width = image.width;
	canvas.height = image.height;
	const context = canvas.getContext("2d");
	context.drawImage(image, 0, 0);
	context.fillStyle = context.strokeStyle = "#0a0705";
	context.lineWidth = 6;
	context.lineJoin = "round";

	// Find the triangles of the panel that faces the wall (it points toward -X at the bench's far end)
	// and fill their area of the texture.
	const { position, uv } = bench.geometry.attributes;
	const index = bench.geometry.index;
	const wallSide = new THREE.Box3().setFromObject(bench).min.x + 0.05;
	const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
	const edgeA = new THREE.Vector3();
	const edgeB = new THREE.Vector3();
	const triangleCount = (index ? index.count : position.count) / 3;
	let painted = 0;
	for (let t = 0; t < triangleCount; t++) {
		const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k));
		ids.forEach((id, k) => corners[k].fromBufferAttribute(position, id).applyMatrix4(bench.matrixWorld));
		const normal = edgeA.subVectors(corners[1], corners[0]).cross(edgeB.subVectors(corners[2], corners[0])).normalize();
		const centreX = (corners[0].x + corners[1].x + corners[2].x) / 3;
		if (normal.x > -0.9 || centreX > wallSide) continue;
		context.beginPath();
		ids.forEach((id, k) => {
			const x = uv.getX(id) * canvas.width;
			const y = uv.getY(id) * canvas.height;
			if (k === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		});
		context.closePath();
		context.fill();
		context.stroke();
		painted++;
	}
	if (!painted) return;

	// Swap the repainted copy in for every object that shares this texture.
	const patched = new THREE.CanvasTexture(canvas);
	for (const key of ["name", "flipY", "colorSpace", "wrapS", "wrapT", "magFilter", "minFilter", "anisotropy", "channel", "generateMipmaps"]) {
		patched[key] = texture[key];
	}
	patched.needsUpdate = true;
	root.traverse((object) => {
		if (object.isMesh && object.material.emissiveMap === texture) object.material.emissiveMap = patched;
	});
	texture.dispose();
}

// Backdrop: the big purple box around the room.
// It is doubled in size and pushed toward the camera's side, so its two far walls sit close behind
// the room (their edges show in the view) while the two near walls stay beyond the camera's reach.
const BACKDROP_SCALE = 2;
const BACKDROP_SHIFT = 24; // how far the box is moved toward +X and +Z
const BACKDROP_LIT = "#a596ae"; // colour where the light pools around the room
const BACKDROP_SHADE = "#45415f"; // colour of the walls and the far floor
const BACKDROP_SHADING_DIRECTION = new THREE.Vector3(0.35, 0.9, 0.2).normalize(); // mostly from above
const SHADOW_LIGHT_DIRECTION = new THREE.Vector3(0.85, 0.47, 0.25).normalize(); // same side as the baked key light
const SHADOW_STRENGTH = 0.38; // 0 = no shadow, 1 = solid

function setupBackdrop(root) {
	const backdrop = root.getObjectByName("Studio_Backdrop");
	if (!backdrop) return;
	backdrop.scale.setScalar(BACKDROP_SCALE);
	backdrop.position.x += BACKDROP_SHIFT;
	backdrop.position.z += BACKDROP_SHIFT;
	root.updateMatrixWorld(true);
	const centre = new THREE.Vector3(controls.target.x, 0, controls.target.z);

	// 1. Shading. Each flat face gets its own brightness, so the edges of the box show,
	//    and the light pools around the room and fades with distance.
	backdrop.material = new THREE.ShaderMaterial({
		side: THREE.DoubleSide,
		uniforms: {
			uLit: { value: new THREE.Color(BACKDROP_LIT) },
			uShade: { value: new THREE.Color(BACKDROP_SHADE) },
			uLightDir: { value: BACKDROP_SHADING_DIRECTION },
			uCentre: { value: centre },
		},
		vertexShader: `
			varying vec3 vWorldPos;
			void main() {
				vec4 worldPos = modelMatrix * vec4(position, 1.0);
				vWorldPos = worldPos.xyz;
				gl_Position = projectionMatrix * viewMatrix * worldPos;
			}`,
		fragmentShader: `
			uniform vec3 uLit;
			uniform vec3 uShade;
			uniform vec3 uLightDir;
			uniform vec3 uCentre;
			varying vec3 vWorldPos;
			void main() {
				vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
				if (dot(n, cameraPosition - vWorldPos) < 0.0) n = -n;
				float facing = dot(n, uLightDir) * 0.5 + 0.5;
				float pool = 1.0 - smoothstep(4.0, 36.0, length(vWorldPos - uCentre));
				float light = clamp(facing * 0.55 + pool * 0.6 - 0.1, 0.0, 1.0);
				gl_FragColor = vec4(mix(uShade, uLit, light * light), 1.0);
				#include <colorspace_fragment>
			}`,
	});

	// 2. A soft shadow of the room on the backdrop. The light has zero brightness and exists only
	//    to cast the shadow, so the baked colours of the room are not changed. The shadow is drawn
	//    once after loading (autoUpdate is off), so it costs nothing per frame.
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.VSMShadowMap;
	renderer.shadowMap.autoUpdate = false;
	const shadowLight = new THREE.DirectionalLight(0xffffff, 0);
	shadowLight.position.copy(centre).addScaledVector(SHADOW_LIGHT_DIRECTION, 40);
	shadowLight.target.position.copy(centre);
	shadowLight.castShadow = true;
	shadowLight.shadow.mapSize.set(2048, 2048);
	shadowLight.shadow.radius = 14;
	shadowLight.shadow.blurSamples = 20;
	shadowLight.shadow.bias = -0.0005;
	Object.assign(shadowLight.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 90 });
	scene.add(shadowLight, shadowLight.target);

	root.traverse((object) => {
		if (object.isMesh && object !== backdrop) object.castShadow = true;
	});
	// The shadow is drawn on a disc lying on the backdrop floor, on the side away from the light.
	// The disc stays inside the area the shadow light covers. Catching shadows on the whole backdrop
	// showed the edge of that area as a thin diagonal line across the walls.
	const awayFromLight = new THREE.Vector3(-SHADOW_LIGHT_DIRECTION.x, 0, -SHADOW_LIGHT_DIRECTION.z).normalize();
	const shadowCatcher = new THREE.Mesh(
		new THREE.CircleGeometry(14, 64),
		new THREE.ShadowMaterial({
			color: "#2b2638",
			opacity: SHADOW_STRENGTH,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2,
		}),
	);
	shadowCatcher.name = "Backdrop_Shadow";
	shadowCatcher.rotation.x = -Math.PI / 2;
	shadowCatcher.position.copy(centre).addScaledVector(awayFromLight, 5);
	shadowCatcher.position.y = new THREE.Box3().setFromObject(backdrop).min.y + 0.001;
	shadowCatcher.receiveShadow = true;
	shadowCatcher.renderOrder = 1;
	root.add(shadowCatcher);
	renderer.shadowMap.needsUpdate = true;
}

// Looping animations: the chair sways from side to side and the three PC fans spin.
const CHAIR_SWAY_ANGLE = 0.3; // how far the chair turns each way, in radians (0.3 is about 17 degrees)
const CHAIR_SWAY_SPEED = 0.7; // higher is faster
const FAN_SPIN_SPEED = 6; // radians per second (6 is about one turn per second)
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fanRotors = [];
let chairPivot = null;
let loopTime = 0;
let lastLoopStamp = null;

function setupLoopingAnimations(root) {
	root.updateMatrixWorld(true);

	// Chair: the seat, cushion, back and back post are separate objects, so group them under one
	// pivot at the seat's centre. The wheeled base is left out, so it stays still on the rug.
	const seat = root.getObjectByName("Chair_Seat");
	if (seat) {
		const centre = new THREE.Box3().setFromObject(seat).getCenter(new THREE.Vector3());
		chairPivot = new THREE.Group();
		chairPivot.name = "Chair_Pivot";
		chairPivot.position.set(centre.x, 0, centre.z);
		root.add(chairPivot);
		chairPivot.updateMatrixWorld(true);
		for (const name of ["Chair_Seat", "Chair_Seat_Cushion", "Chair_Back", "Chair_Back_Post"]) {
			const part = root.getObjectByName(name);
			if (part) chairPivot.attach(part);
		}
	}

	// PC fans: each rotor (hub and blades) is its own object. Spin it about its thinnest local axis.
	for (const name of ["PC_Fan_Hub_A", "PC_Fan_Hub_B", "PC_Fan_Hub_C"]) {
		const rotor = root.getObjectByName(name);
		if (!rotor || !rotor.isMesh) continue;
		rotor.geometry.computeBoundingBox();
		const size = rotor.geometry.boundingBox.getSize(new THREE.Vector3());
		const axis = new THREE.Vector3(1, 0, 0);
		if (size.y <= size.x && size.y <= size.z) axis.set(0, 1, 0);
		else if (size.z <= size.x && size.z <= size.y) axis.set(0, 0, 1);
		fanRotors.push({ object: rotor, axis });
	}
}

function updateLoopingAnimations() {
	if (reduceMotion) return;
	const now = performance.now();
	const delta = lastLoopStamp === null ? 0 : Math.min((now - lastLoopStamp) / 1000, 0.1);
	lastLoopStamp = now;
	loopTime += delta;
	if (chairPivot) chairPivot.rotation.y = Math.sin(loopTime * CHAIR_SWAY_SPEED) * CHAIR_SWAY_ANGLE;
	for (const rotor of fanRotors) rotor.object.rotateOnAxis(rotor.axis, FAN_SPIN_SPEED * delta);
}

loader.load("/models/Room_Portfolio.glb", (gltf) => {
	// Collect signs, frames, and logo aliases after the Draco model loads.
	gltf.scene.traverse((object) => {
		if (interactiveNames.includes(object.name)) {
			object.userData.originalScale = object.scale.clone();
			object.userData.originalPosition = object.position.clone();
			object.userData.hoverScale = SIGN_HOVER_SCALE;
			object.userData.hoverOffset = new THREE.Vector3();
			interactiveObjects.push(object);
			interactiveByName.set(object.name, object);
			raycastObjects.push(object);
		}
		if (Object.hasOwn(logoToFrame, object.name)) {
			logoByName.set(object.name, object);
			raycastObjects.push(object);
		}
	});
	gltf.scene.updateMatrixWorld(true);
	// Signs: pop forward off the post as they grow, so a grown sign sits in front of its neighbours.
	for (const object of interactiveObjects) {
		if (!object.name.startsWith("sign_")) continue;
		object.userData.hoverOffset = worldOffsetToLocal(object, new THREE.Vector3(SIGN_HOVER_FORWARD, 0, 0));
	}
	// Picture frames: make each logo a child of its frame so they grow together, and
	// lift the frame as it grows so its bottom edge stays on the shelf instead of sinking into it.
	for (const [logoName, frameName] of Object.entries(logoToFrame)) {
		const frame = interactiveByName.get(frameName);
		const logo = logoByName.get(logoName);
		if (!frame) continue;
		const box = new THREE.Box3().setFromObject(frame);
		const lift = (frame.getWorldPosition(new THREE.Vector3()).y - box.min.y) * (FRAME_HOVER_SCALE - 1);
		frame.userData.hoverScale = FRAME_HOVER_SCALE;
		frame.userData.hoverOffset = worldOffsetToLocal(frame, new THREE.Vector3(FRAME_HOVER_FORWARD, lift, 0));
		if (logo) frame.attach(logo);
	}
	fixBenchLightLeak(gltf.scene);
	setupBackdrop(gltf.scene);
	setupLoopingAnimations(gltf.scene);
	setupHoverProps(gltf.scene);
	modelRoot = gltf.scene;
	scene.add(gltf.scene);
});

window.addEventListener("resize", () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
	// Always update, so the camera is already aimed at the target behind the loading screen.
	controls.update();
	if (experienceStarted && !modalIsOpen) {
		currentHit = pickInteractiveObject();
		setHoveredObject(currentHit);
		canvas.style.cursor = isClickable(currentHit) ? "pointer" : "default";
	}
	updateLoopingAnimations();
	renderer.render(scene, camera);
});
