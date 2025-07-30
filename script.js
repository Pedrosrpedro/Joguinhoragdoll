// NOTE: All Matter.js modules are now prefixed with 'Matter.' to avoid name conflicts.
// Example: Engine.create() is now Matter.Engine.create()

let engine, world, runner, playerRagdoll, mouseSpring = null;
let objetos = [], particulas = [], outrosRagdolls = [], manchas = [], cordas = [], explosions = [];
let propulsores = [], pistoes = [], ativadores = [], c4s = [];
let teleporters = [];

let objetoParaCriar = 'mao';
let activePistol = null; 
let activeVehicle = null;
let waterZones = [];
let screenShake = { intensity: 0, duration: 0 };

let gameState = 'MENU';
let modalReturnState = 'MENU';
let currentMapType = 'padrao';

let ropeStartPoint = null;
let ropeStartBody = null;

let camera = { x: 0, y: 0, zoom: 1.0 };
let cameraFollowTarget = null;
let isPanning = false;
let panStart = { x: 0, y: 0 };

let showGrid = true;
let showBlood = true;
let showSyringeInfo = false;
let heldSyringeForInfo = null;
let isSlowMotion = false; 

let mobileControlsEnabled = false;
let vehicleInput = 0;
let mobileGrabbing = false;

// --- NOVO: Variáveis para sistema de salvar/selecionar ---
let isSelecting = false;
let selectionBox = { start: null, end: null };
let selectedObjects = { bodies: [], constraints: [] };
let constructionToSpawn = null;
let portalParaLinkar = null;

// --- NOVO: Variáveis para Sprites ---
let tijolosSprite, portalSprite, caixaSprite;


// Game constants
let GROUND_Y = 2000;
let PLAYER_SPAWN_X = 400;
let PLAYER_SPAWN_Y = GROUND_Y - 150;

const VEHICLE_TORQUE = 0.01; 
const VEHICLE_MAX_SPEED = 0.6;
const VEHICLE_BRAKE_DAMPING = 0.9;
const FORCA_MARRETA = 0.5;

const LIMIAR_DE_DANO_VELOCIDADE = 5.0, LIMIAR_EMPALAMENTO = 15.0;
const LIMIAR_INJECAO_SERINGA = 7.0;
const LIMIAR_NOCAUTE_VELOCIDADE = 8.0; 
const LIMIAR_EXPLOSAO_VOLATIL = 12.0; 
const DANO_POR_VELOCIDADE = 3.0; 
const DANO_PISTOLA = 50; 
const DANO_CABECAMULTIPLIER = 1.5; 
const SAUDE_MINIMA_MEMBRO_NORMAL = 5; 
const SAUDE_MINIMA_MEMBRO_CRITICO = -50; 

const FORCA_TENSORA = 0.02, FORCA_PESCOCO = 0.015; 
const VELOCIDADE_ROTACAO_CONTROLADA = 0.3;
const NOCAUTE_DURACAO = 4000; 
const RECUPERACAO_DURACAO = 1000; 
const FORCA_RECUPERACAO_VERTICAL = 0.0005; 

let originalGravityY = 2.5; 
let currentGravityY = 2.5; 

// --- NOVO: p5.js Preload Function ---
function preload() {
    // Carrega as imagens antes do jogo iniciar.
    // Certifique-se que os nomes dos arquivos estão corretos!
    tijolosSprite = loadImage('parede_tijolos.png');
    portalSprite = loadImage('portal.png');
    caixaSprite = loadImage('caixa.png');
}

// --- Core Game Functions ---
function mudarEstado(ragdoll, novoEstado) { 
    if(!ragdoll || ragdoll.estado === novoEstado) return; 
    if (ragdoll.isPetrified && novoEstado !== 'ATIVO') return;
    ragdoll.estado = novoEstado; 
    
    if (novoEstado !== 'MORTO' && novoEstado !== 'CARBONIZED') {
        ragdoll.isOnFire = false;
    }
    ragdoll.adrenalineTimer = 0;
    ragdoll.isPetrified = false; 

    if(novoEstado === 'NOCAUTEADO') {
        ragdoll.tempoNocauteado = millis();
        ragdoll.bodies.torso.customProps.selfRighting = false;
        ragdoll.bodies.head.customProps.selfRighting = false;
    } else if(novoEstado === 'ATIVO') {
        ragdoll.bodies.torso.customProps.selfRighting = true;
        ragdoll.bodies.head.customProps.selfRighting = true;
    } else if(novoEstado === 'MORTO' || novoEstado === 'CARBONIZED' || novoEstado === 'SKELETON') {
        ragdoll.tempoMorte = millis();
        ragdoll.bodies.torso.customProps.selfRighting = false;
        ragdoll.bodies.head.customProps.selfRighting = false;
        ragdoll.composite.bodies.forEach(b => Matter.Body.setAngularVelocity(b, 0));
    } else if (novoEstado === 'ZUMBI') {
         ragdoll.bodies.torso.customProps.selfRighting = true;
    } else if (novoEstado === 'PETRIFICADO') {
        ragdoll.bodies.torso.customProps.selfRighting = false;
        ragdoll.bodies.head.customProps.selfRighting = false;
        ragdoll.isPetrified = true;
        ragdoll.internalLiquids.sangue = 0; 
    }
}

function encontrarRagdollPorCorpo(corpo) { 
    if (!corpo) return null;
    if (playerRagdoll && playerRagdoll.composite.bodies.includes(corpo)) return playerRagdoll; 
    return outrosRagdolls.find(r => r.composite.bodies.includes(corpo)); 
}

function menorDiferencaAngular(atual,alvo) { 
    let diferenca=alvo-atual; 
    while(diferenca<=-PI)diferenca+=TWO_PI; 
    while(diferenca>PI)diferenca-=TWO_PI; 
    return diferenca;}

function spawnSangue(x, y, forca) { 
    if (!showBlood) return; 
    const numParticulas = constrain(floor(forca * 0.5), 1, 15); 
    for (let i = 0; i < numParticulas; i++) { 
        particulas.push({ pos: createVector(x, y), vel: p5.Vector.random2D().mult(random(1, forca)), lifespan: 255, type: 'blood' }); 
    } }

function empalar(lamina, corpo, ponto) { 
    if (!ponto || !corpo.customProps || corpo.customProps.juntaAssociada === null) return; 
    const ragdollAlvo = encontrarRagdollPorCorpo(corpo); 
    if (!ragdollAlvo) return; 
    
    if (lamina.customProps && lamina.customProps.empaledBodies && lamina.customProps.empaledBodies.includes(corpo.id)) return;

    const pontoLocalLamina = Matter.Vector.sub(ponto, lamina.position); 
    const pontoLocalCorpo = Matter.Vector.sub(ponto, corpo.position); 
    
    const juntaEmpalamento = Matter.Constraint.create({ 
        bodyA: lamina, 
        bodyB: corpo, 
        pointA: pontoLocalLamina, 
        pointB: pontoLocalCorpo, 
        stiffness: 1.0, 
        length: 0,
        label: 'empalamento'
    }); 
    Matter.World.add(world, juntaEmpalamento); 

    if (!lamina.customProps) lamina.customProps = {};
    if (!lamina.customProps.empaledBodies) lamina.customProps.empaledBodies = [];
    lamina.customProps.empaledBodies.push(corpo.id);

    mudarEstado(ragdollAlvo, 'MORTO'); 
}

function gerarMapa(mapType) {
    const wallOptions = { isStatic: true, label: 'wall' };
    let worldBounds = { width: 4000, height: 4000, groundY: 2000 };
    waterZones = [];
    
    PLAYER_SPAWN_Y = worldBounds.groundY - 150;

    switch(mapType) {
        case 'pequeno':
            worldBounds = { width: 2000, height: 2000, groundY: 1000 };
            PLAYER_SPAWN_X = 400;
            PLAYER_SPAWN_Y = worldBounds.groundY - 150;
            break;
        case 'grande':
            worldBounds = { width: 8000, height: 8000, groundY: 4000 };
            PLAYER_SPAWN_X = 400;
            PLAYER_SPAWN_Y = worldBounds.groundY - 150;
            break;
        case 'montanhas':
            worldBounds = { width: 8000, height: 8000, groundY: 4000 };
            PLAYER_SPAWN_X = -1500;
            PLAYER_SPAWN_Y = worldBounds.groundY - 150;
            const groundM = worldBounds.groundY;
            const mOptions = { ...wallOptions, render: { fillStyle: '#1e1e1e' }};
            const m1Verts = Matter.Vertices.fromPath('0 0 -200 -1200 -1000 -1500 -1500 -800 -2000 0');
            const m2Verts = Matter.Vertices.fromPath('0 0 300 -1000 1000 -1800 1700 -1000 2000 0');
            const m3Verts = Matter.Vertices.fromPath('0 0 1000 0 1000 -3000');
            const m1 = Matter.Bodies.fromVertices(0, 0, [m1Verts], mOptions);
            const m2 = Matter.Bodies.fromVertices(0, 0, [m2Verts], mOptions);
            const m3 = Matter.Bodies.fromVertices(0, 0, [m3Verts], mOptions);
            Matter.Body.setPosition(m1, { x: -3000, y: groundM - (m1.bounds.max.y - m1.position.y) });
            Matter.Body.setPosition(m2, { x: 500, y: groundM - (m2.bounds.max.y - m2.position.y) });
            Matter.Body.setPosition(m3, { x: 3500, y: groundM - (m3.bounds.max.y - m3.position.y) });
            Matter.World.add(world, [m1, m2, m3]);
            break;
        case 'agua':
            worldBounds = { width: 4000, height: 4000, groundY: 2000 };
            PLAYER_SPAWN_X = -1500; 
            const waterDepth = 800;
            const waterLevel = worldBounds.groundY - waterDepth; 
            waterZones.push({ x: -1000, y: waterLevel, width: 4000, height: waterDepth });
            Matter.World.add(world, Matter.Bodies.rectangle(-1500, waterLevel + 400, 1000, 800, wallOptions));
            PLAYER_SPAWN_Y = waterLevel - 150;
            break;
        case 'predio':
             worldBounds = { width: 6000, height: 4000, groundY: 2000 };
             PLAYER_SPAWN_X = 0; 
             const floorHeight = 800;
             Matter.World.add(world, Matter.Bodies.rectangle(0, worldBounds.groundY - floorHeight, 2000, 50, wallOptions));
             Matter.World.add(world, Matter.Bodies.rectangle(1000, worldBounds.groundY - floorHeight * 2, 1500, 50, wallOptions));
             Matter.World.add(world, Matter.Bodies.rectangle(-1000, worldBounds.groundY - floorHeight / 2, 50, floorHeight, wallOptions));
             Matter.World.add(world, Matter.Bodies.rectangle(1000, worldBounds.groundY - floorHeight / 2, 50, floorHeight, wallOptions));
             PLAYER_SPAWN_Y = worldBounds.groundY - floorHeight - 150;
             break;
        case 'abismo':
            worldBounds = { width: 8000, height: 8000, groundY: 8000 }; 
            PLAYER_SPAWN_X = -1500;
            const platY = 2500;
            Matter.World.add(world, Matter.Bodies.rectangle(-1500, platY, 2000, 50, wallOptions));
            Matter.World.add(world, Matter.Bodies.rectangle(1500, platY, 2000, 50, wallOptions));
            PLAYER_SPAWN_Y = platY - 150;
            break;
        case 'padrao':
        default:
            worldBounds = { width: 4000, height: 4000, groundY: 2000 };
            PLAYER_SPAWN_X = 400;
            PLAYER_SPAWN_Y = worldBounds.groundY - 150;
            break;
    }

    GROUND_Y = worldBounds.groundY;
    const halfW = worldBounds.width / 2;
    const halfH = worldBounds.height / 2;
    
    if(mapType !== 'abismo') {
         Matter.World.add(world, Matter.Bodies.rectangle(0, GROUND_Y, worldBounds.width, 50, wallOptions)); 
    }
    Matter.World.add(world, [ 
        Matter.Bodies.rectangle(-halfW, 0, 50, worldBounds.height, wallOptions), 
        Matter.Bodies.rectangle(halfW, 0, 50, worldBounds.height, wallOptions),
        Matter.Bodies.rectangle(0, -halfH, worldBounds.width, 50, wallOptions) 
    ]);
}


// --- Reset and Clear Functions ---
function resetarMundo() { 
    Matter.World.clear(world, false); 
    engine.world.gravity.y = currentGravityY;
    
    const bodiesToRemove = Matter.Composite.allBodies(world).filter(body => body.label !== 'wall');
    if (bodiesToRemove.length > 0) Matter.World.remove(world, bodiesToRemove);
    
    gerarMapa(currentMapType);
    
    objetos = []; particulas = []; outrosRagdolls = []; manchas = []; cordas = []; explosions = [];
    propulsores = []; pistoes = []; ativadores = []; c4s = []; teleporters = [];

    activePistol = null; activeVehicle = null; playerRagdoll = null; 

    playerRagdoll = createRagdoll(PLAYER_SPAWN_X, PLAYER_SPAWN_Y, true);
    Matter.World.add(world, playerRagdoll.composite); 
    mudarEstado(playerRagdoll, 'ATIVO'); 

    Matter.Events.off(engine, 'collisionStart'); 
    Matter.Events.on(engine, 'collisionStart', handleCollisions); 
}

function clearAllBodies() {
    outrosRagdolls.forEach(r => Matter.World.remove(world, r.composite)); 
    outrosRagdolls = [];
    cordas.forEach(c => Matter.World.remove(world, c));
    cordas = [];
    if (activeVehicle) {
        Matter.World.remove(world, activeVehicle.composite);
        activeVehicle = null;
    }
    objetos.forEach(obj => Matter.World.remove(world, obj)); 
    objetos = []; 
    if (playerRagdoll) {
        Matter.World.remove(world, playerRagdoll.composite); 
        playerRagdoll = null;
    }
    activePistol = null; manchas = []; particulas = []; explosions = [];
    propulsores = []; pistoes = []; ativadores = []; c4s = []; teleporters = [];
}

function clearDebris() {
    const objectsToRemove = [];
     for (const body of Matter.Composite.allBodies(world)) {
        if (body.isStatic || (body.customProps && body.customProps.isPlayer !== undefined) ) continue;
        if ( (body.parent.label && (body.parent.label.includes('carro') || body.parent.label.includes('onibus'))) || (body.label && (body.label.includes('car') || body.label.includes('bus'))) ) continue;
        if (body.label.includes('liquid_container') || body.label.includes('gerador') ) continue;
        if (['propulsor', 'pistao_base', 'pistao_braco', 'botao', 'alavanca', 'c4', 'granada', 'portal'].includes(body.label)) continue;
        objectsToRemove.push(body);
    }
    objectsToRemove.forEach(body => Matter.World.remove(world, body));
    manchas = []; particulas = []; 
}

