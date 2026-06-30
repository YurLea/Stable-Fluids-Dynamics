#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uVelocity;   // текущая итерация x^k
uniform sampler2D uVelocity0;  // исходное поле u^n (b)
uniform vec2 uTexelSize;
uniform float uAlpha;

void main() {
  vec2 xL = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).xy;
  vec2 xR = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).xy;
  vec2 xB = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).xy;
  vec2 xT = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).xy;

  vec2 b  = texture(uVelocity0, vUv).xy;

  float beta = 1.0 + 4.0 * uAlpha;
  vec2 xNew = (b + uAlpha * (xL + xR + xB + xT)) / beta;

  outColor = vec4(xNew, 0.0, 1.0);
}