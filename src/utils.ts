import * as config from "../config.json";
import * as moment from "moment";
import { DiscordClient, OnCommand } from "discord-nestjs";
import { DMChannel, GuildMember, Message, User } from "discord.js";
import { MessageException } from "./objects/message.exception";
import { HttpException } from "@nestjs/common";

interface Response<T> {
	status: number,
	message?: string,
	response?: T
}

export function TransportResponse<T>() {
	return (target: Object, propertyKey: string, descriptor: PropertyDescriptor) => {
		const original = descriptor.value;

		descriptor.value = async function (...args): Promise<Response<T> | HttpException> {
			try {
				const response: T = await original.apply(this, args);

				return {
					response,
					status: 200
				};
			} catch (error) {
				if (error instanceof HttpException)
					return error
				else
					return {
						status: 500,
						message: error.message
					}
			}
		}
	}
}

export function OnUserCommand(name: string) {
	return OnCommand({
		name,
		allowChannels: [ config.channels.users ],
		isRemovePrefix: true,
		isIgnoreBotMessage: true,
		isRemoveCommandName: true
	});
}

export function OnAdminCommand(name: string) {
	return OnCommand({
		name,
		allowChannels: [ config.channels.admin ],
		isRemovePrefix: true,
		isIgnoreBotMessage: true,
		isRemoveCommandName: true
	});
}

export function OnDMCommand(name: string) {
	return (target: Object, propertyKey: string, descriptor: PropertyDescriptor) => {
		DMOnly()(target, propertyKey, descriptor);
		OnCommand({
			name,
			isRemovePrefix: true,
			isIgnoreBotMessage: true,
			isRemoveCommandName: true
		})(target, propertyKey, descriptor);
	}
}

export function DMOnly() {
	return (target: Object, propertyKey: string, descriptor: PropertyDescriptor) => {
		const original = descriptor.value;

		descriptor.value = async function (...args) {
			for (const arg of args) {
				if (!( arg instanceof Message )) continue;

				const channel = arg.channel;
				if (!( channel instanceof DMChannel )) continue;

				if (channel.recipient.id !== arg.author.id) continue;

				return original.apply(this, args);
			}
		}
	}
}

export function MessageFilter() {
	return (target: Object, propertyKey: string, descriptor: PropertyDescriptor) => {
		const original = descriptor.value;

		descriptor.value = async function (...args) {
			try {
				await original.apply(this, args);
			} catch (error) {
				for (const arg of args) {
					if (arg instanceof Message) {
						if (error instanceof MessageException) {
							await this.messageService.replyMessage(arg, error.type, error.message);
							return;
						}
					}
				}
				console.log(error);
			}
		}
	}
}

export function getDateFromRelativeTime(time: string) {
	const mins = new RegExp(/([0-9]{1,2})m/, "g").exec(time);
	const hours = new RegExp(/([0-9]{1,2})h/, "g").exec(time);
	const now = moment();

	if (mins)	now.add(mins[1],"minutes");
	if (hours) now.add(hours[1],"hours");;

	return now.add(5, "millisecond")
}

export function getDateFormattedRelativeTime(date: Date) {
	const target = moment(date).add("1", "seconds");
	const min = target.diff(moment(), "minutes") % 60;
	const hour = target.diff(moment(), "hours") % 24;

	let min_text = "", hour_text = "";

	if (min > 0)
		min_text = `${min} ${min === 1 ? "min" : "mins"}`;

	if (hour > 0)
		hour_text = `${hour} ${hour === 1 ? "hour" : "hours"}`;

	return `${hour_text} ${min_text}`;
}

export function parseMessageArgs(message: Message) {
	let args = message.content.split(" ");
	args = args.filter(arg => arg !== "");
	return args;
}

export async function parseUserArg(bot: DiscordClient, message: Message, argPos = 0): Promise<GuildMember> {
	const args = parseMessageArgs(message);
	const mentionedUser = message.mentions.members.first();
	if (mentionedUser)
		return mentionedUser;

	const mentionedRole = message.mentions.roles.first();
	if (mentionedRole) {
		return null;
	}

	const guild = await bot.guilds.fetch(message.guild.id);
	const userId = await guild.members.fetch(args[argPos]);
	if (userId)
		return userId;
}

export async function parseUserString(bot: DiscordClient, message: Message, arg: string): Promise<GuildMember> {
	const mentionedUser = message.mentions.members.first();
	if (mentionedUser)
		return mentionedUser;

	const mentionedRole = message.mentions.roles.first();
	if (mentionedRole) {
		return null;
	}

	const guild = await bot.guilds.fetch(message.guild.id);
	const userId = await guild.members.fetch(arg);
	if (userId)
		return userId;
}
