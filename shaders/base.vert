#version 300 es
precision highp float;

// Fullscreen triangle без буфера:
// ( -1,-1 ), ( 3,-1 ), ( -1, 3 )
out vec2 vUv;

void main() {
  vec2 pos;
  if (gl_VertexID == 0) pos = vec2(-1.0, -1.0);
  if (gl_VertexID == 1) pos = vec2( 3.0, -1.0);
  if (gl_VertexID == 2) pos = vec2(-1.0,  3.0);
  vUv = 0.5 * (pos + 1.0);
  gl_Position = vec4(pos, 0.0, 1.0);
}