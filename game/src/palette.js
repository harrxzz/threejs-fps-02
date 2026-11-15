// The look plan, in one place. The original six names stay (the CSS in index.html uses
// them); the new names are the desert-industrial set for SABLE LINE: warm sand underfoot,
// dark steel walls, rusted crates, amber site lighting. The same names are the CSS custom
// properties in index.html.
export const PALETTE = {
  canvas: '#14161a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  // Desert-industrial expansion.
  sand: '#c2a878',
  sandDark: '#a68f60',
  steel: '#3a4149',
  steelDark: '#262b31',
  rust: '#8a4f2c',
  rustDark: '#5f3520',
  amber: '#ffb340',
  amberDim: '#8a6420',
  hazard: '#e8c33a',
  enemy: '#a33327',
  enemyDark: '#6e211a',
  ally: '#3f6d4e',
  sky: '#e8c9a0',
  skyTop: '#7fa3c7',
};

export function shade(name) {
  return PALETTE[name];
}
