/* ========================================
   POTTERY RIB CUSTOMIZER - JAVASCRIPT
   ========================================
   
   This application allows users to design custom pottery ribs
   with 3D preview and STL/OBJ export functionality.
   
   Main Features:
   - Interactive 3D preview using Three.js
   - Real-time parameter adjustment
   - Multiple shape options (rectangular, oval, kidney, custom)
   - Edge profile customization (thickness, angle, depth)
   - Asymmetric edge control (different settings per edge)
   - Longitudinal curve for conforming to pottery surfaces
   - Custom shape drawing with smoothing
   - STL and OBJ file export
   - Multiple view modes (3D, top, side, cross-section)
   - Design statistics (volume, weight, surface area)
   
   ======================================== */

// ========================================
// GLOBAL VARIABLES
// ========================================

// Three.js scene components
let appScene;           // Main 3D scene
let appCamera;          // Camera for viewing the scene
let appRenderer;        // WebGL renderer
let appRib;             // The pottery rib 3D mesh object
let thumbRenderers = {}; // Thumbnail view renderers

// Drawing canvas state
let customCurvePoints = []; // Points drawn by user for custom shapes
let drawingHistory = [];    // History for undo functionality
let isDrawing = false;      // Track if user is currently drawing

// Application state
let updateTimeout = null;   // Debounce timer for geometry updates
let currentView = '3d';     // Current camera view mode
let showGrid = false;       // Grid overlay toggle state

// ========================================
// INITIALIZATION FUNCTIONS
// ========================================

/**
 * Initialize the 3D scene with camera, renderer, lights, and controls
 * Called once when the page loads
 */
function initScene() {
    const container = document.getElementById('canvas-container');
    
    // Create and configure scene
    appScene = new THREE.Scene();
    appScene.background = new THREE.Color(0xe6f2ff);
    
    // Setup perspective camera
    // Parameters: FOV, aspect ratio, near clipping, far clipping
    appCamera = new THREE.PerspectiveCamera(
        45, 
        container.clientWidth / container.clientHeight, 
        0.1, 
        1000
    );
    resetCameraPosition();
    
    // Setup WebGL renderer with anti-aliasing
    appRenderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true
    });
    appRenderer.setSize(container.clientWidth, container.clientHeight);
    appRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(appRenderer.domElement);
    
    // Add multiple light sources for better visualization
    // Ambient light provides base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    appScene.add(ambientLight);
    
    // Main directional light from top-right
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.6);
    mainLight.position.set(100, 150, 100);
    appScene.add(mainLight);
    
    // Fill light from opposite side for softer shadows
    const fillLight = new THREE.DirectionalLight(0x99ccff, 0.4);
    fillLight.position.set(-80, 50, -80);
    appScene.add(fillLight);
    
    // Rim light for edge definition
    const rimLight = new THREE.DirectionalLight(0xffeeaa, 0.3);
    rimLight.position.set(0, -30, 50);
    appScene.add(rimLight);
    
    // Back light for depth
    const backLight = new THREE.DirectionalLight(0xffffff, 0.2);
    backLight.position.set(0, 30, -100);
    appScene.add(backLight);
    
    // Initialize thumbnail renderers and controls
    initThumbnails();
    setupOrbitControls();
    
    // Create initial rib geometry and start animation loop
    updateRib();
    animate();
}

/**
 * Reset camera to default position
 * Used for "Reset View" button
 */
function resetCameraPosition() {
    appCamera.position.set(80, 80, 120);
    appCamera.lookAt(0, 0, 0);
}

/**
 * Reset both camera and rib rotation
 */
function resetCamera() {
    resetCameraPosition();
    if (appRib) {
        appRib.rotation.set(0, 0, 0);
    }
}

/**
 * Initialize thumbnail view renderers
 * Creates separate renderer for each view (3D, top, side, cross-section)
 */
function initThumbnails() {
    const thumbIds = ['thumb-3d', 'thumb-top', 'thumb-side', 'thumb-cross'];
    
    thumbIds.forEach(id => {
        const canvas = document.getElementById(id);
        const parent = canvas.parentElement;
        
        // Size canvas to match parent element
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        
        // Create dedicated renderer for this thumbnail
        const renderer = new THREE.WebGLRenderer({ 
            canvas: canvas,
            antialias: true,
            alpha: true
        });
        renderer.setSize(canvas.width, canvas.height);
        thumbRenderers[id] = renderer;
    });
}

/**
 * Setup orbit controls for mouse-based camera manipulation
 * Allows user to rotate rib by dragging and zoom by scrolling
 */
function setupOrbitControls() {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    
    // Mouse down - start drag
    appRenderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        appRenderer.domElement.style.cursor = 'grabbing';
    });
    
    // Mouse move - rotate rib if dragging
    appRenderer.domElement.addEventListener('mousemove', (e) => {
        if (isDragging && appRib) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            // Only rotate in 3D view mode
            if (currentView === '3d') {
                // Rotate around Y axis (left-right drag)
                appRib.rotation.y += deltaX * 0.01;
                // Rotate around X axis (up-down drag)
                appRib.rotation.x += deltaY * 0.01;
                // Clamp X rotation to prevent flipping
                appRib.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, appRib.rotation.x));
            }
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });
    
    // Mouse up - end drag
    document.addEventListener('mouseup', () => {
        isDragging = false;
        appRenderer.domElement.style.cursor = 'grab';
    });
    
    // Mouse wheel - zoom in/out
    appRenderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        appCamera.position.z += e.deltaY * zoomSpeed;
        // Clamp zoom to reasonable range
        appCamera.position.z = Math.max(50, Math.min(300, appCamera.position.z));
    }, { passive: false });
    
    appRenderer.domElement.style.cursor = 'grab';
}

// ========================================
// VIEW SWITCHING FUNCTIONS
// ========================================

/**
 * Switch between different camera views
 * @param {string} view - View mode: '3d', 'top', 'side', or 'cross'
 */
function switchView(view) {
    currentView = view;
    
    // Update active thumbnail indicator
    document.querySelectorAll('.view-thumbnail').forEach(t => t.classList.remove('active'));
    document.getElementById('view-' + view).classList.add('active');
    
    if (!appRib) return;
    
    // Reset rib rotation for orthographic views
    appRib.rotation.set(0, 0, 0);
    
    // Position camera based on selected view
    switch(view) {
        case 'top':
            // View from above (Y axis)
            appCamera.position.set(0, 200, 0);
            appCamera.lookAt(0, 0, 0);
            break;
        case 'side':
            // View from side (X axis)
            appCamera.position.set(200, 0, 0);
            appCamera.lookAt(0, 0, 0);
            break;
        case 'cross':
            // View from front (Z axis) - shows cross-section profile
            appCamera.position.set(0, 0, 200);
            appCamera.lookAt(0, 0, 0);
            break;
        default:
            // Default 3D perspective view
            resetCameraPosition();
    }
}

/**
 * Update all thumbnail previews with current rib geometry
 * Renders rib from different angles in thumbnail canvases
 */
function updateThumbnails() {
    if (!appRib) return;
    
    // Define camera positions for each view
    const views = [
        { id: 'thumb-3d', pos: [80, 80, 120] },    // Perspective
        { id: 'thumb-top', pos: [0, 150, 0] },      // Top-down
        { id: 'thumb-side', pos: [150, 0, 0] },     // Side view
        { id: 'thumb-cross', pos: [0, 0, 150] }     // Cross-section
    ];
    
    // Create temporary scene with cloned rib
    const tempScene = new THREE.Scene();
    tempScene.background = new THREE.Color(0xe6f2ff);
    tempScene.add(appRib.clone());
    
    // Add basic lighting to temp scene
    const ambLight = new THREE.AmbientLight(0xffffff, 0.8);
    tempScene.add(ambLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(50, 50, 50);
    tempScene.add(dirLight);
    
    // Render each view to its thumbnail canvas
    views.forEach(view => {
        const renderer = thumbRenderers[view.id];
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        camera.position.set(...view.pos);
        camera.lookAt(0, 0, 0);
        renderer.render(tempScene, camera);
    });
}

// ========================================
// GEOMETRY HELPER FUNCTIONS
// ========================================

/**
 * Calculate shape modifier for non-rectangular shapes
 * Modifies the width at different points along length to create curves
 * 
 * @param {number} t - Position along length (0-1)
 * @param {number} s - Position along width (0-1)
 * @param {string} shape - Shape type
 * @returns {number} Width multiplier (0-1)
 */
function getShapeModifier(t, s, shape) {
    switch(shape) {
        case 'oval':
            // Create elliptical profile using circle equation
            return Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 2))) * 0.8 + 0.2;
            
        case 'circle':
            // More pronounced circular profile
            return Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 2))) * 0.9 + 0.1;
            
        case 'teardrop':
            // Wider at one end, narrower at other
            return (1 - t) * 0.7 + 0.3;
            
        case 'kidney':
            // Kidney bean shape with curved indentation
            return 1 - Math.abs(Math.sin(t * Math.PI)) * 0.4 * Math.abs(s - 0.5) * 2;
            
        case 'asymmetric-teardrop':
            // Teardrop with different widths on each side
            const asymFactor = s < 0.5 ? 0.8 : 1.2;
            return ((1 - t) * 0.7 + 0.3) * asymFactor;
            
        default:
            // Rectangular - no modification
            return 1;
    }
}

