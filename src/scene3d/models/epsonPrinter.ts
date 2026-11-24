import { PRINTER_SIZE, PRINTER_X, PRINTER_Z, TABLE_TOP_Y } from '../config'
import { createPrinterFrontTexture, createReceiptTexture } from '../textures'
import type { Disposable, ThreeModule } from '../types'

export function buildEpsonPrinter(
  THREE: ThreeModule,
  webglScene: InstanceType<ThreeModule['Scene']>,
  disposables: Disposable[],
) {
  const printerBodyMat = new THREE.MeshStandardMaterial({
    color: '#1b2029',
    roughness: 0.36,
    metalness: 0.35,
  })
  const printerTopMat = new THREE.MeshStandardMaterial({
    color: '#10141b',
    roughness: 0.28,
    metalness: 0.25,
  })
  const printerSlotMat = new THREE.MeshStandardMaterial({
    color: '#111827',
    roughness: 0.5,
    metalness: 0.35,
  })
  const printerBadgeTex = createPrinterFrontTexture(THREE)
  const printerBadgeMat = new THREE.MeshStandardMaterial({
    map: printerBadgeTex,
    roughness: 0.35,
    metalness: 0.2,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const receiptTex = createReceiptTexture(THREE)
  const receiptMat = new THREE.MeshStandardMaterial({
    map: receiptTex,
    roughness: 0.85,
    side: THREE.DoubleSide,
  })
  const printerPowerLedMat = new THREE.MeshStandardMaterial({
    color: '#1ec9a8',
    emissive: '#1ec9a8',
    emissiveIntensity: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const printerNetLedMat = new THREE.MeshStandardMaterial({
    color: '#3b82f6',
    emissive: '#3b82f6',
    emissiveIntensity: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })

  const printerBoxGeo = new THREE.BoxGeometry(PRINTER_SIZE, PRINTER_SIZE, PRINTER_SIZE)
  const printerTopCapGeo = new THREE.BoxGeometry(PRINTER_SIZE - 28, 12, PRINTER_SIZE - 28)
  const printerSlotGeo = new THREE.BoxGeometry(220, 18, 28)
  const printerBadgeGeo = new THREE.PlaneGeometry(180, 90)
  const receiptGeo = new THREE.PlaneGeometry(190, 180)
  const ledGeo = new THREE.CircleGeometry(7, 14)

  disposables.push(
    printerBodyMat,
    printerTopMat,
    printerSlotMat,
    printerBadgeTex,
    printerBadgeMat,
    receiptTex,
    receiptMat,
    printerPowerLedMat,
    printerNetLedMat,
    printerBoxGeo,
    printerTopCapGeo,
    printerSlotGeo,
    printerBadgeGeo,
    receiptGeo,
    ledGeo,
  )

  const printerGroup = new THREE.Group()
  printerGroup.position.set(PRINTER_X, TABLE_TOP_Y, PRINTER_Z)
  webglScene.add(printerGroup)

  const printerBody = new THREE.Mesh(printerBoxGeo, printerBodyMat)
  printerBody.position.set(0, PRINTER_SIZE / 2, 0)
  printerBody.castShadow = true
  printerBody.receiveShadow = true
  printerGroup.add(printerBody)

  const printerCap = new THREE.Mesh(printerTopCapGeo, printerTopMat)
  printerCap.position.set(0, PRINTER_SIZE + 3, 0)
  printerGroup.add(printerCap)

  const printerSlot = new THREE.Mesh(printerSlotGeo, printerSlotMat)
  printerSlot.position.set(0, PRINTER_SIZE - 22, PRINTER_SIZE / 2 - 12)
  printerGroup.add(printerSlot)

  const receiptMesh = new THREE.Mesh(receiptGeo, receiptMat)
  receiptMesh.position.set(0, PRINTER_SIZE - 8, PRINTER_SIZE / 2 + 52)
  receiptMesh.rotation.x = -0.95
  receiptMesh.castShadow = true
  printerGroup.add(receiptMesh)

  const printerBadge = new THREE.Mesh(printerBadgeGeo, printerBadgeMat)
  printerBadge.position.set(0, PRINTER_SIZE * 0.42, PRINTER_SIZE / 2 + 2)
  printerGroup.add(printerBadge)

  const powerLed = new THREE.Mesh(ledGeo, printerPowerLedMat)
  powerLed.position.set(-112, PRINTER_SIZE - 38, PRINTER_SIZE / 2 + 2)
  printerGroup.add(powerLed)

  const netLed = new THREE.Mesh(ledGeo, printerNetLedMat)
  netLed.position.set(-84, PRINTER_SIZE - 38, PRINTER_SIZE / 2 + 2)
  printerGroup.add(netLed)
}
