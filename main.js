import { createGL, createProgram, createDoubleFBO, createTexture, createFBO, drawFullscreen, loadText } from './gl.js';

const canvas = document.getElementById('c');
const gl = createGL(canvas);

function resizeCanvasToDisplaySize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resizeCanvasToDisplaySize);
resizeCanvasToDisplaySize();

const sim = {
    simScale: 0.6,            // 1.0 = fullscreen resolution
    dt: 1/200,
    velocityDissipation: 1.0,
    dyeDissipation: 0.999,
    pressureIterations: 30,
    curlStrength: 20.0, // max 30
    viscosity: 0.00001,          // ν
    viscosityIterations: 20,     // 10..50
    splatRadius: 0.013,        // в UV-координатах
    forceScale: 50.0,
    bloomEnabled: true,
    bloomThreshold: 0.6,
    bloomIntensity: 0.8,
};

const pointer = {
    down: false,
    x: 0, y: 0,
    px: 0, py: 0,
    dx: 0, dy: 0,
    color: [1, 0.5, 0.2],
};

canvas.addEventListener('pointerdown', (e) => {
    pointer.down = true;
    pointer.x = pointer.px = e.clientX;
    pointer.y = pointer.py = e.clientY;
    pointer.dx = 0;
    pointer.dy = 0;
});

canvas.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;

    if (!pointer.down) return; // важно: дельта только при зажатии

    // накапливаем дельту между событиями
    pointer.dx += (pointer.x - pointer.px);
    pointer.dy += (pointer.y - pointer.py);

    pointer.px = pointer.x;
    pointer.py = pointer.y;
});

canvas.addEventListener('pointerup', () => {
    pointer.down = false;
    pointer.dx = 0;
    pointer.dy = 0;
});

function createSimResources() {
    const w = Math.floor(canvas.width * sim.simScale);
    const h = Math.floor(canvas.height * sim.simScale);

    const halfFloat = gl.HALF_FLOAT;

    const velocity = createDoubleFBO(gl, w, h, {
        internalFormat: gl.RG16F,
        format: gl.RG,
        type: halfFloat,
        filter: gl.LINEAR,
    });

    const dye = createDoubleFBO(gl, w, h, {
        internalFormat: gl.RGBA16F,
        format: gl.RGBA,
        type: halfFloat,
        filter: gl.LINEAR,
    });

    const pressure = createDoubleFBO(gl, w, h, {
        internalFormat: gl.R16F,
        format: gl.RED,
        type: halfFloat,
        filter: gl.NEAREST, // для давления лучше nearest (чётче)
    });

    const divergenceTex = createTexture(gl, w, h, {
        internalFormat: gl.R16F,
        format: gl.RED,
        type: halfFloat,
        filter: gl.NEAREST,
    });
    const divergenceFBO = createFBO(gl, divergenceTex);

    const curlTex = createTexture(gl, w, h, {
        internalFormat: gl.R16F,
        format: gl.RED,
        type: halfFloat,
        filter: gl.NEAREST,
    });
    const curlFBO = createFBO(gl, curlTex);

    const velocity0Tex = createTexture(gl, w, h, {
        internalFormat: gl.RG16F,
        format: gl.RG,
        type: halfFloat,
        filter: gl.NEAREST,
    });
    const velocity0FBO = createFBO(gl, velocity0Tex);

    // Очистка (аналог твоего cudaMemset) — критично, иначе “мусор” на первом кадре
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.read.fbo);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.read.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.read.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, divergenceFBO);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, curlFBO);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { w, h, velocity, dye, pressure, divergenceTex, divergenceFBO, curlTex, curlFBO, velocity0Tex, velocity0FBO };
}

let res = createSimResources();

const vsSource = await loadText('./shaders/base.vert');

async function makeProgram(fsPath) {
    const fs = await loadText(fsPath);
    return createProgram(gl, vsSource, fs);
}

const prog = {
    splat: await makeProgram('./shaders/splat.frag'),
    advect: await makeProgram('./shaders/advect.frag'),
    divergence: await makeProgram('./shaders/divergence.frag'),
    pressureJacobi: await makeProgram('./shaders/pressure_jacobi.frag'),
    gradientSubtract: await makeProgram('./shaders/gradient_subtract.frag'),
    curl: await makeProgram('./shaders/curl.frag'),
    vorticity: await makeProgram('./shaders/vorticity.frag'),
    display: await makeProgram('./shaders/display.frag'),
    copy: await makeProgram('./shaders/copy.frag'),
    viscosityJacobi: await makeProgram('./shaders/viscosity_jacobi.frag'),
};

