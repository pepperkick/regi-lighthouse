export interface RegionConfig {
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
	tags: string[]
}

export interface RegionTier {
	limit: number
	provider: string
	minPlayers?: number
	idleTime?: number
	allowReservation?: boolean
	earlyStart?: number
}