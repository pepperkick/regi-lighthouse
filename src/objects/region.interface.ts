export interface Regions {
	[key: string]: Region
}

export interface Region {
	name: string
	alias?: string[]
	default?: boolean
	restricted?: string
	hidden?: boolean
	tiers: {
		[key: string]: RegionTier
	}
	continent: string
	tags: string[]
}

export interface RegionTier {
	limit: number
	inUse?: number
	provider: string
	minPlayers?: number
	idleTime?: number
	allowReservation?: boolean
	earlyStart?: number
}