function bindTexture(unit, tex, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
}

function runPass(program, targetFBO, setUniforms, w = res.w, h = res.h) {
    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    gl.viewport(0, 0, w, h);
    setUniforms?.();
    drawFullscreen(gl);
}

function getPointerUV() {
    const rect = canvas.getBoundingClientRect();

    let uvx = (pointer.x - rect.left) / rect.width;
    let uvy = 1.0 - (pointer.y - rect.top) / rect.height;

    uvx = Math.max(0, Math.min(1, uvx));
    uvy = Math.max(0, Math.min(1, uvy));
    return [uvx, uvy];
}

function step(dt) {
    const texelSize = [1 / res.w, 1 / res.h];

    // 1) curl
    runPass(prog.curl, res.curlFBO, () => {
        bindTexture(0, res.velocity.read.tex, gl.getUniformLocation(prog.curl, 'uVelocity'));
        gl.uniform2f(gl.getUniformLocation(prog.curl, 'uTexelSize'), texelSize[0], texelSize[1]);
    });

    // 2) vorticity confinement -> velocity.write
    runPass(prog.vorticity, res.velocity.write.fbo, () => {
        bindTexture(0, res.velocity.read.tex, gl.getUniformLocation(prog.vorticity, 'uVelocity'));
        bindTexture(1, res.curlTex,          gl.getUniformLocation(prog.vorticity, 'uCurl'));
        gl.uniform2f(gl.getUniformLocation(prog.vorticity, 'uTexelSize'), texelSize[0], texelSize[1]);
        gl.uniform1f(gl.getUniformLocation(prog.vorticity, 'uDt'), dt);
        gl.uniform1f(gl.getUniformLocation(prog.vorticity, 'uCurlStrength'), sim.curlStrength);
    });
    res.velocity.swap();

    // 3) пользовательский splat (force + dye)
    if (pointer.down) {
        const [uvx, uvy] = getPointerUV();

        // Толщина запретной зоны в ЯЧЕЙКАХ симуляции.
        // Должна быть >= радиуса splat в ячейках, иначе круг заденет границу.
        const radiusTexels = Math.ceil(sim.splatRadius * Math.max(res.w, res.h));
        const edgeTexels = radiusTexels + 2; // +2 для запаса

        const ix = Math.floor(uvx * res.w);
        const iy = Math.floor(uvy * res.h);

        const inSafe =
            ix >= edgeTexels && ix < (res.w - edgeTexels) &&
            iy >= edgeTexels && iy < (res.h - edgeTexels);

        if (inSafe) {
            const fx = pointer.dx * sim.forceScale;
            const fy = -pointer.dy * sim.forceScale;

            // velocity splat
            runPass(prog.splat, res.velocity.write.fbo, () => {
                bindTexture(0, res.velocity.read.tex, gl.getUniformLocation(prog.splat, 'uTarget'));
                gl.uniform2f(gl.getUniformLocation(prog.splat, 'uPoint'), uvx, uvy);
                gl.uniform1f(gl.getUniformLocation(prog.splat, 'uRadius'), sim.splatRadius);
                gl.uniform3f(gl.getUniformLocation(prog.splat, 'uValue'), fx, fy, 0);
            });
            res.velocity.swap();

            // dye splat
            runPass(prog.splat, res.dye.write.fbo, () => {
                bindTexture(0, res.dye.read.tex, gl.getUniformLocation(prog.splat, 'uTarget'));
                gl.uniform2f(gl.getUniformLocation(prog.splat, 'uPoint'), uvx, uvy);
                gl.uniform1f(gl.getUniformLocation(prog.splat, 'uRadius'), sim.splatRadius);
                gl.uniform3f(gl.getUniformLocation(prog.splat, 'uValue'), pointer.color[0], pointer.color[1], pointer.color[2]);
            });
            res.dye.swap();
        }

        // сбрасываем дельту всегда
        pointer.dx = 0;
        pointer.dy = 0;
    }

    // --- VISCOSITY (diffuse velocity) ---
    if (sim.viscosity > 0) {
        const N = Math.max(res.w, res.h);
        const alpha = sim.viscosity * dt * (N * N); // ν*dt/h^2, где h~1/N

        // 1) “заморозить” b = u^n в velocity0Tex
        runPass(prog.copy, res.velocity0FBO, () => {
            bindTexture(0, res.velocity.read.tex, gl.getUniformLocation(prog.copy, 'uTexture'));
        });

        // 2) Jacobi iterations: x <- solve( (I - a Laplacian) x = b )
        for (let i = 0; i < sim.viscosityIterations; i++) {
            runPass(prog.viscosityJacobi, res.velocity.write.fbo, () => {
                bindTexture(0, res.velocity.read.tex,  gl.getUniformLocation(prog.viscosityJacobi, 'uVelocity'));
                bindTexture(1, res.velocity0Tex,       gl.getUniformLocation(prog.viscosityJacobi, 'uVelocity0'));
                gl.uniform2f(gl.getUniformLocation(prog.viscosityJacobi, 'uTexelSize'), 1 / res.w, 1 / res.h);
                gl.uniform1f(gl.getUniformLocation(prog.viscosityJacobi, 'uAlpha'), alpha);
            });
            res.velocity.swap();
        }
    }

    // 4) divergence
    runPass(prog.divergence, res.divergenceFBO, () => {
        bindTexture(0, res.velocity.read.tex, gl.getUniformLocation(prog.divergence, 'uVelocity'));
        gl.uniform2f(gl.getUniformLocation(prog.divergence, 'uTexelSize'), texelSize[0], texelSize[1]);
    });

    // 5) pressure solve (Jacobi iterations)
    // Важно: перед решением можно “обнулить” pressure, чтобы не накапливать мусор
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.pressure.read.fbo);
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (let i = 0; i < sim.pressureIterations; i++) {
        runPass(prog.pressureJacobi, res.pressure.write.fbo, () => {
            bindTexture(0, res.pressure.read.tex,  gl.getUniformLocation(prog.pressureJacobi, 'uPressure'));
            bindTexture(1, res.divergenceTex,      gl.getUniformLocation(prog.pressureJacobi, 'uDivergence'));
            gl.uniform2f(gl.getUniformLocation(prog.pressureJacobi, 'uTexelSize'), texelSize[0], texelSize[1]);
        });
        res.pressure.swap();
    }

    // 6) project: subtract pressure gradient from velocity
    runPass(prog.gradientSubtract, res.velocity.write.fbo, () => {
        bindTexture(0, res.velocity.read.tex, gl.getUniformLocation(prog.gradientSubtract, 'uVelocity'));
        bindTexture(1, res.pressure.read.tex, gl.getUniformLocation(prog.gradientSubtract, 'uPressure'));
        gl.uniform2f(gl.getUniformLocation(prog.gradientSubtract, 'uTexelSize'), texelSize[0], texelSize[1]);
    });
    res.velocity.swap();

    // 7) advect velocity
    runPass(prog.advect, res.velocity.write.fbo, () => {
        bindTexture(0, res.velocity.read.tex, gl.getUniformLocation(prog.advect, 'uVelocity'));
        bindTexture(1, res.velocity.read.tex, gl.getUniformLocation(prog.advect, 'uSource'));
        gl.uniform2f(gl.getUniformLocation(prog.advect, 'uTexelSize'), texelSize[0], texelSize[1]);
        gl.uniform1f(gl.getUniformLocation(prog.advect, 'uDt'), dt);
        gl.uniform1f(gl.getUniformLocation(prog.advect, 'uDissipation'), sim.velocityDissipation);
    });
    res.velocity.swap();

    // 8) advect dye
    runPass(prog.advect, res.dye.write.fbo, () => {
        bindTexture(0, res.velocity.read.tex, gl.getUniformLocation(prog.advect, 'uVelocity'));
        bindTexture(1, res.dye.read.tex,      gl.getUniformLocation(prog.advect, 'uSource'));
        gl.uniform2f(gl.getUniformLocation(prog.advect, 'uTexelSize'), texelSize[0], texelSize[1]);
        gl.uniform1f(gl.getUniformLocation(prog.advect, 'uDt'), dt);
        gl.uniform1f(gl.getUniformLocation(prog.advect, 'uDissipation'), sim.dyeDissipation);
    });
    res.dye.swap();
}

function renderToScreen() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.useProgram(prog.display);
    bindTexture(0, res.dye.read.tex, gl.getUniformLocation(prog.display, 'uDye'));
    drawFullscreen(gl);
}

let lastT = performance.now();
function frame(t) {
    resizeCanvasToDisplaySize();

    // Если размер изменился — пересоздаём ресурсы
    const desiredW = Math.floor(canvas.width * sim.simScale);
    const desiredH = Math.floor(canvas.height * sim.simScale);
    if (desiredW !== res.w || desiredH !== res.h) {
        res = createSimResources();
    }
    lastT = t;

    step(sim.dt);
    renderToScreen();

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);