/**
 * Smooth custom curve points using Catmull-Rom spline interpolation
 * Takes user-drawn points and creates a smooth curve through them
 * 
 * @param {Array} points - Array of {x, y} points from drawing
 * @param {number} smoothingFactor - Smoothing strength (0-100)
 * @returns {Array} Smoothed points
 */
function smoothCurvePoints(points, smoothingFactor = 50) {
    if (points.length < 3) return points;
    
    // Sort points by X coordinate (left to right)
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const smoothed = [];
    const resolution = 100; // Number of output points
    const tension = smoothingFactor / 100; // Convert to 0-1 range
    
    // Generate smooth curve using Catmull-Rom spline
    for (let i = 0; i < resolution; i++) {
        const t = i / (resolution - 1);
        const index = Math.floor(t * (sorted.length - 1));
        const nextIndex = Math.min(index + 1, sorted.length - 1);
        const localT = (t * (sorted.length - 1)) - index;
        
        // Get surrounding points for interpolation
        const p0 = sorted[Math.max(0, index - 1)];
        const p1 = sorted[index];
        const p2 = sorted[nextIndex];
        const p3 = sorted[Math.min(sorted.length - 1, nextIndex + 1)];
        
        // Catmull-Rom spline formula
        const y = 0.5 * (
            (2 * p1.y) +
            (-p0.y + p2.y) * localT * tension +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * localT * localT * tension +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * localT * localT * localT * tension
        );
        
        // Clamp Y value to valid range
        smoothed.push({ x: t, y: Math.max(0, Math.min(1, y)) });
    }
    
    return smoothed;
}

/**
 * Apply edge angle profile to modify thickness at edges
 * Creates different edge profiles (sharp, beveled, rounded, etc.)
 * 
 * @param {string} angleType - Type of edge profile
 * @param {number} customAngle - Custom angle in degrees (if using custom-angle)
 * @param {number} thickness - Base thickness in mm
 * @param {number} angleEffect - How much to apply effect (0-1)
 * @returns {number} Modified Z position for top surface
 */
function applyEdgeAngle(angleType, customAngle, thickness, angleEffect) {
    let topZ = thickness / 2;
    
    switch(angleType) {
        case 'straight':
            // No modification - perpendicular edges
            return topZ;
            
        case 'sharp':
            // Knife edge - reduce thickness dramatically
            topZ = Math.max(0.1, thickness / 2 * (1 - angleEffect * 0.95));
            break;
            
        case 'bevel':
            // 30 degree bevel
            const bevelRad = (30 * Math.PI) / 180;
            const bevelReduction = Math.tan(bevelRad) * (thickness * angleEffect * 0.5);
            topZ = Math.max(0.1, thickness / 2 - bevelReduction);
            break;
            
        case 'miter':
            // 45 degree miter cut
            const miterRad = (45 * Math.PI) / 180;
            const miterReduction = Math.tan(miterRad) * (thickness * angleEffect * 0.5);
            topZ = Math.max(0.1, thickness / 2 - miterReduction);
            break;
            
        case 'rounded':
            // Fully rounded edge (180 degree curve)
            const curveAmount = Math.sin(angleEffect * Math.PI / 2);
            topZ = thickness / 2 * (1 - curveAmount * 0.9);
            break;
            
        case 'custom-angle':
            // User-specified angle
            const customRad = (customAngle * Math.PI) / 180;
            const customReduction = Math.tan(customRad) * (thickness * angleEffect * 0.5);
            topZ = Math.max(0.1, thickness / 2 - customReduction);
            break;
    }
    
    return topZ;
}

// ========================================
// MAIN GEOMETRY CREATION
// ========================================

/**
 * Create the 3D geometry for the pottery rib
 * This is the core function that generates the mesh based on all parameters
 * Uses manual vertex generation to create manifold (watertight) geometry
 * 
 * @returns {THREE.BufferGeometry} The generated geometry
 */
function createRibGeometry() {
    const params = getGeometryParameters();
    
    // Validate parameters and show warnings
    validateParameters(params);
    
    // Define mesh resolution
    const segments = 60;        // Divisions along length
    const widthSegments = 40;   // Divisions along width
    
    const geometry = new THREE.BufferGeometry();
    const vertices = [];        // Vertex position array
    const indices = [];         // Triangle indices array
    
    // Get smoothed custom curve if using custom shape
    const smoothingFactor = parseInt(document.getElementById('smoothing-amount')?.value || 50);
    const smoothedCurve = params.shape === 'custom' && customCurvePoints.length > 0 
        ? smoothCurvePoints(customCurvePoints, smoothingFactor) 
        : null;
    
    // 2D grid to store vertex indices for face creation
    const vertexGrid = [];
    
    // Generate vertices in a grid pattern
    for (let i = 0; i <= segments; i++) {
        const row = [];
        const t = i / segments;  // Position along length (0-1)
        const x = (t - 0.5) * params.length;  // Center at origin
        
        // Calculate longitudinal curve offset (bow along length)
        const longitudinalCurve = params.longitudinalCurve / 100;
        const curveOffset = Math.sin(t * Math.PI) * params.thickness * longitudinalCurve * 3;
        
        // Generate vertices across width at this length position
        for (let j = 0; j <= widthSegments; j++) {
            const s = j / widthSegments;  // Position along width (0-1)
            
            // Calculate vertex position with all modifiers
            const vertexData = calculateVertexPosition(
                x, s, t, params, smoothedCurve, widthSegments, curveOffset
            );
            
            // Create top and bottom vertices (for thickness)
            const topIdx = vertices.length / 3;
            vertices.push(x, vertexData.y, vertexData.topZ);    // Top surface
            vertices.push(x, vertexData.y, vertexData.bottomZ); // Bottom surface
            
            row.push({ top: topIdx, bottom: topIdx + 1 });
        }
        
        vertexGrid.push(row);
    }
    
    // Create faces (triangles) connecting vertices
    // Top and bottom surfaces
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < widthSegments; j++) {
            const v00 = vertexGrid[i][j];
            const v10 = vertexGrid[i + 1][j];
            const v11 = vertexGrid[i + 1][j + 1];
            const v01 = vertexGrid[i][j + 1];
            
            // Top surface (2 triangles per quad)
            indices.push(v00.top, v10.top, v11.top);
            indices.push(v00.top, v11.top, v01.top);
            
            // Bottom surface (reversed winding for correct normals)
            indices.push(v00.bottom, v11.bottom, v10.bottom);
            indices.push(v00.bottom, v01.bottom, v11.bottom);
        }
    }
    
    // Create perimeter walls (edges)
    // Left and right edges
    for (let i = 0; i < segments; i++) {
        // Left edge
        const v0 = vertexGrid[i][0];
        const v1 = vertexGrid[i + 1][0];
        indices.push(v0.top, v0.bottom, v1.bottom);
        indices.push(v0.top, v1.bottom, v1.top);
        
        // Right edge
        const v0r = vertexGrid[i][widthSegments];
        const v1r = vertexGrid[i + 1][widthSegments];
        indices.push(v0r.top, v1r.top, v1r.bottom);
        indices.push(v0r.top, v1r.bottom, v0r.bottom);
    }
    
    // Front and back edges
    for (let j = 0; j < widthSegments; j++) {
        // Front edge
        const v0 = vertexGrid[0][j];
        const v1 = vertexGrid[0][j + 1];
        indices.push(v0.top, v1.top, v1.bottom);
        indices.push(v0.top, v1.bottom, v0.bottom);
        
        // Back edge
        const v0b = vertexGrid[segments][j];
        const v1b = vertexGrid[segments][j + 1];
        indices.push(v0b.top, v0b.bottom, v1b.bottom);
        indices.push(v0b.top, v1b.bottom, v1b.top);
    }
    
    // Set geometry attributes
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();  // Calculate smooth normals for lighting
    
    // Update statistics display
    updateStatistics(geometry, params);
    
    return geometry;
}

/**
 * Continued in next part...
 */

/**
 * Get all geometry parameters from UI controls
 * Collects current values from all input fields
 * 
 * @returns {Object} Parameters object with all rib properties
 */
