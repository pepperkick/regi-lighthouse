export interface RegionConfig {
	name: string
	alias: string[]
	default: boolean
	restricted: string
	hidden: boolean
	tiers: {
		[key: string]: TierConfig
	}
}

export interface TierConfig {
	limit: number
	provider: string
	minPlayers: number
	idleTime: number
	allowReservation: boolean
	earlyStart: number
}