import { ProviderSize } from './region.interface';

export interface Variants {
  [key: string]: Variant;
}

export interface Variant {
  name: string;
  default?: boolean;
  map?: string;
  providerSize?: ProviderSize;
  gitRepo?: string;
  gitKey?: string;
  minPlayers?: number;
  idleTime?: number;
  waitTime?: number;
}
