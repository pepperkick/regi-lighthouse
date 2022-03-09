export interface Regions {
  [key: string]: Region;
}

export interface Region {
  name: string;
  alias?: string[];
  default?: boolean;
  restricted?: string;
  hidden?: boolean;
  tiers: {
    [key: string]: RegionTier;
  };
  continent: string;
  tags: string[];
}

export interface RegionTier {
  limit: number;
  inUse?: number;
  provider: string | string[] | ProviderSizes;
  sdrEnable: boolean;
  minPlayers?: number;
  idleTime?: number;
  waitTime?: number;
  allowReservation?: boolean;
  earlyStart?: number;
}

export interface ProviderSizes {
  small: string | string[];
  medium: string | string[];
  large: string | string[];
}

export type ProviderSize = 'small' | 'medium' | 'large';
