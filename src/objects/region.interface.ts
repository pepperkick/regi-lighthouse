export interface RegionConfig {
	name: string
	alias: string[]
	default: boolean
	restricted: string
	hidden: boolean
	tiers: {
		[key: string]: TierConfig
	}
	tags: string[]
}

export interface TierConfig {
	limit: number
	provider: string
	minPlayers: number
	idleTime: number
	allowReservation: boolean
	earlyStart: number
}