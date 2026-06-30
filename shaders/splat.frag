#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTarget;    // поле, в которое добавляем (velocity или dye)
uniform vec2 uPoint;          // позиция splat в UV [0..1]
uniform float uRadius;        // радиус в UV
uniform vec3 uValue;          // добавляемое значение (xy для velocity или rgb для dye)

void main() {
  vec4 base = texture(uTarget, vUv);

  vec2 d = vUv - uPoint;
  // быстрее и стабильнее чем pow(): dot(d,d)
  float r2 = dot(d, d);
  float e = exp(-r2 / max(1e-6, uRadius * uRadius));

  // Для velocity кладём в RG, для dye — в RGB, но шейдер универсальный через uValue
  base.xyz += uValue * e;

  outColor = base;
}