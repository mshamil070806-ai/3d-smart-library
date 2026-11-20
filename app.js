/**
 * 3D Smart Library - Three.js Web Application
 * Handles 3D rendering, procedural books, dynamic canvas spine textures,
 * GSAP camera flight walkthrough, book elevation & inspection, and admin panel.
 */

// Global State
const state = {
  books: [],
  categories: [],
  shelves: [],
  shelfMap: {}, // key: shelf_name
  activeCategory: 'all',
  focusedBookMesh: null,
  inspectedShelf: null,
  isNavigating: false,
  originalBookTransform: null,
  roomArchitecture: {
    leftWall: null,
    rightWall: null,
    floor: null,
    backWall: null,
    frontLeftWall: null,
    frontRightWall: null,
    wallDistance: 0.80
  }
};

// Scene, Camera, Renderer, Controls
let scene, camera, renderer, controls;
let raycaster, mouse;
let booksGroup, categorySignsGroup, shelvesInteractionGroup;
let ambientLight, dirLight, aisleLights = [];

// Audio Synthesizer (Zero asset dependency)
class SoundFX {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
  }
  playSwoosh() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320, this.ctx.currentTime + 0.35);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.45);
  }
  playSlide() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(160, this.ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
  playClick() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.09);
  }
  playSuccess() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, this.ctx.currentTime);
    osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
}
const sfx = new SoundFX();

// Safe DOM Event Listener helper (Prevents any TypeError if an element is missing)
function addSafeListener(id, event, handler) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener(event, handler);
    return true;
  }
  return false;
}

// ==========================================================================
// Initialization
// ==========================================================================
async function init() {
  console.log('3D Smart Library initializing...');
  try {
    initThree();
  } catch (err) {
    console.error('initThree error:', err);
  }

  try {
    setupEventListeners();
  } catch (err) {
    console.error('setupEventListeners error:', err);
  }

  try {
    await loadLayoutAndBooks();
  } catch (err) {
    console.error('loadLayoutAndBooks error:', err);
  }

  try {
    loadLibraryModel();
  } catch (err) {
    console.error('loadLibraryModel error:', err);
  }

  try {
    animate();
  } catch (err) {
    console.error('animate error:', err);
  }
}

function initThree() {
  const container = document.getElementById('canvas-container');
  
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#141722');
  scene.fog = new THREE.FogExp2('#141722', 0.005);

  // Camera - Positioned just inside library entrance for magnificent hall perspective
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 80);
  camera.position.set(0, 1.55, 6.2);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 + 0.02; // Don't go below floor
  controls.minDistance = 0.4;
  controls.maxDistance = 22;
  controls.target.set(0, 1.25, 0); // Focus into center of library
  controls.update();

  // Group to hold all dynamic 3D books
  booksGroup = new THREE.Group();
  booksGroup.name = 'BooksGroup';
  scene.add(booksGroup);

  // Group to hold 3D floating illuminated category signs
  categorySignsGroup = new THREE.Group();
  categorySignsGroup.name = 'CategorySignsGroup';
  scene.add(categorySignsGroup);

  // Group for shelf direct click interactions
  shelvesInteractionGroup = new THREE.Group();
  shelvesInteractionGroup.name = 'ShelvesInteractionGroup';
  scene.add(shelvesInteractionGroup);

  // Architectural modern ceiling with LED light panels
  createArchitecturalCeiling();

  // Lighting
  setupLighting();

  // Raycaster for clicking books in 3D
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('click', onCanvasClick);
}

function createArchitecturalCeiling() {
  const ceilingGroup = new THREE.Group();
  ceilingGroup.name = 'CeilingGroup';

  // Base acoustic architectural ceiling slab resting flush on top of 2.64m walls
  const ceilingGeo = new THREE.BoxGeometry(13.6, 0.08, 15.2);
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x1f2430, // Clean deep modern architectural ceiling
    roughness: 0.8,
    metalness: 0.1
  });
  const ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
  ceilingMesh.position.set(0, 2.68, 0);
  ceilingMesh.receiveShadow = true;
  ceilingGroup.add(ceilingMesh);

  // Modern linear architectural LED light panels (emissive glow)
  const lightTrackMat = new THREE.MeshBasicMaterial({ color: 0xfffaed });

  // Center corridor light strip
  const centerTrackGeo = new THREE.BoxGeometry(0.35, 0.02, 13.5);
  const centerTrack = new THREE.Mesh(centerTrackGeo, lightTrackMat);
  centerTrack.position.set(0, 2.635, 0);
  ceilingGroup.add(centerTrack);

  // Left aisle light strip (X = -3.8)
  const leftTrackGeo = new THREE.BoxGeometry(0.25, 0.02, 13.0);
  const leftTrack = new THREE.Mesh(leftTrackGeo, lightTrackMat);
  leftTrack.position.set(-3.8, 2.635, 0);
  ceilingGroup.add(leftTrack);

  // Right aisle light strip (X = 3.8)
  const rightTrackGeo = new THREE.BoxGeometry(0.25, 0.02, 13.0);
  const rightTrack = new THREE.Mesh(rightTrackGeo, lightTrackMat);
  rightTrack.position.set(3.8, 2.635, 0);
  ceilingGroup.add(rightTrack);

  scene.add(ceilingGroup);
  state.roomArchitecture.ceiling = ceilingMesh;
}

function setupLighting() {
  // Soft natural sky-ground gradient illumination
  const hemiLight = new THREE.HemisphereLight(0xfff7ee, 0x242a38, 1.3);
  hemiLight.position.set(0, 8, 0);
  scene.add(hemiLight);

  // Soft warm ambient library light
  ambientLight = new THREE.AmbientLight(0xfff5eb, 0.65);
  scene.add(ambientLight);

  // Main directional light
  dirLight = new THREE.DirectionalLight(0xfffaea, 1.1);
  dirLight.position.set(3, 7, 4);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 25;
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);

  // Central corridor lighting fixtures along the ceiling
  const zPositions = [5.2, 2.6, 0.0, -2.6, -5.2];
  zPositions.forEach(z => {
    const pLight = new THREE.PointLight(0xfff1dc, 1.25, 8.5);
    pLight.position.set(0, 2.45, z);
    scene.add(pLight);
  });

  // Left aisle downlights
  [-4.0, 0.0, 4.0].forEach(z => {
    const pLight = new THREE.PointLight(0xffeed8, 0.95, 6.5);
    pLight.position.set(-3.8, 2.45, z);
    scene.add(pLight);
  });

  // Right aisle downlights
  [-4.0, 0.0, 4.0].forEach(z => {
    const pLight = new THREE.PointLight(0xffeed8, 0.95, 6.5);
    pLight.position.set(3.8, 2.45, z);
    scene.add(pLight);
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================================================
// Data Loading: Categories, Shelves Layout, Books
// ==========================================================================
async function loadLayoutAndBooks() {
  try {
    let layoutData;
    try {
      const layoutRes = await fetch('/api/layout');
      if (layoutRes.ok) layoutData = await layoutRes.json();
    } catch (e) {}

    if (!layoutData || !layoutData.categories) {
      const localRes = await fetch('library_layout.json');
      layoutData = await localRes.json();
    }

    state.categories = layoutData.categories || [];
    state.shelves = layoutData.shelves || [];

    // Index shelves
    layoutData.shelves.forEach(s => {
      state.shelfMap[s.name] = s;
    });

    setupShelfInteractionBoxes();
    rebuild3DCategorySigns();
    renderCategoryPills();
    populateCategorySelect();
    populateAssignRowSelect();
    renderShelvesTable();

    // Load Books from backend API or fallback to books.json / localStorage
    let loadedBooks = [];
    try {
      const booksRes = await fetch('/api/books');
      if (booksRes.ok) {
        loadedBooks = await booksRes.json();
      }
    } catch (e) {
      console.warn('Backend API unavailable, loading books.json directly');
      const localRes = await fetch('books.json');
      loadedBooks = await localRes.json();
    }

    state.books = loadedBooks || [];
    updateTotalBooksBadge();
  } catch (err) {
    console.error('Failed to load library layout or books:', err);
  }
}

// ==========================================================================
// Load 3D Library Room Model (.GLB)
// ==========================================================================
function loadLibraryModel() {
  const loader = new THREE.GLTFLoader();
  const progressBar = document.getElementById('progress-bar');
  const loadingStatus = document.getElementById('loading-status');

  const hideLoading = () => {
    const screen = document.getElementById('loading-screen');
    if (screen && !screen.classList.contains('hidden')) {
      screen.classList.add('hidden');
    }
  };

  // Safety fallback: Ensure loading screen NEVER stays stuck forever
  setTimeout(hideLoading, 5000);

  loader.load(
    'library.glb',
    (gltf) => {
      try {
        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Material polish
            if (child.material) {
              child.material.roughness = 0.45;
              child.material.metalness = 0.1;
            }

            // Room Floor: Elegant warm polished library floor
            if (child.name === 'Mesh_518') {
              state.roomArchitecture.floor = child;
              child.material = new THREE.MeshStandardMaterial({
                color: 0x3a4253, // Polished deep architectural slate floor
                roughness: 0.35,
                metalness: 0.2
              });
            }

            // Room Walls: Soft warm architectural off-white
            if (['Mesh_519', 'Mesh_520', 'Mesh_521', 'Mesh_522', 'Mesh_523'].includes(child.name)) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0xdde2ee,
                roughness: 0.75,
                metalness: 0.05
              });
            }

            // Catalog room architecture meshes for dynamic wall distance scaling
            if (child.name === 'Mesh_520') state.roomArchitecture.leftWall = child;
            if (child.name === 'Mesh_521') state.roomArchitecture.rightWall = child;
            if (child.name === 'Mesh_519') state.roomArchitecture.backWall = child;
            if (child.name === 'Mesh_522') state.roomArchitecture.frontLeftWall = child;
            if (child.name === 'Mesh_523') state.roomArchitecture.frontRightWall = child;
          }
        });

        // Ensure half shelf (Right_Row3_Shelf2) is straight and flush with Shelf 1 and Shelf 3
        const halfShelf = model.getObjectByName('Right_Row3_Shelf2_HALF_SHELF_1Bay_5Rows');
        if (halfShelf) {
          halfShelf.position.z = -3.101; // Perfectly straight alignment with Row 3
        }

        scene.add(model);
        console.log('3D Library GLB loaded successfully!');

        // Apply initial room wall distance (from localStorage or recommended 0.80m)
        const savedDist = parseFloat(localStorage.getItem('smart_library_wall_distance')) || 0.80;
        updateWallDistance(savedDist, false);

        // Populate 3D books on the shelves
        rebuildAll3DBooks();
      } catch (err) {
        console.error('Error during library model post-processing:', err);
      } finally {
        setTimeout(hideLoading, 400);
      }
    },
    (xhr) => {
      if (xhr.lengthComputable) {
        const pct = Math.round((xhr.loaded / xhr.total) * 100);
        if (progressBar) progressBar.style.width = pct + '%';
        if (loadingStatus) loadingStatus.textContent = `ലൈബ്രറി മോഡൽ ലോഡ് ചെയ്യുന്നു (${pct}%)...`;
      }
    },
    (err) => {
      console.error('Error loading library.glb:', err);
      if (loadingStatus) loadingStatus.textContent = 'മോഡൽ ലോഡ് ചെയ്യുന്നതിൽ പിശക് സംഭവിച്ചു.';
      setTimeout(hideLoading, 1500);
    }
  );
}

