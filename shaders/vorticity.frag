#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uCurlStrength;

void main() {
  float L = abs(texture(uCurl, vUv - vec2(uTexelSize.x, 0)).x);
  float R = abs(texture(uCurl, vUv + vec2(uTexelSize.x, 0)).x);
  float B = abs(texture(uCurl, vUv - vec2(0, uTexelSize.y)).x);
  float T = abs(texture(uCurl, vUv + vec2(0, uTexelSize.y)).x);

  float C = texture(uCurl, vUv).x;

  // grad(|curl|)
  vec2 grad = 0.5 * vec2(R - L, T - B);
  float len = length(grad) + 1e-5;
  vec2 N = grad / len;

  // перпендикуляр и сила
  vec2 force = uCurlStrength * C * vec2(N.y, -N.x);

  vec2 vel = texture(uVelocity, vUv).xy;
  vel += force * uDt;

  outColor = vec4(vel, 0, 1);
}