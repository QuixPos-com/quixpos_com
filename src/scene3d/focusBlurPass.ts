import type { Disposable, ThreeModule } from './types'

/** Three.js layer for 3D objects that remain crisp/unblurred in screen focus mode */
export const FOCUS_SHARP_LAYER = 1

export function markFocusSharp(
  obj: InstanceType<ThreeModule['Object3D']>,
): void {
  obj.traverse((child) => {
    child.layers.enable(FOCUS_SHARP_LAYER)
  })
}

export interface FocusBlurPass extends Disposable {
  setSize: (width: number, height: number, pixelRatio: number) => void
  /**
   * Renders the scene with selective blur (`blurAmount` in 0..1).
   * When `blurAmount <= 0.001`, renders directly with zero overhead.
   */
  render: (blurAmount: number) => void
}

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const BLUR_H_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uTexelSize;
  uniform float uRadius;
  varying vec2 vUv;

  void main() {
    vec2 stepX = vec2(uTexelSize.x * uRadius, 0.0);
    vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
    sum += texture2D(tDiffuse, vUv + stepX * 1.0) * 0.1945946;
    sum += texture2D(tDiffuse, vUv - stepX * 1.0) * 0.1945946;
    sum += texture2D(tDiffuse, vUv + stepX * 2.0) * 0.1216216;
    sum += texture2D(tDiffuse, vUv - stepX * 2.0) * 0.1216216;
    sum += texture2D(tDiffuse, vUv + stepX * 3.0) * 0.054054;
    sum += texture2D(tDiffuse, vUv - stepX * 3.0) * 0.054054;
    sum += texture2D(tDiffuse, vUv + stepX * 4.0) * 0.016216;
    sum += texture2D(tDiffuse, vUv - stepX * 4.0) * 0.016216;
    gl_FragColor = sum;
  }
`

const BLUR_V_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uTexelSize;
  uniform float uRadius;
  uniform float uBrightness;
  varying vec2 vUv;

  void main() {
    vec2 stepY = vec2(0.0, uTexelSize.y * uRadius);
    vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
    sum += texture2D(tDiffuse, vUv + stepY * 1.0) * 0.1945946;
    sum += texture2D(tDiffuse, vUv - stepY * 1.0) * 0.1945946;
    sum += texture2D(tDiffuse, vUv + stepY * 2.0) * 0.1216216;
    sum += texture2D(tDiffuse, vUv - stepY * 2.0) * 0.1216216;
    sum += texture2D(tDiffuse, vUv + stepY * 3.0) * 0.054054;
    sum += texture2D(tDiffuse, vUv - stepY * 3.0) * 0.054054;
    sum += texture2D(tDiffuse, vUv + stepY * 4.0) * 0.016216;
    sum += texture2D(tDiffuse, vUv - stepY * 4.0) * 0.016216;
    gl_FragColor = vec4(sum.rgb * uBrightness, sum.a);
    #include <colorspace_fragment>
  }
`

export function createFocusBlurPass(
  THREE: ThreeModule,
  renderer: InstanceType<ThreeModule['WebGLRenderer']>,
  scene: InstanceType<ThreeModule['Scene']>,
  camera: InstanceType<ThreeModule['PerspectiveCamera']>,
  initialWidth: number,
  initialHeight: number,
  initialPixelRatio: number,
): FocusBlurPass {
  const rtW = Math.max(1, Math.round(initialWidth * initialPixelRatio))
  const rtH = Math.max(1, Math.round(initialHeight * initialPixelRatio))

  const rtOpts = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  }
  const sceneRT = new THREE.WebGLRenderTarget(rtW, rtH, {
    ...rtOpts,
    depthBuffer: true,
  })
  const blurRT = new THREE.WebGLRenderTarget(
    Math.max(1, Math.round(rtW * 0.5)),
    Math.max(1, Math.round(rtH * 0.5)),
    {
      ...rtOpts,
      depthBuffer: false,
    },
  )

  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const quadGeo = new THREE.PlaneGeometry(2, 2)

  const texelSizeH = new THREE.Vector2(1 / Math.max(1, initialWidth), 1 / Math.max(1, initialHeight))
  const texelSizeV = new THREE.Vector2(1 / Math.max(1, initialWidth), 1 / Math.max(1, initialHeight))

  const blurMatH = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: sceneRT.texture },
      uTexelSize: { value: texelSizeH },
      uRadius: { value: 1.5 },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: BLUR_H_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  })

  const blurMatV = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: blurRT.texture },
      uTexelSize: { value: texelSizeV },
      uRadius: { value: 1.5 },
      uBrightness: { value: 0.92 },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: BLUR_V_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  })

  const quadMeshH = new THREE.Mesh(quadGeo, blurMatH)
  const quadSceneH = new THREE.Scene()
  quadSceneH.add(quadMeshH)

  const quadMeshV = new THREE.Mesh(quadGeo, blurMatV)
  const quadSceneV = new THREE.Scene()
  quadSceneV.add(quadMeshV)

  const depthOnlyMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
  })

  const setSize = (width: number, height: number, pixelRatio: number) => {
    const w = Math.max(1, Math.round(width * pixelRatio))
    const h = Math.max(1, Math.round(height * pixelRatio))
    sceneRT.setSize(w, h)
    blurRT.setSize(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)))
    texelSizeH.set(1 / Math.max(1, width), 1 / Math.max(1, height))
    texelSizeV.set(1 / Math.max(1, width), 1 / Math.max(1, height))
  }

  const render = (blurAmount: number) => {
    if (blurAmount <= 0.001) {
      camera.layers.set(0)
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
      return
    }

    const radius = 1.65 * blurAmount
    const brightness = 1 - 0.08 * blurAmount
    blurMatH.uniforms.uRadius.value = radius
    blurMatV.uniforms.uRadius.value = radius
    blurMatV.uniforms.uBrightness.value = brightness

    // 1. Render full scene (Layer 0) into offscreen target
    camera.layers.set(0)
    renderer.setRenderTarget(sceneRT)
    renderer.render(scene, camera)

    // 2. Horizontal blur -> blurRT
    renderer.setRenderTarget(blurRT)
    renderer.render(quadSceneH, quadCamera)

    // 3. Vertical blur + brightness -> main screen buffer
    renderer.setRenderTarget(null)
    renderer.render(quadSceneV, quadCamera)

    // 4. Crisp overlay pass for printers, monitor power buttons, table labels & iframe cutouts
    const prevBg = scene.background
    const prevAutoClear = renderer.autoClear
    const prevShadowAuto = renderer.shadowMap.autoUpdate

    renderer.shadowMap.autoUpdate = false
    renderer.autoClear = false
    scene.background = null
    renderer.clearDepth()

    // Depth pre-pass so sharp objects respect occlusion by monitor bezels/table
    camera.layers.set(0)
    scene.overrideMaterial = depthOnlyMat
    renderer.render(scene, camera)
    scene.overrideMaterial = null

    // Render sharp layer on top of the blurred background
    camera.layers.set(FOCUS_SHARP_LAYER)
    renderer.render(scene, camera)

    // Restore state
    camera.layers.set(0)
    scene.background = prevBg
    renderer.autoClear = prevAutoClear
    renderer.shadowMap.autoUpdate = prevShadowAuto
  }

  const dispose = () => {
    sceneRT.dispose()
    blurRT.dispose()
    quadGeo.dispose()
    blurMatH.dispose()
    blurMatV.dispose()
    depthOnlyMat.dispose()
  }

  return {
    setSize,
    render,
    dispose,
  }
}