// ==========================================================================
// Dynamic Room & Wall Spacing Controller
// ==========================================================================
function updateWallDistance(distanceInMeters, persist = true) {
  const dist = Math.max(0.088, Math.min(5.0, parseFloat(distanceInMeters) || 0.80));
  state.roomArchitecture.wallDistance = dist;

  const wallX = 6.642 + dist;
  const scaleRatio = wallX / 6.73;
  const newFrontWidth = wallX - 0.75;
  const frontScale = newFrontWidth / 5.98;

  const { leftWall, rightWall, floor, backWall, frontLeftWall, frontRightWall, ceiling } = state.roomArchitecture;

  if (leftWall) leftWall.position.x = -wallX;
  if (rightWall) rightWall.position.x = wallX;
  if (floor) floor.scale.x = scaleRatio;
  if (ceiling) ceiling.scale.x = scaleRatio;
  if (backWall) backWall.scale.x = scaleRatio;
  if (frontLeftWall) {
    frontLeftWall.scale.x = frontScale;
    frontLeftWall.position.x = -0.75 - newFrontWidth / 2;
  }
  if (frontRightWall) {
    frontRightWall.scale.x = frontScale;
    frontRightWall.position.x = 0.75 + newFrontWidth / 2;
  }

  // Update UI display if slider / badge exists
  const slider = document.getElementById('wall-distance-slider');
  const valueDisplay = document.getElementById('wall-distance-value');
  if (slider) slider.value = dist;
  if (valueDisplay) {
    const cm = Math.round(dist * 100);
    valueDisplay.textContent = dist >= 1.0 ? `${dist.toFixed(2)} m (${cm} cm)` : `${cm} cm`;
  }

  // Highlight active preset button if matched
  document.querySelectorAll('.preset-dist-btn').forEach(btn => {
    const bDist = parseFloat(btn.dataset.dist);
    if (Math.abs(bDist - dist) < 0.03) {
      btn.style.borderColor = '#3b82f6';
      btn.style.color = '#38bdf8';
      btn.style.background = 'rgba(59, 130, 246, 0.2)';
    } else {
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.style.background = '';
    }
  });

  if (persist) {
    localStorage.setItem('smart_library_wall_distance', dist.toString());
  }
}

// ==========================================================================
// Procedural 3D Books & Dynamic Canvas Texture Generation
// ==========================================================================

/**
 * Creates dynamic high-res textures for Book Spine & Cover
 * Draws title, author, barcode, and decorative lines on an HTML5 Canvas!
 */
function createBookTextures(book) {
  // Spine Canvas (width 128, height 512)
  const spineCanvas = document.createElement('canvas');
  spineCanvas.width = 128;
  spineCanvas.height = 512;
  const sCtx = spineCanvas.getContext('2d');

  // Background
  const baseColor = book.color || '#1e3a8a';
  sCtx.fillStyle = baseColor;
  sCtx.fillRect(0, 0, 128, 512);

  // Subtle gradient shading for 3D curvature look
  const grad = sCtx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.4)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.15)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.5)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 512);

  // Decorative gold stripes at top and bottom
  sCtx.fillStyle = '#d4af37';
  sCtx.fillRect(8, 20, 112, 3);
  sCtx.fillRect(8, 26, 112, 1);
  sCtx.fillRect(8, 480, 112, 1);
  sCtx.fillRect(8, 484, 112, 3);

  // Title on Spine (Rotated 90 degrees vertically)
  sCtx.save();
  sCtx.translate(64, 240);
  sCtx.rotate(Math.PI / 2);
  sCtx.textAlign = 'center';
  sCtx.fillStyle = '#ffffff';
  sCtx.font = 'bold 24px "Noto Sans Malayalam", "Manrope", sans-serif';
  // truncate if very long
  const displayTitle = book.title.length > 20 ? book.title.substring(0, 18) + '..' : book.title;
  sCtx.fillText(displayTitle, 0, 6);
  sCtx.restore();

  // Author on Spine
  sCtx.save();
  sCtx.translate(64, 380);
  sCtx.rotate(Math.PI / 2);
  sCtx.textAlign = 'center';
  sCtx.fillStyle = '#cbd5e1';
  sCtx.font = '16px "Noto Sans Malayalam", "Manrope", sans-serif';
  const displayAuthor = book.author.length > 16 ? book.author.substring(0, 14) + '..' : book.author;
  sCtx.fillText(displayAuthor, 0, 4);
  sCtx.restore();

  // Draw Barcode on Bottom of Spine
  drawBarcodeOnCanvas(sCtx, book.barcode || '1234567890123', 14, 420, 100, 36);

  const spineTexture = new THREE.CanvasTexture(spineCanvas);
  spineTexture.encoding = THREE.sRGBEncoding;

  // Front Cover Canvas (width 512, height 512)
  const coverCanvas = document.createElement('canvas');
  coverCanvas.width = 512;
  coverCanvas.height = 512;
  const cCtx = coverCanvas.getContext('2d');

  cCtx.fillStyle = baseColor;
  cCtx.fillRect(0, 0, 512, 512);

  // Inner border
  cCtx.strokeStyle = '#d4af37';
  cCtx.lineWidth = 4;
  cCtx.strokeRect(24, 24, 464, 464);
  cCtx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
  cCtx.lineWidth = 1;
  cCtx.strokeRect(32, 32, 448, 448);

  // Book Title on Front Cover
  cCtx.textAlign = 'center';
  cCtx.fillStyle = '#ffffff';
  cCtx.font = 'bold 36px "Noto Sans Malayalam", "Manrope", sans-serif';
  wrapText(cCtx, book.title, 256, 150, 420, 46);

  // Author on Front Cover
  cCtx.fillStyle = '#e2e8f0';
  cCtx.font = '24px "Noto Sans Malayalam", "Manrope", sans-serif';
  cCtx.fillText(book.author, 256, 320);

  // Category Tag
  const catObj = state.categories.find(c => c.id === book.category);
  const catName = catObj ? catObj.name.split(' ')[0] : book.category;
  cCtx.fillStyle = '#d4af37';
  cCtx.font = 'bold 18px "Manrope", sans-serif';
  cCtx.fillText(`[ ${catName.toUpperCase()} ]`, 256, 380);

  // Barcode on Front Cover Bottom
  drawBarcodeOnCanvas(cCtx, book.barcode || '1234567890123', 156, 420, 200, 45);

  const coverTexture = new THREE.CanvasTexture(coverCanvas);
  coverTexture.encoding = THREE.sRGBEncoding;

  return { spineTexture, coverTexture };
}

/**
 * Draws realistic barcode lines on canvas
 */
function drawBarcodeOnCanvas(ctx, code, x, y, width, height) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 2, y - 2, width + 4, height + 4);

  ctx.fillStyle = '#000000';
  let curX = x + 4;
  const barWidth = (width - 8) / (code.length * 2.8);

  for (let i = 0; i < code.length; i++) {
    const charCode = code.charCodeAt(i);
    const pattern = (charCode % 4) + 1;
    ctx.fillRect(curX, y, barWidth * pattern, height - 10);
    curX += barWidth * (pattern + 1);
  }

  // Barcode text below lines
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(code, x + width / 2, y + height);
  ctx.restore();
}

/**
 * Helper to wrap long Malayalam or English titles on cover canvas
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let curY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, curY);
      line = words[n] + ' ';
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, curY);
}

/**
 * Creates single 3D Book Mesh with box geometry and materials
 */
