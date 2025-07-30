// NOTE: All Matter.js modules are now prefixed with 'Matter.' to avoid name conflicts.
// Example: Engine.create() is now Matter.Engine.create()

// Variáveis Globais
let engine, world, runner, playerRagdoll, mouseSpring = null;
let objetos = [], particulas = [], outrosRagdolls = [], manchas = [], cordas = [], explosions = [];
let placedC4s = [];
let objetoParaCriar = 'mao';
let activeVehicle = null;
let waterZones = [];
let screenShake = { intensity: 0, duration: 0 };
let gameState = 'MENU';
let modalReturnState = 'MENU';
let currentMapType = 'padrao';
let toolState = { type: null, startPoint: null, startBody: null };
let camera = { x: 0, y: 0, zoom: 1.0 };
let cameraFollowTarget = null;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let showGrid = true, showBlood = true;
let isSlowMotion = false; 

// Seleção
let isSelecting = false;
let selectionStart = { x: 0, y: 0 };
let selectionBox = { x: 0, y: 0, w: 0, h: 0 };
let currentSelection = [];

// Constantes de Jogo
const LIMIAR_DE_DANO_VELOCIDADE = 5.0, LIMIAR_EMPALAMENTO = 15.0, LIMIAR_DESMEMBRAMENTO = 25.0;
const LIMIAR_INJECAO_SERINGA = 7.0, LIMIAR_NOCAUTE_VELOCIDADE = 8.0, LIMIAR_EXPLOSAO_VOLATIL = 12.0; 
const DANO_POR_VELOCIDADE = 3.0, DANO_PISTOLA = 50; 
const SAUDE_MINIMA_MEMBRO_NORMAL = 5, SAUDE_MINIMA_MEMBRO_CRITICO = -50; 
const FORCA_TENSORA = 0.02, FORCA_PESCOCO = 0.015;
const NOCAUTE_DURACAO = 4000;
let originalGravityY = 2.5; 
let currentGravityY = 2.5; 

// --- Funções Principais (Setup, Loop) ---
function setup() {
    p5.disableFriendlyErrors = true; 
    const gameContainer = document.getElementById('game-container');
    const canvas = createCanvas(1, 1);
    canvas.parent('game-container');
    colorMode(HSB, 360, 100, 100);
    
    engine = Matter.Engine.create(); 
    world = engine.world;
    runner = Matter.Runner.create({ delta: 1000 / 120, isFixed: true });
    
    Matter.Runner.run(runner, engine);
    Matter.Events.on(engine, 'collisionStart', handleCollisions);

    setupUI();
    windowResized();
}

function windowResized() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer.offsetWidth > 0 && gameContainer.offsetHeight > 0) {
        resizeCanvas(gameContainer.offsetWidth, gameContainer.offsetHeight);
    }
}

function draw() {
    if (gameState !== 'GAME') {
        background(26, 26, 26); 
        return;
    }

    background(51); 

    updateCamera();
    updateSystems();
    
    push();
    translate(camera.x, camera.y);
    scale(camera.zoom);
    
    if (screenShake.duration > 0) {
        translate(random(-screenShake.intensity, screenShake.intensity), random(-screenShake.intensity, screenShake.intensity));
        screenShake.duration--;
        if(screenShake.duration <= 0) screenShake.intensity = 0;
    }

    if (showGrid) drawGrid();
    
    const allBodies = Matter.Composite.allBodies(world);
    const allConstraints = Matter.Composite.allConstraints(world);

    drawWater();
    drawBodies(allBodies);
    drawConstraints(allConstraints);
    desenharParticulas();
    desenharUI();

    pop(); // Fim da câmera do mundo

    drawSelectionUI();
}

// --- Atualizações de Jogo ---
function updateSystems() {
    updatePanning();
    updateVehicle();
    updateWaterPhysics();
    updateElectricalSystem();
    updateMechanisms();
    
    [playerRagdoll, ...outrosRagdolls].forEach(ragdoll => {
        if(ragdoll) atualizarRagdoll(ragdoll);
    });

    objetos.forEach(obj => {
        if (obj.label === 'granada' && obj.customProps) {
            obj.customProps.timer -= 1000/60;
            if (obj.customProps.timer <= 0) {
                createExplosion(obj.position, 180, 0.8);
                Matter.World.remove(world, obj);
                obj.customProps.isDead = true;
            }
        }
    });
    objetos = objetos.filter(obj => !(obj.customProps && obj.customProps.isDead));

    processExplosions();
}

function updateCamera() {
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
}

// --- CONTINUAÇÃO DO SCRIPT.JS ---

function updatePanning() {
    if (isPanning) {
        cameraFollowTarget = null;
        camera.x += mouseX - panStart.x;
        camera.y += mouseY - panStart.y;
        panStart = { x: mouseX, y: mouseY };
    }
}

