#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;

void main() {
  float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0)).x;
  float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0)).x;
  float B = texture(uPressure, vUv - vec2(0, uTexelSize.y)).x;
  float T = texture(uPressure, vUv + vec2(0, uTexelSize.y)).x;

  float div = texture(uDivergence, vUv).x;

  // (L+R+B+T - div) / 4
  float p = (L + R + B + T - div) * 0.25;
  outColor = vec4(p, 0, 0, 1);
}