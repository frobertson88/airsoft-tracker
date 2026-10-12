// Ranger green palette (docs/colour-scheme.md). Daylight comes in a later stage.
export const colours = {
  background: '#0B100C',
  surface: '#151C16',
  text: '#D7E1D1',
  textSecondary: '#A2B29F',
  border: '#2D3A2D',
  accent: '#A8C58E',
  onAccent: '#0B100C',
  selection: '#182619',
  actionFill: '#28432C',
  actionText: '#D9E7C9',
  // Orange means danger only; it is never a team colour.
  danger: '#FF9F45',
  // Enemy drawings on the map (a stronger red than the Red team).
  enemy: '#E5484D',
  blue: '#8EBBEF',
  red: '#F09E92',
  yellow: '#F2DE6B',
  purple: '#C3A6F5',
  teal: '#7FD6C8',
  pink: '#F5A8D2',
  white: '#F4F4EF',
};

export const TEAM_COLOURS = ['blue', 'red', 'yellow', 'purple', 'teal', 'pink', 'white'] as const;
export type TeamColour = (typeof TEAM_COLOURS)[number];

export const teamColour = (colour: TeamColour) => colours[colour];

// Barlow Condensed for headings, IBM Plex Sans for everything else
// (docs/design-direction.md). Loaded in app/_layout.tsx from assets/fonts.
export const fonts = {
  display: 'BarlowCondensed-Bold',
  displaySemi: 'BarlowCondensed-SemiBold',
  regular: 'IBMPlexSans-Regular',
  medium: 'IBMPlexSans-Medium',
  semibold: 'IBMPlexSans-SemiBold',
};

export const display = {
  fontFamily: fonts.display,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = 12;