function getGeometryParameters() {
    const edgeThicknessApply = document.getElementById('edge-thickness-apply').value;
    const angleType = document.getElementById('angle-type').value;
    
    return {
        // Basic dimensions
        length: parseFloat(document.getElementById('length').value),
        width: parseFloat(document.getElementById('width').value),
        thickness: parseFloat(document.getElementById('thickness').value),
        
        // Edge thickness settings
        edgeThickness: parseFloat(document.getElementById('edge-thickness').value),
        edgeThicknessApply: edgeThicknessApply,
        edgeTop: edgeThicknessApply === 'asymmetric' ? parseFloat(document.getElementById('edge-top')?.value || 6) : null,
        edgeBottom: edgeThicknessApply === 'asymmetric' ? parseFloat(document.getElementById('edge-bottom')?.value || 6) : null,
        edgeLeft: edgeThicknessApply === 'asymmetric' ? parseFloat(document.getElementById('edge-left')?.value || 6) : null,
        edgeRight: edgeThicknessApply === 'asymmetric' ? parseFloat(document.getElementById('edge-right')?.value || 6) : null,
        
        // Shape settings
        shape: document.getElementById('shape').value,
        
        // Edge angle/profile settings
        angleType: angleType,
        angleTop: angleType === 'asymmetric' ? document.getElementById('angle-top')?.value || 'miter' : null,
        angleBottom: angleType === 'asymmetric' ? document.getElementById('angle-bottom')?.value || 'miter' : null,
        angleLeft: angleType === 'asymmetric' ? document.getElementById('angle-left')?.value || 'miter' : null,
        angleRight: angleType === 'asymmetric' ? document.getElementById('angle-right')?.value || 'miter' : null,
        customAngle: parseFloat(document.getElementById('edge-angle').value || 45),
        
        // Edge depth and application
        edgeDepth: parseFloat(document.getElementById('edge-depth').value),
        applyAllEdges: document.getElementById('apply-all-edges').checked,
        
        // Longitudinal curve (bow)
        longitudinalCurve: parseFloat(document.getElementById('longitudinal-curve')?.value || 0)
    };
}

/**
 * Calculate position for a single vertex considering all modifiers
 * This is where shape, edge profiles, thickness variations all come together
 * 
 * @param {number} x - X position (along length)
 * @param {number} s - Width parameter (0-1)
 * @param {number} t - Length parameter (0-1)
 * @param {Object} params - All geometry parameters
 * @param {Array} smoothedCurve - Custom curve points (if applicable)
 * @param {number} widthSegments - Number of width divisions
 * @param {number} curveOffset - Longitudinal curve offset
 * @returns {Object} {y, topZ, bottomZ} - Vertex position data
 */
function calculateVertexPosition(x, s, t, params, smoothedCurve, widthSegments, curveOffset = 0) {
    // Start with basic Y position (along width)
    let y = (s - 0.5) * params.width;
    
    // Apply shape modifier (for oval, kidney, etc.)
    let shapeModifier = 1;
    if (smoothedCurve) {
        // Use custom drawn curve
        const pointIndex = Math.floor(t * (smoothedCurve.length - 1));
        const point = smoothedCurve[Math.min(pointIndex, smoothedCurve.length - 1)];
        if (point) {
            const curveInfluence = s;
            const centerY = 0.5;
            const curveModifier = 1 - Math.abs(point.y - centerY) * 1.5;
            const clampedModifier = Math.max(0.1, Math.min(1, curveModifier));
            shapeModifier = 1.0 * (1 - curveInfluence) + clampedModifier * curveInfluence;
        }
    } else {
        // Use predefined shape modifier
        shapeModifier = getShapeModifier(t, s, params.shape);
    }
    
    y *= shapeModifier;
    
    // Calculate distances to each edge for thickness/angle transitions
    const actualWidth = params.width * Math.abs(shapeModifier);
    const actualLength = params.length;
    const distFromTop = actualWidth * (1 - s);
    const distFromBottom = actualWidth * s;
    const distFromLeft = actualLength * t;
    const distFromRight = actualLength * (1 - t);
    let minDistToEdge = Math.min(distFromTop, distFromBottom, distFromLeft, distFromRight);
    
    // Determine which edge we're closest to
    const isNearTop = distFromTop === minDistToEdge;
    const isNearBottom = distFromBottom === minDistToEdge;
    const isNearLeft = distFromLeft === minDistToEdge;
    const isNearRight = distFromRight === minDistToEdge;
    const isShapingEdge = isNearTop;
    
    // Calculate thickness at this point
    let currentThickness = params.thickness;
    let targetEdgeThickness = params.edgeThickness;
    
    // Apply asymmetric thickness if specified
    if (params.edgeThicknessApply === 'asymmetric') {
        if (isNearTop) targetEdgeThickness = params.edgeTop;
        else if (isNearBottom) targetEdgeThickness = params.edgeBottom;
        else if (isNearLeft) targetEdgeThickness = params.edgeLeft;
        else if (isNearRight) targetEdgeThickness = params.edgeRight;
    }
    
    // Transition thickness near edges
    if (minDistToEdge <= params.edgeDepth) {
        const edgeProgress = minDistToEdge / params.edgeDepth;
        const shouldApplyEdgeThickness = 
            params.edgeThicknessApply === 'all' || 
            params.edgeThicknessApply === 'asymmetric' ||
            (params.edgeThicknessApply === 'shaping' && isShapingEdge);
        
        if (shouldApplyEdgeThickness) {
            // Interpolate between edge and center thickness
            currentThickness = targetEdgeThickness * (1 - edgeProgress) + params.thickness * edgeProgress;
        }
    }
    
    // Calculate Z positions (top and bottom surfaces)
    let topZ = currentThickness / 2 + curveOffset;
    let bottomZ = -currentThickness / 2 - curveOffset;
    
    // Apply edge angle/profile near edges
    if (minDistToEdge <= params.edgeDepth) {
        const edgeProgress = minDistToEdge / params.edgeDepth;
        const shouldApplyAngle = params.applyAllEdges || 
            params.shape === 'oval' || 
            params.shape === 'custom' ||
            isNearTop || 
            distFromBottom === minDistToEdge ||
            distFromLeft <= params.edgeDepth || 
            distFromRight <= params.edgeDepth;
        
        if (shouldApplyAngle) {
            const angleEffect = 1 - edgeProgress;
            
            // Determine which angle type to use
            let edgeAngleType = params.angleType;
            if (params.angleType === 'asymmetric') {
                if (isNearTop) edgeAngleType = params.angleTop;
                else if (isNearBottom) edgeAngleType = params.angleBottom;
                else if (isNearLeft) edgeAngleType = params.angleLeft;
                else if (isNearRight) edgeAngleType = params.angleRight;
            }
            
            // Apply the angle profile
            topZ = applyEdgeAngle(edgeAngleType, params.customAngle, currentThickness, angleEffect) + curveOffset;
            // Blend angle effect toward center
            topZ = topZ * angleEffect + ((currentThickness / 2) + curveOffset) * (1 - angleEffect);
        }
    }
    
    return { y, topZ, bottomZ };
}

/**
 * Validate parameters and show warnings if needed
 * @param {Object} params - Geometry parameters
 */
function validateParameters(params) {
    // Check edge thickness
    const edgeWarning = document.getElementById('edge-thickness-warning');
    if (params.edgeThickness < 0.5) {
        edgeWarning.classList.add('show');
    } else {
        edgeWarning.classList.remove('show');
    }
    
    // Check edge depth
    const depthWarning = document.getElementById('edge-depth-warning');
    if (params.edgeDepth > params.width / 2 || params.edgeDepth > params.length / 2) {
        depthWarning.classList.add('show');
    } else {
        depthWarning.classList.remove('show');
    }
}

// ========================================
// UPDATE FUNCTIONS
// ========================================

/**
 * Update the 3D rib mesh with current parameters
 * Disposes old geometry and creates new one
 */
function updateRib() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.add('show');
    
    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
        try {
            // Clean up old mesh if exists
            if (appRib) {
                appScene.remove(appRib);
                appRib.geometry.dispose();
                appRib.material.dispose();
            }
            
            // Create new geometry
            const geometry = createRibGeometry();
            
            // Create material with red color and smooth shading
            const material = new THREE.MeshStandardMaterial({
                color: 0xd63447,
                roughness: 0.4,
                metalness: 0.2,
                side: THREE.DoubleSide
            });
            
            // Create and add new mesh to scene
            appRib = new THREE.Mesh(geometry, material);
            appScene.add(appRib);
            
            // Update thumbnail views
            updateThumbnails();
        } finally {
            loadingOverlay.classList.remove('show');
        }
    }, 10);
}

/**
 * Debounced update - delays update until user stops adjusting controls
 * Prevents expensive recalculations on every slider movement
 */
function debouncedUpdate() {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(updateRib, 100);
}

/**
 * Animation loop - continuously renders the scene
 */
function animate() {
    requestAnimationFrame(animate);
    appRenderer.render(appScene, appCamera);
}