function createBook3DMesh(book, slot) {
  // Dimensions: 3.8cm wide spine, 24cm tall, 18cm deep
  const bookWidth = 0.038;
  const bookHeight = 0.24;
  const bookDepth = 0.18;

  const geometry = new THREE.BoxGeometry(bookWidth, bookHeight, bookDepth);

  const { spineTexture, coverTexture } = createBookTextures(book);

  // Paper edge material
  const pagesMat = new THREE.MeshStandardMaterial({
    color: 0xf5f0e6,
    roughness: 0.9,
    metalness: 0.05
  });

  const spineMat = new THREE.MeshStandardMaterial({
    map: spineTexture,
    roughness: 0.35,
    metalness: 0.1
  });

  const coverMat = new THREE.MeshStandardMaterial({
    map: coverTexture,
    roughness: 0.35,
    metalness: 0.1
  });

  // Materials for BoxGeometry: [Right(+X), Left(-X), Top(+Y), Bottom(-Y), Front(+Z: Spine facing aisle), Back(-Z: Pages inside)]
  const materials = [
    coverMat, // +X: Right side cover
    coverMat, // -X: Left side cover (Front Cover with title & author)
    pagesMat, // +Y: Top paper pages
    pagesMat, // -Y: Bottom paper pages
    spineMat, // +Z: SPINE (Points directly into aisle towards the viewer!)
    pagesMat  // -Z: Inner page edges (inside back of shelf)
  ];

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Set position & rotation from slot
  mesh.position.set(slot.position.x, slot.position.y, slot.position.z);
  mesh.rotation.set(slot.rotation.x, slot.rotation.y, slot.rotation.z);

  // Store metadata
  mesh.userData = {
    isBook: true,
    book: book,
    slot: slot,
    originalPosition: mesh.position.clone(),
    originalRotation: mesh.rotation.clone()
  };

  return mesh;
}

// ==========================================================================
// Sequential Shelf Placement Algorithm (Middle First -> Downwards -> Upwards)
// ==========================================================================
/**
 * Places books in their respective category shelves.
 * Rules:
 * 1. Books rest flat on the shelf plank with their back resting against the horizontal metal rods (കമ്പി) in the middle.
 * 2. Filling starts at the MIDDLE rack (Rack 3 - Level 3).
 *    When middle is full -> goes DOWNWARDS (Rack 2 -> Rack 1).
 *    When bottom is full -> goes UPWARDS (Rack 4 -> Rack 5).
 * 3. Each rack has 2 bays (Bay 1 Left, Bay 2 Right) separated by center divider post.
 * 4. Supports custom placement (customRack, customBay, customSlot) per book!
 */
function getRackName(rackNum) {
  const names = {
    1: 'റാക്ക് 1 (ഏറ്റവും താഴെ)',
    2: 'റാക്ക് 2 (താഴത്തെ നടുവിൽ)',
    3: 'റാക്ക് 3 (നടുവിലെ റാക്ക്)',
    4: 'റാക്ക് 4 (മുകളിലെ നടുവിൽ)',
    5: 'റാക്ക് 5 (ഏറ്റവും മുകളിൽ)'
  };
  return names[rackNum] || `റാക്ക് ${rackNum}`;
}

function getShelfFaceCategory(shelf, face = 'front') {
  if (shelf.category_mode === 'split') {
    return face === 'back' ? (shelf.category_back || shelf.category) : (shelf.category_front || shelf.category);
  }
  if (shelf.category) return shelf.category;
  const cat = state.categories.find(c => c.side === shelf.side && c.rows && c.rows.includes(shelf.row));
  return cat ? cat.id : null;
}

function computeShelfSlotCoordinates(targetShelf, rackNum, bayNum, slotInBay, face = 'front') {
  // Center Y heights for 0.24m tall book resting on wooden planks
  const rackLevels = {
    1: 0.202, // Bottom rack (Plank at 0.082)
    2: 0.585, // Lower middle (Plank at 0.465)
    3: 0.965, // Exact Middle rack! (Plank at 0.845)
    4: 1.344, // Upper middle (Plank at 1.224)
    5: 1.724  // Top rack (Plank at 1.604)
  };

  const levelY = (rackLevels[rackNum] || 0.965) + (targetShelf.is_half ? 0.055 : 0);
  const shelfBaseX = targetShelf.three_pos[0];
  const shelfBaseY = targetShelf.three_pos[1];
  const shelfBaseZ = targetShelf.three_pos[2];

  // X offset: For half shelf (1 bay: -0.36 to +0.36), for full shelf (Bay 1: -0.74 to -0.10, Bay 2: +0.12 to +0.76)
  const bookWidth = 0.044; // 3.8cm book + 0.6cm gap
  let offsetX = 0;
  if (targetShelf.is_half) {
    offsetX = -0.36 + (slotInBay - 1) * bookWidth;
  } else if (bayNum === 1) {
    offsetX = -0.74 + (slotInBay - 1) * bookWidth;
  } else {
    offsetX = 0.12 + (slotInBay - 1) * bookWidth;
  }

  // Z position: Both full shelves and half shelves have their center at Z = -3.101 for Row 3, or shelfBaseZ + 0.279 for other full shelves
  const isBack = face === 'back';
  const centerZ = targetShelf.is_half ? shelfBaseZ : (shelfBaseZ + 0.279);
  const zPos = isBack ? (centerZ - 0.140) : (centerZ + 0.140);

  return {
    position: new THREE.Vector3(shelfBaseX + offsetX, shelfBaseY + levelY, zPos),
    rotation: new THREE.Euler(0, isBack ? Math.PI : 0, 0), // Front spine faces +Z (0), Back spine faces -Z (Math.PI)
    face: face
  };
}

function rebuildAll3DBooks() {
  // Clear existing books from 3D scene
  while (booksGroup.children.length > 0) {
    const obj = booksGroup.children[0];
    booksGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (Array.isArray(obj.material)) {
      obj.material.forEach(m => m.dispose());
    }
  }

  // Group books by category
  const booksByCategory = {};
  state.categories.forEach(cat => {
    booksByCategory[cat.id] = [];
  });
  state.books.forEach(book => {
    const cat = book.category || 'novels';
    if (!booksByCategory[cat]) booksByCategory[cat] = [];
    booksByCategory[cat].push(book);
  });

  // Rack filling order requested: Middle (3) -> Downwards (2, 1) -> Upwards (4, 5)
  const rackFillOrder = [3, 2, 1, 4, 5];
  const slotsPerBay = 14;

  // For each category, assign books to that category's shelves (supporting double-sided Front & Back)
  state.categories.forEach(cat => {
    // Find all shelf faces assigned to this category (supporting single or split front/back)
    const catFaces = [];
    state.shelves.forEach(s => {
      if (getShelfFaceCategory(s, 'front') === cat.id) {
        catFaces.push({ shelf: s, face: 'front' });
      }
      if (getShelfFaceCategory(s, 'back') === cat.id) {
        catFaces.push({ shelf: s, face: 'back' });
      }
    });

    if (catFaces.length === 0) return;

    const booksInCat = booksByCategory[cat.id] || [];
    let autoIndex = 0;

    // Track occupied slots to prevent collisions: key = `${shelfName}_${face}_${rack}_${bay}_${slot}`
    const occupied = new Set();

    // 1. First pass: Reserve custom-placed books
    booksInCat.forEach(book => {
      if (book.customRack) {
        const face = book.customFace || 'front';
        const shelfName = book.customShelf || catFaces[0].shelf.name;
        const rack = parseInt(book.customRack) || 3;
        const bay = parseInt(book.customBay) || 1;
        const slot = parseInt(book.customSlot) || 1;
        occupied.add(`${shelfName}_${face}_${rack}_${bay}_${slot}`);
      }
    });

    // 2. Second pass: Place all books
    booksInCat.forEach((book) => {
      let targetFaceObj = catFaces[0];
      let rackNum = 3;
      let bayNum = 1;
      let slotInBay = 1;
      let face = 'front';

      if (book.customRack) {
        // User customized position
        face = book.customFace || 'front';
        const customShelf = state.shelves.find(s => s.name === book.customShelf);
        targetFaceObj = {
          shelf: customShelf || catFaces[0].shelf,
          face: face
        };
        rackNum = parseInt(book.customRack) || 3;
        bayNum = parseInt(book.customBay) || 1;
        slotInBay = parseInt(book.customSlot) || 1;
      } else {
        // Auto sequence: Middle (3) -> Lower (2) -> Bottom (1) -> Upper (4) -> Top (5)
        // Find next unoccupied slot across available shelf faces
        let found = false;
        while (!found) {
          const slotsPerFace = 140; // 5 racks * 28 slots per full shelf face
          const faceIdx = Math.floor(autoIndex / slotsPerFace) % catFaces.length;
          targetFaceObj = catFaces[faceIdx];
          face = targetFaceObj.face;
          const targetShelf = targetFaceObj.shelf;

          const slotInFace = autoIndex % slotsPerFace;
          const rackStep = Math.floor(slotInFace / (slotsPerBay * 2)); // 0 to 4
          rackNum = rackFillOrder[rackStep % rackFillOrder.length];

          const slotInRack = slotInFace % (slotsPerBay * 2);
          bayNum = targetShelf.is_half ? 1 : (slotInRack < slotsPerBay ? 1 : 2);
          slotInBay = (slotInRack % slotsPerBay) + 1;

          const key = `${targetShelf.name}_${face}_${rackNum}_${bayNum}_${slotInBay}`;
          if (!occupied.has(key)) {
            occupied.add(key);
            found = true;
          }
          autoIndex++;
        }
      }

      const targetShelf = targetFaceObj.shelf;
      const coords = computeShelfSlotCoordinates(targetShelf, rackNum, bayNum, slotInBay, face);

      const slot = {
        shelfName: targetShelf.name,
        row: targetShelf.row,
        shelfNumber: targetShelf.shelf,
        face: face,
        faceName: face === 'front' ? 'മുൻവശം (Front)' : 'പിൻവശം (Back)',
        rack: rackNum,
        rackName: getRackName(rackNum),
        bay: bayNum,
        bayName: bayNum === 1 ? 'ഇടതുഭാഗം (Bay 1)' : 'വലതുഭാഗം (Bay 2)',
        slotInBay: slotInBay,
        side: targetShelf.side,
        category: cat.name,
        position: coords.position,
        rotation: coords.rotation
      };

      const bookMesh = createBook3DMesh(book, slot);
      booksGroup.add(bookMesh);
    });
  });

  console.log(`Placed ${booksGroup.children.length} books in double-sided shelves (Middle rack first)!`);
}

