/**
 * Levels 21-30 are built by varying and combining the four obstacles introduced in
 * levels 17-20: low gravity, magnets, portals and apple rain.
 * Positions are relative to the target line (x) and the floor (h = height above it).
 */
export interface MagCfg {
  x: number;
  h: number;
  /** seconds on / off; leave `off` out for a magnet that never rests */
  on?: number;
  off?: number;
  ph?: number;
  /** 1 pulls (red), -1 pushes (blue) */
  pol?: 1 | -1;
  /** the polarity flips every `swap` seconds */
  swap?: number;
  /** slides ±rail px along a rail */
  rail?: number;
  railW?: number;
  /** black hole: never rests and swallows what comes too close */
  hole?: boolean;
  k?: number;
  max?: number;
  reach?: number;
}

export interface PortCfg {
  /** entry and exit: x, height, direction the portal faces (rad) */
  a: [number, number, number];
  b: [number, number, number];
  half?: number;
  flip?: 1 | -1;
  /** the entry bobs up and down */
  bob?: number;
  bobW?: number;
  /** the exit swings up by as much as `swing` rad and back */
  swing?: number;
  swingW?: number;
  /** one-way: whatever comes out is pointed straight along the exit */
  nozzle?: boolean;
  hideB?: boolean;
}

export interface LabCfg {
  /** gravity factor: 1 = earth, 1/6 = moon, 0 = none */
  g?: number;
  man?: 'stand' | 'float' | 'none';
  /** Mas Joko joins as a bystander */
  men2?: boolean;
  helmet?: boolean;
  space?: boolean;
  /** the wooden wall of level 19 in front of the man */
  wall?: boolean;
  /** extra walls: x0, x1, height */
  walls?: [number, number, number][];
  /** the apple is reached from behind */
  back?: boolean;
  mags?: MagCfg[];
  ports?: PortCfg[];
  /** the apple sits on the archer's own head */
  self?: boolean;
  /** party = as many as possible against the clock, lines = rows to skewer, loop = endless column */
  rain?: 'party' | 'lines' | 'loop';
  need?: number;
  time?: number;
  /** length of the dotted aim guide (1 = normal) */
  guide?: number;
  /** the aim guide follows through portals */
  warp?: boolean;
  far?: number;
  rapid?: boolean;
  tol?: number;
  // ---- levels 31-40 ----
  /** wind that blows the arrow up, then down: acceleration and frequency */
  wind?: { a: number; w: number };
  /** sliding doors: a gap of `gap` px whose middle moves ±amp around height `mid` */
  doors?: { x: number; gap: number; amp: number; w: number; mid: number; ph?: number }[];
  /** fan with n blades of length r, turning at w rad/s */
  fan?: { x: number; h: number; r: number; n: number; w: number };
  /** the apple hangs on a rope and swings */
  pend?: { x: number; h: number; len: number; amp: number; w: number };
  /** the man rides a little cart back and forth */
  cart?: { amp: number; w: number };
  dark?: boolean;
  /** this many men stand in a row, each with an apple */
  row?: number;
}