// ========================================
// STATISTICS CALCULATION
// ========================================

/**
 * Calculate and display rib statistics
 * Includes volume, weight, surface area, and printing recommendations
 * 
 * @param {THREE.BufferGeometry} geometry - The rib geometry
 * @param {Object} params - Geometry parameters
 */
function updateStatistics(geometry, params) {
    const positions = geometry.attributes.position.array;
    const indices = geometry.index.array;
    
    // Calculate volume using divergence theorem
    // Sum signed volumes of tetrahedra formed by origin and each triangle
    let volume = 0;
    for (let i = 0; i < indices.length; i += 3) {
        const i1 = indices[i] * 3;
        const i2 = indices[i + 1] * 3;
        const i3 = indices[i + 2] * 3;
        
        const v1 = [positions[i1], positions[i1 + 1], positions[i1 + 2]];
        const v2 = [positions[i2], positions[i2 + 1], positions[i2 + 2]];
        const v3 = [positions[i3], positions[i3 + 1], positions[i3 + 2]];
        
        // Signed volume of tetrahedron
        volume += Math.abs(
            v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) +
            v2[0] * (v3[1] * v1[2] - v3[2] * v1[1]) +
            v3[0] * (v1[1] * v2[2] - v1[2] * v2[1])
        ) / 6;
    }
    
    // Convert from mm³ to cm³
    volume = Math.abs(volume) / 1000;
    
    // Calculate weight assuming PLA density
    const pla_density = 1.24; // g/cm³
    const weight = volume * pla_density;
    
    // Approximate surface area
    const surfaceArea = (params.length * params.width * 2) / 100;
    
    // Update display
    document.getElementById('stat-volume').textContent = volume.toFixed(2) + ' cm³';
    document.getElementById('stat-weight').textContent = weight.toFixed(1) + ' g';
    document.getElementById('stat-surface').textContent = surfaceArea.toFixed(1) + ' cm²';
    
    // Determine if supports are needed
    const needsSupports = params.angleType === 'sharp' || 
                          (params.angleType === 'custom-angle' && params.customAngle < 30);
    
    // Determine print orientation
    let orientationText = 'Flat';
    if (needsSupports) {
        orientationText = 'On Edge';
    } else if (params.longitudinalCurve > 20) {
        orientationText = 'Flat (curved)';
    }
    document.getElementById('stat-orientation').textContent = orientationText;
    
    // Size comparison for context
    const size = Math.max(params.length, params.width);
    let comparison = 'Approximately palm-sized';
    if (size < 60) comparison = 'Smaller than average palm';
    else if (size > 120) comparison = 'Larger than average palm';
    document.getElementById('stat-comparison').textContent = comparison;
    
    // Update printing tips
    document.getElementById('support-recommendation').textContent = 
        needsSupports ? 'Recommended for steep angles' : 'Usually not needed';
    
    let orientationRecommendation = 'Flat on build plate';
    if (needsSupports) {
        orientationRecommendation = 'Print on edge with supports';
    } else if (params.longitudinalCurve > 20) {
        orientationRecommendation = 'Flat on build plate (curved ribs may need support under the curve)';
    }
    document.getElementById('orientation-recommendation').textContent = orientationRecommendation;
}

// ========================================
// DRAWING CANVAS FUNCTIONS
// ========================================

const drawingCanvas = document.getElementById('drawing-canvas');
const ctx = drawingCanvas.getContext('2d');

/**
 * Draw grid and guides on drawing canvas
 */
function drawGrid() {
    // Clear canvas
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    
    // Draw grid lines
    ctx.strokeStyle = '#f9d96b';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 10; i++) {
        // Horizontal lines
        ctx.beginPath();
        ctx.moveTo(0, i * drawingCanvas.height / 10);
        ctx.lineTo(drawingCanvas.width, i * drawingCanvas.height / 10);
        ctx.stroke();
        
        // Vertical lines
        ctx.beginPath();
        ctx.moveTo(i * drawingCanvas.width / 10, 0);
        ctx.lineTo(i * drawingCanvas.width / 10, drawingCanvas.height);
        ctx.stroke();
    }
    
    // Draw symmetry guide if enabled
    if (document.getElementById('symmetry-guide').checked) {
        ctx.strokeStyle = '#0066cc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, drawingCanvas.height / 2);
        ctx.lineTo(drawingCanvas.width, drawingCanvas.height / 2);
        ctx.stroke();
    }
    
    // Draw instruction text
    ctx.fillStyle = '#0066cc';
    ctx.font = 'bold 14px Nunito';
    ctx.textAlign = 'center';
    ctx.fillText('Draw from left to right', drawingCanvas.width / 2, 20);
}

/**
 * Open the drawing modal for custom shapes
 */
function openDrawingModal() {
    document.getElementById('drawing-modal').classList.add('show');
    drawGrid();
}

/**
 * Close the drawing modal
 */
function closeDrawingModal() {
    document.getElementById('drawing-modal').classList.remove('show');
}

/**
 * Clear all drawing
 */
function clearDrawing() {
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawGrid();
    customCurvePoints = [];
    drawingHistory = [];
}

/**
 * Undo last drawing action
 */
function undoDrawing() {
    if (drawingHistory.length > 0) {
        customCurvePoints = [...drawingHistory];
        ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        drawGrid();
        redrawCustomCurve();
    }
}

/**
 * Redraw the custom curve from stored points
 */
function redrawCustomCurve() {
    if (customCurvePoints.length < 2) return;
    
    ctx.strokeStyle = '#d63447';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(
        customCurvePoints[0].x * drawingCanvas.width,
        customCurvePoints[0].y * drawingCanvas.height
    );
    
    for (let i = 1; i < customCurvePoints.length; i++) {
        ctx.lineTo(
            customCurvePoints[i].x * drawingCanvas.width,
            customCurvePoints[i].y * drawingCanvas.height
        );
    }
    ctx.stroke();
}

/**
 * Apply the custom curve to the rib geometry
 */
function applyCustomCurve() {
    if (customCurvePoints.length > 5) {
        updateRib();
        closeDrawingModal();
        showToast('Custom shape applied successfully');
    } else {
        showToast('Please draw a longer curve (draw from left to right across the canvas)', true);
    }
}

// Drawing event listeners
drawingCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    drawingHistory = [...customCurvePoints];
    const rect = drawingCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / drawingCanvas.width;
    const y = (e.clientY - rect.top) / drawingCanvas.height;
    customCurvePoints.push({ x, y });
});

drawingCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    
    const rect = drawingCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / drawingCanvas.width;
    const y = (e.clientY - rect.top) / drawingCanvas.height;
    
    customCurvePoints.push({ x, y });
    
    if (customCurvePoints.length > 1) {
        const prevPoint = customCurvePoints[customCurvePoints.length - 2];
        const currPoint = customCurvePoints[customCurvePoints.length - 1];
        
        ctx.strokeStyle = '#d63447';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(prevPoint.x * drawingCanvas.width, prevPoint.y * drawingCanvas.height);
        ctx.lineTo(currPoint.x * drawingCanvas.width, currPoint.y * drawingCanvas.height);
        ctx.stroke();
    }
});

drawingCanvas.addEventListener('mouseup', () => {
    isDrawing = false;
});

document.getElementById('symmetry-guide').addEventListener('change', () => {
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawGrid();
    redrawCustomCurve();
});

// ========================================
// PRESET CONFIGURATIONS
// ========================================

/**
 * Apply a preset configuration
 * @param {string} preset - Preset name
 */