function clearRagdolls() {
    outrosRagdolls.forEach(r => Matter.World.remove(world, r.composite));
    outrosRagdolls = [];
    if (playerRagdoll) { 
        Matter.World.remove(world, playerRagdoll.composite);
        playerRagdoll = null;
    }
    manchas = []; particulas = [];
}

function clearRopes() {
    cordas.forEach(c => Matter.World.remove(world, c));
    cordas = [];
}

// --- UI Setup and Control Functions ---
function setupControles() { 
    document.getElementById('icon-favorites').addEventListener('click', () => switchCategoryAndToggleSidebar('category-favorites-content', 'icon-favorites')); 
    document.getElementById('icon-items-basic').addEventListener('click', () => switchCategoryAndToggleSidebar('category-items-basic', 'icon-items-basic'));
    document.getElementById('icon-firearms').addEventListener('click', () => switchCategoryAndToggleSidebar('category-firearms-content', 'icon-firearms'));
    document.getElementById('icon-explosives').addEventListener('click', () => switchCategoryAndToggleSidebar('category-explosives-content', 'icon-explosives'));
    document.getElementById('icon-people').addEventListener('click', () => switchCategoryAndToggleSidebar('category-people-content', 'icon-people'));
    document.getElementById('icon-vehicles').addEventListener('click', () => switchCategoryAndToggleSidebar('category-vehicles-content', 'icon-vehicles')); 
    document.getElementById('icon-syringes').addEventListener('click', () => switchCategoryAndToggleSidebar('category-syringes-content', 'icon-syringes'));
    document.getElementById('icon-machines').addEventListener('click', () => switchCategoryAndToggleSidebar('category-machines-content', 'icon-machines'));
    document.getElementById('icon-tools-category').addEventListener('click', () => switchCategoryAndToggleSidebar('category-tools-content', 'icon-tools-category'));
    
    document.getElementById('icon-info').addEventListener('click', () => { 
        modalReturnState = 'GAME'; 
        const leftSidebar = document.getElementById('left-sidebar');
        if (!leftSidebar.classList.contains('hidden')) leftSidebar.classList.add('hidden'); 
        showModal('info-modal'); 
    }); 
    
    document.getElementById('icon-save').addEventListener('click', () => {
        modalReturnState = 'GAME';
        const leftSidebar = document.getElementById('left-sidebar');
        if (!leftSidebar.classList.contains('hidden')) leftSidebar.classList.add('hidden'); 
        showModal('save-modal');
        populateSaveModal();
    }); 
    
    document.getElementById('icon-plus').addEventListener('click', () => {
        modalReturnState = 'GAME';
        const leftSidebar = document.getElementById('left-sidebar');
        if (!leftSidebar.classList.contains('hidden')) leftSidebar.classList.add('hidden'); 
        showModal('plus-modal'); 
    });

    document.getElementById('save-selection-btn').addEventListener('click', saveCurrentSelection);


    document.querySelectorAll('.item-btn, .tool-btn').forEach(btn => { 
        btn.addEventListener('click', (e) => selectCreationType(btn.dataset.tipo)); 
    }); 

    document.getElementById('slowMoButton').addEventListener('click', toggleSlowMotion);
    document.getElementById('freezeToggleButton').addEventListener('click', toggleFreeze);

    document.getElementById('settings-button').addEventListener('click', () => { modalReturnState = 'GAME'; showSettingsModal(); }); 
    document.getElementById('environment-button').addEventListener('click', () => { modalReturnState = 'GAME'; showEnvironmentModal(); }); 
    document.getElementById('btnClearAll').addEventListener('click', clearAllBodies); 
    document.getElementById('btnClearDebris').addEventListener('click', clearDebris); 
    document.getElementById('btnClearLiving').addEventListener('click', clearRagdolls); 
    document.getElementById('btnClearRopes').addEventListener('click', clearRopes); 

    document.querySelector('.clear-filter').addEventListener('click', (e) => {
        document.querySelector('.filter-bar input').value = ''; 
    });
    
    
    const btnLeft = document.getElementById('btnVehicleLeft');
    const btnRight = document.getElementById('btnVehicleRight');
    btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); vehicleInput = -1; });
    btnLeft.addEventListener('touchend', (e) => { e.preventDefault(); if(vehicleInput === -1) vehicleInput = 0; });
    btnLeft.addEventListener('mousedown', (e) => { e.preventDefault(); vehicleInput = -1; });
    btnLeft.addEventListener('mouseup', (e) => { e.preventDefault(); if(vehicleInput === -1) vehicleInput = 0; });
    btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); vehicleInput = 1; });
    btnRight.addEventListener('touchend', (e) => { e.preventDefault(); if(vehicleInput === 1) vehicleInput = 0; });
    btnRight.addEventListener('mousedown', (e) => { e.preventDefault(); vehicleInput = 1; });
    btnRight.addEventListener('mouseup', (e) => { e.preventDefault(); if(vehicleInput === 1) vehicleInput = 0; });
    
    document.getElementById('btnSlowMo').addEventListener('click', (e) => { e.preventDefault(); toggleSlowMotion(); });
    document.getElementById('btnZoomOut').addEventListener('click', (e) => { e.preventDefault(); zoomCamera(0.9); });
    document.getElementById('btnZoomIn').addEventListener('click', (e) => { e.preventDefault(); zoomCamera(1.1); });
    
    document.getElementById('btnGrabDrop').addEventListener('click', (e) => { e.preventDefault(); mobileGrabDrop(); });
    document.getElementById('btnFreeze').addEventListener('click', (e) => { e.preventDefault(); mobileFreeze(); });
    document.getElementById('btnDonor').addEventListener('click', (e) => { e.preventDefault(); mobileToggleDonor(); });
    
    document.getElementById('btnMobileDetonate').addEventListener('click', (e) => {
        e.preventDefault();
        detonateAllC4s();
    });

    document.getElementById('btnMobileActivate').addEventListener('click', (e) => {
        e.preventDefault();
        const centerScreen = screenToWorld(width/2, height/2);
        const bodiesNearby = Matter.Query.point(Matter.Composite.allBodies(world), centerScreen);
        const machine = bodiesNearby.find(b => b.label === 'propulsor' || b.label === 'pistao_base');
            
        if (machine) {
            machine.customProps.isActive = !machine.customProps.isActive;
            showNotification(`Máquina ${machine.customProps.isActive ? 'ativada' : 'desativada'}.`);
        }
    });
}


function switchCategoryAndToggleSidebar(contentCategoryId, topBarIconId) {
    const leftSidebar = document.getElementById('left-sidebar');
    const topBarIconElement = document.getElementById(topBarIconId);
    const isAlreadyActive = topBarIconElement && topBarIconElement.classList.contains('active-category-icon');
    const sidebarIsHidden = leftSidebar.classList.contains('hidden');

    if (isAlreadyActive && !sidebarIsHidden) {
        leftSidebar.classList.add('hidden');
    } else {
        leftSidebar.classList.remove('hidden'); 
        switchCategory(contentCategoryId);
    }
    const isTool = ['corda', 'cabo_eletrico', 'tubo_liquido', 'mola', 'prego'].includes(objetoParaCriar);
    if (!isTool) {
         document.getElementById('floating-tool-panel').style.display = 'none';
    }
}

function switchCategory(contentCategoryId) {
    document.querySelectorAll('#top-bar button').forEach(btn => btn.classList.remove('active-category-icon'));
    document.querySelectorAll('.item-category').forEach(div => div.classList.remove('active'));

    let topBarIconElement = null;
    if (contentCategoryId === 'category-items-basic') topBarIconElement = document.getElementById('icon-items-basic');
    else if (contentCategoryId === 'category-firearms-content') topBarIconElement = document.getElementById('icon-firearms');
    else if (contentCategoryId === 'category-explosives-content') topBarIconElement = document.getElementById('icon-explosives');
    else if (contentCategoryId === 'category-people-content') topBarIconElement = document.getElementById('icon-people');
    else if (contentCategoryId === 'category-vehicles-content') topBarIconElement = document.getElementById('icon-vehicles'); 
    else if (contentCategoryId === 'category-syringes-content') topBarIconElement = document.getElementById('icon-syringes');
    else if (contentCategoryId === 'category-machines-content') topBarIconElement = document.getElementById('icon-machines');
    else if (contentCategoryId === 'category-tools-content') topBarIconElement = document.getElementById('icon-tools-category');
    else if (contentCategoryId === 'category-favorites-content') topBarIconElement = document.getElementById('icon-favorites'); 

    if (topBarIconElement) topBarIconElement.classList.add('active-category-icon');
    
    const contentCategoryElement = document.getElementById(contentCategoryId);
    if (contentCategoryElement) { 
        contentCategoryElement.classList.add('active');
    }
    
    const firstButton = contentCategoryElement.querySelector('.item-btn, .tool-btn');
    if (firstButton) {
        selectCreationType(firstButton.dataset.tipo);
    } else {
        selectCreationType(null);
    }
}

function selectCreationType(type) {
    document.querySelectorAll('.item-btn').forEach(btn => btn.classList.remove('active-create-type'));
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('ativo'));

    ropeStartPoint = null; ropeStartBody = null;
    document.getElementById('floating-tool-panel').style.display = 'none';

    if (type) {
        const newActiveItemBtn = document.querySelector(`.item-btn[data-tipo="${type}"]`);
        if (newActiveItemBtn) {
            newActiveItemBtn.classList.add('active-create-type');
            objetoParaCriar = type;
        } else {
            const newActiveToolBtn = document.querySelector(`.tool-btn[data-tipo="${type}"]`); 
            if (newActiveToolBtn) {
                 newActiveToolBtn.classList.add('ativo'); 
                 objetoParaCriar = type;
                 if (['corda', 'cabo_eletrico', 'tubo_liquido', 'mola', 'prego'].includes(type)) {
                     document.getElementById('floating-tool-panel').style.display = 'block';
                     let toolName = type.replace('_', ' de ').replace('cabo', 'Cabo').replace('tubo', 'Tubo').replace('mola', 'Mola').replace('prego', 'Prego');
                     document.getElementById('floating-tool-panel').textContent = `Clique para usar ${toolName}`;
                 }
            } else {
                objetoParaCriar = null;
            }
        }
    } else {
        objetoParaCriar = null; 
    }
}

// --- p5.js Setup and Draw Loop ---
function setup() {
    p5.disableFriendlyErrors = true; 

    const gameContainer = document.getElementById('game-container');
    const canvas = createCanvas(1, 1);
    canvas.parent('game-container');
    const uiElements = [
        document.getElementById('top-bar'), document.getElementById('left-sidebar'), document.getElementById('bottom-bar'),
        document.getElementById('mobile-controls'), document.getElementById('floating-tool-panel'),
        document.getElementById('save-selection-btn')
    ];
    uiElements.forEach(el => { if (el) gameContainer.appendChild(el); });

    colorMode(HSB, 360, 100, 100);
    
    engine = Matter.Engine.create(); 
    world = engine.world;
    runner = Matter.Runner.create({ delta: 1000 / 120, isFixed: true });
    
    Matter.Runner.run(runner, engine);
    Matter.Events.on(engine, 'collisionStart', handleCollisions);

    document.getElementById('main-menu-play').addEventListener('click', showMapSelection);
    document.querySelectorAll('.map-preview-btn').forEach(btn => {
        btn.addEventListener('click', () => iniciarJogoComMapa(btn.dataset.map));
    });

    document.getElementById('main-menu-settings').addEventListener('click', () => { modalReturnState = 'MENU'; showModal('settings-modal'); });
    document.getElementById('main-menu-mods').addEventListener('click', () => { modalReturnState = 'MENU'; showModal('mods-modal'); });
    document.getElementById('main-menu-information').addEventListener('click', () => { modalReturnState = 'MENU'; showModal('info-modal'); });
    document.getElementById('main-menu-quit').addEventListener('click', () => {
    showNotification('Para sair, feche a aba do navegador.');
});

    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.game-modal').style.display = 'none'; 
            gameState = modalReturnState;
        });
    });

    document.getElementById('toggleMobileControls').addEventListener('change', (e) => {
        mobileControlsEnabled = e.target.checked;
        document.getElementById('mobile-controls').classList.toggle('active', mobileControlsEnabled);
        localStorage.setItem('ragdollSandboxMobileControls', JSON.stringify(mobileControlsEnabled));
    });
    
    document.getElementById('toggle-gravity-btn').addEventListener('click', toggleGravity);
    document.getElementById('toggle-grid-cb').addEventListener('change', (e) => { showGrid = e.target.checked; });
    document.getElementById('toggle-blood-cb').addEventListener('change', (e) => { showBlood = e.target.checked; });
    
    const fsCheckbox = document.getElementById('toggle-fullscreen-cb');
    fsCheckbox.addEventListener('change', () => {
        if (fsCheckbox.checked) {
            if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(err => {});
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    });
    
    document.addEventListener('fullscreenchange', () => {
        fsCheckbox.checked = !!document.fullscreenElement;
        setTimeout(() => windowResized(), 100);
    });


    const savedMobileControls = localStorage.getItem('ragdollSandboxMobileControls');
    if (savedMobileControls !== null) {
        mobileControlsEnabled = JSON.parse(savedMobileControls);
        document.getElementById('toggleMobileControls').checked = mobileControlsEnabled;
        document.getElementById('mobile-controls').classList.toggle('active', mobileControlsEnabled);
    }

    setupControles();
    windowResized();
}

function windowResized() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer.offsetWidth > 0 && gameContainer.offsetHeight > 0) {
        resizeCanvas(gameContainer.offsetWidth, gameContainer.offsetHeight);
    }
}