// ==========================================================================
// Camera Flight Walkthrough & Book Lift Animation
// ==========================================================================
/**
 * Smoothly flies camera from door/current position, down the central corridor,
 * turns into the row, focuses right in front of the book,
 * and makes the book glide forward and rotate to face the user!
 */
function focusOnBook(bookMesh) {
  if (state.isNavigating) return;
  state.isNavigating = true;

  // If a book was previously inspected, put it back first
  if (state.focusedBookMesh && state.focusedBookMesh !== bookMesh) {
    putBackBook(false);
  }

  sfx.playSwoosh();
  const bookData = bookMesh.userData.book;
  const slotData = bookMesh.userData.slot;

  // Show status banner
  const banner = document.getElementById('nav-banner');
  const navTitle = document.getElementById('nav-target-title');
  const navCoords = document.getElementById('nav-target-coords');
  const isBack = slotData.face === 'back' || (bookMesh.rotation && Math.abs(bookMesh.rotation.y) > 1.5);
  const faceMalayalam = isBack ? 'പിൻവശം (Back Face)' : 'മുൻവശം (Front Face)';

  navTitle.textContent = `${bookData.title}`;
  navCoords.textContent = `${slotData.side === 'left' ? 'ഇടതുഭാഗം' : 'വലതുഭാഗം'} • Row ${slotData.row} • ${faceMalayalam} • ${slotData.rackName} ലേക്ക് ക്യാമറ നീങ്ങുന്നു...`;
  banner.style.display = 'flex';

  // Target book world position
  const targetPos = bookMesh.userData.originalPosition.clone();
  
  // Camera waypoint path:
  // If Front book (+Z): approach from front aisle at Z = targetPos.z + 1.25
  // If Back book (-Z): approach from back aisle at Z = targetPos.z - 1.25
  const zSign = isBack ? -1 : +1;
  const corridorZ = targetPos.z + zSign * 1.20;
  const aisleCameraPos = new THREE.Vector3(
    targetPos.x, 
    Math.max(targetPos.y, 1.25), 
    targetPos.z + zSign * 1.25
  );

  const lookAtTarget = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);

  // Disable controls during flight
  controls.enabled = false;

  const tl = gsap.timeline({
    onComplete: () => {
      state.isNavigating = false;
      banner.style.display = 'none';
      controls.enabled = true;
      controls.target.copy(lookAtTarget);

      // Trigger Book Lift & Rotation Interaction from its shelf face!
      animateBookLift(bookMesh);
    }
  });

  // Step 1: Fly along central corridor to row entrance
  tl.to(camera.position, {
    x: 0,
    y: 1.6,
    z: corridorZ,
    duration: 1.1,
    ease: 'power2.inOut',
    onUpdate: () => controls.update()
  });

  // Step 2: Turn into aisle and zoom in directly facing the rack of books from front or back
  tl.to(camera.position, {
    x: aisleCameraPos.x,
    y: aisleCameraPos.y,
    z: aisleCameraPos.z,
    duration: 1.4,
    ease: 'power2.out',
    onUpdate: () => controls.update()
  }, '-=0.1');

  // Rotate camera view smoothly towards target book
  tl.to(controls.target, {
    x: lookAtTarget.x,
    y: lookAtTarget.y,
    z: lookAtTarget.z,
    duration: 1.3,
    ease: 'power2.out'
  }, '-=1.3');
}

/**
 * Lifts book out of the shelf row, brings it forward from between its neighbors,
 * and rotates it to face directly at the user!
 */
function animateBookLift(bookMesh) {
  state.focusedBookMesh = bookMesh;
  sfx.playSlide();

  const originalPos = bookMesh.userData.originalPosition.clone();
  const originalRot = bookMesh.userData.originalRotation.clone();
  const isBack = bookMesh.userData.slot.face === 'back' || Math.abs(originalRot.y) > 1.5;
  const zSign = isBack ? -1 : +1;

  // Position book directly in front of camera
  const cameraDir = new THREE.Vector3();
  camera.getWorldDirection(cameraDir);

  const floatPos = camera.position.clone().add(cameraDir.clone().multiplyScalar(0.62));
  floatPos.y -= 0.04; // comfortable eye-level reading angle

  // Animate book:
  // Step 1: Slide forward out of shelf face into aisle (zSign * 0.16m)
  // Step 2: Elevate upward (+Y by 0.14m)
  // Step 3: Glide forward to camera lens and rotate to 3D reading view!
  gsap.timeline()
    .to(bookMesh.position, {
      z: originalPos.z + zSign * 0.16, // slide forward from front or back face into aisle
      duration: 0.35,
      ease: 'power2.out'
    })
    .to(bookMesh.position, {
      y: originalPos.y + 0.14, // elevate upwards
      duration: 0.35,
      ease: 'back.out(1.4)'
    }, '-=0.1')
    .to(bookMesh.position, {
      x: floatPos.x,
      y: floatPos.y,
      z: floatPos.z,
      duration: 0.75,
      ease: 'power3.out'
    }, '-=0.1')
    .to(bookMesh.rotation, {
      x: 0.05,
      y: camera.rotation.y + (isBack ? -0.55 : 0.55), // 3D perspective angle showing Cover & Spine
      z: 0.03,
      duration: 0.75,
      ease: 'power3.out'
    }, '-=0.75');

  // Show detailed inspect card
  showBookInspectCard(bookMesh.userData.book, bookMesh.userData.slot);
}

/**
 * Returns the currently focused book smoothly back into its shelf slot between other books
 */
function putBackBook(resetCamera = true) {
  if (!state.focusedBookMesh) return;

  const bookMesh = state.focusedBookMesh;
  const originalPos = bookMesh.userData.originalPosition;
  const originalRot = bookMesh.userData.originalRotation;
  const isBack = bookMesh.userData.slot.face === 'back' || Math.abs(originalRot.y) > 1.5;
  const zSign = isBack ? -1 : +1;

  sfx.playSlide();

  gsap.timeline({
    onComplete: () => {
      state.focusedBookMesh = null;
      hideBookInspectCard();
    }
  })
  .to(bookMesh.position, {
    x: originalPos.x,
    y: originalPos.y + 0.14,
    z: originalPos.z + zSign * 0.16, // position directly above its gap
    duration: 0.65,
    ease: 'power2.inOut'
  })
  .to(bookMesh.rotation, {
    x: originalRot.x,
    y: originalRot.y,
    z: originalRot.z,
    duration: 0.65,
    ease: 'power2.inOut'
  }, '-=0.65')
  .to(bookMesh.position, {
    y: originalPos.y, // lower down into the gap
    duration: 0.3,
    ease: 'power2.in'
  })
  .to(bookMesh.position, {
    z: originalPos.z, // slide back flush into the row!
    duration: 0.25,
    ease: 'power2.out'
  });

  if (resetCamera) {
    gsap.to(camera.position, {
      x: 0,
      y: 1.8,
      z: 7.4,
      duration: 1.6,
      ease: 'power2.inOut'
    });
    gsap.to(controls.target, {
      x: 0,
      y: 1.2,
      z: 0,
      duration: 1.6,
      ease: 'power2.inOut'
    });
  }
}

// ==========================================================================
// 3D Canvas Click Handler (Click book, shelf, or category sign)
// ==========================================================================
function onCanvasClick(event) {
  // If clicking on UI overlay, ignore
  if (event.target.closest('.top-bar, .category-bar, .modal-backdrop, .book-inspect-card, .shelf-inspect-card')) {
    return;
  }

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // 1. Check if a 3D book was clicked
  const bookIntersects = raycaster.intersectObjects(booksGroup.children);
  if (bookIntersects.length > 0) {
    const clickedMesh = bookIntersects[0].object;
    if (clickedMesh.userData && clickedMesh.userData.isBook) {
      document.getElementById('shelf-inspect-card').style.display = 'none';
      focusOnBook(clickedMesh);
      return;
    }
  }

  // 2. Check if a 3D category signboard was clicked
  if (categorySignsGroup) {
    const signIntersects = raycaster.intersectObjects(categorySignsGroup.children, true);
    if (signIntersects.length > 0) {
      const hit = signIntersects[0].object;
      const data = hit.userData || (hit.parent && hit.parent.userData);
      if (data && data.isSign) {
        sfx.playClick();
        const targetX = data.side === 'left' ? -2.2 : 2.2;
        gsap.to(camera.position, { x: 0, y: 1.6, z: data.z, duration: 1.3, ease: 'power2.inOut' });
        gsap.to(controls.target, { x: targetX, y: 1.1, z: data.z, duration: 1.5, ease: 'power2.inOut' });
        return;
      }
    }
  }

  // 3. Check if a shelf unit was clicked
  if (shelvesInteractionGroup) {
    const shelfIntersects = raycaster.intersectObjects(shelvesInteractionGroup.children);
    if (shelfIntersects.length > 0) {
      const shelfBox = shelfIntersects[0].object;
      if (shelfBox.userData && shelfBox.userData.isShelf) {
        openShelfInspectCard(shelfBox.userData.shelf);
        return;
      }
    }
  }

  // If clicked empty space, hide shelf card
  const shelfCard = document.getElementById('shelf-inspect-card');
  if (shelfCard) shelfCard.style.display = 'none';
}