function applyPreset(preset) {
    const presets = {
        'thin-flexible': {
            length: 120, width: 60, thickness: 3, edgeThickness: 1,
            edgeDepth: 15, shape: 'oval', angleType: 'rounded'
        },
        'thick-rigid': {
            length: 100, width: 70, thickness: 10, edgeThickness: 8,
            edgeDepth: 12, shape: 'rectangular', angleType: 'miter'
        },
        'kidney-style': {
            length: 110, width: 80, thickness: 6, edgeThickness: 3,
            edgeDepth: 10, shape: 'kidney', angleType: 'rounded'
        },
        'trimming': {
            length: 70, width: 40, thickness: 5, edgeThickness: 2,
            edgeDepth: 8, shape: 'teardrop', angleType: 'bevel'
        },
        'throwing': {
            length: 150, width: 90, thickness: 8, edgeThickness: 5,
            edgeDepth: 15, shape: 'kidney', angleType: 'rounded'
        },
        'smoothing': {
            length: 100, width: 50, thickness: 4, edgeThickness: 1.5,
            edgeDepth: 20, shape: 'oval', angleType: 'rounded'
        }
    };
    
    const config = presets[preset];
    if (!config) return;
    
    // Apply each config value to corresponding control
    Object.keys(config).forEach(key => {
        const element = document.getElementById(key.replace(/([A-Z])/g, '-$1').toLowerCase());
        if (element) {
            element.value = config[key];
            if (element.type === 'checkbox') {
                element.checked = config[key];
            }
            element.dispatchEvent(new Event('input'));
            element.dispatchEvent(new Event('change'));
        }
    });
    
    showToast('Preset applied: ' + preset.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
    updateRib();
}

// ========================================
// EXPORT FUNCTIONS
// ========================================

/**
 * Export geometry as STL file
 * STL is the standard format for 3D printing
 */
function exportSTL() {
    const geometry = appRib.geometry;
    const vertices = geometry.attributes.position.array;
    const indices = geometry.index.array;
    
    // Build STL file content (ASCII format)
    let output = 'solid pottery_rib\n';
    
    // Write each triangle
    for (let i = 0; i < indices.length; i += 3) {
        const i1 = indices[i] * 3;
        const i2 = indices[i + 1] * 3;
        const i3 = indices[i + 2] * 3;
        
        const v1 = new THREE.Vector3(vertices[i1], vertices[i1 + 1], vertices[i1 + 2]);
        const v2 = new THREE.Vector3(vertices[i2], vertices[i2 + 1], vertices[i2 + 2]);
        const v3 = new THREE.Vector3(vertices[i3], vertices[i3 + 1], vertices[i3 + 2]);
        
        // Calculate normal vector
        const normal = new THREE.Vector3().crossVectors(
            new THREE.Vector3().subVectors(v2, v1),
            new THREE.Vector3().subVectors(v3, v1)
        ).normalize();
        
        // Write triangle in STL format
        output += `  facet normal ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}\n`;
        output += '    outer loop\n';
        output += `      vertex ${v1.x.toFixed(6)} ${v1.y.toFixed(6)} ${v1.z.toFixed(6)}\n`;
        output += `      vertex ${v2.x.toFixed(6)} ${v2.y.toFixed(6)} ${v2.z.toFixed(6)}\n`;
        output += `      vertex ${v3.x.toFixed(6)} ${v3.y.toFixed(6)} ${v3.z.toFixed(6)}\n`;
        output += '    endloop\n';
        output += '  endfacet\n';
    }
    
    output += 'endsolid pottery_rib\n';
    
    // Trigger download
    const blob = new Blob([output], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'pottery_rib.stl';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    
    showToast('STL file downloaded successfully');
}

/**
 * Export geometry as OBJ file
 * OBJ is a simpler format good for general 3D software
 */
function exportOBJ() {
    const geometry = appRib.geometry;
    const vertices = geometry.attributes.position.array;
    const indices = geometry.index.array;
    
    // Build OBJ file content
    let output = '# Pottery Rib\n';
    output += '# Generated by Pottery Rib Customizer\n\n';
    
    // Write vertices
    for (let i = 0; i < vertices.length; i += 3) {
        output += `v ${vertices[i].toFixed(6)} ${vertices[i + 1].toFixed(6)} ${vertices[i + 2].toFixed(6)}\n`;
    }
    
    output += '\n';
    
    // Write faces (OBJ uses 1-based indexing)
    for (let i = 0; i < indices.length; i += 3) {
        output += `f ${indices[i] + 1} ${indices[i + 1] + 1} ${indices[i + 2] + 1}\n`;
    }
    
    // Trigger download
    const blob = new Blob([output], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'pottery_rib.obj';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    
    showToast('OBJ file downloaded successfully');
}

// ========================================
// UI HELPER FUNCTIONS
// ========================================

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {boolean} isError - Whether this is an error message
 */
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    toast.style.borderColor = isError ? '#dc3545' : 'var(--primary-blue)';
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * Toggle grid overlay on canvas
 */
function toggleGrid() {
    showGrid = !showGrid;
    const gridCanvas = document.getElementById('grid-overlay');
    
    if (showGrid) {
        const ctx = gridCanvas.getContext('2d');
        gridCanvas.width = gridCanvas.parentElement.clientWidth;
        gridCanvas.height = gridCanvas.parentElement.clientHeight;
        
        ctx.strokeStyle = 'rgba(0, 102, 204, 0.3)';
        ctx.lineWidth = 1;
        
        const gridSize = 50;
        for (let x = 0; x < gridCanvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, gridCanvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < gridCanvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(gridCanvas.width, y);
            ctx.stroke();
        }
        
        showToast('Grid overlay enabled');
    } else {
        const ctx = gridCanvas.getContext('2d');
        ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        showToast('Grid overlay disabled');
    }
}

/**
 * Toggle collapsible section
 * @param {string} sectionId - ID of section to toggle
 */
function toggleSection(sectionId) {
    const content = document.getElementById(sectionId + '-content');
    const icon = document.getElementById(sectionId + '-icon');
    
    content.classList.toggle('open');
    icon.classList.toggle('fa-chevron-down');
    icon.classList.toggle('fa-chevron-up');
}

/**
 * Update thickness suggestions based on current thickness
 */
function updateThicknessSuggestions() {
    const thickness = parseFloat(document.getElementById('thickness').value);
    document.getElementById('current-thickness-display').textContent = thickness + 'mm';
    document.getElementById('petg-suggestion').textContent = (thickness + 1) + '-' + (thickness + 2) + 'mm';
    document.getElementById('tpu-suggestion').textContent = (thickness + 2) + '-' + (thickness + 4) + 'mm';
}

// ========================================
// EVENT LISTENERS
// ========================================

// Setup input synchronization for sliders and number inputs
['length', 'width', 'thickness', 'edge-thickness', 'edge-angle', 'edge-depth', 
 'longitudinal-curve', 'smoothing-amount'].forEach(id => {
    const slider = document.getElementById(id);
    const input = document.getElementById(id + '-input');
    const display = document.getElementById(id + '-value');
    
    if (slider && display) {
        slider.addEventListener('input', (e) => {
            const value = e.target.value;
            const unit = id.includes('angle') ? '°' : (id.includes('curve') || id.includes('smoothing') ? '%' : 'mm');
            display.textContent = value + unit;
            if (input) input.value = value;
            
            if (id === 'thickness') {
                updateThicknessSuggestions();
            }
            
            debouncedUpdate();
        });
    }
    
    if (input && display) {
        input.addEventListener('input', (e) => {
            const min = parseFloat(e.target.min);
            const max = parseFloat(e.target.max);
            const value = Math.min(Math.max(e.target.value, min), max);
            e.target.value = value;
            if (slider) slider.value = value;
            const unit = id.includes('angle') ? '°' : (id.includes('curve') || id.includes('smoothing') ? '%' : 'mm');
            display.textContent = value + unit;
            
            if (id === 'thickness') {
                updateThicknessSuggestions();
            }
            
            debouncedUpdate();
        });
    }
});

// Asymmetric edge thickness controls
['edge-top', 'edge-bottom', 'edge-left', 'edge-right'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
        input.addEventListener('input', debouncedUpdate);
    }
});

// Asymmetric angle controls
['angle-top', 'angle-bottom', 'angle-left', 'angle-right'].forEach(id => {
    const select = document.getElementById(id);
    if (select) {
        select.addEventListener('change', debouncedUpdate);
    }
});

// Shape selector
document.getElementById('shape').addEventListener('change', (e) => {
    const customShapeInfo = document.getElementById('custom-shape-info');
    customShapeInfo.style.display = e.target.value === 'custom' ? 'block' : 'none';
    debouncedUpdate();
});

// Edge angle type selector
document.getElementById('angle-type').addEventListener('change', (e) => {
    const value = e.target.value;
    document.getElementById('custom-angle-control').style.display = 
        value === 'custom-angle' ? 'block' : 'none';
    document.getElementById('asymmetric-angle-controls').style.display = 
        value === 'asymmetric' ? 'block' : 'none';
    debouncedUpdate();
});

// Edge thickness application selector
document.getElementById('edge-thickness-apply').addEventListener('change', (e) => {
    document.getElementById('asymmetric-controls').style.display = 
        e.target.value === 'asymmetric' ? 'block' : 'none';
    debouncedUpdate();
});

// Apply all edges checkbox
document.getElementById('apply-all-edges').addEventListener('change', debouncedUpdate);

// Window load - initialize everything
window.addEventListener('load', () => {
    initScene();
    drawGrid();
    updateThicknessSuggestions();
});

// Window resize - update canvas and camera
window.addEventListener('resize', () => {
    const container = document.getElementById('canvas-container');
    appCamera.aspect = container.clientWidth / container.clientHeight;
    appCamera.updateProjectionMatrix();
    appRenderer.setSize(container.clientWidth, container.clientHeight);
    
    initThumbnails();
    updateThumbnails();
});

/**
 * Get all geometry parameters from UI controls
 * Collects current values from all input fields
 * 
 * /@returns {Object} Parameters object with all rib properties
 */
function getGeometryParameters() {
    const edgeThicknessApply = document.getElementById('edge-thickness-apply').value;
    const angleType = document.getElementById('angle-type').value;
    
    return {
        // Basic dimensions
        length: parseFloat(document.getElementById('length').value),
        width: parseFloat(document.getElementById('width').value),
        thickness: parseFloat(document.getElementById('thickness').value),
        
        // Edge thickness settings
        edgeThickness: parseFloat(document.getElementById('edge-thickness').value),
        edgeThicknessApply: edgeThicknessApply,
        edgeTop: edgeThicknessApply === 'asymmetric' ? parseFloat(document.getElementById('edge-top')?.value || 6) : null,
        edgeBottom: edgeThicknessApply === 'asymmetric' ? parseFloat(document.getElementById('edge-bottom')?.value || 6) : null,
        edgeLeft: edgeThicknessApply === 'asymmetric' ? parseFloat(document.getElementById('edge-left')?.value || 6) : null,
        edgeRight: edgeThicknessApply === 'asymmetric' ? parseFloat(document.getElementById('edge-right')?.value || 6) : null,
        
        // Shape settings
        shape: document.getElementById('shape').value,
        
        // Edge angle/profile settings
        angleType: angleType,
        angleTop: angleType === 'asymmetric' ? document.getElementById('angle-top')?.value || 'miter' : null,
        angleBottom: angleType === 'asymmetric' ? document.getElementById('angle-bottom')?.value || 'miter' : null,
        angleLeft: angleType === 'asymmetric' ? document.getElementById('angle-left')?.value || 'miter' : null,
        angleRight: angleType === 'asymmetric' ? document.getElementById('angle-right')?.value || 'miter' : null,
        customAngle: parseFloat(document.getElementById('edge-angle').value || 45),
        
        // Edge depth and application
        edgeDepth: parseFloat(document.getElementById('edge-depth').value),
        applyAllEdges: document.getElementById('apply-all-edges').checked,
        
        // Longitudinal curve (bow)
        longitudinalCurve: parseFloat(document.getElementById('longitudinal-curve')?.value || 0)
    };
}

/**
 * Calculate position for a single vertex considering all modifiers
 * This is where shape, edge profiles, thickness variations all come together
 * 
 * @param {number} x - X position (along length)
 * @param {number} s - Width parameter (0-1)
 * @param {number} t - Length parameter (0-1)
 * @param {Object} params - All geometry parameters
 * @param {Array} smoothedCurve - Custom curve points (if applicable)
 * @param {number} widthSegments - Number of width divisions
 * @param {number} curveOffset - Longitudinal curve offset
 * @returns {Object} {y, topZ, bottomZ} - Vertex position data
 */
function calculateVertexPosition(x, s, t, params, smoothedCurve, widthSegments, curveOffset = 0) {
    // Start with basic Y position (along width)
    let y = (s - 0.5) * params.width;
    
    // Apply shape modifier (for oval, kidney, etc.)
    let shapeModifier = 1;
    if (smoothedCurve) {
        // Use custom drawn curve
        const pointIndex = Math.floor(t * (smoothedCurve.length - 1));
        const point = smoothedCurve[Math.min(pointIndex, smoothedCurve.length - 1)];
        if (point) {
            const curveInfluence = s;
            const centerY = 0.5;
            const curveModifier = 1 - Math.abs(point.y - centerY) * 1.5;
            const clampedModifier = Math.max(0.1, Math.min(1, curveModifier));
            shapeModifier = 1.0 * (1 - curveInfluence) + clampedModifier * curveInfluence;
        }
    } else {
        // Use predefined shape modifier
        shapeModifier = getShapeModifier(t, s, params.shape);
    }
    
    y *= shapeModifier;
    
    // Calculate distances to each edge for thickness/angle transitions
    const actualWidth = params.width * Math.abs(shapeModifier);
    const actualLength = params.length;
    const distFromTop = actualWidth * (1 - s);
    const distFromBottom = actualWidth * s;
    const distFromLeft = actualLength * t;
    const distFromRight = actualLength * (1 - t);
    let minDistToEdge = Math.min(distFromTop, distFromBottom, distFromLeft, distFromRight);
    
    // Determine which edge we're closest to
    const isNearTop = distFromTop === minDistToEdge;
    const isNearBottom = distFromBottom === minDistToEdge;
    const isNearLeft = distFromLeft === minDistToEdge;
    const isNearRight = distFromRight === minDistToEdge;
    const isShapingEdge = isNearTop;
    
    // Calculate thickness at this point
    let currentThickness = params.thickness;
    let targetEdgeThickness = params.edgeThickness;
    
    // Apply asymmetric thickness if specified
    if (params.edgeThicknessApply === 'asymmetric') {
        if (isNearTop) targetEdgeThickness = params.edgeTop;
        else if (isNearBottom) targetEdgeThickness = params.edgeBottom;
        else if (isNearLeft) targetEdgeThickness = params.edgeLeft;
        else if (isNearRight) targetEdgeThickness = params.edgeRight;
    }
    
    // Transition thickness near edges
    if (minDistToEdge <= params.edgeDepth) {
        const edgeProgress = minDistToEdge / params.edgeDepth;
        const shouldApplyEdgeThickness = 
            params.edgeThicknessApply === 'all' || 
            params.edgeThicknessApply === 'asymmetric' ||
            (params.edgeThicknessApply === 'shaping' && isShapingEdge);
        
        if (shouldApplyEdgeThickness) {
            // Interpolate between edge and center thickness
            currentThickness = targetEdgeThickness * (1 - edgeProgress) + params.thickness * edgeProgress;
        }
    }
    
    // Calculate Z positions (top and bottom surfaces)
    let topZ = currentThickness / 2 + curveOffset;
    let bottomZ = -currentThickness / 2 - curveOffset;
    
    // Apply edge angle/profile near edges
    if (minDistToEdge <= params.edgeDepth) {
        const edgeProgress = minDistToEdge / params.edgeDepth;
        const shouldApplyAngle = params.applyAllEdges || 
            params.shape === 'oval' || 
            params.shape === 'custom' ||
            isNearTop || 
            distFromBottom === minDistToEdge ||
            distFromLeft <= params.edgeDepth || 
            distFromRight <= params.edgeDepth;
        
        if (shouldApplyAngle) {
            const angleEffect = 1 - edgeProgress;
            
            // Determine which angle type to use
            let edgeAngleType = params.angleType;
            if (params.angleType === 'asymmetric') {
                if (isNearTop) edgeAngleType = params.angleTop;
                else if (isNearBottom) edgeAngleType = params.angleBottom;
                else if (isNearLeft) edgeAngleType = params.angleLeft;
                else if (isNearRight) edgeAngleType = params.angleRight;
            }
            
            // Apply the angle profile
            topZ = applyEdgeAngle(edgeAngleType, params.customAngle, currentThickness, angleEffect) + curveOffset;
            // Blend angle effect toward center
            topZ = topZ * angleEffect + ((currentThickness / 2) + curveOffset) * (1 - angleEffect);
        }
    }
    
    return { y, topZ, bottomZ };
}

/**
 * Validate parameters and show warnings if needed
 * @param {Object} params - Geometry parameters
 */
function validateParameters(params) {
    // Check edge thickness
    const edgeWarning = document.getElementById('edge-thickness-warning');
    if (params.edgeThickness < 0.5) {
        edgeWarning.classList.add('show');
    } else {
        edgeWarning.classList.remove('show');
    }
    
    // Check edge depth
    const depthWarning = document.getElementById('edge-depth-warning');
    if (params.edgeDepth > params.width / 2 || params.edgeDepth > params.length / 2) {
        depthWarning.classList.add('show');
    } else {
        depthWarning.classList.remove('show');
    }
}

// ========================================
// UPDATE FUNCTIONS
// ========================================

/**
 * Update the 3D rib mesh with current parameters
 * Disposes old geometry and creates new one
 */
function updateRib() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.add('show');
    
    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
        try {
            // Clean up old mesh if exists
            if (appRib) {
                appScene.remove(appRib);
                appRib.geometry.dispose();
                appRib.material.dispose();
            }
            
            // Create new geometry
            const geometry = createRibGeometry();
            
            // Create material with red color and smooth shading
            const material = new THREE.MeshStandardMaterial({
                color: 0xd63447,
                roughness: 0.4,
                metalness: 0.2,
                side: THREE.DoubleSide
            });
            
            // Create and add new mesh to scene
            appRib = new THREE.Mesh(geometry, material);
            appScene.add(appRib);
            
            // Update thumbnail views
            updateThumbnails();
        } finally {
            loadingOverlay.classList.remove('show');
        }
    }, 10);
}

