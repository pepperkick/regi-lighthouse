import { GuildMember, Message } from "discord.js";

export interface BookingOptions {
	message: Message
	bookingFor: GuildMember
	bookingBy: GuildMember
	reserveAt?: Date
	region: string
	tier: string
}

export interface RequestOptions {
	game: string
	region: string
	provider: string
	data?: any
	callbackUrl?: string
	closePref?: {
		minPlayers: number
		idleTime: number
		waitTime: number
	}
}