// ==========================================================================
// Search & Filter System
// ==========================================================================
function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search-btn');
  const searchDropdown = document.getElementById('search-dropdown');

  // Live search input
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    clearBtn.style.display = query ? 'flex' : 'none';

    if (!query) {
      searchDropdown.style.display = 'none';
      return;
    }

    performSearch(query);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    searchDropdown.style.display = 'none';
  });

  // Close search dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-section')) {
      searchDropdown.style.display = 'none';
    }
  });

  // Camera Action Buttons
  addSafeListener('entrance-cam-btn', 'click', () => {
    sfx.playClick();
    if (state.focusedBookMesh) putBackBook(false);
    gsap.to(camera.position, { x: 0, y: 1.55, z: 6.2, duration: 1.5, ease: 'power2.inOut' });
    gsap.to(controls.target, { x: 0, y: 1.25, z: 0, duration: 1.5, ease: 'power2.inOut' });
  });

  addSafeListener('overview-cam-btn', 'click', () => {
    sfx.playClick();
    if (state.focusedBookMesh) putBackBook(false);
    gsap.to(camera.position, { x: 0, y: 8.5, z: 8.0, duration: 1.8, ease: 'power2.inOut' });
    gsap.to(controls.target, { x: 0, y: 0.5, z: 0, duration: 1.8, ease: 'power2.inOut' });
  });

  // Book Inspect Card buttons
  addSafeListener('close-inspect-btn', 'click', () => putBackBook(true));
  addSafeListener('put-back-btn', 'click', () => putBackBook(true));
  addSafeListener('issue-btn', 'click', () => {
    sfx.playClick();
    if (state.focusedBookMesh && state.focusedBookMesh.userData.book) {
      alert(`"${state.focusedBookMesh.userData.book.title}" വിജയകരമായി ഇഷ്യൂ ചെയ്തു!`);
    }
    putBackBook(true);
  });

  // Move book button from Inspect Card
  const moveBookBtn = document.getElementById('move-book-btn');
  if (moveBookBtn) {
    moveBookBtn.addEventListener('click', () => {
      sfx.playClick();
      if (state.focusedBookMesh && state.focusedBookMesh.userData.book) {
        openEditLocationModal(state.focusedBookMesh.userData.book.id);
      }
    });
  }

  // Edit Location Modal close buttons & form
  const editModal = document.getElementById('edit-location-modal');
  const closeEditModalBtn = document.getElementById('close-edit-modal-btn');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  if (closeEditModalBtn) {
    closeEditModalBtn.addEventListener('click', () => {
      if (editModal) editModal.style.display = 'none';
    });
  }
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      if (editModal) editModal.style.display = 'none';
    });
  }

  const editLocationForm = document.getElementById('edit-location-form');
  if (editLocationForm) {
    editLocationForm.addEventListener('submit', onEditLocationSubmit);
  }

  // Admin Modal Buttons
  const adminModal = document.getElementById('admin-modal');
  addSafeListener('admin-panel-btn', 'click', () => {
    sfx.playClick();
    if (adminModal) {
      adminModal.style.display = 'flex';
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const formTab = document.querySelector('.tab-btn[data-tab="form"]');
      if (formTab) formTab.classList.add('active');
      const addBookForm = document.getElementById('add-book-form');
      if (addBookForm) addBookForm.style.display = 'flex';
      const mBooksTab = document.getElementById('manage-books-tab');
      if (mBooksTab) mBooksTab.style.display = 'none';
      const sTab = document.getElementById('shelves-tab');
      if (sTab) sTab.style.display = 'none';
      if (window.lucide) lucide.createIcons();
    }
  });

  // Shelf & Category Manager button in top bar
  const shelfMgrBtn = document.getElementById('shelf-mgr-btn');
  if (shelfMgrBtn) {
    shelfMgrBtn.addEventListener('click', () => {
      sfx.playClick();
      adminModal.style.display = 'flex';
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const shelvesTabBtn = document.querySelector('.tab-btn[data-tab="shelves"]');
      if (shelvesTabBtn) shelvesTabBtn.classList.add('active');

      document.getElementById('add-book-form').style.display = 'none';
      document.getElementById('manage-books-tab').style.display = 'none';
      document.getElementById('shelves-tab').style.display = 'flex';
      renderShelvesTable();
      lucide.createIcons();
    });
  }

  addSafeListener('close-modal-btn', 'click', () => {
    if (adminModal) adminModal.style.display = 'none';
  });
  addSafeListener('cancel-add-btn', 'click', () => {
    if (adminModal) adminModal.style.display = 'none';
  });

  // Admin Modal Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sfx.playClick();
      const tab = e.currentTarget.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');

      document.getElementById('add-book-form').style.display = tab === 'form' ? 'flex' : 'none';
      document.getElementById('manage-books-tab').style.display = tab === 'manage' ? 'block' : 'none';
      document.getElementById('shelves-tab').style.display = tab === 'shelves' ? 'flex' : 'none';

      if (tab === 'manage') renderManageBooksTable();
      if (tab === 'shelves') renderShelvesTable();
      lucide.createIcons();
    });
  });

  // Add Category Modal triggers & handlers
  const openAddCatBtn = document.getElementById('open-add-cat-btn');
  if (openAddCatBtn) {
    openAddCatBtn.addEventListener('click', () => {
      sfx.playClick();
      populateAssignRowSelect();
      document.getElementById('add-category-modal').style.display = 'flex';
      lucide.createIcons();
    });
  }

  const closeAddCatBtn = document.getElementById('close-add-cat-modal-btn');
  const cancelAddCatBtn = document.getElementById('cancel-add-cat-btn');
  if (closeAddCatBtn) {
    closeAddCatBtn.addEventListener('click', () => {
      document.getElementById('add-category-modal').style.display = 'none';
    });
  }
  if (cancelAddCatBtn) {
    cancelAddCatBtn.addEventListener('click', () => {
      document.getElementById('add-category-modal').style.display = 'none';
    });
  }

  const addCatForm = document.getElementById('add-category-form');
  if (addCatForm) {
    addCatForm.addEventListener('submit', onAddCategorySubmit);
  }

  const catSideSelect = document.getElementById('cat-side');
  if (catSideSelect) {
    catSideSelect.addEventListener('change', populateAssignRowSelect);
  }

  const catColorInput = document.getElementById('cat-color');
  if (catColorInput) {
    catColorInput.addEventListener('input', (e) => {
      document.getElementById('cat-color-hex').textContent = e.target.value;
    });
  }

  // Shelf Wing Filter Buttons
  document.querySelectorAll('.shelf-wing-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sfx.playClick();
      document.querySelectorAll('.shelf-wing-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const wing = e.currentTarget.dataset.wing;
      renderShelvesTable(wing);
    });
  });

  // Shelf Direct Inspect Card buttons
  const closeShelfInspectBtn = document.getElementById('close-shelf-inspect-btn');
  if (closeShelfInspectBtn) {
    closeShelfInspectBtn.addEventListener('click', () => {
      document.getElementById('shelf-inspect-card').style.display = 'none';
      state.inspectedShelf = null;
    });
  }

  // Category mode radio toggles
  const modeSingleRadio = document.getElementById('mode-single');
  const modeSplitRadio = document.getElementById('mode-split');
  const singleCatWrap = document.getElementById('single-cat-wrap');
  const splitCatWrap = document.getElementById('split-cat-wrap');

  if (modeSingleRadio && modeSplitRadio) {
    modeSingleRadio.addEventListener('change', () => {
      if (singleCatWrap) singleCatWrap.style.display = 'block';
      if (splitCatWrap) splitCatWrap.style.display = 'none';
    });
    modeSplitRadio.addEventListener('change', () => {
      if (singleCatWrap) singleCatWrap.style.display = 'none';
      if (splitCatWrap) splitCatWrap.style.display = 'block';
    });
  }

  const shelfSaveCatBtn = document.getElementById('shelf-save-cat-btn');
  if (shelfSaveCatBtn) {
    shelfSaveCatBtn.addEventListener('click', async () => {
      if (!state.inspectedShelf) return;
      const shelf = state.inspectedShelf;
      const isSplit = modeSplitRadio && modeSplitRadio.checked;

      const singleCatId = document.getElementById('shelf-quick-cat-select').value;
      const frontCatId = document.getElementById('shelf-front-cat-select') ? document.getElementById('shelf-front-cat-select').value : singleCatId;
      const backCatId = document.getElementById('shelf-back-cat-select') ? document.getElementById('shelf-back-cat-select').value : singleCatId;

      shelf.category_mode = isSplit ? 'split' : 'single';
      shelf.category = singleCatId;
      shelf.category_front = frontCatId;
      shelf.category_back = backCatId;

      sfx.playClick();

      try {
        await fetch('/api/shelves/category', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shelfName: shelf.name,
            categoryMode: shelf.category_mode,
            categoryId: shelf.category,
            categoryFront: shelf.category_front,
            categoryBack: shelf.category_back
          })
        });
      } catch (err) {
        console.warn('Backend update failed:', err);
      }

      rebuildAll3DBooks();
      renderShelvesTable();
      document.getElementById('shelf-inspect-card').style.display = 'none';
    });
  }

  const shelfAddBookBtn = document.getElementById('shelf-add-book-btn');
  if (shelfAddBookBtn) {
    shelfAddBookBtn.addEventListener('click', () => {
      if (!state.inspectedShelf) return;
      const shelf = state.inspectedShelf;
      document.getElementById('shelf-inspect-card').style.display = 'none';
      adminModal.style.display = 'flex';
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.tab-btn[data-tab="form"]').classList.add('active');
      document.getElementById('add-book-form').style.display = 'flex';
      document.getElementById('manage-books-tab').style.display = 'none';
      document.getElementById('shelves-tab').style.display = 'none';

      if (shelf.category) {
        document.getElementById('book-category').value = shelf.category;
      }
      lucide.createIcons();
    });
  }

  // Add Book Form Submit
  document.getElementById('add-book-form').addEventListener('submit', onAddBookSubmit);

  // Color picker hex update
  document.getElementById('book-color').addEventListener('input', (e) => {
    document.getElementById('color-hex').textContent = e.target.value;
  });

  // Room & Wall Settings Modal Event Listeners
  const roomSettingsModal = document.getElementById('room-settings-modal');
  const roomSettingsBtn = document.getElementById('room-settings-btn');
  const closeRoomModalBtn = document.getElementById('close-room-modal-btn');
  const doneRoomModalBtn = document.getElementById('done-room-modal-btn');
  const wallSlider = document.getElementById('wall-distance-slider');

  if (roomSettingsBtn) {
    roomSettingsBtn.addEventListener('click', () => {
      sfx.playClick();
      if (roomSettingsModal) roomSettingsModal.style.display = 'flex';
      const curDist = state.roomArchitecture.wallDistance || 0.80;
      updateWallDistance(curDist, false);
      lucide.createIcons();
    });
  }

  if (closeRoomModalBtn) {
    closeRoomModalBtn.addEventListener('click', () => {
      if (roomSettingsModal) roomSettingsModal.style.display = 'none';
    });
  }

  if (doneRoomModalBtn) {
    doneRoomModalBtn.addEventListener('click', () => {
      sfx.playSuccess();
      if (roomSettingsModal) roomSettingsModal.style.display = 'none';
    });
  }

  if (wallSlider) {
    wallSlider.addEventListener('input', (e) => {
      updateWallDistance(parseFloat(e.target.value), true);
    });
  }

  document.querySelectorAll('.preset-dist-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sfx.playClick();
      const dist = parseFloat(e.currentTarget.dataset.dist);
      updateWallDistance(dist, true);
    });
  });
}