/**
 * Debounced update - delays update until user stops adjusting controls
 * Prevents expensive recalculations on every slider movement
 */
function debouncedUpdate() {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(updateRib, 100);
}

/**
 * Animation loop - continuously renders the scene
 */
function animate() {
    requestAnimationFrame(animate);
    appRenderer.render(appScene, appCamera);
}

// ========================================
// STATISTICS CALCULATION
// ========================================

/**
 * Calculate and display rib statistics
 * Includes volume, weight, surface area, and printing recommendations
 * 
 * @param {THREE.BufferGeometry} geometry - The rib geometry
 * @param {Object} params - Geometry parameters
 */
function updateStatistics(geometry, params) {
    const positions = geometry.attributes.position.array;
    const indices = geometry.index.array;
    
    // Calculate volume using divergence theorem
    // Sum signed volumes of tetrahedra formed by origin and each triangle
    let volume = 0;
    for (let i = 0; i < indices.length; i += 3) {
        const i1 = indices[i] * 3;
        const i2 = indices[i + 1] * 3;
        const i3 = indices[i + 2] * 3;
        
        const v1 = [positions[i1], positions[i1 + 1], positions[i1 + 2]];
        const v2 = [positions[i2], positions[i2 + 1], positions[i2 + 2]];
        const v3 = [positions[i3], positions[i3 + 1], positions[i3 + 2]];
        
        // Signed volume of tetrahedron
        volume += Math.abs(
            v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) +
            v2[0] * (v3[1] * v1[2] - v3[2] * v1[1]) +
            v3[0] * (v1[1] * v2[2] - v1[2] * v2[1])
        ) / 6;
    }
    
    // Convert from mm³ to cm³
    volume = Math.abs(volume) / 1000;
    
    // Calculate weight assuming PLA density
    const pla_density = 1.24; // g/cm³
    const weight = volume * pla_density;
    
    // Approximate surface area
    const surfaceArea = (params.length * params.width * 2) / 100;
    
    // Update display
    document.getElementById('stat-volume').textContent = volume.toFixed(2) + ' cm³';
    document.getElementById('stat-weight').textContent = weight.toFixed(1) + ' g';
    document.getElementById('stat-surface').textContent = surfaceArea.toFixed(1) + ' cm²';
    
    // Determine if supports are needed
    const needsSupports = params.angleType === 'sharp' || 
                          (params.angleType === 'custom-angle' && params.customAngle < 30);
    
    // Determine print orientation
    let orientationText = 'Flat';
    if (needsSupports) {
        orientationText = 'On Edge';
    } else if (params.longitudinalCurve > 20) {
        orientationText = 'Flat (curved)';
    }
    document.getElementById('stat-orientation').textContent = orientationText;
    
    // Size comparison for context
    const size = Math.max(params.length, params.width);
    let comparison = 'Approximately palm-sized';
    if (size < 60) comparison = 'Smaller than average palm';
    else if (size > 120) comparison = 'Larger than average palm';
    document.getElementById('stat-comparison').textContent = comparison;
    
    // Update printing tips
    document.getElementById('support-recommendation').textContent = 
        needsSupports ? 'Recommended for steep angles' : 'Usually not needed';
    
    let orientationRecommendation = 'Flat on build plate';
    if (needsSupports) {
        orientationRecommendation = 'Print on edge with supports';
    } else if (params.longitudinalCurve > 20) {
        orientationRecommendation = 'Flat on build plate (curved ribs may need support under the curve)';
    }
    document.getElementById('orientation-recommendation').textContent = orientationRecommendation;
}