function updateVehicle() {
    if (!activeVehicle) return;
    let moveDirection = 0;
    if (keyIsDown(LEFT_ARROW)) moveDirection = -1;
    if (keyIsDown(RIGHT_ARROW)) moveDirection = 1;
    
    if(moveDirection !== 0) {
        const torque = 0.01 * moveDirection;
        activeVehicle.wheels.forEach(wheel => {
            const maxSpeed = 0.6;
            const newAngVel = wheel.angularVelocity + torque;
            Matter.Body.setAngularVelocity(wheel, Math.max(-maxSpeed, Math.min(maxSpeed, newAngVel)));
        });
    } else {
        activeVehicle.wheels.forEach(wheel => {
             Matter.Body.setAngularVelocity(wheel, wheel.angularVelocity * 0.9);
        });
    }
}

function updateWaterPhysics() {
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
                Matter.Body.setVelocity(body, {x: body.velocity.x * 0.95, y: body.velocity.y * 0.95});
                Matter.Body.setAngularVelocity(body, body.angularVelocity * 0.95);
            }
        });
        if (ragdoll && ragdoll.isOnFire && isInWater) ragdoll.isOnFire = false;
    });
}

// --- Novos Sistemas ---
function updateElectricalSystem() {
    const allBodies = Matter.Composite.allBodies(world);
    const allConstraints = Matter.Composite.allConstraints(world);

    // Resetar estado de energia
    allBodies.forEach(b => { if (b.customProps) b.customProps.isPowered = false; });

    // Geradores fornecem energia
    allBodies.forEach(b => {
        if (b.label === 'gerador') b.customProps.isPowered = true;
    });

    // Propagar energia pelos cabos e condutores
    for (let i = 0; i < 5; i++) { // Iterar algumas vezes para garantir a propagação
        allConstraints.forEach(c => {
            if (c.label === 'cabo_eletrico_segment' && c.bodyA && c.bodyB) {
                const poweredA = c.bodyA.customProps && c.bodyA.customProps.isPowered;
                const poweredB = c.bodyB.customProps && c.bodyB.customProps.isPowered;
                if (poweredA && !poweredB) c.bodyB.customProps.isPowered = true;
                if (poweredB && !poweredA) c.bodyA.customProps.isPowered = true;
            }
        });
        allBodies.forEach(b => {
            if (b.customProps && b.customProps.isPowered && b.customProps.isConductor) {
                 const touching = Matter.Query.collides(b, allBodies);
                 touching.forEach(pair => {
                     const other = pair.bodyA === b ? pair.bodyB : pair.bodyA;
                     if (other.customProps && other.customProps.isConductor && !other.customProps.isPowered) {
                         other.customProps.isPowered = true;
                     }
                 });
            }
        });
    }

    // Aplicar efeitos
    allBodies.forEach(b => {
        if (b.customProps && b.customProps.isPowered) {
            const ragdoll = encontrarRagdollPorCorpo(b);
            if (ragdoll && !ragdoll.isImmortal && Math.random() < 0.2) {
                aplicarDano(b, 2);
                particulas.push({ pos: createVector(b.position.x, b.position.y), vel: p5.Vector.random2D().mult(2), lifespan: 50, type: 'spark' });
            }
        }
    });
}

function updateMechanisms() {
    objetos.forEach(obj => {
        if (!obj.customProps) return;

        // Lógica do Botão
        if (obj.label === 'botao') {
            const touching = Matter.Query.collides(obj, Matter.Composite.allBodies(world));
            obj.customProps.isPressed = touching.length > 0;
        }

        // Lógica do Pistão
        if (obj.label === 'pistao' && obj.customProps.pistonConstraint) {
            const constraint = obj.customProps.pistonConstraint;
            const isPowered = obj.customProps.isPowered || (obj.customProps.wiredTo && obj.customProps.wiredTo.customProps.isPowered);
            constraint.length = isPowered ? obj.customProps.maxLength : obj.customProps.minLength;
        }

        // Lógica do Propulsor
        if (obj.label === 'propulsor') {
            const isPowered = obj.customProps.isPowered || (obj.customProps.wiredTo && obj.customProps.wiredTo.customProps.isPowered);
            if (isPowered) {
                const angle = obj.angle;
                const force = Matter.Vector.create(0, -0.005 * obj.mass);
                const rotatedForce = Matter.Vector.rotate(force, angle);
                Matter.Body.applyForce(obj, obj.position, rotatedForce);
                if (Math.random() < 0.8) {
                    const particlePos = Matter.Vector.add(obj.position, Matter.Vector.rotate(Matter.Vector.create(0, 15), angle));
                    particulas.push({ pos: createVector(particlePos.x, particlePos.y), vel: createVector(rotatedForce.x, rotatedForce.y).mult(-100).add(p5.Vector.random2D()), lifespan: 50, type: 'fire' });
                }
            }
        }
    });
}


