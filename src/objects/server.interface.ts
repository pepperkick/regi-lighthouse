import { ServerStatus } from "./server-status.enum";

export interface Server {
	_id?: string
	client?: string
	game: string
	createdAt?: Date
	closeAt?: Date
	ip?: string
	port?: number
	region: string
	provider: string
	image?: string
	status?: ServerStatus
	data: {
		// For TF2
		password?: string
		rconPassword?: string
		sdrEnable?: boolean
		tvPort?: number

		// For Status Updates
		callbackUrl?: string

		// For Auto Close
		closeMinPlayers?: number
		closeIdleTime?: number
		closeWaitTime?: number
	}
}