// ========================================
// DRAWING CANVAS FUNCTIONS
// ========================================

const drawingCanvas = document.getElementById('drawing-canvas');
const ctx = drawingCanvas.getContext('2d');

/**
 * Draw grid and guides on drawing canvas
 */
function drawGrid() {
    // Clear canvas
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    
    // Draw grid lines
    ctx.strokeStyle = '#f9d96b';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 10; i++) {
        // Horizontal lines
        ctx.beginPath();
        ctx.moveTo(0, i * drawingCanvas.height / 10);
        ctx.lineTo(drawingCanvas.width, i * drawingCanvas.height / 10);
        ctx.stroke();
        
        // Vertical lines
        ctx.beginPath();
        ctx.moveTo(i * drawingCanvas.width / 10, 0);
        ctx.lineTo(i * drawingCanvas.width / 10, drawingCanvas.height);
        ctx.stroke();
    }
    
    // Draw symmetry guide if enabled
    if (document.getElementById('symmetry-guide').checked) {
        ctx.strokeStyle = '#0066cc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, drawingCanvas.height / 2);
        ctx.lineTo(drawingCanvas.width, drawingCanvas.height / 2);
        ctx.stroke();
    }
    
    // Draw instruction text
    ctx.fillStyle = '#0066cc';
    ctx.font = 'bold 14px Nunito';
    ctx.textAlign = 'center';
    ctx.fillText('Draw from left to right', drawingCanvas.width / 2, 20);
}

/**
 * Open the drawing modal for custom shapes
 */
function openDrawingModal() {
    document.getElementById('drawing-modal').classList.add('show');
    drawGrid();
}

/**
 * Close the drawing modal
 */
function closeDrawingModal() {
    document.getElementById('drawing-modal').classList.remove('show');
}

/**
 * Clear all drawing
 */
function clearDrawing() {
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawGrid();
    customCurvePoints = [];
    drawingHistory = [];
}

/**
 * Undo last drawing action
 */
function undoDrawing() {
    if (drawingHistory.length > 0) {
        customCurvePoints = [...drawingHistory];
        ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        drawGrid();
        redrawCustomCurve();
    }
}

/**
 * Redraw the custom curve from stored points
 */
function redrawCustomCurve() {
    if (customCurvePoints.length < 2) return;
    
    ctx.strokeStyle = '#d63447';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(
        customCurvePoints[0].x * drawingCanvas.width,
        customCurvePoints[0].y * drawingCanvas.height
    );
    
    for (let i = 1; i < customCurvePoints.length; i++) {
        ctx.lineTo(
            customCurvePoints[i].x * drawingCanvas.width,
            customCurvePoints[i].y * drawingCanvas.height
        );
    }
    ctx.stroke();
}

/**
 * Apply the custom curve to the rib geometry
 */
function applyCustomCurve() {
    if (customCurvePoints.length > 5) {
        updateRib();
        closeDrawingModal();
        showToast('Custom shape applied successfully');
    } else {
        showToast('Please draw a longer curve (draw from left to right across the canvas)', true);
    }
}

// Drawing event listeners
drawingCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    drawingHistory = [...customCurvePoints];
    const rect = drawingCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / drawingCanvas.width;
    const y = (e.clientY - rect.top) / drawingCanvas.height;
    customCurvePoints.push({ x, y });
});

drawingCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    
    const rect = drawingCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / drawingCanvas.width;
    const y = (e.clientY - rect.top) / drawingCanvas.height;
    
    customCurvePoints.push({ x, y });
    
    if (customCurvePoints.length > 1) {
        const prevPoint = customCurvePoints[customCurvePoints.length - 2];
        const currPoint = customCurvePoints[customCurvePoints.length - 1];
        
        ctx.strokeStyle = '#d63447';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(prevPoint.x * drawingCanvas.width, prevPoint.y * drawingCanvas.height);
        ctx.lineTo(currPoint.x * drawingCanvas.width, currPoint.y * drawingCanvas.height);
        ctx.stroke();
    }
});

drawingCanvas.addEventListener('mouseup', () => {
    isDrawing = false;
});

document.getElementById('symmetry-guide').addEventListener('change', () => {
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawGrid();
    redrawCustomCurve();
});

// ========================================
// PRESET CONFIGURATIONS
// ========================================

/**
 * Apply a preset configuration
 * @param {string} preset - Preset name
 */
