import { Discord, Slash, SlashChoice, SlashGroup, SlashOption } from 'discordx';
import {
  AutocompleteInteraction,
  CommandInteraction,
  GuildMember,
} from 'discord.js';
import { BookingCommand } from '../booking.command';
import { APIInteractionGuildMember } from 'discord-api-types';
import { BookingService } from '../../booking.service';
import { PreferenceService } from '../../preference.service';
import * as config from '../../../config.json';
import { BookingOptions } from '../../objects/booking.interface';
import { ErrorMessage, WarningMessage } from '../../objects/message.exception';

@Discord()
@SlashGroup('booking')
export class CreateCommand {
  @Slash('create', { description: 'Create a new booking server.' })
  async exec(
    @SlashOption('region', {
      description: 'Select the server location.',
      autocomplete: true,
      type: 'STRING',
    })
    region: string,
    @SlashOption('provider', {
      description:
        'Select the server provider (Availability depends on access).',
      autocomplete: true,
      required: false,
      type: 'STRING',
    })
    tier: string,
    @SlashOption('for-friend', {
      description:
        'Book the server for someone else (Availability depends on access).',
      required: false,
      type: 'USER',
    })
    bookingFor: GuildMember | APIInteractionGuildMember,
    @SlashOption('variant', {
      description:
        'Select the variant of the game to use in your server  (Availability depends on access).',
      required: false,
    })
    @SlashChoice(BookingService.getGameVariantList())
    variant: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      const focusedOption = interaction.options.getFocused(true);
      if (focusedOption.name === 'region') {
        const text = interaction.options.getString('region');
        return interaction.respond(
          BookingCommand.bookingService
            .searchRegions(text.toLocaleLowerCase())
            .slice(0, 24),
        );
      } else if (focusedOption.name === 'provider') {
        const text = interaction.options.getString('provider');
        let region = interaction.options.getString('region');
        const bookingFor = interaction.options.getUser('for-friend');

        if (!region) {
          if (bookingFor)
            region = await BookingCommand.preferenceService.getDataString(
              bookingFor.id,
              PreferenceService.Keys.bookingRegion,
            );
          else
            region = await BookingCommand.preferenceService.getDataString(
              interaction.user.id,
              PreferenceService.Keys.bookingRegion,
            );
        }

        const defaultRegion = BookingCommand.bookingService.defaultRegion;
        if (!region && defaultRegion) {
          region = defaultRegion;
        }

        if (!region) {
          return interaction.respond([
            {
              name: 'Please select a region first',
              value: 'invalid',
            },
          ]);
        }

        return interaction.respond(
          BookingCommand.bookingService
            .searchTiers(region, text.toLocaleLowerCase())
            .slice(0, 24),
        );
      }
    } else {
      if (
        tier &&
        !BookingCommand.userHasAccess(
          interaction.member,
          config.features.providerSelector,
        )
      ) {
        return await interaction.reply({
          content: `Currently you do not have access to selecting server provider.`,
          ephemeral: true,
        });
      }

      if (
        variant &&
        !BookingCommand.userHasAccess(
          interaction.member,
          config.features.variantSelector,
        )
      ) {
        return await interaction.reply({
          content: `Currently you do not have access to selecting game variants.`,
          ephemeral: true,
        });
      }

      if (
        bookingFor &&
        !BookingCommand.userHasAccess(
          interaction.member,
          config.features.multiBooking,
        )
      ) {
        return await interaction.reply({
          content: `Currently you cannot book for others.`,
          ephemeral: true,
        });
      }

      if (!bookingFor) {
        bookingFor = interaction.member;
      }

      if (bookingFor.user.bot) {
        return await interaction.reply({
          content: `We do not want the bots to take over the world now, do we? ;)`,
          ephemeral: true,
        });
      }

      if (!tier) {
        tier = BookingCommand.userHasAccess(
          interaction.member,
          config.features.premiumBooking,
        )
          ? config.preferences.defaultPremiumTier
          : config.preferences.defaultFreeTier;
      }

      if (!region) {
        region = await BookingCommand.preferenceService.getDataString(
          bookingFor.user.id,
          PreferenceService.Keys.bookingRegion,
        );
      }

      const defaultRegion = BookingCommand.bookingService.defaultRegion;
      if (!region && defaultRegion) {
        region = defaultRegion;
      }

      // Check if region is present
      if (!region) {
        return await interaction.reply({
          content: `You need to specify a region.`,
          ephemeral: true,
        });
      }

      region = BookingCommand.bookingService.parseRegion(region);

      // Check if region is present
      if (!region) {
        return await interaction.reply({
          content: `Unknown region.`,
          ephemeral: true,
        });
      }

      const defaultVariant = BookingCommand.bookingService.defaultVariant;
      if (!variant && defaultVariant) {
        variant = defaultVariant;
      }

      // Check if variant is present
      if (!variant) {
        return await interaction.reply({
          content: `You need to specify a game variant.`,
          ephemeral: true,
        });
      }

      const bookingOptions: BookingOptions = {
        message: interaction,
        region,
        tier,
        bookingFor,
        variant,
        bookingBy: interaction.member,
      };

      await interaction.deferReply({
        ephemeral: true,
      });

      try {
        // Validate and create booking
        console.log(bookingOptions.region);
        console.log(bookingOptions.tier);
        if (
          await BookingCommand.bookingService.validateBookRequest(
            bookingOptions,
          )
        ) {
          await BookingCommand.bookingService.createBookingRequest(
            bookingOptions,
          );
          return interaction.editReply({
            content: 'Check the status of the request in the bookings channel!',
          });
        }
      } catch (error: any) {
        console.log(error);
        if (error instanceof WarningMessage) {
          return interaction.editReply(error.message);
        } else if (error instanceof ErrorMessage) {
          return interaction.editReply(error.message);
        }
      }
    }
  }
}