function keyPressed() {
    if (gameState !== 'GAME') return;

    if (key === 'h' || key === 'H') {
        if (mouseSpring && mouseSpring.bodyA && mouseSpring.bodyA.customProps) {
            const props = mouseSpring.bodyA.customProps;
            const ragdoll = encontrarRagdollPorCorpo(mouseSpring.bodyA);
            if (ragdoll) {
                props.mode = (props.mode === 'donor' ? 'normal' : 'donor');
            } else if (props.hasOwnProperty('mode')) {
                props.mode = (props.mode === 'donor' ? 'receiver' : 'donor');
            }
        }
    } else if (key === 'i' || key === 'I') {
        if (mouseSpring && mouseSpring.bodyA.label.startsWith('seringa_')) {
            showSyringeInfo = true;
            heldSyringeForInfo = mouseSpring.bodyA;
        }
    } else if (key === 'r' || key === 'R') {
        if (activePistol) fireFromPistol(activePistol);
    } else if (key === 'p' || key === 'P') {
        toggleSlowMotion();
    } else if (key === 'k' || key === 'K') {
        toggleFreeze();
    } else if (key === '[') {
        zoomCamera(0.9);
    } else if (key === ']') {
        zoomCamera(1.1);
    } else if (key === 'o' || key === 'O') {
        if (cameraFollowTarget) cameraFollowTarget = null;
        else if (mouseSpring && mouseSpring.bodyA) cameraFollowTarget = mouseSpring.bodyA;
    }
    else if (key === 'b' || key === 'B') {
        detonateAllC4s();
    }   
       
    else if (key === 'f' || key === 'F') {
        const worldMouse = screenToWorld(mouseX, mouseY);
        const bodiesUnderMouse = Matter.Query.point(Matter.Composite.allBodies(world), worldMouse);
        
        const machine = bodiesUnderMouse.find(b => b.label === 'propulsor' || b.label === 'pistao_base');
        if (machine) {
            machine.customProps.isActive = !machine.customProps.isActive; 
            showNotification(`Máquina ${machine.customProps.isActive ? 'ativada' : 'desativada'}.`);
            return;
        }
    }
}


function keyReleased() {
     if (key === 'i' || key === 'I') {
        showSyringeInfo = false;
        heldSyringeForInfo = null;
    }
}

function zoomCamera(zoomFactor) {
    const worldPosBefore = screenToWorld(mouseX, mouseY);
    camera.zoom = constrain(camera.zoom * zoomFactor, 0.2, 5.0);
    const worldPosAfter = screenToWorld(mouseX, mouseY);
    
    const dx = (worldPosAfter.x - worldPosBefore.x) * camera.zoom;
    const dy = (worldPosAfter.y - worldPosBefore.y) * camera.zoom;

    camera.x += dx;
    camera.y += dy;
}


function toggleSlowMotion() {
    isSlowMotion = !isSlowMotion;
    if (isSlowMotion) {
        engine.timing.timeScale = 0.2; 
        document.getElementById('slowMoButton').textContent = 'VELOCIDADE NORMAL'; 
        document.getElementById('slowMoButton').classList.add('ativo');
    } else {
        engine.timing.timeScale = 1.0; 
        document.getElementById('slowMoButton').textContent = 'CÂMERA LENTA'; 
        document.getElementById('slowMoButton').classList.remove('ativo');
    }
}

function toggleFreeze() {
    if (!mouseSpring) return; 

    const heldBody = mouseSpring.bodyA;
    Matter.World.remove(world, mouseSpring);
    mouseSpring = null;

    if (heldBody.isStatic) { 
        Matter.Body.setStatic(heldBody, false);
        if (heldBody.customProps) heldBody.customProps.isFrozen = false;
    } else { 
        Matter.Body.setStatic(heldBody, true);
        if (heldBody.customProps) heldBody.customProps.isFrozen = true;
    }
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modalReturnState = gameState; 
        modal.style.display = 'flex';
        gameState = 'MODAL';
    }
}

function showSettingsModal() { showModal('settings-modal'); }

function showEnvironmentModal() { 
    showModal('environment-modal'); 
    const btn = document.getElementById('toggle-gravity-btn');
    btn.textContent = currentGravityY === 0 ? 'Ativar Gravidade' : 'Desativar Gravidade';
}

function toggleGravity() {
    currentGravityY = (currentGravityY === 0) ? originalGravityY : 0;
    engine.world.gravity.y = currentGravityY;
    showEnvironmentModal(); // Refresh modal text
}

function showMapSelection() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('map-selection-screen').style.display = 'flex';
}

function iniciarJogoComMapa(mapType) {
    currentMapType = mapType;
    resetarMundo(); 
    startGame();
}

function startGame() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('map-selection-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    
    gameState = 'GAME';
    modalReturnState = 'GAME'; 

    windowResized();
    
    camera.x = width / 2 - PLAYER_SPAWN_X * camera.zoom;
    camera.y = height / 2 - PLAYER_SPAWN_Y * camera.zoom;
    
    document.getElementById('left-sidebar').classList.add('hidden');
    switchCategory('category-items-basic');
}

function screenToWorld(x, y) {
    return {
        x: (x - camera.x) / camera.zoom,
        y: (y - camera.y) / camera.zoom
    };
}

function draw() {
    if (gameState !== 'GAME') {
        background(26, 26, 26); 
        return;
    }

    background(51); 

    if (activeVehicle) {
        let moveDirection = 0;
        if (keyIsDown(LEFT_ARROW)) moveDirection = -1;
        if (keyIsDown(RIGHT_ARROW)) moveDirection = 1;
        if (vehicleInput !== 0) moveDirection = vehicleInput;
        
        if(moveDirection !== 0) {
            const torque = VEHICLE_TORQUE * moveDirection;
            activeVehicle.wheels.forEach(wheel => {
                const newAngVel = wheel.angularVelocity + torque;
                const clampedVel = Math.max(-VEHICLE_MAX_SPEED, Math.min(VEHICLE_MAX_SPEED, newAngVel));
                 Matter.Body.setAngularVelocity(wheel, clampedVel);
            });
        } else {
            activeVehicle.wheels.forEach(wheel => {
                 Matter.Body.setAngularVelocity(wheel, wheel.angularVelocity * VEHICLE_BRAKE_DAMPING);
            });
        }
    }

    if (cameraFollowTarget) {
        if (!Matter.Composite.get(world, cameraFollowTarget.id, 'body')) {
            cameraFollowTarget = null;
        } else {
            const targetX = width / 2 - cameraFollowTarget.position.x * camera.zoom;
            const targetY = height / 2 - cameraFollowTarget.position.y * camera.zoom;
            camera.x = lerp(camera.x, targetX, 0.05);
            camera.y = lerp(camera.y, targetY, 0.05);
        }
    }
    
    updateTeleporters();
    updateElectricitySystem();
    updateThrusters();
    updatePistons();
    updateExplosives();
    updateActivators();

    push();
    translate(camera.x, camera.y);
    scale(camera.zoom);
    
    if (screenShake.duration > 0) {
        const shakeX = random(-screenShake.intensity, screenShake.intensity);
        const shakeY = random(-screenShake.intensity, screenShake.intensity);
        translate(shakeX, shakeY);
        screenShake.duration--;
         if(screenShake.duration <= 0) screenShake.intensity = 0;
    }

    if (showGrid) drawGrid();
    
    waterZones.forEach(zone => {
        push();
        noStroke();
        fill(200, 80, 70, 0.5); 
        rect(zone.x, zone.y, zone.width, zone.height);
        pop();
    });

    const allBodies = Matter.Composite.allBodies(world);
    
    allBodies.forEach(body => {
        if (body.isStatic) return;
        const ragdoll = encontrarRagdollPorCorpo(body);
        let isInWater = false;
        waterZones.forEach(zone => {
            if (Matter.Bounds.overlaps(body.bounds, { min: { x: zone.x, y: zone.y }, max: { x: zone.x + zone.width, y: zone.y + zone.height } })) {
                isInWater = true;
                let buoyancyForce = (body.area / 1000) * 0.005 * world.gravity.y;
                buoyancyForce = Math.min(buoyancyForce, 0.05);
                Matter.Body.applyForce(body, body.position, { x: 0, y: -buoyancyForce });
                 body.velocity.x *= 0.95; 
                 body.velocity.y *= 0.95;
                 body.angularVelocity *= 0.95;
            }
        });
        if (ragdoll && ragdoll.isOnFire && isInWater) ragdoll.isOnFire = false;
    });
    
    [playerRagdoll, ...outrosRagdolls].forEach(ragdoll => {
        if(ragdoll) atualizarRagdoll(ragdoll);
    });
    
    updateLiquidSystem();
    processExplosions();

    if (ropeStartPoint !== null) {
        fill(255, 0, 0); noStroke();
        circle(ropeStartPoint.x, ropeStartPoint.y, 5 / camera.zoom);
    }

    if (mouseSpring) {
         const worldMouse = screenToWorld(mouseX, mouseY);
         mouseSpring.pointB = { x: worldMouse.x, y: worldMouse.y };
    }
    
    desenharParticulas();

    drawBodies(allBodies);
    drawConstraints(); 
    desenharUI();

    pop(); // End world camera view

    // Screen-space UI
    if (isSelecting && selectionBox.start) {
        push();
        const startScreen = { x: (selectionBox.start.x * camera.zoom) + camera.x, y: (selectionBox.start.y * camera.zoom) + camera.y };
        const endScreen = { x: mouseX, y: mouseY };
        fill(150, 80, 80, 0.3);
        stroke(150, 80, 100);
        strokeWeight(1);
        rectMode(CORNERS);
        rect(startScreen.x, startScreen.y, endScreen.x, endScreen.y);
        pop();
    }
    if (mouseSpring && mouseSpring.bodyA.label === 'liquid_container') {
        drawContainerUI(mouseSpring.bodyA);
    }
    if (showSyringeInfo && heldSyringeForInfo) {
        drawSyringeUI(heldSyringeForInfo);
    }
}

// --- Collision and Damage ---
function handleCollisions(event) { 
    for (const pair of event.pairs) { 
        if (!pair.collision) continue; 
        
        // --- LÓGICA DO TELETRANSPORTADOR ---
        const ePortalA = pair.bodyA.label === 'portal';
        const ePortalB = pair.bodyB.label === 'portal';

        if (ePortalA || ePortalB) {
            const portal = ePortalA ? pair.bodyA : pair.bodyB;
            const otherBody = ePortalA ? pair.bodyB : pair.bodyA;
            
            if (otherBody.isStatic || otherBody.isSensor) continue;

            const props = portal.customProps;
            if (props.isLinked && props.cooldown === 0) {
                const targetPortal = teleporters.find(p => p.id === props.linkedTo);
                if (targetPortal) {
                    const vel = otherBody.velocity;
                    const angVel = otherBody.angularVelocity;
                    Matter.Body.setPosition(otherBody, { x: targetPortal.position.x, y: targetPortal.position.y - 30 });
                    Matter.Body.setVelocity(otherBody, vel);
                    Matter.Body.setAngularVelocity(otherBody, angVel);

                    props.cooldown = 20; 
                    targetPortal.customProps.cooldown = 20;
                }
            }
            continue; // Portais não causam dano, então podemos pular o resto.
        }

        const velRelativa = Matter.Vector.magnitude(Matter.Vector.sub(pair.bodyA.velocity, pair.bodyB.velocity)); 
        
        const eOrganicoA = pair.bodyA.customProps && pair.bodyA.customProps.isPlayer !== undefined; 
        const eOrganicoB = pair.bodyB.customProps && pair.bodyB.customProps.isPlayer !== undefined; 
        const eLaminaA = pair.bodyA.label === 'lamina'; 
        const eLaminaB = pair.bodyB.label === 'lamina'; 
        const eSeringaA = pair.bodyA.label && pair.bodyA.label.startsWith('seringa_');
        const eSeringaB = pair.bodyB.label && pair.bodyB.label.startsWith('seringa_');
        const eBulletA = pair.bodyA.label === 'bullet';
        const eBulletB = pair.bodyB.label === 'bullet';
        const eC4A = pair.bodyA.label === 'c4';
        const eC4B = pair.bodyB.label === 'c4';
        const eGranadaA = pair.bodyA.label === 'granada';
        const eGranadaB = pair.bodyB.label === 'granada';
        const eMarretaA = pair.bodyA.label === 'marreta';
        const eMarretaB = pair.bodyB.label === 'marreta';

        if(eC4A && pair.bodyA.customProps.isSticky) handleStickyCollision(pair.bodyA, pair.bodyB, pair.collision.supports[0]);
        if(eC4B && pair.bodyB.customProps.isSticky) handleStickyCollision(pair.bodyB, pair.bodyA, pair.collision.supports[0]);
        
        if (eGranadaA && velRelativa > 10) pair.bodyA.customProps.timer = 1;
        if (eGranadaB && velRelativa > 10) pair.bodyB.customProps.timer = 1;

        if ((eMarretaA && eOrganicoB) || (eMarretaB && eOrganicoA)) {
            const marreta = eMarretaA ? pair.bodyA : pair.bodyB;
            const target = eMarretaA ? pair.bodyB : pair.bodyA;
            const forceDirection = Matter.Vector.sub(target.position, marreta.position);
            Matter.Body.applyForce(target, target.position, Matter.Vector.mult(Matter.Vector.normalise(forceDirection), FORCA_MARRETA));
        }

        const ragdollA = eOrganicoA ? encontrarRagdollPorCorpo(pair.bodyA) : null;
        const ragdollB = eOrganicoB ? encontrarRagdollPorCorpo(pair.bodyB) : null;

        if (ragdollA && ragdollA.isPetrified && velRelativa > 25) {
            shatterRagdoll(ragdollA, pair.collision.supports[0]);
            continue; 
        }
        if (ragdollB && ragdollB.isPetrified && velRelativa > 25) {
            shatterRagdoll(ragdollB, pair.collision.supports[0]);
            continue; 
        }


        if (ragdollA && ragdollA.isVolatile && velRelativa > LIMIAR_EXPLOSAO_VOLATIL) {
            createExplosion(ragdollA.bodies.torso.position, 150, 0.5);
            ragdollA.isVolatile = false;
            Matter.World.remove(world, ragdollA.composite);
            if(ragdollA.isPlayer) playerRagdoll = null;
            else outrosRagdolls = outrosRagdolls.filter(r => r !== ragdollA);
        }
        if (ragdollB && ragdollB.isVolatile && velRelativa > LIMIAR_EXPLOSAO_VOLATIL) {
            createExplosion(ragdollB.bodies.torso.position, 150, 0.5);
            ragdollB.isVolatile = false;
            Matter.World.remove(world, ragdollB.composite);
            if(ragdollB.isPlayer) playerRagdoll = null;
            else outrosRagdolls = outrosRagdolls.filter(r => r !== ragdollB);
        }

        if ((eSeringaA && eOrganicoB) || (eSeringaB && eOrganicoA)) {
            const seringa = eSeringaA ? pair.bodyA : pair.bodyB;
            const corpoAlvo = eSeringaA ? pair.bodyB : pair.bodyA;
            if (velRelativa > LIMIAR_INJECAO_SERINGA && !seringa.customProps.isStuck) {
                if(pair.collision.supports && pair.collision.supports.length > 0) {
                    stickSyringe(seringa, corpoAlvo, pair.collision.supports[0]);
                }
            }
            continue; 
        }

        if ((eLaminaA && eOrganicoB) || (eLaminaB && eOrganicoA)) { 
            if (velRelativa > LIMIAR_EMPALAMENTO) { 
                const lamina = eLaminaA ? pair.bodyA : pair.bodyB; 
                const corpoAlvo = eOrganicoA ? pair.bodyA : pair.bodyB; 
                if(pair.collision.supports && pair.collision.supports.length > 0) empalar(lamina, corpoAlvo, pair.collision.supports[0]); 
                continue; 
            } 
        } 
        
        if (eBulletA || eBulletB) {
            const bullet = eBulletA ? pair.bodyA : pair.bodyB;
            const otherBody = eBulletA ? pair.bodyB : pair.bodyA;
            if (!bullet.customProps || bullet.customProps.hit) continue; 
            bullet.customProps.hit = true;
            bullet.customProps.visible = false; 
            setTimeout(() => {
                Matter.World.remove(world, bullet);
                objetos = objetos.filter(obj => obj.id !== bullet.id); 
            }, 50); 
            if (otherBody.customProps && otherBody.customProps.isPlayer !== undefined) {
                const dano = DANO_PISTOLA; 
                const pontoImpacto = pair.collision.supports && pair.collision.supports.length > 0 ? pair.collision.supports[0] : null;
                aplicarDano(otherBody, dano, pontoImpacto, true); 
                if (pontoImpacto) spawnSangue(pontoImpacto.x, pontoImpacto.y, velRelativa * 2); 
            }
            continue; 
        }

        if (velRelativa > LIMIAR_DE_DANO_VELOCIDADE) { 
            const dano = velRelativa * DANO_POR_VELOCIDADE; 
            const pontoImpacto = pair.collision.supports && pair.collision.supports.length > 0 ? pair.collision.supports[0] : null; 
            if(eOrganicoA) aplicarDano(pair.bodyA, dano, pontoImpacto, false); 
            if(eOrganicoB) aplicarDano(pair.bodyB, dano, pontoImpacto, false); 
            if (pontoImpacto && (eOrganicoA || eOrganicoB)) spawnSangue(pontoImpacto.x, pontoImpacto.y, velRelativa); 

            if (pair.bodyA.customProps && pair.bodyA.customProps.vida) {
                aplicarDanoObjeto(pair.bodyA, dano);
            }
            if (pair.bodyB.customProps && pair.bodyB.customProps.vida) {
                aplicarDanoObjeto(pair.bodyB, dano);
            }
        } 

        const cabecaA = pair.bodyA.label === 'head', cabecaB = pair.bodyB.label === 'head'; 
        if ((cabecaA || cabecaB) && velRelativa > LIMIAR_NOCAUTE_VELOCIDADE) { 
            const ragdollAlvo = cabecaA ? encontrarRagdollPorCorpo(pair.bodyA) : encontrarRagdollPorCorpo(pair.bodyB); 
            if (ragdollAlvo && ragdollAlvo.estado !== 'SKELETON') mudarEstado(ragdollAlvo, 'NOCAUTEADO'); 
        } 
    } 
}

