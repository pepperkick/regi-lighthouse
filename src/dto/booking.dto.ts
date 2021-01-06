export interface BookingDTO {
	_id: string
	name: string
	token: string
	ip: string
	port: number
	tvPort: number
	password: string
	rconPassword: string
	bookedBy: string
	createdAd: Date
	selectors: {
		region: string
		tier: string
	}
	metadata: {
		name: string
	}
}