function performSearch(query) {
  const searchDropdown = document.getElementById('search-dropdown');
  const resultsList = document.getElementById('search-results-list');
  const resultsCount = document.getElementById('results-count');

  // Match Title, Author, Barcode, or Category
  const matches = state.books.filter(b => {
    const titleMatch = b.title.toLowerCase().includes(query);
    const authorMatch = b.author.toLowerCase().includes(query);
    const barcodeMatch = (b.barcode || '').includes(query);
    const catMatch = (b.category || '').toLowerCase().includes(query);
    return titleMatch || authorMatch || barcodeMatch || catMatch;
  });

  resultsCount.textContent = `${matches.length} ബുക്കുകൾ കണ്ടെത്തി`;

  if (matches.length === 0) {
    resultsList.innerHTML = `<div class="no-results">സാമ്യമുള്ള ബുക്കുകൾ ഒന്നും കണ്ടെത്താനായില്ല</div>`;
  } else {
    resultsList.innerHTML = matches.map(book => {
      const catObj = state.categories.find(c => c.id === book.category);
      const catLabel = catObj ? catObj.name.split(' ')[0] : book.category;
      return `
        <div class="search-item" data-id="${book.id}">
          <div class="item-spine-thumb" style="background-color: ${book.color || '#3b82f6'};"></div>
          <div class="item-info">
            <div class="item-title">${book.title}</div>
            <div class="item-meta">
              <span>${book.author}</span>
              <span class="item-badge">${book.barcode || ''}</span>
              <span class="item-badge" style="color: ${catObj ? catObj.color : '#fff'}">${catLabel}</span>
            </div>
          </div>
          <i data-lucide="arrow-right" style="width: 16px; height: 16px; color: #94a3b8;"></i>
        </div>
      `;
    }).join('');

    // Attach click events
    resultsList.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        const bookId = item.dataset.id;
        const targetMesh = booksGroup.children.find(m => m.userData.book.id === bookId);
        if (targetMesh) {
          searchDropdown.style.display = 'none';
          document.getElementById('search-input').value = '';
          document.getElementById('clear-search-btn').style.display = 'none';
          focusOnBook(targetMesh);
        }
      });
    });
  }

  searchDropdown.style.display = 'block';
  lucide.createIcons();
}

// ==========================================================================
// Category Pills Navigation & Dynamic Updates
// ==========================================================================
function renderCategoryPills() {
  const container = document.getElementById('category-pills');
  if (!container) return;

  let html = `
    <button class="pill ${state.activeCategory === 'all' ? 'active' : ''}" data-category="all">
      <i data-lucide="layers" style="width:14px;height:14px;"></i>
      <span>എല്ലാം (All)</span>
    </button>
  `;

  html += state.categories.map(cat => {
    const isActive = state.activeCategory === cat.id ? 'active' : '';
    return `
      <button class="pill ${isActive}" data-category="${cat.id}">
        <span class="cat-dot" style="width: 8px; height: 8px; border-radius: 50%; background: ${cat.color}; display: inline-block;"></span>
        <span>${cat.name}</span>
      </button>
    `;
  }).join('');

  html += `
    <button id="add-category-pill-btn" class="pill" style="border: 1px dashed rgba(99, 102, 241, 0.45); background: rgba(99, 102, 241, 0.08); color: #a5b4fc;" title="പുതിയ കാറ്റഗറി ഉണ്ടാക്കുക">
      <i data-lucide="plus" style="width:14px;height:14px;"></i>
      <span>+ കാറ്റഗറി</span>
    </button>
  `;

  container.innerHTML = html;

  // Re-attach handlers
  container.querySelectorAll('.pill[data-category]').forEach(pill => {
    pill.addEventListener('click', () => {
      sfx.playClick();
      container.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const catId = pill.dataset.category;
      state.activeCategory = catId;

      if (catId === 'all') {
        gsap.to(camera.position, { x: 0, y: 1.8, z: 7.2, duration: 1.5, ease: 'power2.inOut' });
        gsap.to(controls.target, { x: 0, y: 1.2, z: 0, duration: 1.5, ease: 'power2.inOut' });
      } else {
        const cat = state.categories.find(c => c.id === catId);
        if (cat) {
          const shelf = state.shelves.find(s => s.category === catId) || 
                        state.shelves.find(s => s.side === cat.side && cat.rows && cat.rows.includes(s.row));
          if (shelf) {
            const z = shelf.three_pos[2];
            const x = cat.side === 'left' ? -2.2 : 2.2;
            gsap.to(camera.position, { x: 0, y: 1.6, z: z, duration: 1.2, ease: 'power2.inOut' });
            gsap.to(controls.target, { x: x, y: 1.1, z: z, duration: 1.4, ease: 'power2.inOut' });
          }
        }
      }
    });
  });

  const addCatPill = document.getElementById('add-category-pill-btn');
  if (addCatPill) {
    addCatPill.addEventListener('click', () => {
      sfx.playClick();
      populateAssignRowSelect();
      document.getElementById('add-category-modal').style.display = 'flex';
      lucide.createIcons();
    });
  }

  lucide.createIcons();
}

function populateCategorySelect() {
  const select = document.getElementById('book-category');
  if (!select) return;
  select.innerHTML = state.categories.map(cat => {
    return `<option value="${cat.id}">${cat.name}</option>`;
  }).join('');
}

// ==========================================================================
// 3D Shelf Interaction Boxes & Illuminated Category Signboards
// ==========================================================================
function setupShelfInteractionBoxes() {
  if (!shelvesInteractionGroup) return;

  while (shelvesInteractionGroup.children.length > 0) {
    const obj = shelvesInteractionGroup.children[0];
    shelvesInteractionGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
  }

  state.shelves.forEach(shelf => {
    const width = shelf.is_half ? 0.98 : 1.85;
    const boxGeo = new THREE.BoxGeometry(width, 2.2, 0.65);
    const boxMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.position.set(shelf.three_pos[0], shelf.three_pos[1] + 1.1, shelf.three_pos[2] + 0.1);
    boxMesh.userData = { isShelf: true, shelf: shelf };
    shelvesInteractionGroup.add(boxMesh);
  });
}

function rebuild3DCategorySigns() {
  if (!categorySignsGroup) return;

  // Clear any existing virtual category signs from 3D scene (Disabled as per user request: "mukalilulla virtual category display venda")
  while (categorySignsGroup.children.length > 0) {
    const child = categorySignsGroup.children[0];
    categorySignsGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
  }
}