function aplicarDano(corpo, dano, pontoImpacto, isBulletDamage = false) { 
    if (!corpo.customProps) return; 
    const ragdoll = encontrarRagdollPorCorpo(corpo);
    if (ragdoll && (ragdoll.isImmortal || ragdoll.isPermanentlyDead || ragdoll.isPetrified)) return; 
    if (corpo.label === 'corda_segmento') return;

    let danoAplicado = dano;
    if (corpo.label === 'head') danoAplicado *= DANO_CABECAMULTIPLIER;
    corpo.customProps.saude -= danoAplicado; 
    
    if (pontoImpacto && showBlood) { 
        const pontoLocal = Matter.Vector.sub(pontoImpacto, corpo.position); 
        const pontoRotacionado = Matter.Vector.rotate(pontoLocal, -corpo.angle); 
        corpo.customProps.hematomas.push({ pos: pontoRotacionado, raio: dano * (isBulletDamage ? 0.3 : 0.5), idade: 500, type: isBulletDamage ? 'bullet' : 'bruise' }); 
    } 
    if (corpo.customProps.saude <= 0) { 
        corpo.customProps.saude = 0; 
        const ragdollAlvo = encontrarRagdollPorCorpo(corpo); 
        if (ragdollAlvo) { 
            if ((corpo.label === 'torso' || corpo.label === 'head')) { 
                if(ragdollAlvo.estado !== 'MORTO' && ragdollAlvo.estado !== 'SKELETON') mudarEstado(ragdollAlvo, 'MORTO'); 
            } 
            if (corpo.customProps.saude < SAUDE_MINIMA_MEMBRO_NORMAL && corpo.customProps.juntaAssociada) { 
                const juntaParaRemover = ragdollAlvo.composite.constraints.find(c => c.label === corpo.customProps.juntaAssociada); 
                if (juntaParaRemover) { 
                    if (juntaParaRemover.label === 'neck' && corpo.customProps.saude < SAUDE_MINIMA_MEMBRO_CRITICO) {
                        Matter.Composite.remove(ragdollAlvo.composite, juntaParaRemover); 
                        corpo.customProps.juntaAssociada = null; 
                        if(ragdollAlvo.estado !== 'SKELETON') mudarEstado(ragdollAlvo, 'MORTO'); 
                    } else if (juntaParaRemover.label !== 'neck') { 
                        Matter.Composite.remove(ragdollAlvo.composite, juntaParaRemover); 
                        corpo.customProps.juntaAssociada = null; 
                    }
                } 
            } 
        } 
    } 
}

function aplicarDanoObjeto(corpo, dano) {
    if (!corpo.customProps || corpo.customProps.vida <= 0) return;

    corpo.customProps.vida -= dano;

    if (corpo.customProps.vida <= 0) {
        spawnDebris(corpo.position, corpo.customProps.material, corpo.velocity);
        Matter.World.remove(world, corpo);
        objetos = objetos.filter(o => o.id !== corpo.id);
    }
}

function spawnDebris(position, material, velocity) {
    const numParticulas = material === 'madeira' ? 10 : 20;
    const cor = material === 'madeira' ? color(30, 60, 50) : color(20, 70, 40);
    const forca = velocity ? Matter.Vector.magnitude(velocity) : 2;

    for (let i = 0; i < numParticulas; i++) {
        particulas.push({
            pos: createVector(position.x, position.y),
            vel: p5.Vector.random2D().mult(random(1, forca * 0.5)),
            lifespan: 150,
            color: cor,
            type: 'debris'
        });
    }
}

function atualizarRagdoll(ragdoll) { 
    if (!ragdoll || !ragdoll.bodies.torso || !ragdoll.bodies.head) return; 
    
    if (ragdoll.isPermanentlyDead) {
        if(ragdoll.estado !== 'MORTO') mudarEstado(ragdoll, 'MORTO');
        return;
    }

    if (ragdoll.estado === 'CARBONIZED' || ragdoll.estado === 'SKELETON' || ragdoll.estado === 'PETRIFICADO') {
        ragdoll.isOnFire = false; 
        return;
    }
    
    const totalLiquid = Object.values(ragdoll.internalLiquids).reduce((a, b) => a + b, 0);
    if (totalLiquid <= 0 && !ragdoll.isPermanentlyDead) {
        if (ragdoll.deathTimer === 0) ragdoll.deathTimer = millis();
        else if (millis() - ragdoll.deathTimer > 5000) {
            ragdoll.isPermanentlyDead = true;
            mudarEstado(ragdoll, 'MORTO');
        }
    } else if (totalLiquid > 0) {
        ragdoll.deathTimer = 0;
    }

    if (ragdoll.antiGravityTimer > 0) {
        ragdoll.antiGravityTimer -= (1000/60);
        const antiGravForce = -world.gravity.y;
        ragdoll.composite.bodies.forEach(b => {
             Matter.Body.applyForce(b, b.position, {x: 0, y: antiGravForce * b.mass});
        });
    }

    if (ragdoll.isCorroding) {
        if (ragdoll.corrosionLevel < 1) {
            ragdoll.corrosionLevel += 0.002;
            ragdoll.composite.bodies.forEach(b => { if (b.customProps) aplicarDano(b, 0.1, b.position); });
            if (Math.random() < 0.4) {
                 const body = ragdoll.composite.bodies[Math.floor(random(ragdoll.composite.bodies.length))];
                 particulas.push({ pos: createVector(body.position.x + random(-10,10), body.position.y + random(-10,10)), vel: p5.Vector.random2D().mult(random(0.1, 1)), lifespan: 120, type: 'acid'});
            }
        } else {
            ragdoll.isCorroding = false;
            ragdoll.skeletonType = 'acid';
            mudarEstado(ragdoll, 'SKELETON');
        }
    }

    if (ragdoll.adrenalineTimer > 0) ragdoll.adrenalineTimer -= (1000/60);

    if (ragdoll.isOnFire) {
        if (Math.random() < 0.1) triggerScreenShake(1.5, 5);
        aplicarDano(ragdoll.bodies.torso, 0.2); 
        aplicarDano(ragdoll.bodies.head, 0.2);
        
        ragdoll.charring = Math.min(ragdoll.charring + 0.003, 1);
        if (ragdoll.charring >= 1) {
            ragdoll.skeletonType = 'fire';
            mudarEstado(ragdoll, 'SKELETON');
        }

         if (Math.random() < 0.6) { 
            const body = ragdoll.composite.bodies[Math.floor(random(ragdoll.composite.bodies.length))];
            particulas.push({ pos: createVector(body.position.x + random(-15,15), body.position.y + random(-15,15)), vel: p5.Vector.random2D().mult(random(1, 2.5)), lifespan: 100, type: 'fire'});
         }
    }

    if (ragdoll.estado === 'ATIVO') { 
        const { torso, head } = ragdoll.bodies; 
        const bloodRatio = (ragdoll.internalLiquids.sangue || 0) / 10;
        let fatorSaude = torso.customProps.saude / torso.customProps.saudeMaxima; 
        let bloodStrengthFactor = constrain(bloodRatio, 0.1, 1.0);
        if (ragdoll.adrenalineTimer > 0) fatorSaude = 2.0; 

        const forcaAtual = FORCA_TENSORA * fatorSaude * bloodStrengthFactor; 
        const forcaPescocoAtual = FORCA_PESCOCO * bloodStrengthFactor;

        if (torso.customProps.selfRighting) Matter.Body.setAngularVelocity(torso, torso.angularVelocity + (menorDiferencaAngular(torso.angle, 0) * forcaAtual) - (torso.angularVelocity * 0.2));
        if (head.customProps.selfRighting && ragdoll.composite.constraints.find(c => c.label === 'neck')) Matter.Body.setAngularVelocity(head, head.angularVelocity + (menorDiferencaAngular(head.angle, 0) * forcaPescocoAtual) - (head.angularVelocity * 0.2));
    } else if (ragdoll.estado === 'NOCAUTEADO' && millis() - ragdoll.tempoNocauteado > NOCAUTE_DURACAO) {
        mudarEstado(ragdoll, 'ATIVO'); 
    } else if (ragdoll.estado === 'ZUMBI') {
        const { torso } = ragdoll.bodies;
         Matter.Body.setAngularVelocity(torso, torso.angularVelocity + (menorDiferencaAngular(torso.angle, 0) * FORCA_TENSORA * 0.5) - (torso.angularVelocity * 0.2));
    }
}

function mousePressed() { 
    if (gameState !== 'GAME') return;

    const clickedElement = event.target;
    if (clickedElement.closest('#top-bar, #left-sidebar, #bottom-bar, #mobile-controls, #save-selection-btn')) return; 

    const worldMouse = screenToWorld(mouseX, mouseY);
    
    if (constructionToSpawn) {
        spawnConstruction(constructionToSpawn, worldMouse);
        constructionToSpawn = null; 
        showNotification("Construção carregada!");
        selectCreationType('mao');
        return;
    }
    
    const allBodies = Matter.Composite.allBodies(world);
    const bodiesUnderMouse = Matter.Query.point(allBodies, worldMouse);
    const clickedBody = bodiesUnderMouse.find(b => !b.isStatic);

    if (objetoParaCriar === 'mao') { 
        if (clickedBody) {
            mouseSpring = Matter.Constraint.create({bodyA:clickedBody, pointB: worldMouse, stiffness:0.1, damping:0.1, label: 'mouseSpring'}); 
            Matter.World.add(world, mouseSpring); 
        } else {
            isPanning = true;
            panStart = { x: mouseX, y: mouseY };
            cameraFollowTarget = null;
        }
    } else if (objetoParaCriar === 'selecionar') {
        isSelecting = true;
        selectionBox.start = worldMouse;
        selectionBox.end = worldMouse;
        selectedObjects = { bodies: [], constraints: [] };
        document.getElementById('save-selection-btn').style.display = 'none';
    } else if (['corda', 'cabo_eletrico', 'tubo_liquido', 'mola', 'prego'].includes(objetoParaCriar)) { 
        if (objetoParaCriar === 'prego') {
             if (clickedBody) createWeld(clickedBody, worldMouse);
             return;
        }
        
        if (ropeStartPoint === null) { 
            ropeStartPoint = worldMouse;
            ropeStartBody = clickedBody || null;
        } else { 
            const ropeEndPoint = worldMouse;
            const ropeEndBody = clickedBody || null;
            if (objetoParaCriar === 'mola') {
                createSpring(ropeStartPoint, ropeStartBody, ropeEndPoint, ropeEndBody);
            } else {
                createCable(ropeStartPoint, ropeStartBody, ropeEndPoint, ropeEndBody, objetoParaCriar);
            }
            ropeStartPoint = null; ropeStartBody = null;
            document.getElementById('floating-tool-panel').style.display = 'none';
        }
    }
    else { 
        criarObjeto(objetoParaCriar, worldMouse.x, worldMouse.y); 
    }
}

function mouseDragged() { 
    if (gameState !== 'GAME') return;
    
    if (isSelecting) {
        selectionBox.end = screenToWorld(mouseX, mouseY);
        return;
    }
    
    if (isPanning) {
        cameraFollowTarget = null;
        camera.x += mouseX - panStart.x;
        camera.y += mouseY - panStart.y;
        panStart = { x: mouseX, y: mouseY };
        return;
    }

    if (mouseSpring) { 
        if (keyIsDown(69)) Matter.Body.setAngularVelocity(mouseSpring.bodyA, VELOCIDADE_ROTACAO_CONTROLADA); 
        else if (keyIsDown(81)) Matter.Body.setAngularVelocity(mouseSpring.bodyA, -VELOCIDADE_ROTACAO_CONTROLADA); 
    }
}