function applyPreset(preset) {
    const presets = {
        'thin-flexible': {
            length: 120, width: 60, thickness: 3, edgeThickness: 1,
            edgeDepth: 15, shape: 'oval', angleType: 'rounded'
        },
        'thick-rigid': {
            length: 100, width: 70, thickness: 10, edgeThickness: 8,
            edgeDepth: 12, shape: 'rectangular', angleType: 'miter'
        },
        'kidney-style': {
            length: 110, width: 80, thickness: 6, edgeThickness: 3,
            edgeDepth: 10, shape: 'kidney', angleType: 'rounded'
        },
        'trimming': {
            length: 70, width: 40, thickness: 5, edgeThickness: 2,
            edgeDepth: 8, shape: 'teardrop', angleType: 'bevel'
        },
        'throwing': {
            length: 150, width: 90, thickness: 8, edgeThickness: 5,
            edgeDepth: 15, shape: 'kidney', angleType: 'rounded'
        },
        'smoothing': {
            length: 100, width: 50, thickness: 4, edgeThickness: 1.5,
            edgeDepth: 20, shape: 'oval', angleType: 'rounded'
        }
    };
    
    const config = presets[preset];
    if (!config) return;
    
    // Apply each config value to corresponding control
    Object.keys(config).forEach(key => {
        const element = document.getElementById(key.replace(/([A-Z])/g, '-$1').toLowerCase());
        if (element) {
            element.value = config[key];
            if (element.type === 'checkbox') {
                element.checked = config[key];
            }
            element.dispatchEvent(new Event('input'));
            element.dispatchEvent(new Event('change'));
        }
    });
    
    showToast('Preset applied: ' + preset.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
    updateRib();
}

// ========================================
// EXPORT FUNCTIONS
// ========================================

/**
 * Export geometry as STL file
 * STL is the standard format for 3D printing
 */
function exportSTL() {
    const geometry = appRib.geometry;
    const vertices = geometry.attributes.position.array;
    const indices = geometry.index.array;
    
    // Build STL file content (ASCII format)
    let output = 'solid pottery_rib\n';
    
    // Write each triangle
    for (let i = 0; i < indices.length; i += 3) {
        const i1 = indices[i] * 3;
        const i2 = indices[i + 1] * 3;
        const i3 = indices[i + 2] * 3;
        
        const v1 = new THREE.Vector3(vertices[i1], vertices[i1 + 1], vertices[i1 + 2]);
        const v2 = new THREE.Vector3(vertices[i2], vertices[i2 + 1], vertices[i2 + 2]);
        const v3 = new THREE.Vector3(vertices[i3], vertices[i3 + 1], vertices[i3 + 2]);
        
        // Calculate normal vector
        const normal = new THREE.Vector3().crossVectors(
            new THREE.Vector3().subVectors(v2, v1),
            new THREE.Vector3().subVectors(v3, v1)
        ).normalize();
        
        // Write triangle in STL format
        output += `  facet normal ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}\n`;
        output += '    outer loop\n';
        output += `      vertex ${v1.x.toFixed(6)} ${v1.y.toFixed(6)} ${v1.z.toFixed(6)}\n`;
        output += `      vertex ${v2.x.toFixed(6)} ${v2.y.toFixed(6)} ${v2.z.toFixed(6)}\n`;
        output += `      vertex ${v3.x.toFixed(6)} ${v3.y.toFixed(6)} ${v3.z.toFixed(6)}\n`;
        output += '    endloop\n';
        output += '  endfacet\n';
    }
    
    output += 'endsolid pottery_rib\n';
    
    // Trigger download
    const blob = new Blob([output], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'pottery_rib.stl';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    
    showToast('STL file downloaded successfully');
}

/**
 * Export geometry as OBJ file
 * OBJ is a simpler format good for general 3D software
 */
function exportOBJ() {
    const geometry = appRib.geometry;
    const vertices = geometry.attributes.position.array;
    const indices = geometry.index.array;
    
    // Build OBJ file content
    let output = '# Pottery Rib\n';
    output += '# Generated by Pottery Rib Customizer\n\n';
    
    // Write vertices
    for (let i = 0; i < vertices.length; i += 3) {
        output += `v ${vertices[i].toFixed(6)} ${vertices[i + 1].toFixed(6)} ${vertices[i + 2].toFixed(6)}\n`;
    }
    
    output += '\n';
    
    // Write faces (OBJ uses 1-based indexing)
    for (let i = 0; i < indices.length; i += 3) {
        output += `f ${indices[i] + 1} ${indices[i + 1] + 1} ${indices[i + 2] + 1}\n`;
    }
    
    // Trigger download
    const blob = new Blob([output], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'pottery_rib.obj';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    
    showToast('OBJ file downloaded successfully');
}

// ========================================
// UI HELPER FUNCTIONS
// ========================================

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {boolean} isError - Whether this is an error message
 */
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    toast.style.borderColor = isError ? '#dc3545' : 'var(--primary-blue)';
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * Toggle grid overlay on canvas
 */
function toggleGrid() {
    showGrid = !showGrid;
    const gridCanvas = document.getElementById('grid-overlay');
    
    if (showGrid) {
        const ctx = gridCanvas.getContext('2d');
        gridCanvas.width = gridCanvas.parentElement.clientWidth;
        gridCanvas.height = gridCanvas.parentElement.clientHeight;
        
        ctx.strokeStyle = 'rgba(0, 102, 204, 0.3)';
        ctx.lineWidth = 1;
        
        const gridSize = 50;
        for (let x = 0; x < gridCanvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, gridCanvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < gridCanvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(gridCanvas.width, y);
            ctx.stroke();
        }
        
        showToast('Grid overlay enabled');
    } else {
        const ctx = gridCanvas.getContext('2d');
        ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        showToast('Grid overlay disabled');
    }
}

/**
 * Toggle collapsible section
 * @param {string} sectionId - ID of section to toggle
 */
function toggleSection(sectionId) {
    const content = document.getElementById(sectionId + '-content');
    const icon = document.getElementById(sectionId + '-icon');
    
    content.classList.toggle('open');
    icon.classList.toggle('fa-chevron-down');
    icon.classList.toggle('fa-chevron-up');
}

/**
 * Update thickness suggestions based on current thickness
 */
function updateThicknessSuggestions() {
    const thickness = parseFloat(document.getElementById('thickness').value);
    document.getElementById('current-thickness-display').textContent = thickness + 'mm';
    document.getElementById('petg-suggestion').textContent = (thickness + 1) + '-' + (thickness + 2) + 'mm';
    document.getElementById('tpu-suggestion').textContent = (thickness + 2) + '-' + (thickness + 4) + 'mm';
}

// ========================================
// EVENT LISTENERS
// ========================================

// Setup input synchronization for sliders and number inputs
['length', 'width', 'thickness', 'edge-thickness', 'edge-angle', 'edge-depth', 
 'longitudinal-curve', 'smoothing-amount'].forEach(id => {
    const slider = document.getElementById(id);
    const input = document.getElementById(id + '-input');
    const display = document.getElementById(id + '-value');
    
    if (slider && display) {
        slider.addEventListener('input', (e) => {
            const value = e.target.value;
            const unit = id.includes('angle') ? '°' : (id.includes('curve') || id.includes('smoothing') ? '%' : 'mm');
            display.textContent = value + unit;
            if (input) input.value = value;
            
            if (id === 'thickness') {
                updateThicknessSuggestions();
            }
            
            debouncedUpdate();
        });
    }
    
    if (input && display) {
        input.addEventListener('input', (e) => {
            const min = parseFloat(e.target.min);
            const max = parseFloat(e.target.max);
            const value = Math.min(Math.max(e.target.value, min), max);
            e.target.value = value;
            if (slider) slider.value = value;
            const unit = id.includes('angle') ? '°' : (id.includes('curve') || id.includes('smoothing') ? '%' : 'mm');
            display.textContent = value + unit;
            
            if (id === 'thickness') {
                updateThicknessSuggestions();
            }
            
            debouncedUpdate();
        });
    }
});

// Asymmetric edge thickness controls
['edge-top', 'edge-bottom', 'edge-left', 'edge-right'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
        input.addEventListener('input', debouncedUpdate);
    }
});

// Asymmetric angle controls
['angle-top', 'angle-bottom', 'angle-left', 'angle-right'].forEach(id => {
    const select = document.getElementById(id);
    if (select) {
        select.addEventListener('change', debouncedUpdate);
    }
});

// Shape selector
document.getElementById('shape').addEventListener('change', (e) => {
    const customShapeInfo = document.getElementById('custom-shape-info');
    customShapeInfo.style.display = e.target.value === 'custom' ? 'block' : 'none';
    debouncedUpdate();
});

// Edge angle type selector
document.getElementById('angle-type').addEventListener('change', (e) => {
    const value = e.target.value;
    document.getElementById('custom-angle-control').style.display = 
        value === 'custom-angle' ? 'block' : 'none';
    document.getElementById('asymmetric-angle-controls').style.display = 
        value === 'asymmetric' ? 'block' : 'none';
    debouncedUpdate();
});

// Edge thickness application selector
document.getElementById('edge-thickness-apply').addEventListener('change', (e) => {
    document.getElementById('asymmetric-controls').style.display = 
        e.target.value === 'asymmetric' ? 'block' : 'none';
    debouncedUpdate();
});

// Apply all edges checkbox
document.getElementById('apply-all-edges').addEventListener('change', debouncedUpdate);

// Window load - initialize everything
window.addEventListener('load', () => {
    initScene();
    drawGrid();
    updateThicknessSuggestions();
});

// Window resize - update canvas and camera
window.addEventListener('resize', () => {
    const container = document.getElementById('canvas-container');
    appCamera.aspect = container.clientWidth / container.clientHeight;
    appCamera.updateProjectionMatrix();
    appRenderer.setSize(container.clientWidth, container.clientHeight);
    
    initThumbnails();
    updateThumbnails();
});