// ==========================================================================
// Shelf Direct Click Inspection
// ==========================================================================
function openShelfInspectCard(shelf) {
  state.inspectedShelf = shelf;
  sfx.playClick();

  const card = document.getElementById('shelf-inspect-card');
  const title = document.getElementById('shelf-inspect-title');
  const subtitle = document.getElementById('shelf-inspect-subtitle');
  const currentBadge = document.getElementById('shelf-current-cat-badge');
  const quickSelect = document.getElementById('shelf-quick-cat-select');
  const frontSelect = document.getElementById('shelf-front-cat-select');
  const backSelect = document.getElementById('shelf-back-cat-select');
  const countEl = document.getElementById('shelf-books-count');
  const singleRadio = document.getElementById('mode-single');
  const splitRadio = document.getElementById('mode-split');
  const singleWrap = document.getElementById('single-cat-wrap');
  const splitWrap = document.getElementById('split-cat-wrap');

  const sideLabel = shelf.side === 'left' ? 'ഇടതുഭാഗം (Left Wing)' : 'വലതുഭാഗം (Right Wing)';
  title.textContent = `${sideLabel} - Row ${shelf.row}`;
  subtitle.textContent = `ഷെൽഫ്: ${shelf.name}`;

  const isSplit = shelf.category_mode === 'split';
  if (singleRadio) singleRadio.checked = !isSplit;
  if (splitRadio) splitRadio.checked = isSplit;
  if (singleWrap) singleWrap.style.display = isSplit ? 'none' : 'block';
  if (splitWrap) splitWrap.style.display = isSplit ? 'block' : 'none';

  const defaultCat = state.categories.find(c => c.side === shelf.side && c.rows && c.rows.includes(shelf.row));
  const defaultCatId = defaultCat ? defaultCat.id : (state.categories[0] ? state.categories[0].id : '');

  const singleCatId = shelf.category || defaultCatId;
  const frontCatId = shelf.category_front || shelf.category || defaultCatId;
  const backCatId = shelf.category_back || shelf.category || defaultCatId;

  const currentCat = state.categories.find(c => c.id === singleCatId);
  const frontCat = state.categories.find(c => c.id === frontCatId);
  const backCat = state.categories.find(c => c.id === backCatId);

  if (isSplit) {
    currentBadge.textContent = `${(frontCat ? frontCat.name : '').split(' ')[0]} / ${(backCat ? backCat.name : '').split(' ')[0]}`;
    currentBadge.style.color = '#38bdf8';
    currentBadge.style.borderColor = '#38bdf8';
    currentBadge.style.background = 'rgba(56, 189, 248, 0.15)';
  } else if (currentCat) {
    currentBadge.textContent = currentCat.name.split(' ')[0];
    currentBadge.style.color = currentCat.color;
    currentBadge.style.borderColor = currentCat.color;
    currentBadge.style.background = `${currentCat.color}22`;
  } else {
    currentBadge.textContent = 'കാറ്റഗറി നിശ്ചയിച്ചിട്ടില്ല';
    currentBadge.style.color = '#fff';
    currentBadge.style.borderColor = '#666';
    currentBadge.style.background = 'transparent';
  }

  const optionsHtml = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (quickSelect) {
    quickSelect.innerHTML = optionsHtml;
    quickSelect.value = singleCatId;
  }
  if (frontSelect) {
    frontSelect.innerHTML = optionsHtml;
    frontSelect.value = frontCatId;
  }
  if (backSelect) {
    backSelect.innerHTML = optionsHtml;
    backSelect.value = backCatId;
  }

  const booksOnShelf = state.books.filter(b => {
    return b.customShelf === shelf.name || 
           (!b.customShelf && (b.category === singleCatId || (isSplit && (b.category === frontCatId || b.category === backCatId))));
  });
  countEl.textContent = `${booksOnShelf.length} പുസ്തകങ്ങൾ`;

  card.style.display = 'block';
  lucide.createIcons();
}

async function assignCategoryToShelfRow(side, row, categoryId) {
  sfx.playClick();
  const rowInt = parseInt(row, 10);

  state.shelves.forEach(s => {
    if (s.side === side && s.row === rowInt) {
      s.category = categoryId;
    }
  });

  state.categories.forEach(c => {
    if (c.side === side) {
      if (c.id === categoryId) {
        if (!c.rows) c.rows = [];
        if (!c.rows.includes(rowInt)) {
          c.rows.push(rowInt);
          c.rows.sort((a, b) => a - b);
        }
      } else {
        if (c.rows && c.rows.includes(rowInt)) {
          c.rows = c.rows.filter(r => r !== rowInt);
        }
      }
    }
  });

  try {
    await fetch('/api/shelves/category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side, row: rowInt, categoryId })
    });
  } catch (err) {
    console.warn('Backend update failed:', err);
  }

  rebuildAll3DBooks();
  rebuild3DCategorySigns();
  renderCategoryPills();
  populateCategorySelect();
  renderShelvesTable();
}

function renderShelvesTable(wingFilter = 'all') {
  const tbody = document.getElementById('shelves-tbody');
  if (!tbody) return;

  const rowMap = new Map();
  state.shelves.forEach(s => {
    const key = `${s.side}_${s.row}`;
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        side: s.side,
        row: s.row,
        shelves: [],
        z: s.three_pos[2]
      });
    }
    rowMap.get(key).shelves.push(s);
  });

  const rows = Array.from(rowMap.values()).filter(r => {
    if (wingFilter === 'all') return true;
    return r.side === wingFilter;
  });

  tbody.innerHTML = rows.map(r => {
    const sideMalayalam = r.side === 'left' ? 'ഇടതുഭാഗം' : 'വലതുഭാഗം';
    const currentCatId = r.shelves[0].category || 
      (state.categories.find(c => c.side === r.side && c.rows && c.rows.includes(r.row)) || {}).id;
    const catObj = state.categories.find(c => c.id === currentCatId);
    const catName = catObj ? catObj.name : 'നിശ്ചയിച്ചിട്ടില്ല';
    const catColor = catObj ? catObj.color : '#94a3b8';

    const bookCount = state.books.filter(b => b.category === currentCatId).length;

    const selectOptions = state.categories.map(c => {
      const isSel = c.id === currentCatId ? 'selected' : '';
      return `<option value="${c.id}" ${isSel}>${c.name}</option>`;
    }).join('');

    return `
      <tr>
        <td>
          <strong>${sideMalayalam} - Row ${r.row}</strong>
          <div style="font-size:0.75rem; color:var(--text-muted);">${r.shelves.length} ഷെൽഫ് യൂണിറ്റുകൾ</div>
        </td>
        <td>
          <span class="cat-pill-badge" style="color: ${catColor}; border-color: ${catColor}; background: ${catColor}18;">
            <span style="width:7px; height:7px; border-radius:50%; background:${catColor}; display:inline-block;"></span>
            ${catName.split(' ')[0]}
          </span>
        </td>
        <td>
          <select class="row-cat-select" data-side="${r.side}" data-row="${r.row}">
            ${selectOptions}
          </select>
        </td>
        <td>
          <span class="location-chip">${bookCount} പുസ്തകങ്ങൾ</span>
        </td>
        <td>
          <button class="view-shelf-btn edit-btn" data-side="${r.side}" data-row="${r.row}" data-z="${r.z}">
            <i data-lucide="eye" style="width:13px;height:13px;display:inline-block;vertical-align:middle;"></i> 3D വ്യൂ
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.row-cat-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const side = sel.dataset.side;
      const row = parseInt(sel.dataset.row, 10);
      const newCatId = sel.value;
      assignCategoryToShelfRow(side, row, newCatId);
    });
  });

  tbody.querySelectorAll('.view-shelf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playClick();
      const side = btn.dataset.side;
      const z = parseFloat(btn.dataset.z);
      document.getElementById('admin-modal').style.display = 'none';

      const targetX = side === 'left' ? -2.2 : 2.2;
      gsap.to(camera.position, { x: 0, y: 1.6, z: z, duration: 1.3, ease: 'power2.inOut' });
      gsap.to(controls.target, { x: targetX, y: 1.1, z: z, duration: 1.5, ease: 'power2.inOut' });
    });
  });

  const countBadge = document.getElementById('total-categories-count');
  if (countBadge) countBadge.textContent = state.categories.length;

  renderCategoriesSummaryList();
  lucide.createIcons();
}

function renderCategoriesSummaryList() {
  const container = document.getElementById('categories-summary-list');
  if (!container) return;

  container.innerHTML = state.categories.map(cat => {
    const shelfCount = state.shelves.filter(s => s.category === cat.id).length;
    const bookCount = state.books.filter(b => b.category === cat.id).length;
    return `
      <div class="cat-summary-chip">
        <span class="chip-dot" style="background: ${cat.color};"></span>
        <strong>${cat.name}</strong>
        <span style="color: var(--text-dim); font-size: 0.74rem;">(${shelfCount} ഷെൽഫുകൾ • ${bookCount} ബുക്കുകൾ)</span>
      </div>
    `;
  }).join('');
}

function populateAssignRowSelect() {
  const sideSelect = document.getElementById('cat-side');
  const rowSelect = document.getElementById('cat-assign-row');
  if (!sideSelect || !rowSelect) return;

  const side = sideSelect.value;
  const maxRows = side === 'left' ? 9 : 8;

  let options = '';
  for (let r = 1; r <= maxRows; r++) {
    const existingCat = state.categories.find(c => c.side === side && c.rows && c.rows.includes(r));
    const label = existingCat ? `Row ${r} (${existingCat.name.split(' ')[0]})` : `Row ${r} (ഒഴിവുണ്ട്)`;
    options += `<option value="${r}">${label}</option>`;
  }
  rowSelect.innerHTML = options;
}

async function onAddCategorySubmit(e) {
  e.preventDefault();

  const name = document.getElementById('cat-name').value.trim();
  let id = document.getElementById('cat-id').value.trim();
  const color = document.getElementById('cat-color').value;
  const side = document.getElementById('cat-side').value;
  const row = parseInt(document.getElementById('cat-assign-row').value, 10);

  if (!id) {
    id = name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 18);
  }

  const newCat = {
    id,
    name,
    color,
    side,
    rows: [row]
  };

  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCat)
    });
    if (res.ok) {
      const saved = await res.json();
      const idx = state.categories.findIndex(c => c.id === saved.id);
      if (idx >= 0) state.categories[idx] = saved;
      else state.categories.push(saved);
    } else {
      state.categories.push(newCat);
    }
  } catch (err) {
    state.categories.push(newCat);
  }

  state.shelves.forEach(s => {
    if (s.side === side && s.row === row) {
      s.category = id;
    }
  });

  rebuildAll3DBooks();
  rebuild3DCategorySigns();
  renderCategoryPills();
  populateCategorySelect();
  renderShelvesTable();

  document.getElementById('add-category-form').reset();
  document.getElementById('add-category-modal').style.display = 'none';

  sfx.playClick();

  const targetShelf = state.shelves.find(s => s.side === side && s.row === row);
  if (targetShelf) {
    const z = targetShelf.three_pos[2];
    const targetX = side === 'left' ? -2.2 : 2.2;
    gsap.to(camera.position, { x: 0, y: 1.6, z: z, duration: 1.4, ease: 'power2.inOut' });
    gsap.to(controls.target, { x: targetX, y: 1.1, z: z, duration: 1.6, ease: 'power2.inOut' });
  }
}

// ==========================================================================
// Book Inspect Card Presentation
// ==========================================================================
function showBookInspectCard(book, slot) {
  const card = document.getElementById('book-inspect-card');
  const catObj = state.categories.find(c => c.id === book.category);

  document.getElementById('inspect-category').textContent = catObj ? catObj.name : book.category;
  document.getElementById('inspect-category').style.borderColor = catObj ? catObj.color : '#6366f1';
  document.getElementById('inspect-title').textContent = book.title;
  document.getElementById('inspect-author').textContent = book.author;
  document.getElementById('inspect-barcode').textContent = book.barcode || 'N/A';
  document.getElementById('inspect-desc').textContent = book.description || 'വിവരണം ലഭ്യമല്ല.';

  const sideMalayalam = slot.side === 'left' ? 'ഇടതുഭാഗം' : 'വലതുഭാഗം';
  const faceMalayalam = slot.face === 'back' ? 'പിൻവശം (Back Face)' : 'മുൻവശം (Front Face)';
  document.getElementById('inspect-location').textContent = `${sideMalayalam} • Row ${slot.row} • ${faceMalayalam} • ${slot.rackName} • ${slot.bayName} • സ്ലോട്ട് ${slot.slotInBay}`;

  const badge = document.getElementById('inspect-cover-badge');
  badge.style.background = book.color || '#1e3a8a';

  card.style.display = 'block';
  lucide.createIcons();
}

function hideBookInspectCard() {
  document.getElementById('book-inspect-card').style.display = 'none';
}

// ==========================================================================
// Custom Placement: Open Edit Modal & Handle Submit
// ==========================================================================
function openEditLocationModal(bookId) {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;

  const mesh = booksGroup.children.find(m => m.userData && m.userData.book && m.userData.book.id === bookId);
  const slot = mesh ? mesh.userData.slot : null;

  document.getElementById('edit-book-id').value = book.id;
  document.getElementById('edit-modal-book-title').textContent = `"${book.title}" (${book.author})`;

  const faceVal = book.customFace || (slot ? slot.face : 'front');
  const rackVal = book.customRack || (slot ? slot.rack : 3);
  const bayVal = book.customBay || (slot ? slot.bay : 1);
  const slotVal = book.customSlot || (slot ? slot.slotInBay : 1);

  const faceEl = document.getElementById('edit-book-face');
  if (faceEl) faceEl.value = faceVal;
  document.getElementById('edit-book-rack').value = String(rackVal);
  document.getElementById('edit-book-bay').value = String(bayVal);
  document.getElementById('edit-book-slot').value = String(slotVal);

  document.getElementById('edit-location-modal').style.display = 'flex';
  lucide.createIcons();
}

async function onEditLocationSubmit(e) {
  e.preventDefault();
  const bookId = document.getElementById('edit-book-id').value;
  const face = document.getElementById('edit-book-face') ? document.getElementById('edit-book-face').value : 'front';
  const rack = parseInt(document.getElementById('edit-book-rack').value, 10);
  const bay = parseInt(document.getElementById('edit-book-bay').value, 10);
  const slot = parseInt(document.getElementById('edit-book-slot').value, 10);

  const book = state.books.find(b => b.id === bookId);
  if (!book) return;

  book.customFace = face;
  book.customRack = rack;
  book.customBay = bay;
  book.customSlot = slot;

  try {
    await fetch(`/api/books/${bookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customFace: face, customRack: rack, customBay: bay, customSlot: slot })
    });
  } catch (err) {
    console.warn('Backend update failed, kept in local state:', err);
  }

  document.getElementById('edit-location-modal').style.display = 'none';
  sfx.playClick();

  // If this book was currently lifted/focused, put it back smoothly first
  if (state.focusedBookMesh && state.focusedBookMesh.userData.book.id === bookId) {
    putBackBook(false);
  }

  // Rebuild shelves with the customized placement
  rebuildAll3DBooks();
  renderManageBooksTable();

  // Fly camera to its new place and lift it to show the user
  setTimeout(() => {
    const targetMesh = booksGroup.children.find(m => m.userData.book.id === bookId);
    if (targetMesh) {
      focusOnBook(targetMesh);
    }
  }, 400);
}