function mouseReleased() { 
    if (gameState !== 'GAME') return;
    
    if (isSelecting) {
        isSelecting = false;
        selectObjectsInBox();
        if (selectedObjects.bodies.length > 0) {
            const btn = document.getElementById('save-selection-btn');
            btn.style.display = 'block';
            btn.style.left = `${mouseX}px`;
            btn.style.top = `${mouseY - 50}px`;
        }
    }
    
    isPanning = false;
    if (mouseSpring) {
        Matter.World.remove(world,mouseSpring); 
        mouseSpring=null;
    }
}

// --- Syringe and Liquid Functions ---
function stickSyringe(seringa, corpoAlvo, ponto) {
    const ragdoll = encontrarRagdollPorCorpo(corpoAlvo);
    if (!ragdoll || seringa.customProps.isStuck) return;
    
    seringa.customProps.isStuck = true;
    const juntaSeringa = Matter.Constraint.create({
        bodyA: seringa, bodyB: corpoAlvo,
        pointA: Matter.Vector.sub(ponto, seringa.position), 
        pointB: Matter.Vector.sub(ponto, corpoAlvo.position),
        stiffness: 0.2,
        damping: 0.1,
        length: 0, 
        label: 'seringa_presa'
    });
    Matter.World.add(world, juntaSeringa);

    if (seringa.label === 'seringa_vazia') {
        extractLiquidFromRagdoll(seringa, ragdoll, 1.0);
    } else if (seringa.customProps.uses > 0) {
        injectSyringe(ragdoll, seringa);
    }
}

function extractLiquidFromRagdoll(seringa, ragdoll, amount) {
    const totalInternalVolume = Object.values(ragdoll.internalLiquids).reduce((s, v) => s + v, 0);
    if (totalInternalVolume <= 0) return;

    seringa.customProps.liquidContents = {}; 
    let totalExtracted = 0;

    for (const liquidType in ragdoll.internalLiquids) {
        const proportion = ragdoll.internalLiquids[liquidType] / totalInternalVolume;
        const amountToExtract = Math.min(amount * proportion, ragdoll.internalLiquids[liquidType]);
        
        ragdoll.internalLiquids[liquidType] -= amountToExtract;
        seringa.customProps.liquidContents[liquidType] = (seringa.customProps.liquidContents[liquidType] || 0) + amountToExtract;
        totalExtracted += amountToExtract;
    }
    
    seringa.customProps.liquidAmount = totalExtracted;
    seringa.customProps.uses = 1;

    let dominantLiquid = 'vazia';
    let maxAmount = 0;
    for(const type in seringa.customProps.liquidContents) {
        if(seringa.customProps.liquidContents[type] > maxAmount) {
            maxAmount = seringa.customProps.liquidContents[type];
            dominantLiquid = type;
        }
    }
    seringa.label = `seringa_${dominantLiquid}`;
    seringa.customProps.cor = getSyringeColor(seringa.label);
}

function emptySyringe(seringa) {
    if (!seringa || !seringa.customProps) return;
    seringa.label = 'seringa_vazia';
    seringa.customProps.cor = getSyringeColor('seringa_vazia');
    seringa.customProps.liquidContents = {};
    seringa.customProps.uses = 0;
    seringa.customProps.liquidAmount = 0;
}

function injectSyringe(ragdoll, seringa) {
    if (!ragdoll || seringa.label === 'seringa_vazia' || ragdoll.isPermanentlyDead) return;
    
    for (const liquidType in seringa.customProps.liquidContents) {
        const amount = seringa.customProps.liquidContents[liquidType];
        
        if (liquidType !== 'fogo') {
            ragdoll.internalLiquids[liquidType] = (ragdoll.internalLiquids[liquidType] || 0) + amount;
        }
        
        switch(liquidType) {
            case 'acido': ragdoll.isCorroding = true; break;
            case 'adrenalina': ragdoll.adrenalineTimer = 10000; break;
            case 'cura':
                 ragdoll.internalLiquids = { sangue: 10 };
                 ragdoll.composite.bodies.forEach(b => { 
                     if (b.customProps) b.customProps.saude = b.customProps.saudeMaxima; 
                     Matter.Body.setDensity(b, 0.002);
                 });
                 ragdoll.isCorroding = false; ragdoll.corrosionLevel = 0;
                 ragdoll.isImmortal = false; 
                 ragdoll.isPetrified = false; 
                 if(ragdoll.scale !== 1.0) scaleRagdoll(ragdoll, 1.0 / ragdoll.scale);
                 mudarEstado(ragdoll, 'ATIVO');
                 break;
            case 'zumbi': mudarEstado(ragdoll, 'ZUMBI'); break;
            case 'imortalidade': ragdoll.isImmortal = true; break;
            case 'fogo': if (ragdoll.estado !== 'SKELETON') ragdoll.isOnFire = true; break;
            case 'nitro': ragdoll.isVolatile = true; break;
            case 'anti_gravidade': ragdoll.antiGravityTimer = 15000; break;
            case 'encolher': scaleRagdoll(ragdoll, 0.5); break;
            case 'crescer': scaleRagdoll(ragdoll, 2.0); break;
            case 'petrificar': petrifyRagdoll(ragdoll); break;
        }
    }
    seringa.customProps.uses--;
    if (seringa.customProps.uses <= 0) setTimeout(() => emptySyringe(seringa), 100);
}

// --- Rope & Cable Creation ---
function createCable(point1, body1, point2, body2, cableType) {
    let numSegments, segmentRadius, stiffness;
    
    switch(cableType) {
        case 'cabo_eletrico': case 'tubo_liquido': case 'corda': default:
            numSegments = 20; segmentRadius = 3; stiffness = 0.1; break;
    }

    const distBetweenPoints = dist(point1.x, point1.y, point2.x, point2.y);
    if (distBetweenPoints < segmentRadius*2) return; 

    const cableComposite = Matter.Composite.create({ label: `${cableType}_composite` });
    const segments = [];
    
    for (let i = 0; i < numSegments; i++) {
        const x = lerp(point1.x, point2.x, i / (numSegments - 1));
        const y = lerp(point1.y, point2.y, i / (numSegments - 1));
        segments.push(Matter.Bodies.circle(x, y, segmentRadius, { friction: 0.8, density: 0.0001, label: `${cableType}_segmento`, collisionFilter: { group: Matter.Body.nextGroup(true) }}));
    }
    
    for (let i = 0; i < segments.length - 1; i++) {
        Matter.Composite.add(cableComposite, Matter.Constraint.create({ bodyA: segments[i], bodyB: segments[i + 1], stiffness: stiffness }));
    }

    Matter.Composite.add(cableComposite, Matter.Constraint.create({ bodyA: body1, pointA: body1 ? Matter.Vector.sub(point1, body1.position) : point1, bodyB: segments[0], stiffness: stiffness }));
    Matter.Composite.add(cableComposite, Matter.Constraint.create({ bodyA: segments[segments.length - 1], bodyB: body2, pointB: body2 ? Matter.Vector.sub(point2, body2.position) : point2, stiffness: stiffness }));

    Matter.Composite.add(cableComposite, segments);
    Matter.World.add(world, cableComposite);
    cordas.push(cableComposite);
}

function createRagdoll(x, y, isPlayer) { 
    const group = Matter.Body.nextGroup(true); 
    const escalaAltura = random(0.9, 1.1), escalaLargura = random(0.9, 1.1);
    const corRagdoll = color(random(360), random(40, 60), random(70, 85));

    const commonBodyOptions = { collisionFilter: { group: group }, density: 0.002, friction: 0.8 };
    const commonCustomProps = { saude: 100, saudeMaxima: 100, isPlayer, hematomas: [], cor: corRagdoll, originalColor: corRagdoll, isFrozen: false, selfRighting: true, mode: 'normal' };

    const torso = Matter.Bodies.rectangle(x, y, 40 * escalaLargura, 80 * escalaAltura, { ...commonBodyOptions, label: 'torso', customProps: { ...commonCustomProps, juntaAssociada: 'torso' } });
    const head = Matter.Bodies.circle(x, y - 60 * escalaAltura, 25 * escalaLargura, { ...commonBodyOptions, label: 'head', customProps: { ...commonCustomProps, juntaAssociada: 'neck' } });
    const legLeft = Matter.Bodies.rectangle(x - 10 * escalaLargura, y + 80 * escalaAltura, 20 * escalaLargura, 60 * escalaAltura, { ...commonBodyOptions, label: 'legLeft', customProps: { ...commonCustomProps, juntaAssociada: 'hipLeft' } });
    const legRight = Matter.Bodies.rectangle(x + 10 * escalaLargura, y + 80 * escalaAltura, 20 * escalaLargura, 60 * escalaAltura, { ...commonBodyOptions, label: 'legRight', customProps: { ...commonCustomProps, juntaAssociada: 'hipRight' } });
    const armLeft = Matter.Bodies.rectangle(x - 35 * escalaLargura, y - 10 * escalaAltura, 20 * escalaLargura, 50 * escalaAltura, { ...commonBodyOptions, label: 'armLeft', customProps: { ...commonCustomProps, juntaAssociada: 'shoulderLeft' } });
    const armRight = Matter.Bodies.rectangle(x + 35 * escalaLargura, y + 10 * escalaAltura, 20 * escalaLargura, 50 * escalaAltura, { ...commonBodyOptions, label: 'armRight', customProps: { ...commonCustomProps, juntaAssociada: 'shoulderRight' } });
    
    const criarJunta = (bodyA, bodyB, pA, pB, label) => Matter.Constraint.create({bodyA, bodyB, pointA:pA, pointB:pB, stiffness:1.0, length:0, label}); 

    const neck = criarJunta(torso, head, {x:0, y:-45*escalaAltura}, {x:0,y:0}, 'neck'); 
    const hipLeft = criarJunta(torso, legLeft, {x:-12*escalaLargura, y:30*escalaAltura}, {x:0,y:-30*escalaAltura}, 'hipLeft'); 
    const hipRight = criarJunta(torso, legRight, {x:12*escalaLargura, y:30*escalaAltura}, {x:0,y:-30*escalaAltura}, 'hipRight'); 
    const shoulderLeft = criarJunta(torso, armLeft, {x:20*escalaLargura, y:-35*escalaAltura}, {x:0,y:-25*escalaAltura}, 'shoulderLeft'); 
    const shoulderRight = criarJunta(torso, armRight, {x:-20*escalaLargura, y:-35*escalaAltura}, {x:0,y:-25*escalaAltura}, 'shoulderRight'); 

    const composite = Matter.Composite.create({bodies:[torso,head,legLeft,legRight,armLeft,armRight], constraints:[neck,hipLeft,hipRight,shoulderLeft,shoulderRight]}); 
    
    return { composite, bodies:{torso,head,legLeft,legRight,armLeft,armRight}, isPlayer, estado: 'ATIVO', tempoNocauteado:0, tempoMorte:0, isImmortal: false, isOnFire: false, adrenalineTimer: 0, charring: 0, internalLiquids: { sangue: 10 }, isVolatile: false, isCorroding: false, corrosionLevel: 0, deathTimer: 0, isPermanentlyDead: false, skeletonType: null, antiGravityTimer: 0, isPetrified: false, scale: 1.0 }; 
}

function getSyringeColor(type) {
     switch(type) {
        case 'seringa_vazia': return color(0, 0, 80); case 'seringa_sangue': return color(0, 80, 70); case 'seringa_acido': return color(100, 80, 70);
        case 'seringa_adrenalina': return color(60, 100, 90); case 'seringa_cura': return color(340, 70, 90); case 'seringa_zumbi': return color(120, 30, 50);
        case 'seringa_imortalidade': return color(50, 70, 100); case 'seringa_fogo': return color(20, 100, 100); case 'seringa_nitro': return color(40, 90, 80);
        case 'seringa_anti_gravidade': return color(200, 60, 90);
        case 'seringa_encolher': return color(300, 70, 80);
        case 'seringa_crescer': return color(250, 80, 90);
        case 'seringa_petrificar': return color(0, 0, 50);
        default: return color(0, 0, 60);
    }
}

