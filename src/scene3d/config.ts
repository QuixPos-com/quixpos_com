import type { TabletSpec } from './types'

// Scale: 1 world unit = 0.25 mm (4000 units = 1 meter).
// 22" 4:3 (1600x1200 CSS px @ scale 1.1176 -> 1788x1341 units, 447x335mm, 22.0" diag)
// 12" 16:10 (1024x640 CSS px @ scale 1.0 -> 256x160mm, 11.9" diag)
// 8" 10:16 portrait (432x688 CSS px @ scale 1.0 -> 108x172mm, 8.0" diag)
export const TABLET_DEPTH = 28
export const TILT_ANGLE = -0.36 // ~20.6 degrees tilted back toward viewer
export const TABLET_Z = 920 // Near front edge of the table (front edge at +1600)

export const TABLE_W = 7000 // 1.75m
export const TABLE_D = 3200 // 0.80m
export const TABLE_TOP_Y = 3040 // 0.76m
export const TABLE_THICKNESS = 140

export const EYE_HEIGHT = 4800 // 1.20m
export const WALK_SPEED = 11200 // 2.8 m/s
export const PLAYER_RADIUS = 650
export const ARENA_HALF = 72000 // 18m

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

// Inateck BCST-70 barcode scanner
export const SCANNER_X = 2580
export const SCANNER_Z = 920

export const TABLETS: TabletSpec[] = [
  {
    id: 'dash-left',
    title: 'Artikelverwaltung',
    subtitle: 'dashdemo.quixpos.com',
    url: 'https://dashdemo.quixpos.com',
    x: -2150,
    cssW: 1600,
    cssH: 1200,
    physicalScale: 1.1176,
    bezelPad: 42,
    bottomClearance: 160,
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
    crop: {
      x: 304,
      y: 158,
      w: 400,
      h: 465,
    },
  },
]