// ==========================================================================
// Admin Panel: Add & Delete Books
// ==========================================================================
async function onAddBookSubmit(e) {
  e.preventDefault();

  const title = document.getElementById('book-title').value.trim();
  const author = document.getElementById('book-author').value.trim();
  const barcode = document.getElementById('book-barcode').value.trim();
  const category = document.getElementById('book-category').value;
  const color = document.getElementById('book-color').value;
  const year = document.getElementById('book-year').value.trim();
  const description = document.getElementById('book-desc').value.trim();

  const customFace = document.getElementById('book-face') ? document.getElementById('book-face').value : 'auto';
  const customRack = document.getElementById('book-rack').value;
  const customBay = document.getElementById('book-bay').value;
  const customSlot = document.getElementById('book-slot').value;

  const newBook = {
    id: `BK-${Date.now().toString().slice(-4)}`,
    barcode,
    title,
    author,
    category,
    color,
    year: year || '2024',
    description: description || 'സ്മാർട്ട് ലൈബ്രറിയിൽ പുതിയതായി ചേർത്ത ബുക്ക്.'
  };

  if (customFace !== 'auto') newBook.customFace = customFace;
  if (customRack !== 'auto') newBook.customRack = parseInt(customRack, 10);
  if (customBay !== 'auto') newBook.customBay = parseInt(customBay, 10);
  if (customSlot !== 'auto') newBook.customSlot = parseInt(customSlot, 10);

  // Save to backend or local array
  try {
    const res = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBook)
    });
    if (res.ok) {
      const saved = await res.json();
      state.books.push(saved);
    } else {
      state.books.push(newBook);
    }
  } catch (err) {
    state.books.push(newBook);
  }

  // Update 3D Shelves
  rebuildAll3DBooks();
  renderManageBooksTable();
  updateTotalBooksBadge();

  // Reset form & close modal
  document.getElementById('add-book-form').reset();
  document.getElementById('admin-modal').style.display = 'none';

  sfx.playClick();

  // Find the newly placed book mesh and fly camera right to it!
  const targetMesh = booksGroup.children.find(m => m.userData.book.id === newBook.id);
  if (targetMesh) {
    setTimeout(() => {
      focusOnBook(targetMesh);
    }, 400);
  }
}

function renderManageBooksTable() {
  const tbody = document.getElementById('manage-books-tbody');
  tbody.innerHTML = state.books.map(b => {
    const catObj = state.categories.find(c => c.id === b.category);
    const mesh = booksGroup.children.find(m => m.userData && m.userData.book && m.userData.book.id === b.id);
    const slot = mesh ? mesh.userData.slot : null;
    const rackText = slot ? slot.rackName : (b.customRack ? `റാക്ക് ${b.customRack}` : 'റാക്ക് 3');
    const bayText = slot ? (slot.bay === 1 ? 'Bay 1' : 'Bay 2') : (b.customBay === 2 ? 'Bay 2' : 'Bay 1');
    const slotText = slot ? `സ്ലോട്ട് ${slot.slotInBay}` : (b.customSlot ? `സ്ലോട്ട് ${b.customSlot}` : '1');

    return `
      <tr>
        <td><strong>${b.title}</strong></td>
        <td>${b.author}</td>
        <td><span style="color: ${catObj ? catObj.color : '#fff'}; font-weight:600;">${catObj ? catObj.name.split(' ')[0] : b.category}</span></td>
        <td><code>${b.barcode}</code></td>
        <td>
          <span class="location-chip" title="ഷെൽഫിലെ സ്ഥാനം">
            <i data-lucide="map-pin" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:2px;"></i>
            ${rackText} • ${bayText} • ${slotText}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="edit-btn" data-id="${b.id}" title="സ്ഥാനം മാറ്റുക">
              <i data-lucide="map-pin" style="width:13px;height:13px;display:inline-block;vertical-align:middle;"></i> മാറ്റുക
            </button>
            <button class="del-btn" data-id="${b.id}" title="നീക്കം ചെയ്യുക">
              <i data-lucide="trash-2" style="width:13px;height:13px;display:inline-block;vertical-align:middle;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Edit location button handlers
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playClick();
      const id = btn.dataset.id;
      openEditLocationModal(id);
    });
  });

  // Delete button handlers
  tbody.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('ഈ ബുക്ക് ലൈബ്രറിയിൽ നിന്ന് നീക്കം ചെയ്യണമെന്നുറപ്പാണോ?')) {
        try {
          await fetch(`/api/books/${id}`, { method: 'DELETE' });
        } catch (e) {}

        state.books = state.books.filter(b => b.id !== id);
        rebuildAll3DBooks();
        renderManageBooksTable();
        updateTotalBooksBadge();
        sfx.playClick();
      }
    });
  });

  lucide.createIcons();
}

function updateTotalBooksBadge() {
  const countEl = document.getElementById('total-books-count');
  if (countEl) countEl.textContent = state.books.length;
}

// ==========================================================================
// Animation Loop
// ==========================================================================
function animate() {
  requestAnimationFrame(animate);

  if (controls && controls.enabled) {
    controls.update();
  }

  // Gentle floating animation on focused book
  if (state.focusedBookMesh && !state.isNavigating) {
    const time = Date.now() * 0.002;
    state.focusedBookMesh.position.y += Math.sin(time) * 0.0004;
  }

  renderer.render(scene, camera);
}

// Start application safely regardless of when script is parsed
function startApplication() {
  init();
  if (window.lucide && window.lucide.createIcons) {
    try { lucide.createIcons(); } catch (e) {}
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApplication);
} else {
  // DOM is already ready (or script loaded defer/async) - execute immediately!
  startApplication();
}
