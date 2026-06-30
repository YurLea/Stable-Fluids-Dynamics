#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uDye;

void main() {
  vec3 c = texture(uDye, vUv).rgb;
  // лёгкая гамма-коррекция
  c = pow(c, vec3(1.0/2.2));
  outColor = vec4(c, 1.0);
}