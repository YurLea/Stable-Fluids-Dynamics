#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uVelocity;
uniform sampler2D uSource;       // что переносим (velocity или dye)
uniform vec2 uTexelSize;         // (1/w, 1/h)
uniform float uDt;
uniform float uDissipation;      // 0.98..0.999

void main() {
  vec2 vel = texture(uVelocity, vUv).xy;

  // Backtrace: откуда пришло
  vec2 coord = vUv - uDt * vel * uTexelSize;
  // CLAMP_TO_EDGE на текстуре = безопасные границы без if’ов
  // не даём уйти за границу: держим внутри "центров" крайних пикселей
  vec2 minUV = 0.5 * uTexelSize;
  vec2 maxUV = 1.0 - 0.5 * uTexelSize;
  coord = clamp(coord, minUV, maxUV);

  vec4 result = texture(uSource, coord);

  outColor = result * uDissipation;
}