function criarObjeto(tipo, x, y) { 
    let novoObjeto; 
    let options = {restitution:0.5, friction:0.5, customProps: {cor: color(random(360), 60, 90), isFrozen: false, isStuck: false, mode: 'receiver'}}; 
    
    if (tipo && tipo.startsWith('seringa_')) {
        const syringeColor = getSyringeColor(tipo);
        let liquid = {};
        if (tipo !== 'seringa_vazia') liquid[tipo.replace('seringa_','')] = 1;

        options = {density: 0.001, label: tipo, customProps: {...options.customProps, cor: syringeColor, liquidContents: liquid, uses: 1, liquidAmount: (tipo === 'seringa_vazia' ? 0 : 1) }};
        novoObjeto = Matter.Bodies.rectangle(x, y, 8, 40, options);
    } else {
        switch(tipo) { 
            case 'mao': case 'selecionar': return; 
            case 'caixa': novoObjeto=Matter.Bodies.rectangle(x,y,60,60,{...options, density: 0.002, customProps: {...options.customProps, material: 'madeira', vida: 50, vidaMaxima: 50, sprite: caixaSprite }}); break; 
            case 'parede_tijolos': novoObjeto=Matter.Bodies.rectangle(x,y,40,150,{...options, density: 0.01, label: 'parede_tijolos', customProps: {...options.customProps, material: 'tijolo', vida: 250, vidaMaxima: 250, sprite: tijolosSprite }}); break;
            case 'bola': novoObjeto=Matter.Bodies.circle(x,y,25,{...options, density: 0.0008}); break; 
            case 'parede': novoObjeto=Matter.Bodies.rectangle(x,y,20,150,{...options, density: 0.008, customProps: {...options.customProps, material: 'madeira', vida: 150, vidaMaxima: 150 }}); break; 
            case 'lamina': 
                novoObjeto = Matter.Bodies.fromVertices(x, y, [Matter.Vertices.fromPath('0 0  100 0  120 10  100 20  0 20')], { ...options, density:0.01, label: 'lamina' }); 
                break; 
            case 'barril': novoObjeto=Matter.Bodies.rectangle(x, y, 40, 60, {...options, density: 0.005, chamfer: { radius: 20 }}); break;
            case 'triangulo': novoObjeto = Matter.Bodies.fromVertices(x, y, [Matter.Vertices.fromPath('0 0 50 0 25 -43.3')], { ...options, density: 0.002 }); break;
            case 'cano': novoObjeto = Matter.Bodies.rectangle(x, y, 150, 15, { ...options, density: 0.008 }); break;
            case 'pistola': 
                novoObjeto = Matter.Bodies.fromVertices(x, y, [Matter.Vertices.fromPath('0 10 80 10 80 0 100 0 100 20 80 20 80 30 60 30 60 20 0 20')], { ...options, density: 0.005, label: 'pistola', customProps: { ...options.customProps, cor: color(0, 0, 30) } });
                activePistol = novoObjeto; 
                break;
            case 'marreta':
                novoObjeto = Matter.Bodies.rectangle(x, y, 100, 30, { ...options, density: 0.05, label: 'marreta', customProps: { ...options.customProps, cor: color(0, 0, 50) }});
                break;
            case 'granada':
                novoObjeto = Matter.Bodies.circle(x, y, 15, { ...options, density: 0.01, label: 'granada', customProps: { ...options.customProps, cor: color(120, 60, 40), timer: 200, primed: true }});
                break;
            case 'c4':
                novoObjeto = Matter.Bodies.rectangle(x, y, 30, 20, { ...options, density: 0.02, label: 'c4', customProps: { ...options.customProps, cor: color(30, 70, 60), isSticky: true }});
                c4s.push(novoObjeto);
                break;
            case 'detonador':
                showNotification("Detonador equipado! Pressione 'B' para explodir.", 4000);
                return;
            case 'propulsor':
                novoObjeto = Matter.Bodies.rectangle(x, y, 20, 50, { ...options, density: 0.008, label: 'propulsor', customProps: { ...options.customProps, cor: color(0, 0, 60), isPowered: false, isActive: false, force: 0.002 }});
                propulsores.push(novoObjeto);
                break;
            case 'pistao':
                const pistaoBase = Matter.Bodies.rectangle(x, y, 30, 60, { ...options, density: 0.01, label: 'pistao_base', customProps: { ...options.customProps, cor: color(0,0,50), isPowered: false, isActive: false }});
                const pistaoBraco = Matter.Bodies.rectangle(x, y-50, 20, 40, { ...options, density: 0.005, label: 'pistao_braco' });
                const pistaoJunta = Matter.Constraint.create({ bodyA: pistaoBase, bodyB: pistaoBraco, pointA: {x:0, y: -30}, pointB: {x:0, y:20}, stiffness: 1, length: 0 });
                const pistaoPrismatico = Matter.Constraint.create({ bodyA: pistaoBase, bodyB: pistaoBraco, pointA: {x:0, y: -100}, pointB: {x:0, y:0}, stiffness: 0.01, length: 70, render: { type: 'line', visible: false } });
                novoObjeto = Matter.Composite.create({ label: 'pistao_composite', bodies: [pistaoBase, pistaoBraco], constraints: [pistaoJunta, pistaoPrismatico]});
                pistoes.push(novoObjeto);
                break;
            case 'botao':
                novoObjeto = Matter.Bodies.rectangle(x,y, 40, 20, { isStatic: true, label: 'botao', customProps: { ...options.customProps, cor: color(0,80,90), isActivator: true, toggled: false }});
                ativadores.push(novoObjeto);
                break;
            case 'alavanca':
                 const alavancaBase = Matter.Bodies.rectangle(x, y, 20, 20, { isStatic: true });
                 novoObjeto = Matter.Bodies.rectangle(x, y - 25, 10, 50, { ...options, density: 0.001, label: 'alavanca', customProps: { ...options.customProps, cor: color(0,0,70), isActivator: true, toggled: false } });
                 const alavancaJunta = Matter.Constraint.create({ bodyA: alavancaBase, bodyB: novoObjeto, pointA: {x:0, y:0}, pointB: {x:0, y:25}, stiffness: 0.8, length: 0 });
                 Matter.World.add(world, [alavancaBase, alavancaJunta]);
                 ativadores.push(novoObjeto);
                 break;
            case 'portal':
                novoObjeto = Matter.Bodies.rectangle(x, y, 120, 40, { isStatic: true, isSensor: true, label: 'portal', customProps: { cor: color(240, 70, 90), isLinked: false, linkedTo: null, cooldown: 0, sprite: portalSprite }});
                teleporters.push(novoObjeto);
                if (teleporters.length % 2 === 0) {
                    const portalA = teleporters[teleporters.length - 2];
                    const portalB = teleporters[teleporters.length - 1];
                    portalA.customProps.linkedTo = portalB.id;
                    portalB.customProps.linkedTo = portalA.id;
                    portalA.customProps.isLinked = true;
                    portalB.customProps.isLinked = true;
                     showNotification("Par de portais linkado!", 3000);
                }
                break;
            case 'boneco': 
                const novoRagdoll=createRagdoll(x,y,false); 
                outrosRagdolls.push(novoRagdoll); 
                Matter.World.add(world, novoRagdoll.composite); 
                return; 
            case 'carro':
                if (activeVehicle) Matter.World.remove(world, activeVehicle.composite);
                activeVehicle = createCar(x, y);
                novoObjeto = activeVehicle.composite; 
                break;
            case 'onibus':
                if (activeVehicle) Matter.World.remove(world, activeVehicle.composite);
                activeVehicle = createBus(x, y);
                novoObjeto = activeVehicle.composite;
                break;
            case 'liquid_container':
                 novoObjeto = Matter.Bodies.rectangle(x, y, 150, 200, { density: 0.01, label: 'liquid_container', customProps: { ...options.customProps, cor: color(0,0,50), liquids: {}, capacity: 20, liquidAmount: 0 }});
                 break;
            case 'gerador':
                novoObjeto = Matter.Bodies.rectangle(x, y, 80, 80, {density: 0.015, label: 'gerador', customProps: {cor: color(30, 80, 50), isFrozen: false, mode: 'normal'}});
                break;
            case 'corda': case 'cabo_eletrico': case 'tubo_liquido': case 'mola': case 'prego': return;
            default: return;
        } 
    }
     if (novoObjeto) { 
        if (novoObjeto.type === 'composite') { 
            Matter.World.add(world, novoObjeto);
        } else { 
            objetos.push(novoObjeto); 
            Matter.World.add(world, novoObjeto); 
        }
    }
}

function createCar(x, y) {
    const group = Matter.Body.nextGroup(true);
    const scale = 1.3;
    const chassisColor = color(10, 80, 70);
    
    const commonOptions = { collisionFilter: { group: group }, density: 0.008, customProps: { cor: chassisColor, isFrozen: false } };

    const floor = Matter.Bodies.rectangle(0, 0, 250 * scale, 20 * scale, {...commonOptions, label: 'car_floor'});
    const wheelRadius = 24 * scale;
    const wheelA = Matter.Bodies.circle(-80 * scale, 25 * scale, wheelRadius, { ...commonOptions, label: 'car_wheel' });
    const wheelB = Matter.Bodies.circle(80 * scale, 25 * scale, wheelRadius, { ...commonOptions, label: 'car_wheel' });
    
    const axleA = Matter.Constraint.create({ bodyA: floor, pointA: {x: -80 * scale, y: 10 * scale}, bodyB: wheelA, stiffness: 1, length: 0 });
    const axleB = Matter.Constraint.create({ bodyA: floor, pointA: {x: 80 * scale, y: 10 * scale}, bodyB: wheelB, stiffness: 1, length: 0 });

    const carComposite = Matter.Composite.create({ bodies: [floor, wheelA, wheelB], constraints: [axleA, axleB] });
    
    Matter.Composite.translate(carComposite, { x: x, y: y });
    carComposite.label = 'carro_composite';
    return { composite: carComposite, wheels: [wheelA, wheelB] };
}

function createBus(x, y) {
    const group = Matter.Body.nextGroup(true);
    const scale = 1.5;
    const busWidth = 550 * scale;
    const wallThickness = 25 * scale; 
    const chassisColor = color(55, 80, 80);
    const wheelColor = color(0, 0, 20);

    const floor = Matter.Bodies.rectangle(0, 0, busWidth, wallThickness, { collisionFilter: { group: group }, density: 0.009, customProps: { cor: chassisColor, isFrozen: false }, label: 'bus_floor' });
    const wheelRadius = 30 * scale;
    const wheelYOffset = (wallThickness / 2) + (wheelRadius * 0.4); 
    const wheelXFront = -busWidth/2 * 0.7;
    const wheelXRear1 = busWidth/2 * 0.6;
    const wheelXRear2 = busWidth/2 * 0.8;
    
    const wheelOptions = { collisionFilter: { group: group }, density: 0.005, friction: 0.9, customProps: { cor: wheelColor, isFrozen: false } };

    const wheelA = Matter.Bodies.circle(wheelXFront, wheelYOffset, wheelRadius, { ...wheelOptions, label: 'bus_wheel' });
    const wheelB = Matter.Bodies.circle(wheelXRear1, wheelYOffset, wheelRadius, { ...wheelOptions, label: 'bus_wheel' });
    const wheelC = Matter.Bodies.circle(wheelXRear2, wheelYOffset, wheelRadius, { ...wheelOptions, label: 'bus_wheel' });
    
    const weldOptions = { stiffness: 1, length: 0 };
    const axleA = Matter.Constraint.create({ bodyA: floor, bodyB: wheelA, pointA: { x: wheelXFront, y: wheelYOffset }, pointB: { x:0, y:0 }, ...weldOptions });
    const axleB = Matter.Constraint.create({ bodyA: floor, bodyB: wheelB, pointA: { x: wheelXRear1, y: wheelYOffset }, pointB: { x:0, y:0 }, ...weldOptions });
    const axleC = Matter.Constraint.create({ bodyA: floor, bodyB: wheelC, pointA: { x: wheelXRear2, y: wheelYOffset }, pointB: { x:0, y:0 }, ...weldOptions });

    const busComposite = Matter.Composite.create({ bodies: [floor, wheelA, wheelB, wheelC], constraints: [axleA, axleB, axleC] });
    
    Matter.Composite.translate(busComposite, { x: x, y: y });
    busComposite.label = 'onibus_composite';
    return { composite: busComposite, wheels: [wheelA, wheelB, wheelC] };
}

// --- Drawing Functions ---
function drawGrid() {
    const gridSize = 50;
    const screenTopLeft = screenToWorld(0, 0);
    const screenBottomRight = screenToWorld(width, height);
    const startX = Math.floor(screenTopLeft.x / gridSize) * gridSize;
    const endX = Math.ceil(screenBottomRight.x / gridSize) * gridSize;
    const startY = Math.floor(screenTopLeft.y / gridSize) * gridSize;
    const endY = Math.ceil(screenBottomRight.y / gridSize) * gridSize;

    stroke(0, 0, 30);
    strokeWeight(1 / camera.zoom);
    for (let x = startX; x <= endX; x += gridSize) line(x, screenTopLeft.y, x, screenBottomRight.y);
    for (let y = startY; y <= endY; y += gridSize) line(screenTopLeft.x, y, screenBottomRight.x, y);
}

function desenharUI() { 
    [playerRagdoll, ...outrosRagdolls].forEach(ragdoll => { 
        if(!ragdoll || !ragdoll.bodies.torso || !ragdoll.bodies.head) return;

        const vida = (ragdoll.bodies.torso.customProps.saude + ragdoll.bodies.head.customProps.saude) / 2; 
        const bloodAmount = (ragdoll.internalLiquids.sangue || 0);
        const x = ragdoll.bodies.torso.position.x;
        const y = ragdoll.bodies.head.position.y - 40; 

        if(!ragdoll.isPetrified) {
            fill(0, 80, 80); rect(x-25, y-5, 50, 10); 
            fill(120, 80, 80); rect(x-25, y-5, map(vida, 0, 100, 0, 50), 10); 

            fill(0, 100, 60); rect(x - 25, y + 7, 50, 5);
            fill(0, 80, 80); rect(x - 25, y + 7, map(bloodAmount, 0, 10, 0, 50), 5);
        }

        fill(255); textSize(10 / camera.zoom); textAlign(CENTER, BOTTOM); 
        let statusText = ragdoll.estado;
        if (ragdoll.isPermanentlyDead) statusText = 'MORTO (PERMANENTE)';
        else if (ragdoll.deathTimer > 0) statusText = `MORRENDO (${max(0, (5 - (millis() - ragdoll.deathTimer)/1000)).toFixed(1)}s)`;
        else if (ragdoll.bodies.torso.customProps.mode === 'donor') statusText = 'DOADOR';
        if (ragdoll.antiGravityTimer > 0) statusText = 'FLUTUANDO';
        text(statusText, x, y - 8); 
    }); 
}

function drawContainerUI(container) {
    const props = container.customProps;
    const capacity = props.capacity;
    const w = 250, h = 180;
    const x = width - w - 20, y = height/2 - h/2;

    push();
    fill(20, 80, 20, 0.8); noStroke(); rect(x, y, w, h);
    fill(255); textSize(16); textAlign(LEFT, TOP); text('Contêiner de Líquidos', x + 10, y + 10);
    fill(200, 100, 100); textSize(12); text(`Modo: ${props.mode.toUpperCase()} (H)`, x + 10, y + 30);

    let yOffset = y + 60;
    let hasLiquids = false;
    for (const liquid in props.liquids) {
        if(props.liquids[liquid] > 0.01) {
            hasLiquids = true;
            const amount = props.liquids[liquid];
            const percentage = (amount / capacity) * 100;
            const liquidName = liquid.charAt(0).toUpperCase() + liquid.slice(1);
            const liquidColor = getSyringeColor('seringa_' + liquid);
            fill(liquidColor); noStroke(); rect(x+10, yOffset, 5, 12);
            fill(255); textSize(12); text(`${liquidName}: ${percentage.toFixed(1)}%`, x + 20, yOffset);
            yOffset += 20;
        }
    }
    if(!hasLiquids) { fill(150); textSize(12); text('Vazio', x + 10, yOffset); }

    const totalPercentage = (props.liquidAmount / capacity) * 100;
    fill(255); textSize(14); text(`Total: ${totalPercentage.toFixed(1)}%`, x + 10, y + h - 25);
    pop();
}

 function drawSyringeUI(seringa) {
    const props = seringa.customProps;
    const w = 200, h = 100;
    const x = 20, y = height - h - 20; 

    push();
    fill(20, 80, 20, 0.8); noStroke(); rect(x, y, w, h);
    fill(255); textSize(16); textAlign(LEFT, TOP); text('Conteúdo da Seringa', x + 10, y + 10);
    textSize(12); text(`Usos: ${props.uses}`, x + 10, y + 30);
    text(`Modo: ${props.mode.toUpperCase()}`, x + 10, y + 45);

    let yOffset = y + 60;
    if (Object.keys(props.liquidContents).length === 0 || props.label === 'seringa_vazia') {
         text('Vazia', x + 10, yOffset);
    } else {
         for (const liquid in props.liquidContents) {
            let liquidName = liquid.charAt(0).toUpperCase() + liquid.slice(1);
            liquidName = liquidName.replace('_', ' ');
            const liquidColor = getSyringeColor('seringa_' + liquid);
            fill(liquidColor); text(liquidName, x + 10, yOffset);
            yOffset += 20;
        }
    }
    pop();
}

