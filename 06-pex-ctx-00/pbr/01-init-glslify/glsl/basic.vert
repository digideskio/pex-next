attribute vec4 aPosition;
attribute vec3 aNormal;
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;
varying vec3 vNormal;
void main() {
  vNormal = aNormal;
  gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * aPosition;
}
