import {MessageType} from "./objects/message-types.enum";
import { GuildMember, Message, MessageEmbed, TextChannel, User } from "discord.js";
import * as config from "../config.json";
import {I18nService} from "nestjs-i18n";
import {Injectable} from "@nestjs/common";

@Injectable()
export class MessageService {
    constructor(private readonly i18n: I18nService) {}

    /**
     * Reply to a message using translations
     *
     * @param message
     * @param type
     * @param key
     * @param data
     */
    async replyMessageI18n(message: Message, type: MessageType, key: string, data?: {}): Promise<Message> {
        return this.replyMessage(message, type, await this.i18n.t(key, data));
    }

    /**
     * Reply to a message
     *
     * @param message
     * @param type
     * @param text
     */
    async replyMessage(message: Message, type: MessageType, text: string): Promise<Message> {
        return this.sendMessage(message, message.author, type, text);
    }

    /**
     * Edit a message using translations
     *
     * @param message
     * @param type
     * @param key
     * @param data
     */
    async editMessageI18n(message: Message, type: MessageType, key: string, data?: {}): Promise<Message> {
        return this.editMessage(message, type, await this.i18n.t(key, data))
    }

    /**
     * Edit a message
     *
     * @param message
     * @param type
     * @param text
     */
    async editMessage(message: Message, type: MessageType, text: string): Promise<Message> {
        return message.edit({
            content: message.content,
            embeds: [ MessageService.buildTextMessage(type, text) ]
        });
    }

    /**
     * Send a message using translations
     *
     * @param target
     * @param user
     * @param type
     * @param key
     * @param data
     */
    async sendMessageI18n(target: Message | TextChannel, user: User | GuildMember, type: MessageType, key: string, data?: {}): Promise<Message> {
        return this.sendMessage(target, user, type, await this.i18n.t(key, data));
    }

    /**
     * Send a message
     *
     * @param target
     * @param user
     * @param type
     * @param text
     */
    async sendMessage(target: Message | TextChannel, user: User | GuildMember, type: MessageType, text: string): Promise<Message> {
        if (target instanceof Message)
            return target.reply({
                embeds: [MessageService.buildTextMessage(type, text)]
            });
        else if (target instanceof TextChannel)
            return target.send({
                content: user.toString(),
                embeds: [MessageService.buildTextMessage(type, text)]
            });
    }

    /**
     * Build a embed message with pre filled info for the bot
     *
     * @param type
     */
    static buildMessageEmbed(type: MessageType): MessageEmbed {
        return new MessageEmbed()
            .setAuthor(config.bot.name, config.bot.avatar)
            .setFooter(config.bot.footer.text, config.bot.footer.icon)
            .setImage(config.bot.image)
            .setTimestamp(new Date())
            .setColor(
                type === MessageType.SUCCESS  ? "#06D6A0" :
                type === MessageType.INFO     ? "#03A9F4" :
                type === MessageType.WARNING  ? "#FF9800" :
                type === MessageType.ERROR    ? "#f44336" : "#212121"
            );
    }

    /**
     * Build a text message
     *
     * @param type Message Type
     * @param text Message text
     * @param title Message title
     */
    static buildTextMessage(type: MessageType, text: string, title = "Booking") {
        return MessageService.buildMessageEmbed(type)
            .setTitle(title)
            .setDescription(text)
    }
}