function atualizarRagdoll(ragdoll) { 
    if (!ragdoll || !ragdoll.bodies.torso || !ragdoll.bodies.head) return; 
    
    // Atualiza escala
    if (ragdoll.scaleTarget && ragdoll.scale !== ragdoll.scaleTarget) {
        ragdoll.scale = lerp(ragdoll.scale, ragdoll.scaleTarget, 0.05);
        Matter.Composite.scale(ragdoll.composite, ragdoll.scale / ragdoll.composite.bodies[0].customProps.scale, ragdoll.scale / ragdoll.composite.bodies[0].customProps.scale, ragdoll.bodies.torso.position);
        ragdoll.composite.bodies.forEach(b => b.customProps.scale = ragdoll.scale);
    }
    
    // Efeito Anti-Gravidade
    if (ragdoll.antiGravityTimer > 0) {
        ragdoll.antiGravityTimer -= 1000/60;
        Matter.Composite.allBodies(ragdoll.composite).forEach(b => {
            Matter.Body.applyForce(b, b.position, {x: 0, y: -world.gravity.y * b.mass * 1.2});
        });
    }

    if (ragdoll.isPermanentlyDead) {
        if(ragdoll.estado !== 'MORTO') mudarEstado(ragdoll, 'MORTO');
        return;
    }

    if (ragdoll.estado === 'PETRIFIED' || ragdoll.estado === 'SKELETON') {
        ragdoll.isOnFire = false; return;
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


// --- Funções de Input (Mouse, Teclado) ---
function mousePressed() { 
    if (gameState !== 'GAME' || event.target.closest('#top-bar, #left-sidebar, #bottom-bar, #mobile-controls')) return;

    const worldMouse = screenToWorld(mouseX, mouseY);
    
    if (keyIsDown(SHIFT)) {
        isSelecting = true;
        selectionStart = { x: mouseX, y: mouseY };
        document.getElementById('selection-box').style.display = 'block';
        return;
    }

    const allBodies = Matter.Composite.allBodies(world);
    const bodiesUnderMouse = Matter.Query.point(allBodies, worldMouse);
    const clickedBody = bodiesUnderMouse.find(b => !b.isStatic);

    if (toolState.type) {
        if (!toolState.startPoint) {
            toolState.startPoint = worldMouse;
            toolState.startBody = clickedBody || null;
        } else {
            createTool(toolState.startPoint, toolState.startBody, worldMouse, clickedBody || null, toolState.type);
            toolState = { type: null, startPoint: null, startBody: null };
        }
    } else if (objetoParaCriar === 'mao') { 
        if (clickedBody) {
            mouseSpring = Matter.Constraint.create({ bodyA: clickedBody, pointB: worldMouse, stiffness: 0.1, damping: 0.1, label: 'mouseSpring' }); 
            Matter.World.add(world, mouseSpring); 
        } else {
            isPanning = true;
            panStart = { x: mouseX, y: mouseY };
        }
    } else { 
        criarObjeto(objetoParaCriar, worldMouse.x, worldMouse.y); 
    }
}

function mouseDragged() { 
    if (gameState !== 'GAME') return;
    if (isSelecting) {
        const startX = Math.min(selectionStart.x, mouseX);
        const startY = Math.min(selectionStart.y, mouseY);
        const width = Math.abs(selectionStart.x - mouseX);
        const height = Math.abs(selectionStart.y - mouseY);
        const boxDiv = document.getElementById('selection-box');
        boxDiv.style.left = `${startX}px`;
        boxDiv.style.top = `${startY}px`;
        boxDiv.style.width = `${width}px`;
        boxDiv.style.height = `${height}px`;
    }
}

function mouseReleased() { 
    if (gameState !== 'GAME') return;
    
    if (isSelecting) {
        isSelecting = false;
        document.getElementById('selection-box').style.display = 'none';
        
        const worldStart = screenToWorld(selectionStart.x, selectionStart.y);
        const worldEnd = screenToWorld(mouseX, mouseY);
        
        const selectionBounds = Matter.Bounds.create([
            { x: Math.min(worldStart.x, worldEnd.x), y: Math.min(worldStart.y, worldEnd.y) },
            { x: Math.max(worldStart.x, worldEnd.x), y: Math.max(worldStart.y, worldEnd.y) }
        ]);

        const allBodies = Matter.Composite.allBodies(world);
        currentSelection = Matter.Query.region(allBodies, selectionBounds);
    }

    isPanning = false;
    if (mouseSpring) {
        Matter.World.remove(world, mouseSpring); 
        mouseSpring = null;
    }
}

function keyPressed() {
    if (gameState !== 'GAME') return;
    
    switch (key.toLowerCase()) {
        case 'b': // Detonar C4
            placedC4s.forEach(c4 => {
                if (c4.parent) {
                    createExplosion(c4.position, 200, 1.0);
                    Matter.World.remove(world, c4);
                }
            });
            placedC4s = [];
            break;
        case 'r':
            if (activePistol) fireFromPistol(activePistol);
            // Poderia ser usado para ativar outros itens
            break;
        case 'p': toggleSlowMotion(); break;
        case 'k': toggleFreeze(); break;
        case 'o': 
            if (cameraFollowTarget) cameraFollowTarget = null;
            else if (mouseSpring && mouseSpring.bodyA) cameraFollowTarget = mouseSpring.bodyA;
            break;
        case '[': zoomCamera(0.9); break;
        case ']': zoomCamera(1.1); break;
    }
}

// --- CONTINUAÇÃO FINAL DO SCRIPT.JS ---

// --- Sistema de Colisão ---
function handleCollisions(event) { 
    for (const pair of event.pairs) { 
        if (!pair.collision) continue; 
        const velRelativa = pair.collision.speed;
        
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        
        // Granada explode com impacto
        if (bodyA.label === 'granada' && velRelativa > 10 && bodyA.customProps.timer > 0) {
            bodyA.customProps.timer = -1; // Previne explosão dupla
            createExplosion(bodyA.position, 180, 0.8);
            Matter.World.remove(world, bodyA);
            bodyA.customProps.isDead = true;
        }
        if (bodyB.label === 'granada' && velRelativa > 10 && bodyB.customProps.timer > 0) {
            bodyB.customProps.timer = -1;
            createExplosion(bodyB.position, 180, 0.8);
            Matter.World.remove(world, bodyB);
            bodyB.customProps.isDead = true;
        }

        // Ragdolls quebráveis (Petrificados)
        const ragdollA = encontrarRagdollPorCorpo(bodyA);
        if (ragdollA && ragdollA.estado === 'PETRIFIED' && velRelativa > 15) {
            shatterBody(bodyA);
        }
        const ragdollB = encontrarRagdollPorCorpo(bodyB);
        if (ragdollB && ragdollB.estado === 'PETRIFIED' && velRelativa > 15) {
            shatterBody(bodyB);
        }

        const eOrganicoA = bodyA.customProps && bodyA.customProps.isPlayer !== undefined; 
        const eOrganicoB = bodyB.customProps && bodyB.customProps.isPlayer !== undefined; 
        const eArmaBrancaA = ['lamina', 'espada', 'marreta'].includes(bodyA.label);
        const eArmaBrancaB = ['lamina', 'espada', 'marreta'].includes(bodyB.label);
        const eSeringaA = bodyA.label && bodyA.label.startsWith('seringa_');
        const eSeringaB = bodyB.label && bodyB.label.startsWith('seringa_');

        if ((eSeringaA && eOrganicoB) || (eSeringaB && eOrganicoA)) {
            const seringa = eSeringaA ? bodyA : bodyB;
            const corpoAlvo = eSeringaA ? bodyB : bodyA;
            if (velRelativa > LIMIAR_INJECAO_SERINGA && !seringa.customProps.isStuck) {
                stickSyringe(seringa, corpoAlvo, pair.collision.supports[0]);
            }
            continue; 
        }

        if ((eArmaBrancaA && eOrganicoB) || (eArmaBrancaB && eOrganicoA)) { 
            const arma = eArmaBrancaA ? bodyA : bodyB;
            const corpoAlvo = eOrganicoA ? bodyA : bodyB;
            const ragdollAlvo = encontrarRagdollPorCorpo(corpoAlvo);
            if (ragdollAlvo && (arma.label === 'lamina' || arma.label === 'espada') && velRelativa > LIMIAR_DESMEMBRAMENTO) {
                 dismember(ragdollAlvo, corpoAlvo);
            }
        } 
        
        if (velRelativa > LIMIAR_DE_DANO_VELOCIDADE) { 
            const dano = velRelativa * DANO_POR_VELOCIDADE * (bodyA.label === 'marreta' || bodyB.label === 'marreta' ? 2 : 1);
            if(eOrganicoA) aplicarDano(bodyA, dano); 
            if(eOrganicoB) aplicarDano(bodyB, dano); 
            if (eOrganicoA || eOrganicoB) spawnSangue(pair.collision.supports[0].x, pair.collision.supports[0].y, velRelativa); 
        } 

        if ((bodyA.label === 'head' || bodyB.label === 'head') && velRelativa > LIMIAR_NOCAUTE_VELOCIDADE) { 
            const ragdollAlvo = bodyA.label === 'head' ? encontrarRagdollPorCorpo(bodyA) : encontrarRagdollPorCorpo(bodyB); 
            if (ragdollAlvo && ragdollAlvo.estado === 'ATIVO') mudarEstado(ragdollAlvo, 'NOCAUTEADO'); 
        } 
    } 
}

// --- Funções de Dano e Estados ---
function aplicarDano(corpo, dano) { 
    if (!corpo.customProps) return; 
    const ragdoll = encontrarRagdollPorCorpo(corpo);
    if (ragdoll && (ragdoll.isImmortal || ragdoll.isPermanentlyDead || ragdoll.estado === 'PETRIFIED')) return; 

    corpo.customProps.saude -= dano; 
    
    if (corpo.customProps.saude <= 0) { 
        corpo.customProps.saude = 0; 
        const ragdollAlvo = encontrarRagdollPorCorpo(corpo); 
        if (ragdollAlvo && (corpo.label === 'torso' || corpo.label === 'head')) { 
            if(ragdollAlvo.estado !== 'MORTO' && ragdollAlvo.estado !== 'SKELETON') mudarEstado(ragdollAlvo, 'MORTO'); 
        } 
    } 
}

function dismember(ragdoll, bodyPart) {
    if (!bodyPart.customProps.juntaAssociada || bodyPart.label === 'torso' || bodyPart.label === 'head') return;
    
    const constraintLabel = bodyPart.customProps.juntaAssociada;
    const constraint = ragdoll.composite.constraints.find(c => c.label === constraintLabel);
    
    if (constraint) {
        Matter.Composite.remove(ragdoll.composite, constraint);
        bodyPart.customProps.juntaAssociada = null;
    }
}

function shatterBody(body) {
    if (!body || !body.parent) return;
    const ragdoll = encontrarRagdollPorCorpo(body);
    if (ragdoll) {
        mudarEstado(ragdoll, 'MORTO');
        ragdoll.isPermanentlyDead = true;
    }
    createExplosion(body.position, 20, 0.05);
    Matter.World.remove(world, body);
}

// --- Funções de Criação de Itens ---
function criarObjeto(tipo, x, y) { 
    let novoObjeto; 
    const metalProps = { isConductor: true, cor: color(0, 0, 70) };
    let options = {restitution:0.5, friction:0.5, customProps: {isFrozen: false, isStuck: false, scale: 1.0}}; 
    
    switch(tipo) { 
        case 'mao': return; 
        case 'caixa': novoObjeto=Matter.Bodies.rectangle(x,y,40,40,{...options, customProps: {...options.customProps, cor: color(30, 70, 80)}}); break; 
        case 'bola': novoObjeto=Matter.Bodies.circle(x,y,25,{...options, customProps: {...options.customProps, cor: color(20, 80, 90)}}); break; 
        case 'parede': novoObjeto=Matter.Bodies.rectangle(x,y,20,150,{...options, customProps: {...options.customProps, cor: color(0, 0, 60)}}); break; 
        case 'triangulo': novoObjeto = Matter.Bodies.polygon(x, y, 3, 30, {...options, customProps: {...options.customProps, cor: color(200, 70, 80)}}); break;
        case 'cano': novoObjeto = Matter.Bodies.rectangle(x, y, 150, 15, { ...options, label: tipo, customProps: {...options.customProps, ...metalProps}}); break;
        case 'barril': novoObjeto=Matter.Bodies.rectangle(x, y, 40, 60, {...options, label: tipo, chamfer: { radius: 20 }, customProps: {...options.customProps, ...metalProps}}); break;
        // Armas Brancas
        case 'lamina': novoObjeto = Matter.Bodies.rectangle(x, y, 80, 10, { ...options, label: tipo, customProps: {...options.customProps, ...metalProps}}); break; 
        case 'espada': novoObjeto = Matter.Bodies.rectangle(x, y, 120, 8, { ...options, label: tipo, customProps: {...options.customProps, ...metalProps}}); break;
        case 'marreta': novoObjeto = Matter.Bodies.rectangle(x, y, 50, 50, { ...options, label: tipo, density: 0.05, customProps: {...options.customProps, ...metalProps, cor: color(0,0,50)}}); break;
        // Explosivos
        case 'granada': novoObjeto = Matter.Bodies.circle(x, y, 15, { ...options, label: tipo, density: 0.01, customProps: {...options.customProps, timer: 3000, cor: color(120, 80, 40)}}); break;
        case 'c4': novoObjeto = createC4(x, y); break;
        // Ragdoll
        case 'boneco': const novoRagdoll=createRagdoll(x,y,false); outrosRagdolls.push(novoRagdoll); Matter.World.add(world, novoRagdoll.composite); return; 
        // Veículos
        case 'carro': if (activeVehicle) Matter.World.remove(world, activeVehicle.composite); activeVehicle = createCar(x, y); Matter.World.add(world, activeVehicle.composite); return;
        case 'onibus': if (activeVehicle) Matter.World.remove(world, activeVehicle.composite); activeVehicle = createBus(x, y); Matter.World.add(world, activeVehicle.composite); return;
        // Mecanismos
        case 'gerador': novoObjeto = Matter.Bodies.rectangle(x, y, 80, 80, {label: tipo, isStatic: true, customProps: {isPowered: true, cor: color(30, 80, 50)}}); break;
        case 'botao': novoObjeto = Matter.Bodies.rectangle(x, y, 50, 20, {label: tipo, isStatic: true, customProps: {isPressed: false, isConductor: true, cor: color(0, 80, 70)}}); break;
        case 'propulsor': novoObjeto = Matter.Bodies.rectangle(x, y, 30, 60, {label: tipo, density: 0.005, customProps: {isPowered: false, cor: color(0,0,60)}}); break;
        case 'pistao': novoObjeto = createPiston(x, y); break;
        // Seringas
        default:
            if (tipo && tipo.startsWith('seringa_')) {
                const liquid = tipo.replace('seringa_','');
                novoObjeto = createSyringe(x, y, liquid);
            } else return;
    } 
    if (novoObjeto) {
        if (!Array.isArray(novoObjeto)) novoObjeto = [novoObjeto];
        novoObjeto.forEach(obj => objetos.push(obj));
        Matter.World.add(world, novoObjeto); 
    }
}

function createPiston(x, y) {
    const base = Matter.Bodies.rectangle(x, y, 40, 40, {label: 'pistao_base', density: 0.02});
    const head = Matter.Bodies.rectangle(x, y - 50, 40, 20, {label: 'pistao_head', density: 0.01});
    const minLength = 25, maxLength = 150;
    const pistonConstraint = Matter.Constraint.create({
        bodyA: base,
        bodyB: head,
        length: minLength,
        stiffness: 0.1
    });
    base.customProps = { isPowered: false, pistonConstraint, minLength, maxLength, cor: color(0,0,50)};
    head.customProps = { cor: color(0,0,60) };
    Matter.World.add(world, [base, head, pistonConstraint]);
    objetos.push(base, head);
}

function createC4(x, y) {
    const worldMouse = screenToWorld(mouseX, mouseY);
    const bodiesUnderMouse = Matter.Query.point(Matter.Composite.allBodies(world), worldMouse);
    const targetBody = bodiesUnderMouse.find(b => b.label !== 'wall');
    
    const c4 = Matter.Bodies.rectangle(x, y, 30, 15, {label: 'c4', density: 0.002, customProps: {cor: color(30, 90, 60)}});
    
    if (targetBody) {
        const constraint = Matter.Constraint.create({
            bodyA: targetBody,
            bodyB: c4,
            pointA: Matter.Vector.sub(c4.position, targetBody.position),
            stiffness: 1,
            length: 0
        });
        Matter.World.add(world, constraint);
    }
    placedC4s.push(c4);
    objetos.push(c4);
    Matter.World.add(world, c4);
}

// ... (Outras funções de criação de objetos como createRagdoll, createCar, etc)
// Elas continuam as mesmas da sua versão anterior.

// --- Funções de Ferramentas (Corda, Mola, Prego) ---
function createTool(p1, b1, p2, b2, type) {
    let newConstraint;
    switch (type) {
        case 'corda':
        case 'cabo_eletrico':
            const cable = createCable(p1, b1, p2, b2, type);
            if (cable) cordas.push(cable);
            break;
        case 'mola':
            newConstraint = Matter.Constraint.create({
                bodyA: b1 || world.bodies.find(b => b.isStatic), pointA: b1 ? Matter.Vector.sub(p1, b1.position) : p1,
                bodyB: b2 || world.bodies.find(b => b.isStatic), pointB: b2 ? Matter.Vector.sub(p2, b2.position) : p2,
                stiffness: 0.05, damping: 0.05, label: 'mola'
            });
            Matter.World.add(world, newConstraint);
            break;
        case 'prego':
            if (!b1 || !b2) return;
            newConstraint = Matter.Constraint.create({
                bodyA: b1, bodyB: b2,
                pointA: Matter.Vector.sub(p1, b1.position),
                pointB: Matter.Vector.sub(p2, b2.position),
                stiffness: 1, length: 0, label: 'prego'
            });
            Matter.World.add(world, newConstraint);
            break;
    }
}


// --- Funções de Salvamento ---
function saveContraption(name) {
    if (currentSelection.length === 0 || !name) return;

    const bodies = currentSelection.map(b => {
        return {
            id: b.id, label: b.label,
            position: { ...b.position }, angle: b.angle,
            vertices: b.vertices.map(v => ({...v})),
            customProps: { ...b.customProps, cor: {h: hue(b.customProps.cor), s: saturation(b.customProps.cor), b: brightness(b.customProps.cor)} }
        };
    });

    const constraints = [];
    const allConstraints = Matter.Composite.allConstraints(world);
    allConstraints.forEach(c => {
        if (currentSelection.includes(c.bodyA) && currentSelection.includes(c.bodyB)) {
            constraints.push({
                label: c.label,
                bodyAId: c.bodyA.id, bodyBId: c.bodyB.id,
                pointA: { ...c.pointA }, pointB: { ...c.pointB },
                length: c.length, stiffness: c.stiffness
            });
        }
    });

    const contraption = { name, bodies, constraints };
    const savedContraptions = JSON.parse(localStorage.getItem('ragdollSandboxContraptions') || '[]');
    savedContraptions.push(contraption);
    localStorage.setItem('ragdollSandboxContraptions', JSON.stringify(savedContraptions));
    
    currentSelection = [];
    showModal('load-modal');
    populateLoadList();
}

function loadContraption(name) {
    const savedContraptions = JSON.parse(localStorage.getItem('ragdollSandboxContraptions') || '[]');
    const contraptionData = savedContraptions.find(c => c.name === name);
    if (!contraptionData) return;

    const newBodies = {};
    const worldMouse = screenToWorld(mouseX, mouseY);
    
    // Calcular centroide para posicionar corretamente
    let avgX = 0, avgY = 0;
    contraptionData.bodies.forEach(bData => {
        avgX += bData.position.x;
        avgY += bData.position.y;
    });
    avgX /= contraptionData.bodies.length;
    avgY /= contraptionData.bodies.length;
    
    const offsetX = worldMouse.x - avgX;
    const offsetY = worldMouse.y - avgY;

    contraptionData.bodies.forEach(bData => {
        const props = { ...bData.customProps, cor: color(bData.customProps.cor.h, bData.customProps.cor.s, bData.customProps.cor.b)};
        const newBody = Matter.Bodies.fromVertices(bData.position.x + offsetX, bData.position.y + offsetY, [bData.vertices], {
            label: bData.label,
            angle: bData.angle,
            customProps: props
        });
        newBodies[bData.id] = newBody;
        objetos.push(newBody);
        Matter.World.add(world, newBody);
    });

    contraptionData.constraints.forEach(cData => {
        const bodyA = newBodies[cData.bodyAId];
        const bodyB = newBodies[cData.bodyBId];
        if (bodyA && bodyB) {
            const newConstraint = Matter.Constraint.create({
                ...cData, bodyA, bodyB
            });
            Matter.World.add(world, newConstraint);
        }
    });
}


// --- Funções de UI e Desenho Auxiliares ---
function drawSelectionUI() {
    push();
    currentSelection.forEach(body => {
        fill(0, 100, 100, 0.3);
        noStroke();
        beginShape();
        body.vertices.forEach(v => vertex(v.x * camera.zoom + camera.x, v.y * camera.zoom + camera.y));
        endShape(CLOSE);
    });
    pop();
}

function drawWater() {
    waterZones.forEach(zone => {
        push();
        noStroke();
        fill(200, 80, 70, 0.5); 
        rect(zone.x, zone.y, zone.width, zone.height);
        pop();
    });
}

function populateLoadList() {
    const listDiv = document.getElementById('load-list');
    listDiv.innerHTML = '';
    const savedContraptions = JSON.parse(localStorage.getItem('ragdollSandboxContraptions') || '[]');
    savedContraptions.forEach(c => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'load-item';
        itemDiv.innerHTML = `<span>${c.name}</span>`;
        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Carregar';
        loadBtn.onclick = () => {
            loadContraption(c.name);
            hideModal('load-modal');
        };
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'X';
        deleteBtn.style.backgroundColor = '#c0392b';
        deleteBtn.onclick = () => {
            const updated = savedContraptions.filter(item => item.name !== c.name);
            localStorage.setItem('ragdollSandboxContraptions', JSON.stringify(updated));
            populateLoadList();
        };
        itemDiv.appendChild(deleteBtn);
        itemDiv.appendChild(loadBtn);
        listDiv.appendChild(itemDiv);
    });
}

// ==================================================================
// COLE TODAS AS FUNÇÕES ABAIXO NO FINAL DO SEU NOVO SCRIPT.JS
// ==================================================================


// --- Funções de Criação de Objetos Complexos ---

function createRagdoll(x, y, isPlayer) { 
    const group = Matter.Body.nextGroup(true); 
    const corRagdoll = color(random(360), random(40, 60), random(70, 85));

    const commonBodyOptions = { collisionFilter: { group: group }, density: 0.002, friction: 0.8 };
    const commonCustomProps = { saude: 100, saudeMaxima: 100, isPlayer, hematomas: [], cor: corRagdoll, originalColor: corRagdoll, isFrozen: false, selfRighting: true, mode: 'normal', scale: 1.0 };

    const torso = Matter.Bodies.rectangle(x, y, 40, 80, { ...commonBodyOptions, label: 'torso', customProps: { ...commonCustomProps, juntaAssociada: 'torso' } });
    const head = Matter.Bodies.circle(x, y - 60, 25, { ...commonBodyOptions, label: 'head', customProps: { ...commonCustomProps, juntaAssociada: 'neck' } });
    const legLeft = Matter.Bodies.rectangle(x - 10, y + 80, 20, 60, { ...commonBodyOptions, label: 'legLeft', customProps: { ...commonCustomProps, juntaAssociada: 'hipLeft' } });
    const legRight = Matter.Bodies.rectangle(x + 10, y + 80, 20, 60, { ...commonBodyOptions, label: 'legRight', customProps: { ...commonCustomProps, juntaAssociada: 'hipRight' } });
    const armLeft = Matter.Bodies.rectangle(x - 35, y - 10, 20, 50, { ...commonBodyOptions, label: 'armLeft', customProps: { ...commonCustomProps, juntaAssociada: 'shoulderLeft' } });
    const armRight = Matter.Bodies.rectangle(x + 35, y + 10, 20, 50, { ...commonBodyOptions, label: 'armRight', customProps: { ...commonCustomProps, juntaAssociada: 'shoulderRight' } });
    
    const criarJunta = (bodyA, bodyB, pA, pB, label) => Matter.Constraint.create({bodyA, bodyB, pointA:pA, pointB:pB, stiffness:1.0, length:0, label}); 

    const neck = criarJunta(torso, head, {x:0, y:-45}, {x:0,y:0}, 'neck'); 
    const hipLeft = criarJunta(torso, legLeft, {x:-12, y:30}, {x:0,y:-30}, 'hipLeft'); 
    const hipRight = criarJunta(torso, legRight, {x:12, y:30}, {x:0,y:-30}, 'hipRight'); 
    const shoulderLeft = criarJunta(torso, armLeft, {x:20, y:-35}, {x:0,y:-25}, 'shoulderLeft'); 
    const shoulderRight = criarJunta(torso, armRight, {x:-20, y:-35}, {x:0,y:-25}, 'shoulderRight'); 

    const composite = Matter.Composite.create({bodies:[torso,head,legLeft,legRight,armLeft,armRight], constraints:[neck,hipLeft,hipRight,shoulderLeft,shoulderRight]}); 
    
    return { 
        composite, bodies:{torso,head,legLeft,legRight,armLeft,armRight}, 
        isPlayer, estado: 'ATIVO', tempoNocauteado:0, tempoMorte:0, 
        isImmortal: false, isOnFire: false, adrenalineTimer: 0, charring: 0, 
        internalLiquids: { sangue: 10 }, isVolatile: false, isCorroding: false, 
        corrosionLevel: 0, deathTimer: 0, isPermanentlyDead: false, 
        skeletonType: null, antiGravityTimer: 0, scale: 1.0, scaleTarget: 1.0 
    }; 
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


// --- Funções de Seringa ---

function createSyringe(x, y, liquidType) {
    const syringeColor = getSyringeColor('seringa_' + liquidType);
    let liquidContents = {};
    if (liquidType !== 'vazia') {
        liquidContents[liquidType] = 1;
    }
    const options = {
        density: 0.001,
        label: 'seringa_' + liquidType,
        customProps: {
            cor: syringeColor,
            liquidContents,
            uses: (liquidType === 'vazia' ? 0 : 1),
            isStuck: false
        }
    };
    return Matter.Bodies.rectangle(x, y, 8, 40, options);
}

function getSyringeColor(type) {
     switch(type) {
        case 'seringa_vazia': return color(0, 0, 80);
        case 'seringa_sangue': return color(0, 80, 70);
        case 'seringa_acido': return color(100, 80, 70);
        case 'seringa_adrenalina': return color(60, 100, 90);
        case 'seringa_cura': return color(340, 70, 90);
        case 'seringa_zumbi': return color(120, 30, 50);
        case 'seringa_imortalidade': return color(50, 70, 100);
        case 'seringa_fogo': return color(20, 100, 100);
        case 'seringa_nitro': return color(40, 90, 80);
        case 'seringa_antigravidade': return color(200, 50, 90);
        case 'seringa_petrificacao': return color(0, 0, 50);
        case 'seringa_crescimento': return color(120, 100, 80);
        case 'seringa_encolhimento': return color(300, 50, 80);
        default: return color(0, 0, 60);
    }
}


// --- Funções de UI e Controles Mobile ---

function setupUI() {
    // Eventos do menu principal
    document.getElementById('main-menu-play').addEventListener('click', showMapSelection);
    document.querySelectorAll('.map-preview-btn').forEach(btn => {
        btn.addEventListener('click', () => iniciarJogoComMapa(btn.dataset.map));
    });
    document.getElementById('main-menu-settings').addEventListener('click', () => { modalReturnState = 'MENU'; showModal('settings-modal'); });
    document.getElementById('main-menu-mods').addEventListener('click', () => { modalReturnState = 'MENU'; showModal('mods-modal'); });
    document.getElementById('main-menu-information').addEventListener('click', () => { modalReturnState = 'MENU'; showModal('info-modal'); });

    // Eventos dos modais
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => e.target.closest('.game-modal').style.display = 'none');
    });

    // Eventos da UI do jogo
    document.querySelectorAll('#top-bar button').forEach(btn => {
        btn.addEventListener('click', () => switchCategory(btn.dataset.category, btn.id));
    });
    document.querySelectorAll('.item-btn, .tool-btn').forEach(btn => { 
        btn.addEventListener('click', () => selectCreationType(btn.dataset.tipo)); 
    });
    document.getElementById('btnClearAll').addEventListener('click', clearAllBodies);
    document.getElementById('settings-button').addEventListener('click', () => { modalReturnState = 'GAME'; showModal('settings-modal'); });
    document.getElementById('environment-button').addEventListener('click', () => { modalReturnState = 'GAME'; showEnvironmentModal(); });
    document.getElementById('toggle-gravity-btn').addEventListener('click', toggleGravity);
    
    // Sistema de salvar/carregar
    document.getElementById('icon-save').addEventListener('click', () => {
        if(currentSelection.length > 0) showModal('save-modal');
        else alert('Selecione objetos com SHIFT + Arrastar para salvar.');
    });
    document.getElementById('icon-load').addEventListener('click', () => {
        populateLoadList();
        showModal('load-modal');
    });
    document.getElementById('save-contraption-btn').addEventListener('click', () => {
        const name = document.getElementById('save-name-input').value;
        saveContraption(name);
        hideModal('save-modal');
    });
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showSettingsModal() { showModal('settings-modal'); }

function showEnvironmentModal() { 
    showModal('environment-modal'); 
    const btn = document.getElementById('toggle-gravity-btn');
    btn.textContent = currentGravityY === 0 ? 'Ativar Gravidade' : 'Desativar Gravidade';
}

function mobileGrabDrop() {
    // Lógica para controles mobile...
}
function mobileFreeze() {
    // Lógica para controles mobile...
}
function mobileToggleDonor() {
    // Lógica para controles mobile...
}

// ==================================================================
// COLE ESTE BLOCO PARA CORRIGIR O ERRO DO MENU
// ==================================================================

// --- Funções de Navegação de UI (Menu -> Jogo) ---

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

    windowResized(); // Garante que o canvas tenha o tamanho certo
    
    // Centraliza a câmera no ponto inicial do jogador
    camera.x = width / 2 - PLAYER_SPAWN_X * camera.zoom;
    camera.y = height / 2 - PLAYER_SPAWN_Y * camera.zoom;
    
    // Esconde a sidebar no início do jogo
    document.getElementById('left-sidebar').classList.add('hidden');
    // Define a categoria inicial de itens
    switchCategory('category-items-basic', 'icon-items-basic');
}