function desenharParticulas() { 
    for (let i = particulas.length-1; i >= 0; i--) { 
        let p = particulas[i]; 
        p.vel.y += (0.1 / camera.zoom);
        p.pos.add(p.vel); 
        p.lifespan-=4; 
        
        if (p.type === 'fire' || p.type === 'explosion') p.vel.y -= (0.3 / camera.zoom); 

        if (showBlood && p.type === 'blood') {
            const corposProximos = Matter.Query.point(Matter.Composite.allBodies(world), p.pos); 
            if (corposProximos.length > 0 && !corposProximos[0].isStatic) { 
                manchas.push({ corpoPai: corposProximos[0], posLocal: Matter.Vector.sub(p.pos, corposProximos[0].position), raio: random(2, 4) }); 
                particulas.splice(i, 1);
                continue;
            } 
        }
        
        if (p.lifespan < 0) { 
            particulas.splice(i, 1); 
        } else { 
            noStroke(); 
            if (p.type === 'fire') fill(random(15, 40), 100, 100, p.lifespan/150);
            else if (p.type === 'explosion') fill(random(20, 50), 100, 100, p.lifespan/100);
            else if (p.type === 'smoke') fill(0, 0, 50, p.lifespan/255);
            else if (p.type === 'acid') fill(100, 80, 70, p.lifespan/200);
            else if (p.type === 'stone') fill(0, 0, random(30, 50), p.lifespan/255);
            else if (p.color) { const c = p.color; fill(hue(c), saturation(c), brightness(c), p.lifespan/255); } 
            else fill(0, 80, 70, p.lifespan/255);
            
            const particleSize = p.type === 'smoke' ? 8 : (p.type === 'debris' ? 6 : 4);
            circle(p.pos.x, p.pos.y, particleSize);
        }
    }
}

function drawBodies(bodies) {
    for (let body of bodies) {
        
        if (body.customProps && body.customProps.sprite) {
            push();
            translate(body.position.x, body.position.y);
            rotate(body.angle);
            imageMode(CENTER);
            
            if (body.customProps.vida) {
                const vidaRatio = body.customProps.vida / body.customProps.vidaMaxima;
                tint(255, 255 * vidaRatio, 255 * vidaRatio);
            }
            if (body.label === 'portal' && body.customProps.isLinked) {
                // Efeito de brilho para portais linkados
                drawingContext.shadowBlur = 20;
                drawingContext.shadowColor = 'cyan';
            }

            const bodyWidth = body.bounds.max.x - body.bounds.min.x;
            const bodyHeight = body.bounds.max.y - body.bounds.min.y;
            image(body.customProps.sprite, 0, 0, bodyWidth, bodyHeight);
            
            noTint();
            drawingContext.shadowBlur = 0;
            pop();
            continue; 
        }
        
        const ragdoll = encontrarRagdollPorCorpo(body);
        let fillColor = (body.customProps && body.customProps.cor) ? body.customProps.cor : color(0, 0, 80);

        if (ragdoll) {
            if (ragdoll.estado === 'ZUMBI') fillColor = color(120, 40, 60);
            if (ragdoll.isCorroding) {
                const acidColor = color(90, 60, 40);
                const originalColor = ragdoll.bodies.torso.customProps.originalColor;
                 if (originalColor) fillColor = lerpColor(originalColor, acidColor, ragdoll.corrosionLevel);
            }
            if (ragdoll.charring > 0) {
                const charcoalColor = color(0,0,15);
                const originalColor = ragdoll.bodies.torso.customProps.originalColor;
                if(originalColor) fillColor = lerpColor(originalColor, charcoalColor, ragdoll.charring);
            }
            if(ragdoll.isPetrified) {
                fillColor = color(0, 0, 45);
            }
        }
        
        if (body.label === 'wall') {
            push(); translate(body.position.x, body.position.y); rotate(body.angle);
            fill(0, 0, 25); noStroke(); beginShape();
            for (let vert of body.vertices) vertex(vert.x - body.position.x, vert.y - body.position.y);
            endShape(CLOSE); pop(); continue;
        }
        
        if (body.customProps && body.customProps.visible === false) continue;

        push();
        translate(body.position.x, body.position.y); rotate(body.angle);
        
        if (selectedObjects.bodies.includes(body)) {
            stroke(60, 100, 100); // Amarelo para selecionado
            strokeWeight(3 / camera.zoom);
        } else if (body.customProps && body.customProps.isFrozen) {
            tint(200, 50, 100, 150);
            stroke(0, 0, 10); strokeWeight(1.5 / camera.zoom);
        } else {
            noTint();
            stroke(0, 0, 10); strokeWeight(1.5 / camera.zoom);
        }

        if (ragdoll && ragdoll.estado === 'SKELETON') {
            noFill();
            if (ragdoll.skeletonType === 'fire') stroke(0, 0, 15);
            else stroke(0, 0, 90);
        } else {
             if (body.customProps && body.customProps.vida) {
                const vidaRatio = body.customProps.vida / body.customProps.vidaMaxima;
                fill(lerpColor(color(0, 80, 80), fillColor, vidaRatio));
            } else if (body.label.includes('wheel')) fill(0, 0, 20); 
            else fill(fillColor);
        }
        
        if (body.label === 'botao' && body.customProps.toggled) fill(0, 90, 100);
        if (body.label === 'alavanca' && body.customProps.toggled) fill(0, 90, 100);

        if (body.circleRadius) circle(0,0, body.circleRadius * 2);
        else { beginShape(); for (let vert of body.vertices) vertex(vert.x - body.position.x, vert.y - body.position.y); endShape(CLOSE); }
        
        if (body.label === 'propulsor' || body.label === 'pistao_base') {
            const props = body.customProps;
            const indicatorRadius = 3.5 / camera.zoom;
            let width = body.bounds.max.x - body.bounds.min.x;
            
            fill(props.isPowered ? color(120, 90, 80) : color(0, 80, 70));
            noStroke();
            circle(-width/4, 0, indicatorRadius * 2);
            fill(props.isActive ? color(120, 90, 80) : color(0, 80, 70));
            noStroke();
            circle(width/4, 0, indicatorRadius * 2);
        }
        
        noStroke();
        
        if (!(ragdoll && ragdoll.estado === 'SKELETON')) { 
            drawingContext.save();
            if (body.circleRadius) circle(0,0, body.circleRadius * 2); 
            else { beginShape(); for (let vert of body.vertices) vertex(vert.x - body.position.x, vert.y - body.position.y); endShape(CLOSE); }
            drawingContext.clip();

            if (body.customProps && body.customProps.hematomas) {
                for (let i = body.customProps.hematomas.length - 1; i >= 0; i--) {
                    let h = body.customProps.hematomas[i];
                    fill(280, 50, 40, h.idade * 0.5 / 500); circle(h.pos.x, h.pos.y, h.raio);
                    h.idade--; if (h.idade <= 0) body.customProps.hematomas.splice(i, 1);
                }
            }
            if (showBlood) {
                for (const mancha of manchas) {
                    if (mancha.corpoPai.id === body.id) {
                        fill(0, 80, 50, 0.8); circle(mancha.posLocal.x, mancha.posLocal.y, mancha.raio);
                    }
                }
            }
            drawingContext.restore();
        }
        pop();
    }
}

function drawConstraints() {
    const allConstraints = Matter.Composite.allConstraints(world);

    for (let constraint of allConstraints) {
        if (!constraint.bodyA || !constraint.bodyB || constraint.label === 'mouseSpring' || constraint.render.visible === false) continue;
        
        const posA = Matter.Vector.add(constraint.bodyA.position, constraint.pointA || {x:0, y:0});
        const posB = Matter.Vector.add(constraint.bodyB.position, constraint.pointB || {x:0, y:0});

        push();
        
        let style = { color: color(0, 0, 10, 0.5), weight: 2 };

        if (constraint.label.includes('cabo_eletrico')) style = { color: color(60, 100, 100, 0.7), weight: 2 };
        else if (constraint.label === 'mola') style = { color: color(200, 80, 90), weight: 3 };
        else if (constraint.label === 'prego') style = { color: color(0, 0, 70), weight: 5 };
        else if (constraint.label.includes('hip') || constraint.label.includes('shoulder') || constraint.label === 'neck') continue;
        
        if (selectedObjects.constraints.includes(constraint)) {
            stroke(60, 100, 100); // Amarelo para selecionado
            strokeWeight(style.weight + 2 / camera.zoom);
        } else {
            stroke(style.color);
            strokeWeight(style.weight / camera.zoom);
        }

        if (constraint.label === 'prego') {
            point(posA.x, posA.y);
        } else {
            line(posA.x, posA.y, posB.x, posB.y);
        }
        
        pop(); 
    }
}

function triggerScreenShake(intensity, duration) {
    screenShake.intensity = Math.max(screenShake.intensity, intensity);
    screenShake.duration = Math.max(screenShake.duration, duration);
}

function createExplosion(position, radius, force) {
    explosions.push({ pos: position, radius, force, life: 1 });
    triggerScreenShake(15, 20);
}

function processExplosions() {
     for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        if (exp.life === 1) {
            const affectedBodies = Matter.Query.region(Matter.Composite.allBodies(world), Matter.Bounds.create([{x: exp.pos.x-exp.radius, y: exp.pos.y-exp.radius}, {x: exp.pos.x+exp.radius, y: exp.pos.y+exp.radius}]));
            affectedBodies.forEach(body => {
                if (body.isStatic) return;
                const forceVec = Matter.Vector.sub(body.position, exp.pos);
                const distance = Matter.Vector.magnitude(forceVec);
                if (distance === 0 || distance > exp.radius) return;
                const forceMagnitude = (1 - (distance / exp.radius)) * exp.force;
                Matter.Body.applyForce(body, body.position, Matter.Vector.mult(Matter.Vector.normalise(forceVec), forceMagnitude));
                if(body.customProps && body.customProps.isPlayer !== undefined) aplicarDano(body, 200 / (distance * 0.1), body.position);
                if(body.customProps && body.customProps.vida) aplicarDanoObjeto(body, 300 / (distance * 0.1));
            });
            for(let j=0; j<80; j++) particulas.push({ pos: createVector(exp.pos.x, exp.pos.y), vel: p5.Vector.random2D().mult(random(5, 18)), lifespan: 150, type: 'explosion' });
            for(let k=0; k<40; k++) particulas.push({ pos: createVector(exp.pos.x, exp.pos.y), vel: p5.Vector.random2D().mult(random(1, 6)), lifespan: 255, type: 'smoke' });
        }
        exp.life--;
        if (exp.life <= 0) explosions.splice(i, 1);
    }
}

function updateLiquidSystem() {
    cordas.forEach(cable => {
        if (!cable.label.includes('tubo_liquido')) return;
        
        const bodyA = cable.constraints[0].bodyA;
        const bodyB = cable.constraints[cable.constraints.length - 1].bodyB;
        if (!bodyA || !bodyB || !bodyA.customProps || !bodyB.customProps) return;

        let source = null, dest = null;
        if (bodyA.customProps.mode === 'donor' && bodyB.customProps.mode === 'receiver') {
            source = bodyA; dest = bodyB;
        } else if (bodyB.customProps.mode === 'donor' && bodyA.customProps.mode === 'receiver') {
            source = bodyB; dest = bodyA;
        }

        if (source && dest) {
            transferLiquid(source, dest);
        }
    });
}

function transferLiquid(source, dest) {
    const transferRate = 0.05;
    const sourceRagdoll = encontrarRagdollPorCorpo(source);
    
    let sourceLiquids = {};
    let sourceTotalVolume = 0;

    if (sourceRagdoll) {
        sourceLiquids = sourceRagdoll.internalLiquids;
        sourceTotalVolume = Object.values(sourceLiquids).reduce((s, v) => s + v, 0);
    } else if (source.customProps.liquids) {
        sourceLiquids = source.customProps.liquids;
        sourceTotalVolume = source.customProps.liquidAmount;
    } else if (source.customProps.liquidContents) {
        sourceLiquids = source.customProps.liquidContents;
        sourceTotalVolume = source.customProps.liquidAmount;
    }

    if (sourceTotalVolume <= 0) return;

    const destIsContainer = dest.label === 'liquid_container';
    const destIsSyringe = dest.label.startsWith('seringa_');
    const destCapacity = destIsContainer ? dest.customProps.capacity : 1;
    const destCurrentAmount = dest.customProps.liquidAmount || 0;

    if (destCurrentAmount >= destCapacity) return;

    let spaceInDest = destCapacity - destCurrentAmount;
    let amountToTransfer = Math.min(transferRate, sourceTotalVolume, spaceInDest);

    for (const liquidType in sourceLiquids) {
        if (sourceLiquids[liquidType] <= 0) continue;
        const proportion = sourceLiquids[liquidType] / sourceTotalVolume;
        const liquidAmountToTransfer = amountToTransfer * proportion;

        if (sourceRagdoll) {
            sourceRagdoll.internalLiquids[liquidType] -= liquidAmountToTransfer;
        } else {
            sourceLiquids[liquidType] -= liquidAmountToTransfer;
            source.customProps.liquidAmount -= liquidAmountToTransfer;
        }

        if (destIsContainer) {
            dest.customProps.liquids[liquidType] = (dest.customProps.liquids[liquidType] || 0) + liquidAmountToTransfer;
        } else if (destIsSyringe) {
            dest.customProps.liquidContents[liquidType] = (dest.customProps.liquidContents[liquidType] || 0) + liquidAmountToTransfer;
        }
        dest.customProps.liquidAmount = (dest.customProps.liquidAmount || 0) + liquidAmountToTransfer;
    }
}

