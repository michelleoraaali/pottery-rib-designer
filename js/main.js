const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth/container.clientHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setClearColor(0xffffff, 0);
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
camera.position.set(0, 50, 150);
controls.update();

scene.add(new THREE.DirectionalLight(0xffffff, 1).position.set(0,50,50));
scene.add(new THREE.AmbientLight(0xaaaaaa));

let ribMesh;
let customCurvePoints = [];

function createRibGeometry(params, customCurvePoints=null) {
  const width = params.size;
  const thickness = params.thickness;
  const curveFactor = params.curve;

  const shape = new THREE.Shape();
  if(params.edgeType === "custom" && customCurvePoints.length) {
    shape.moveTo(customCurvePoints[0].x, customCurvePoints[0].y);
    customCurvePoints.forEach(p => shape.lineTo(p.x, p.y));
  } else if(params.edgeType === "bevel") {
    shape.moveTo(0,0);
    shape.lineTo(width*0.8,0);
    shape.lineTo(width,thickness);
    shape.lineTo(0,thickness);
  } else if(params.edgeType === "curved") {
    shape.moveTo(0,0);
    shape.quadraticCurveTo(width/2, thickness*curveFactor*10, width,0);
    shape.lineTo(width,thickness);
    shape.lineTo(0,thickness);
  } else {
    shape.moveTo(0,0);
    shape.lineTo(width,0);
    shape.lineTo(width,thickness);
    shape.lineTo(0,thickness);
  }

  const extrudeSettings = { depth: 5, bevelEnabled: false, steps:1 };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  if(params.texture === "ridges") {
    for(let i=0; i<geometry.attributes.position.count; i+=10) {
      geometry.attributes.position.setZ(i, geometry.attributes.position.getZ(i)+Math.sin(i/5)*1);
    }
  } else if(params.texture === "dots") {
    for(let i=0; i<geometry.attributes.position.count; i+=15) {
      geometry.attributes.position.setZ(i, geometry.attributes.position.getZ(i)+Math.random()*2);
    }
  }

  geometry.computeVertexNormals();
  return geometry;
}

function updateRib() {
  const params = {
    size: parseFloat(document.getElementById('size').value),
    thickness: parseFloat(document.getElementById('thickness').value),
    edgeType: document.getElementById('edgeType').value,
    curve: parseFloat(document.getElementById('curve').value),
    texture: document.getElementById('texture').value
  };
  const geometry = createRibGeometry(params, customCurvePoints);
  if(ribMesh) scene.remove(ribMesh);
  const material = new THREE.MeshStandardMaterial({color:0x4a90e2, metalness:0.3, roughness:0.7});
  ribMesh = new THREE.Mesh(geometry, material);
  scene.add(ribMesh);
}

// Custom curve drawing
const drawCanvasContainer = document.getElementById('drawCanvasContainer');
const drawCanvas = document.getElementById('drawCanvas');
const ctx = drawCanvas.getContext('2d');
let drawing = false;

document.getElementById('edgeType').addEventListener('change', (e)=>{
  if(e.target.value === "custom") drawCanvasContainer.style.display = "block";
  else {
    customCurvePoints = [];
    updateRib();
  }
});

drawCanvas.addEventListener('mousedown', () => drawing=true);
drawCanvas.addEventListener('mouseup', () => drawing=false);
drawCanvas.addEventListener('mouseout', () => drawing=false);
drawCanvas.addEventListener('mousemove', (e)=>{
  if(!drawing) return;
  const rect = drawCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  customCurvePoints.push({x:x, y:y});
  ctx.fillStyle="#4a90e2";
  ctx.beginPath();
  ctx.arc(x, y, 2,0,2*Math.PI);
  ctx.fill();
});

document.querySelector('.btn-close-canvas').addEventListener('click', ()=>{
  drawCanvasContainer.style.display = "none";
  ctx.clearRect(0,0,drawCanvas.width, drawCanvas.height);
});

document.getElementById('saveCurve').addEventListener('click', ()=>{
  drawCanvasContainer.style.display = "none";
  ctx.clearRect(0,0,drawCanvas.width, drawCanvas.height);
  updateRib();
});

// Controls events
['size','thickness','curve','texture'].forEach(id=>{
  document.getElementById(id).addEventListener('input', updateRib);
});

// Download STL / OBJ
document.getElementById('downloadSTL').addEventListener('click', ()=>{
  const exporter = new THREE.STLExporter();
  const stlString = exporter.parse(ribMesh);
  const blob = new Blob([stlString], {type:'text/plain'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'pottery_rib.stl';
  link.click();
});

document.getElementById('downloadOBJ').addEventListener('click', ()=>{
  const exporter = new THREE.OBJExporter();
  const objString = exporter.parse(ribMesh);
  const blob = new Blob([objString], {type:'text/plain'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'pottery_rib.obj';
  link.click();
});

// Animate
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
updateRib();

window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth/container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});
