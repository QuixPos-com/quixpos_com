import type { TabletSpec, ZebraMediaInfo, ZebraReelId } from './types'

// Scale: 1 world unit = 0.25 mm (4000 units = 1 meter).
// 27" 16:9 widescreen (1920x1080 CSS px @ scale 1.2418 -> 2384x1341 units, 596x335mm, 27.0" diag)
// 12" 16:10 (1024x640 CSS px @ scale 1.0 -> 256x160mm, 11.9" diag)
// 8" 10:16 portrait (432x688 CSS px @ scale 1.0 -> 108x172mm, 8.0" diag)
export const TABLET_DEPTH = 28
export const TILT_ANGLE = -0.36 // ~20.6 degrees tilted back toward viewer
export const TABLET_Z = 920 // Near front edge of the table (front edge at +1600)

export const TABLE_W = 7800 // 1.95m
export const TABLE_D = 3200 // 0.80m
export const TABLE_TOP_Y = 3040 // 0.76m
export const TABLE_THICKNESS = 140

export const EYE_HEIGHT = 4800 // 1.20m
export const WALK_SPEED = 11200 // 2.8 m/s
export const PLAYER_RADIUS = 650
export const ARENA_HALF = 72000 // 18m

// Shop room walls & shelving
export const ROOM_HALF_W = 11200 // 5.60m wide
export const ROOM_BACK_Z = -6400 // 1.60m behind table center
export const ROOM_FRONT_Z = 12800 // 3.20m in front of table center
export const ROOM_HEIGHT = 11200 // 2.80m wall height
export const WALL_THICKNESS = 400
export const SHELF_DEPTH = 1360 // 0.34m deep
export const SHELF_BAY_W = 3600 // 0.90m wide per bay
export const SHELF_HEIGHT = 8600 // 2.15m upright height
export const SHELF_BOARD_THICKNESS = 90
export const SHELF_LEVEL_YS = [1100, 3300, 5500, 7700] as const
export const BACK_SHELF_BAYS = 4
export const SIDE_SHELF_BAYS = 2

export const SPAWN_POS = { x: 0, y: EYE_HEIGHT, z: 5400 }
export const SPAWN_YAW = 0
export const SPAWN_PITCH = -0.27

// Virtual dual-stick tuning (desktop + mobile)
export const STICK_MAX_R = 42
export const STICK_DEADZONE = 0.22 // 22% center dead spot
export const STICK_CURVE_EXP = 1.65
export const STICK_MOVE_SENSITIVITY = 0.52
export const STICK_YAW_SPEED = 0.85 // rad/s at full stick deflection
export const STICK_PITCH_SPEED = 0.60 // rad/s at full stick deflection

// Under-table cash drawer
export const DRAWER_H = 380
export const DRAWER_X = 74
export const DRAWER_Z = 980
export const DRAWER_W = 1360
export const DRAWER_D = 1120
export const DRAWER_OPEN_OFFSET = 820

// Epson TM-m30III thermal receipt printer
export const PRINTER_SIZE = 340
export const PRINTER_X = 2118
export const PRINTER_Z = 900

// Zebra ZD420 shipping label printer
export const ZEBRA_X = -844
export const ZEBRA_Z = 780
export const ZEBRA_W = 540
export const ZEBRA_D = 700
export const ZEBRA_DPI = 203

const mmToDots = (mm: number, dpi = ZEBRA_DPI) =>
  Math.round((mm * dpi) / 25.4)

export const ZEBRA_REELS: readonly ZebraMediaInfo[] = [
  {
    id: '25x13',
    label: '25 × 13 mm',
    dpi: ZEBRA_DPI,
    widthMm: 25,
    heightMm: 13,
    widthPx: mmToDots(25),
    heightPx: mmToDots(13),
  },
  {
    id: '57x32',
    label: '57 × 32 mm',
    dpi: ZEBRA_DPI,
    widthMm: 57,
    heightMm: 32,
    widthPx: mmToDots(57),
    heightPx: mmToDots(32),
  },
  {
    id: '101x51',
    label: '101 × 51 mm',
    dpi: ZEBRA_DPI,
    widthMm: 101,
    heightMm: 51,
    widthPx: mmToDots(101),
    heightPx: mmToDots(51),
  },
  {
    id: '101x152',
    label: '101 × 152 mm',
    dpi: ZEBRA_DPI,
    widthMm: 101,
    heightMm: 152,
    widthPx: mmToDots(101),
    heightPx: mmToDots(152),
  },
]

export const DEFAULT_ZEBRA_REEL_ID: ZebraReelId = '101x51'

export function getZebraReelById(id: string): ZebraMediaInfo {
  return (
    ZEBRA_REELS.find((r) => r.id === id) ??
    ZEBRA_REELS.find((r) => r.id === DEFAULT_ZEBRA_REEL_ID) ??
    ZEBRA_REELS[0]
  )
}

// Inateck BCST-70 barcode scanner
export const SCANNER_X = 2580
export const SCANNER_Z = 920

export const TABLETS: TabletSpec[] = [
  {
    id: 'dash-left',
    title: 'Artikelverwaltung',
    subtitle: 'dashdemo.quixpos.com',
    url: 'https://dashdemo.quixpos.com',
    x: -2460,
    cssW: 1920,
    cssH: 1080,
    physicalScale: 1.2418,
    bezelPad: 42,
    bottomClearance: 160,
    initialPower: true,
    canControlScreens: true,
  },
  {
    id: 'pos-center',
    title: 'POS',
    subtitle: 'pos.quixpos.com',
    url: 'https://pos.quixpos.com',
    x: 74,
    cssW: 1024,
    cssH: 640,
    physicalScale: 1,
    bezelPad: 36,
    bottomClearance: 727,
    initialPower: false,
  },
  {
    id: 'pos-vertical',
    title: 'Kundendisplay',
    subtitle: 'posdemo.quixpos.com',
    url: 'https://posdemo.quixpos.com',
    x: 1186,
    cssW: 432,
    cssH: 688,
    physicalScale: 1,
    bezelPad: 28,
    bottomClearance: 127,
    initialPower: false,
  },
  {
    id: 'sumup-far-right',
    title: 'SumUp Virtual Solo',
    subtitle: 'virtual-solo.sumup.com',
    url: 'https://virtual-solo.sumup.com',
    x: 1684,
    cssW: 1024,
    cssH: 640,
    physicalScale: 0.85,
    bezelPad: 24,
    bottomClearance: 380,
    initialPower: false,
    crop: {
      x: 304,
      y: 158,
      w: 400,
      h: 465,
    },
  },
]
