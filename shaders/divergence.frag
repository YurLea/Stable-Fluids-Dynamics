#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

void main() {
  vec2 L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0)).xy;
  vec2 R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0)).xy;
  vec2 B = texture(uVelocity, vUv - vec2(0, uTexelSize.y)).xy;
  vec2 T = texture(uVelocity, vUv + vec2(0, uTexelSize.y)).xy;

  float div = 0.5 * ((R.x - L.x) + (T.y - B.y));
  outColor = vec4(div, 0, 0, 1);
}