function mobileGrabDrop() {
    if (mouseSpring) { Matter.World.remove(world, mouseSpring); mouseSpring = null; } 
    else {
        const centerScreen = screenToWorld(width/2, height/2);
        const allBodies = Matter.Composite.allBodies(world).filter(b => !b.isStatic);
        let closestBody = null, minDist = Infinity;
        for (const body of allBodies) {
            const d = dist(centerScreen.x, centerScreen.y, body.position.x, body.position.y);
            if (d < minDist && d < 100) { minDist = d; closestBody = body; }
        }
        if (closestBody) {
            mouseSpring = Matter.Constraint.create({ bodyA: closestBody, pointB: centerScreen, stiffness: 0.1, damping: 0.1, label: 'mouseSpring' }); 
            Matter.World.add(world, mouseSpring);
        }
    }
}

function mobileFreeze() { if (mouseSpring && mouseSpring.bodyA) toggleFreeze(); }

function mobileToggleDonor() {
    let targetBody = null;
    if (mouseSpring && mouseSpring.bodyA) targetBody = mouseSpring.bodyA;
    else {
        const centerScreen = screenToWorld(width/2, height/2);
        const allBodies = Matter.Composite.allBodies(world).filter(b => !b.isStatic);
        let closestBody = null, minDist = Infinity;
        for (const body of allBodies) {
            const d = dist(centerScreen.x, centerScreen.y, body.position.x, body.position.y);
            if (d < minDist && d < 100) { minDist = d; closestBody = body; }
        }
        targetBody = closestBody;
    }
    
    if (targetBody && targetBody.customProps) {
        const props = targetBody.customProps;
        if (encontrarRagdollPorCorpo(targetBody)) props.mode = (props.mode === 'donor' ? 'normal' : 'donor');
        else if (props.hasOwnProperty('mode')) props.mode = (props.mode === 'donor' ? 'receiver' : 'donor');
    }
}


// --- NOVAS FUNÇÕES ---

function scaleRagdoll(ragdoll, factor) {
    if (!ragdoll) return;
    ragdoll.scale = (ragdoll.scale || 1.0) * factor;

    ragdoll.composite.bodies.forEach(body => {
        const originalVertices = body.customProps.originalVertices || body.vertices.map(v => ({ x: v.x - body.position.x, y: v.y - body.position.y }));
        if (!body.customProps.originalVertices) {
            body.customProps.originalVertices = originalVertices;
        }

        Matter.Body.scale(body, factor, factor);
        Matter.Body.setMass(body, body.mass * (factor * factor)); 
    });
}

function petrifyRagdoll(ragdoll) {
    if (!ragdoll) return;
    mudarEstado(ragdoll, 'PETRIFICADO');
    ragdoll.isImmortal = true; 
    
    ragdoll.composite.bodies.forEach(body => {
        Matter.Body.setDensity(body, 0.05);
    });
}

function shatterRagdoll(ragdoll, impactPoint) {
    if (!ragdoll || !impactPoint) return;
    
    for (let i = 0; i < 50; i++) {
        particulas.push({ 
            pos: createVector(impactPoint.x, impactPoint.y), 
            vel: p5.Vector.random2D().mult(random(2, 10)), 
            lifespan: 200, 
            type: 'stone' 
        });
    }

    Matter.World.remove(world, ragdoll.composite);
    if(ragdoll.isPlayer) {
        playerRagdoll = null;
    } else {
        outrosRagdolls = outrosRagdolls.filter(r => r !== ragdoll);
    }
}


function updateElectricitySystem() {
    // Primeiro, reseta a energia de todos os componentes que podem recebê-la
    const allBodies = Matter.Composite.allBodies(world);
    allBodies.forEach(b => {
        if (b.customProps && b.customProps.isPowered !== undefined) {
            b.customProps.isPowered = false;
        }
    });

    // Itera várias vezes para propagar a energia pela rede
    for (let i = 0; i < 5; i++) { 
        // Filtra os cabos elétricos do array principal 'cordas'
        const cabosEletricos = cordas.filter(c => c.label === 'cabo_eletrico_composite');

        cabosEletricos.forEach(cabo => {
            // 'cabo' é um Composite, então pegamos as pontas pelas juntas
            const bodyA = cabo.constraints[0].bodyA;
            const bodyB = cabo.constraints[cabo.constraints.length - 1].bodyB;
            if (!bodyA || !bodyB) return;

            const propsA = bodyA.customProps || {};
            const propsB = bodyB.customProps || {};

            // Uma fonte de energia é um gerador ou um ativador que está ligado
            const aIsSource = bodyA.label === 'gerador' || (propsA.isActivator && propsA.toggled);
            const bIsSource = bodyB.label === 'gerador' || (propsB.isActivator && propsB.toggled);
            
            // Um corpo está energizado se for uma fonte ou se já recebeu energia neste loop
            const aIsPowered = aIsSource || propsA.isPowered;
            const bIsPowered = bIsSource || propsB.isPowered;

            // Propaga a energia: se A está ligado, B recebe energia (se for um componente elétrico)
            if (aIsPowered && propsB.isPowered !== undefined) {
                propsB.isPowered = true;
            }
            // E vice-versa
            if (bIsPowered && propsA.isPowered !== undefined) {
                propsA.isPowered = true;
            }
        });
    }
}

function updateActivators() {
    ativadores.forEach(act => {
        if(act.customProps) act.customProps.isPowered = false;
        
        if (act.label === 'botao') {
            const bodiesOnTop = Matter.Query.region(Matter.Composite.allBodies(world), act.bounds);
            const isPressed = bodiesOnTop.some(b => b.id !== act.id && !b.isStatic && !b.isSensor);
            act.customProps.toggled = isPressed;
            if(isPressed) act.customProps.isPowered = true;
        } else if (act.label === 'alavanca') {
            const isToggled = Math.abs(act.angle) > 0.3;
            act.customProps.toggled = isToggled;
            if (isToggled) act.customProps.isPowered = true;
        }
    });
}

function updateThrusters() {
    propulsores.forEach(p => {
        if (!p.customProps) return;
        
        const shouldBeActive = p.customProps.isPowered || p.customProps.isActive;
        
        if (shouldBeActive) {
            const forceVector = { x: 0, y: -p.customProps.force };
            const rotatedForce = Matter.Vector.rotate(forceVector, p.angle);
            Matter.Body.applyForce(p, p.position, rotatedForce);
            if (Math.random() < 0.8) {
                const particlePos = Matter.Vector.add(p.position, Matter.Vector.rotate({x:0, y:25}, p.angle));
                particulas.push({ pos: createVector(particlePos.x, particlePos.y), vel: p5.Vector.random2D().mult(random(1, 2)), lifespan: 60, type: 'fire'});
            }
        }
    });
}

function updatePistons() {
    pistoes.forEach(pistonComp => {
        const base = pistonComp.bodies.find(b => b.label === 'pistao_base');
        if (!base || !base.customProps) return;

        const shouldBeActive = base.customProps.isPowered || base.customProps.isActive;
        const prismatic = pistonComp.constraints.find(c => c.stiffness === 0.01);
        
        if (shouldBeActive) {
            prismatic.length = lerp(prismatic.length, 20, 0.1); 
        } else {
            prismatic.length = lerp(prismatic.length, 120, 0.1); 
        }
    });
}

function handleStickyCollision(c4, otherBody, collisionPoint) {
    if (!otherBody || otherBody.isStatic || c4.customProps.isStuck) return;

    c4.customProps.isStuck = true;
    c4.customProps.isSticky = false;

    const weld = Matter.Constraint.create({
        bodyA: c4,
        bodyB: otherBody,
        pointA: Matter.Vector.sub(collisionPoint, c4.position),
        pointB: Matter.Vector.sub(collisionPoint, otherBody.position),
        stiffness: 1,
        length: 0
    });
    Matter.World.add(world, weld);
}

function updateExplosives() {
    const allBodies = Matter.Composite.allBodies(world);
    allBodies.forEach(body => {
        if(body.label === 'granada' && body.customProps.primed) {
            body.customProps.timer--;
            if (body.customProps.timer <= 0) {
                createExplosion(body.position, 200, 0.7);
                Matter.World.remove(world, body);
            }
        }
    });
}

function createWeld(body, point) {
    const weld = Matter.Constraint.create({
        label: 'prego',
        pointA: point, 
        bodyB: body,
        pointB: Matter.Vector.sub(point, body.position),
        stiffness: 0.7,
        length: 0
    });
    Matter.World.add(world, weld);
}

function createSpring(point1, body1, point2, body2) {
    const spring = Matter.Constraint.create({
        label: 'mola',
        pointA: body1 ? Matter.Vector.sub(point1, body1.position) : point1,
        bodyA: body1,
        bodyB: body2,
        pointB: body2 ? Matter.Vector.sub(point2, body2.position) : point2,
        stiffness: 0.01,
        damping: 0.05
    });
    Matter.World.add(world, spring);
}

function showNotification(message, duration = 3000) {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

function detonateAllC4s() {
    if (c4s.length === 0) {
        showNotification("Nenhuma C4 foi plantada.");
        return;
    }
    showNotification(`Detonando ${c4s.length} C4(s)!`);
    c4s.forEach(c4 => {
        if (Matter.Composite.get(world, c4.id, 'body')) { 
            createExplosion(c4.position, 180, 0.6);
            Matter.World.remove(world, c4);
        }
    });
    c4s = []; 
}

function updateTeleporters() {
    teleporters.forEach(portal => {
        if (portal.customProps.cooldown > 0) {
            portal.customProps.cooldown--;
        }
    });
}

function selectObjectsInBox() {
    selectedObjects = { bodies: [], constraints: [] };
    const allBodies = Matter.Composite.allBodies(world);
    const allConstraints = Matter.Composite.allConstraints(world);

    const bounds = {
        min: { x: min(selectionBox.start.x, selectionBox.end.x), y: min(selectionBox.start.y, selectionBox.end.y) },
        max: { x: max(selectionBox.start.x, selectionBox.end.x), y: max(selectionBox.start.y, selectionBox.end.y) }
    };

    selectedObjects.bodies = Matter.Query.region(allBodies, bounds).filter(b => !b.isStatic && !b.isSensor);

    const bodyIds = selectedObjects.bodies.map(b => b.id);
    selectedObjects.constraints = allConstraints.filter(c => {
        if (!c.bodyA || !c.bodyB) return false;
        const isInternal = bodyIds.includes(c.bodyA.id) && bodyIds.includes(c.bodyB.id);
        const isFromRagdoll = c.label.match(/hip|shoulder|neck/);
        return isInternal && !isFromRagdoll; // Seleciona apenas juntas criadas pelo jogador
    });
}

function saveCurrentSelection() {
    if (selectedObjects.bodies.length === 0) return;

    let center = { x: 0, y: 0 };
    selectedObjects.bodies.forEach(b => {
        center.x += b.position.x;
        center.y += b.position.y;
    });
    center.x /= selectedObjects.bodies.length;
    center.y /= selectedObjects.bodies.length;

    const bodyData = selectedObjects.bodies.map(b => ({
        id: b.id,
        label: b.label,
        pos: { x: b.position.x - center.x, y: b.position.y - center.y },
        angle: b.angle,
        vertices: b.vertices.map(v => ({ x: v.x - b.position.x, y: v.y - b.position.y })),
        customProps: JSON.parse(JSON.stringify({ ...b.customProps, hematomas: [], sprite: null }))
    }));

    const constraintData = selectedObjects.constraints.map(c => ({
        label: c.label,
        bodyA_id: c.bodyA.id,
        bodyB_id: c.bodyB.id,
        pointA: c.pointA,
        pointB: c.pointB,
        stiffness: c.stiffness,
        damping: c.damping,
        length: c.length
    }));

    const serializable = { bodies: bodyData, constraints: constraintData };

    const savedConstructions = JSON.parse(localStorage.getItem('ragdollSandboxSaves') || '[]');
    savedConstructions.push(serializable);
    localStorage.setItem('ragdollSandboxSaves', JSON.stringify(savedConstructions));

    showNotification("Construção salva!");
    document.getElementById('save-selection-btn').style.display = 'none';
    selectedObjects = { bodies: [], constraints: [] };
    selectionBox.start = null;
}

function populateSaveModal() {
    const grid = document.getElementById('saved-items-grid');
    grid.innerHTML = '';
    const savedConstructions = JSON.parse(localStorage.getItem('ragdollSandboxSaves') || '[]');

    savedConstructions.forEach((con, index) => {
        const btn = document.createElement('button');
        btn.textContent = `Salvo ${index + 1}`;
        btn.style.cssText = "background: #333; border: 1px solid #555; color: white; padding: 10px; cursor: pointer;";
        btn.onclick = () => {
            constructionToSpawn = con;
            showNotification("Construção selecionada! Clique no mapa para posicionar.", 4000);
            document.getElementById('save-modal').style.display = 'none';
            gameState = modalReturnState;
        };
        grid.appendChild(btn);
    });
}

function spawnConstruction(data, centerPos) {
    const newBodyMap = new Map();
    const group = Matter.Body.nextGroup(true);

    data.bodies.forEach(bData => {
        const newBody = Matter.Bodies.fromVertices(
            centerPos.x + bData.pos.x,
            centerPos.y + bData.pos.y,
            [bData.vertices],
            { label: bData.label, angle: bData.angle, collisionFilter: { group: group } },
            true
        );
        
        // Recriar as propriedades customizadas
        if (bData.customProps) {
            newBody.customProps = JSON.parse(JSON.stringify(bData.customProps));

            // --- INÍCIO DA CORREÇÃO ---
            // Se a propriedade de cor existir, ela é um objeto genérico. Vamos recriá-la.
            if (newBody.customProps.cor) {
                const loadedColorData = newBody.customProps.cor.levels; // O objeto genérico ainda tem os dados da cor
                // Recria o objeto p5.Color a partir dos dados [h, s, b, a]
                newBody.customProps.cor = color(loadedColorData[0], loadedColorData[1], loadedColorData[2]);
            }
            // --- FIM DA CORREÇÃO ---

            // Atribui os sprites novamente
            if (newBody.label === 'caixa') newBody.customProps.sprite = caixaSprite;
            else if (newBody.label === 'parede_tijolos') newBody.customProps.sprite = tijolosSprite;
        }

        Matter.World.add(world, newBody);
        objetos.push(newBody);
        newBodyMap.set(bData.id, newBody);
    });

    data.constraints.forEach(cData => {
        const bodyA = newBodyMap.get(cData.bodyA_id);
        const bodyB = newBodyMap.get(cData.bodyB_id);
        if (bodyA && bodyB) {
            const newConstraint = Matter.Constraint.create({
                label: cData.label,
                bodyA: bodyA,
                bodyB: bodyB,
                pointA: cData.pointA,
                pointB: cData.pointB,
                stiffness: cData.stiffness,
                damping: cData.damping,
                length: cData.length
            });
            Matter.World.add(world, newConstraint);
        }
    });
}
