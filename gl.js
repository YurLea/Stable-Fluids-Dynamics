export function createGL(canvas) {
    const gl = canvas.getContext('webgl2', {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');

    // Нужны float/half-float текстуры, иначе качество будет плохим.
    // В WebGL2 обычно доступно RGBA16F + рендер в float через EXT_color_buffer_float.
    const extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    if (!extColorBufferFloat) {
        console.warn('EXT_color_buffer_float not available (float render targets may fail)');
    }
    gl.getExtension('OES_texture_float_linear');      // линейная фильтрация float (может быть null)
    gl.getExtension('OES_texture_half_float_linear'); // линейная фильтрация half-float (может быть null)

    return gl;
}

export function compileShader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) + '\n' + source);
    }
    return s;
}

export function createProgram(gl, vsSource, fsSource) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(p));
    }
    return p;
}

// Fullscreen triangle без VBO
export function drawFullscreen(gl) {
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function createTexture(gl, w, h, {
    internalFormat,
    format,
    type,
    filter = gl.LINEAR,
    wrap = gl.CLAMP_TO_EDGE,
} = {}) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
}

export function createFBO(gl, tex) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('FBO incomplete: ' + status.toString(16));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
}

export function createDoubleFBO(gl, w, h, texOpts) {
    const tex0 = createTexture(gl, w, h, texOpts);
    const tex1 = createTexture(gl, w, h, texOpts);
    const fbo0 = createFBO(gl, tex0);
    const fbo1 = createFBO(gl, tex1);
    return {
        read:  { tex: tex0, fbo: fbo0 },
        write: { tex: tex1, fbo: fbo1 },
        swap() { const t = this.read; this.read = this.write; this.write = t; }
    };
}

export async function loadText(url) {
    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) {
        throw new Error(`Failed to load ${url}: ${r.status} ${r.statusText}\n` + text.slice(0, 200));
    }
    return text;
}