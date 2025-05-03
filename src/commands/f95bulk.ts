import { 
  SlashCommandBuilder, 
  CommandInteraction, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder, 
  ModalSubmitInteraction, 
  ButtonBuilder, 
  ButtonStyle,
  Client,
  ChannelType,
  TextChannel,
  Interaction,
  ButtonInteraction,
  MessageFlags,
  EmbedBuilder,
  SelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
  MentionableSelectMenuBuilder
} from "discord.js";
import { login, Game, getHandiworkFromURL } from 'f95api';
import { config } from "../config";
import { formatLink, safeDownloadImage, uploadImageToDiscord, ensureF95Session, cleanupTempFiles } from "../utils/utils";
import { sendGameEmbed } from "./f95";
import * as fs from 'fs';

interface GameSubmission {
  url: string;
  freePcMediafire: string;
  freePcPixeldrain: string;
  freeMobileMediafire: string;
  freeMobilePixeldrain: string;
  premiumPcMediafire: string;
  premiumPcPixeldrain: string;
  premiumMobileMediafire: string;
  premiumMobilePixeldrain: string;
  hasMultipleParts?: boolean;
  hasPremium?: boolean;
  additionalParts: Array<{
    partNumber: number;
    pcMediafire: string;
    pcPixeldrain: string;
    mobileMediafire: string;
    mobilePixeldrain: string;
    premiumPcMediafire: string;
    premiumPcPixeldrain: string;
    premiumMobileMediafire: string;
    premiumMobilePixeldrain: string;
  }>;
}

interface ResultItem extends GameSubmission {
  name: string;
  success: boolean;
  error?: string;
}

const activeSubmissions = new Map<string, GameSubmission[]>();
const pendingSubmission = new Map<string, Partial<GameSubmission>>();

const activeListeners = new Map<string, (interaction: Interaction) => Promise<void>>();

export const data = new SlashCommandBuilder()
  .setName("f95bulk")
  .setDescription("Publicar múltiples juegos de F95Zone en lote");

async function createGameModal(customId: string): Promise<ModalBuilder> {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Añadir juego de F95Zone (1/2)');

  const urlInput = new TextInputBuilder()
    .setCustomId('url')
    .setLabel('URL del juego en F95Zone')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('https://f95zone.to/threads/game-name.12345/');

  const freePcMediafireInput = new TextInputBuilder()
    .setCustomId('free-pc-mediafire')
    .setLabel('Link descarga free PC mediafire')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const freePcPixeldrainInput = new TextInputBuilder()
    .setCustomId('free-pc-pixeldrain')
    .setLabel('Link descarga free PC pixeldrain')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
    
  const freeMobileMediafireInput = new TextInputBuilder()
    .setCustomId('free-mobile-mediafire')
    .setLabel('Link descarga free mobile mediafire')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const freeMobilePixeldrainInput = new TextInputBuilder()
    .setCustomId('free-mobile-pixeldrain')
    .setLabel('Link descarga free mobile pixeldrain')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const actionRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput);
  const actionRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(freePcMediafireInput);
  const actionRow3 = new ActionRowBuilder<TextInputBuilder>().addComponents(freePcPixeldrainInput);
  const actionRow4 = new ActionRowBuilder<TextInputBuilder>().addComponents(freeMobileMediafireInput);
  const actionRow5 = new ActionRowBuilder<TextInputBuilder>().addComponents(freeMobilePixeldrainInput);

  modal.addComponents(actionRow1, actionRow2, actionRow3, actionRow4, actionRow5);

  return modal;
}

async function createPremiumGameModal(customId: string): Promise<ModalBuilder> {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Añadir enlaces premium (2/3)');

  const premiumPcMediafireInput = new TextInputBuilder()
    .setCustomId('premium-pc-mediafire')
    .setLabel('Link descarga premium PC mediafire')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const premiumPcPixeldrainInput = new TextInputBuilder()
    .setCustomId('premium-pc-pixeldrain')
    .setLabel('Link descarga premium PC pixeldrain')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
    
  const premiumMobileMediafireInput = new TextInputBuilder()
    .setCustomId('premium-mobile-mediafire')
    .setLabel('Link descarga premium mobile mediafire')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const premiumMobilePixeldrainInput = new TextInputBuilder()
    .setCustomId('premium-mobile-pixeldrain')
    .setLabel('Link descarga premium mobile pixeldrain')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const actionRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(premiumPcMediafireInput);
  const actionRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(premiumPcPixeldrainInput);
  const actionRow3 = new ActionRowBuilder<TextInputBuilder>().addComponents(premiumMobileMediafireInput);
  const actionRow4 = new ActionRowBuilder<TextInputBuilder>().addComponents(premiumMobilePixeldrainInput);

  modal.addComponents(actionRow1, actionRow2, actionRow3, actionRow4);

  return modal;
}

async function createAdditionalPartsModal(customId: string, nextPartNumber: number, isPremium: boolean = false): Promise<ModalBuilder> {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(`${isPremium ? 'Premium' : 'Free'} - Parte ${nextPartNumber}`);

  const pcMediafireInput = new TextInputBuilder()
    .setCustomId('pc-mediafire')
    .setLabel(`Link parte ${nextPartNumber} PC mediafire ${isPremium ? '(Premium)' : ''}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const pcPixeldrainInput = new TextInputBuilder()
    .setCustomId('pc-pixeldrain')
    .setLabel(`Link parte ${nextPartNumber} PC pixeldrain ${isPremium ? '(Premium)' : ''}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
    
  const mobileMediafireInput = new TextInputBuilder()
    .setCustomId('mobile-mediafire')
    .setLabel(`Link parte ${nextPartNumber} mobile mediafire ${isPremium ? '(Premium)' : ''}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const mobilePixeldrainInput = new TextInputBuilder()
    .setCustomId('mobile-pixeldrain')
    .setLabel(`Link parte ${nextPartNumber} mobile pixeldrain ${isPremium ? '(Premium)' : ''}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const actionRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(pcMediafireInput);
  const actionRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(pcPixeldrainInput);
  const actionRow3 = new ActionRowBuilder<TextInputBuilder>().addComponents(mobileMediafireInput);
  const actionRow4 = new ActionRowBuilder<TextInputBuilder>().addComponents(mobilePixeldrainInput);

  modal.addComponents(actionRow1, actionRow2, actionRow3, actionRow4);

  return modal;
}

async function finalizeCurrentGame(userId: string): Promise<GameSubmission | null> {
  const pendingGame = pendingSubmission.get(userId);
  if (!pendingGame || !pendingGame.url) {
    console.warn(`[finalizeCurrentGame] No valid pending game found for user ${userId}`);
    pendingSubmission.delete(userId);
    return null;
  }

  if (!activeSubmissions.has(userId)) {
    activeSubmissions.set(userId, []);
  }

  const completedGame = pendingGame as GameSubmission;
  activeSubmissions.get(userId)!.push(completedGame);
  pendingSubmission.delete(userId);
  console.log(`[finalizeCurrentGame] Game ${completedGame.url} finalized for user ${userId}. Total active: ${activeSubmissions.get(userId)!.length}`);
  return completedGame;
}

async function handleModalSubmit(interaction: ModalSubmitInteraction, userId: string): Promise<GameSubmission | null | 'pending'> {
  const customId = interaction.customId;
  
  try {
    if (customId.startsWith('game_modal_')) {
      const url = interaction.fields.getTextInputValue('url');
      
      if (!url.includes("f95zone.to")) {
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "La URL debe ser de F95Zone.", flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: "La URL debe ser de F95Zone.", flags: MessageFlags.Ephemeral });
          }
        } catch (error) {
          console.error("Error responding to invalid URL modal:", error);
        }
        return null;
      }
      
      const tempGame: Partial<GameSubmission> = {
        url,
        freePcMediafire: interaction.fields.getTextInputValue('free-pc-mediafire'),
        freePcPixeldrain: interaction.fields.getTextInputValue('free-pc-pixeldrain'),
        freeMobileMediafire: interaction.fields.getTextInputValue('free-mobile-mediafire'),
        freeMobilePixeldrain: interaction.fields.getTextInputValue('free-mobile-pixeldrain'),
        premiumPcMediafire: '',
        premiumPcPixeldrain: '',
        premiumMobileMediafire: '',
        premiumMobilePixeldrain: '',
        additionalParts: []
      };
      
      pendingSubmission.set(userId, tempGame);
      
      try {
        const flowId = customId.substring('game_modal_'.length);
        const premiumModalCustomId = `premium_modal_${flowId}`;

        if (premiumModalCustomId.length > 100) {
           console.error(`Generated premium modal custom ID too long: ${premiumModalCustomId}`);
           if (!interaction.deferred && !interaction.replied) {
             await interaction.reply({ 
                content: "Error interno: ID de modal demasiado largo.", 
                flags: MessageFlags.Ephemeral 
             });
           } else {
             await interaction.followUp({ 
                content: "Error interno: ID de modal demasiado largo.", 
                flags: MessageFlags.Ephemeral 
             });
           }
           pendingSubmission.delete(userId);
           return null;
        }

        const premiumModal = await createPremiumGameModal(premiumModalCustomId);
        
       
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Información básica guardada. Abriendo modal para enlaces premium...",
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.followUp({
            content: "Información básica guardada. Abriendo modal para enlaces premium...",
            flags: MessageFlags.Ephemeral
          });
        }
        
       
        const autoPremiumButtonId = `auto_premium_${flowId}_${Date.now()}`;
        const autoPremiumButton = new ButtonBuilder()
          .setCustomId(autoPremiumButtonId)
          .setLabel('Añadir Enlaces Premium')
          .setStyle(ButtonStyle.Primary);
          
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(autoPremiumButton);
          
       
        await interaction.followUp({
          content: "Haz clic para añadir enlaces premium (o cierra este mensaje para omitir)",
          components: [row],
          flags: MessageFlags.Ephemeral
        });
        
       
        const buttonHandler = async (buttonInteraction: Interaction) => {
          if (!buttonInteraction.isButton()) return;
          if (buttonInteraction.user.id !== userId) return;
          if (buttonInteraction.customId !== autoPremiumButtonId) return;
          
         
          await buttonInteraction.showModal(premiumModal);
          
         
          interaction.client.removeListener('interactionCreate', buttonHandler);
        };
        
       
        interaction.client.on('interactionCreate', buttonHandler);
        
       
        setTimeout(() => {
          interaction.client.removeListener('interactionCreate', buttonHandler);
        }, 5 * 60 * 1000);
        
        return 'pending';
      } catch (error) {
        console.error("Error showing premium modal after initial modal submission:", error);
        try {
           if (interaction.replied || interaction.deferred) {
               await interaction.followUp({
                   content: "Error al intentar mostrar el modal de enlaces premium. Por favor, intenta añadir el juego de nuevo.",
                   flags: MessageFlags.Ephemeral
               });
           } else {
               await interaction.reply({
                   content: "Error al intentar mostrar el modal de enlaces premium. Por favor, intenta añadir el juego de nuevo.",
                   flags: MessageFlags.Ephemeral
               });
           }
        } catch (followUpError) {
          console.error("Error in followUp after initial modal reply error:", followUpError);
        }
        pendingSubmission.delete(userId);
        return null;
      }
    }
    
    else if (customId.startsWith('premium_modal_')) {
      const pendingGame = pendingSubmission.get(userId);
      
      if (!pendingGame) {
        try {
          if (interaction.deferred || interaction.replied) {
              await interaction.followUp({ content: "Error: No se encontró información inicial del juego pendiente.", flags: MessageFlags.Ephemeral });
          } else {
              await interaction.reply({ content: "Error: No se encontró información inicial del juego pendiente.", flags: MessageFlags.Ephemeral });
          }
        } catch (error) {
          console.error("Error responding to missing pending game state:", error);
        }
        return null;
      }
      
      pendingGame.premiumPcMediafire = interaction.fields.getTextInputValue('premium-pc-mediafire');
      pendingGame.premiumPcPixeldrain = interaction.fields.getTextInputValue('premium-pc-pixeldrain');
      pendingGame.premiumMobileMediafire = interaction.fields.getTextInputValue('premium-mobile-mediafire');
      pendingGame.premiumMobilePixeldrain = interaction.fields.getTextInputValue('premium-mobile-pixeldrain');
      
      const finalizedGame = await finalizeCurrentGame(userId);
      if (!finalizedGame) {
         try {
            if (interaction.deferred || interaction.replied) {
                 await interaction.followUp({ content: "Error al finalizar el juego actual.", flags: MessageFlags.Ephemeral });
             } else {
                 await interaction.reply({ content: "Error al finalizar el juego actual.", flags: MessageFlags.Ephemeral });
             }
         } catch(e){ console.error("Failed to notify user of finalization error", e); }
         return null;
      }
      
      const userSubmissions = activeSubmissions.get(userId) || [];
      const commandInvocationId = customId.split('_').slice(2).join('_');
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`final_options_${commandInvocationId}`)
        .setPlaceholder('Selecciona la siguiente acción')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Añadir Parte (Juego Actual)')
            .setValue('add_part')
            .setEmoji('🧩'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Añadir Otro Juego')
            .setValue('add_another')
            .setEmoji('➕'),
          new StringSelectMenuOptionBuilder()
            .setLabel(`Enviar Lote (${userSubmissions.length} juego${userSubmissions.length === 1 ? '' : 's'})`)
            .setValue('submit_all')
            .setEmoji('✅')
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      try {
        const gameIdentifier = finalizedGame.url.split('/').filter(Boolean).pop()?.substring(0, 50) || 'actual';
        const messageContent = `Juego "${gameIdentifier}" añadido al lote. Total: ${userSubmissions.length}. ¿Qué quieres hacer ahora?`;

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: messageContent,
                components: [row]
            });
        } else {
             await interaction.reply({
                 content: messageContent,
                 components: [row],
                 flags: MessageFlags.Ephemeral
             });
         }
        return 'pending';
      } catch (error) {
        console.error("Error showing final options select menu:", error);
        try {
             if (interaction.deferred || interaction.replied) {
                 await interaction.followUp({ content: "Error mostrando las opciones finales.", flags: MessageFlags.Ephemeral });
             } else {
                 await interaction.reply({ content: "Error mostrando las opciones finales.", flags: MessageFlags.Ephemeral });
             }
         } catch (replyError) {
             console.error("Failed to send error message for final options:", replyError);
         }
        return null;
      }
    }
    
    else if (customId.startsWith('parts_modal_')) {
      const pendingGame = pendingSubmission.get(userId);
      
      if (!pendingGame) {
        try {
           if (interaction.deferred || interaction.replied) {
               await interaction.followUp({ content: "Error: No se encontró información del juego pendiente.", flags: MessageFlags.Ephemeral });
           } else {
               await interaction.reply({ content: "Error: No se encontró información del juego pendiente.", flags: MessageFlags.Ephemeral });
           }
        } catch (error) {
          console.error("Error responding to missing pending game state:", error);
        }
        return null;
      }
      
      const parts = customId.split('_');
      const lastPart = parts[parts.length - 1];
      const isPremium = lastPart.startsWith('premium');
      const partNumberStr = isPremium ? lastPart.substring(7) : lastPart;
      const partNumber = parseInt(partNumberStr, 10);

      if (isNaN(partNumber)) {
        console.error("Invalid part number in customId:", customId);
        try {
           if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: "Error interno: Número de parte inválido.", flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: "Error interno: Número de parte inválido.", flags: MessageFlags.Ephemeral });
            }
        } catch(e) { console.error("Failed to notify user of invalid part number", e); }
        return null;
      }
      
      if (!pendingGame.additionalParts) {
        pendingGame.additionalParts = [];
      }
      let existingPartIndex = pendingGame.additionalParts.findIndex(p => p.partNumber === partNumber);

      if (existingPartIndex >= 0) {
        const existingPart = pendingGame.additionalParts[existingPartIndex];
        if (isPremium) {
          existingPart.premiumPcMediafire = interaction.fields.getTextInputValue('pc-mediafire');
          existingPart.premiumPcPixeldrain = interaction.fields.getTextInputValue('pc-pixeldrain');
          existingPart.premiumMobileMediafire = interaction.fields.getTextInputValue('mobile-mediafire');
          existingPart.premiumMobilePixeldrain = interaction.fields.getTextInputValue('mobile-pixeldrain');
        } else {
          existingPart.pcMediafire = interaction.fields.getTextInputValue('pc-mediafire');
          existingPart.pcPixeldrain = interaction.fields.getTextInputValue('pc-pixeldrain');
          existingPart.mobileMediafire = interaction.fields.getTextInputValue('mobile-mediafire');
          existingPart.mobilePixeldrain = interaction.fields.getTextInputValue('mobile-pixeldrain');
        }
      } else {
        const newPart = { partNumber, pcMediafire: '', pcPixeldrain: '', mobileMediafire: '', mobilePixeldrain: '', premiumPcMediafire: '', premiumPcPixeldrain: '', premiumMobileMediafire: '', premiumMobilePixeldrain: '' };
        if (isPremium) {
          newPart.premiumPcMediafire = interaction.fields.getTextInputValue('pc-mediafire');
          newPart.premiumPcPixeldrain = interaction.fields.getTextInputValue('pc-pixeldrain');
          newPart.premiumMobileMediafire = interaction.fields.getTextInputValue('mobile-mediafire');
          newPart.premiumMobilePixeldrain = interaction.fields.getTextInputValue('mobile-pixeldrain');
        } else {
          newPart.pcMediafire = interaction.fields.getTextInputValue('pc-mediafire');
          newPart.pcPixeldrain = interaction.fields.getTextInputValue('pc-pixeldrain');
          newPart.mobileMediafire = interaction.fields.getTextInputValue('mobile-mediafire');
          newPart.mobilePixeldrain = interaction.fields.getTextInputValue('mobile-pixeldrain');
        }
        pendingGame.additionalParts.push(newPart);
      }

      const nextPartNumber = partNumber + 1;
      const commandInvocationId = parts.slice(2, -1).join('_');
      const flowId = `flow_${userId}_${Date.now()}`;

      if (!commandInvocationId || !commandInvocationId.includes(userId)) {
          console.error(`[parts_modal_] Failed to extract valid commandInvocationId from ${customId}`);
          await interaction.reply({ content: "Error interno procesando la parte.", flags: MessageFlags.Ephemeral });
          return null;
      }

      try {
        if (!isPremium) {
         
         
          
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
              content: `Parte ${partNumber} (Free) añadida. Abriendo modal para enlaces premium...`, 
              flags: MessageFlags.Ephemeral 
            });
          } else {
            await interaction.followUp({ 
              content: `Parte ${partNumber} (Free) añadida. Abriendo modal para enlaces premium...`, 
              flags: MessageFlags.Ephemeral 
            });
          }
          
         
          const premiumPartsModalCustomId = `parts_modal_${flowId}_premium${partNumber}`;
          if (premiumPartsModalCustomId.length > 100) {
            console.error(`Generated premium parts modal ID too long: ${premiumPartsModalCustomId}`);
            return null;
          }
          
          const premiumPartsModal = await createAdditionalPartsModal(premiumPartsModalCustomId, partNumber, true);
          
         
         
          const autoPremiumButtonId = `auto_premium_${flowId}_${partNumber}_${Date.now()}`;
          const autoPremiumButton = new ButtonBuilder()
            .setCustomId(autoPremiumButtonId)
            .setLabel(`Añadir Premium para Parte ${partNumber}`)
            .setStyle(ButtonStyle.Primary);
          
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(autoPremiumButton);
          
         
          await interaction.followUp({
            content: `Haz clic para añadir enlaces premium para la Parte ${partNumber} (o cierra este mensaje para omitir)`,
            components: [row],
            flags: MessageFlags.Ephemeral
          });
          
         
          const autoPremiumHandler = async (btnInteraction: Interaction) => {
            if (!btnInteraction.isButton()) return;
            if (btnInteraction.user.id !== userId) return;
            if (btnInteraction.customId !== autoPremiumButtonId) return;
            
           
            await btnInteraction.showModal(premiumPartsModal);
            
           
            interaction.client.removeListener('interactionCreate', autoPremiumHandler);
          };
          
         
          interaction.client.on('interactionCreate', autoPremiumHandler);
          
         
          setTimeout(() => {
            interaction.client.removeListener('interactionCreate', autoPremiumHandler);
          }, 5 * 60 * 1000);
          
          return 'pending';
        }

        const addAnotherPartButton = new ButtonBuilder()
          .setCustomId(`show_parts_${flowId}_${nextPartNumber}`)
          .setLabel(`Añadir Parte ${nextPartNumber} (Free)`)
          .setStyle(ButtonStyle.Primary);
        const finishCurrentGamePartsButton = new ButtonBuilder()
          .setCustomId(`finish_parts_submit_${commandInvocationId}`)
          .setLabel('Terminar de Añadir Partes (Este Juego)')
          .setStyle(ButtonStyle.Success);

        const actionRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(addAnotherPartButton, finishCurrentGamePartsButton);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        }
        await interaction.editReply({
          content: `Enlaces Premium para Parte ${partNumber} añadidos. ¿Quieres añadir la Parte ${nextPartNumber} (Free) o terminar con las partes de este juego?`,
          components: [actionRow]
        });
        return 'pending';
      } catch (error) {
        console.error(`Error after adding part ${partNumber} (${isPremium ? 'Premium' : 'Free'}):`, error);
        try {
            if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate();
            await interaction.editReply({ content: `Error procesando la parte ${partNumber}. Intenta finalizar o añadir otro juego.`, components: []});
        } catch(e) { console.error("Failed to notify user of part processing error", e); }
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error handling interaction:`, error);
    await interaction.followUp({
      content: "Error processing interaction. Please try again later.",
      flags: MessageFlags.Ephemeral
    });
    return null;
  }
}

const listenerTimeouts = new Map<string, NodeJS.Timeout>();

async function processGameSubmissions(client: Client, userId: string, interaction: CommandInteraction | ButtonInteraction | ModalSubmitInteraction): Promise<void> {
  try {
    const submissions = activeSubmissions.get(userId) || [];
    if (submissions.length === 0) {
      try {
        await interaction.followUp({
          content: "No hay juegos en la cola para procesar.",
          flags: MessageFlags.Ephemeral
        });
      } catch (error) {
        console.error("Error sending no games message:", error);
        if (!interaction.replied && 'reply' in interaction) {
          await interaction.reply({
            content: "No hay juegos en la cola para procesar.",
            flags: MessageFlags.Ephemeral
          });
        }
      }
      return;
    }

    let notifiedStart = false;
    try {
      await interaction.followUp({
        content: `Procesando ${submissions.length} juegos. Esto puede tardar varios minutos...`,
        flags: MessageFlags.Ephemeral
      });
      notifiedStart = true;
    } catch (error) {
      console.error("Error sending processing start message:", error);
      if (!interaction.replied && 'reply' in interaction) {
        await interaction.reply({
          content: `Procesando ${submissions.length} juegos. Esto puede tardar varios minutos...`,
          flags: MessageFlags.Ephemeral
        });
        notifiedStart = true;
      }
    }

    if (!await ensureF95Session()) {
      try {
        if (notifiedStart) {
          await interaction.followUp({
            content: "Error al iniciar sesión en F95Zone. Por favor, intenta de nuevo más tarde.",
            flags: MessageFlags.Ephemeral
          });
        } else if (!interaction.replied && 'reply' in interaction) {
          await interaction.reply({
            content: "Error al iniciar sesión en F95Zone. Por favor, intenta de nuevo más tarde.",
            flags: MessageFlags.Ephemeral
          });
        }
      } catch (error) {
        console.error("Error sending login failure message:", error);
      }
      return;
    }

    let localImagePaths: string[] = [];
    const results: ResultItem[] = [];
    let processedCount = 0;
    
    try {
      await login(config.F95_LOGIN_USER, config.F95_LOGIN_PASSWORD);
      
      for (const submission of submissions) {
        let gameName = submission.url;
        try {
          console.log(`[Bulk] Iniciando procesamiento para: ${submission.url}`);
          const gameData = await getHandiworkFromURL<Game>(submission.url, Game);
          
          if (!gameData) {
            console.error(`[Bulk] No se pudo obtener información del juego: ${submission.url}`);
            results.push({ 
              ...submission,
              name: gameName, 
              success: false, 
              error: "No se pudo obtener información del juego" 
            });
            continue;
          }
          
          gameName = gameData.name || submission.url;
          console.log(`[Bulk] Juego obtenido: ${gameName}`);
          
          const FALLBACK_IMAGE = 'https://cdn.discordapp.com/attachments/1143524516156051456/1147920354753704096/logo.png';
          let coverImageUrl = FALLBACK_IMAGE;
          let localImagePath: string | null = null;
          
          if (gameData.cover && typeof gameData.cover === 'string' && gameData.cover.trim()) {
            try {
              const originalUrl = gameData.cover.trim();
              const filename = `bulk_game_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
              const attachmentName = `cover_game_${gameName.replace(/[^a-zA-Z0-9]/g, '') || 'game'}.png`;
              
              console.log(`[Bulk] Descargando imagen para ${gameName}: ${originalUrl}`);
              localImagePath = await safeDownloadImage(originalUrl, filename);
              console.log(`[Bulk] Imagen guardada localmente: ${localImagePath}`);

              if (localImagePath) {
                localImagePaths.push(localImagePath);
                coverImageUrl = await uploadImageToDiscord(client, localImagePath, attachmentName);
                console.log(`[Bulk] URL de Discord CDN obtenida para ${gameName}: ${coverImageUrl}`);
              } else {
                console.log(`[Bulk] Falló la descarga/conversión de imagen para ${gameName}, usando fallback.`);
                coverImageUrl = FALLBACK_IMAGE;
              }
            } catch (imgError) {
              console.error(`[Bulk] Error procesando imagen para ${gameName}:`, imgError);
              coverImageUrl = FALLBACK_IMAGE;
            }
          } else {
            console.log(`[Bulk] No se encontró URL de portada para ${gameName}, usando fallback.`);
            coverImageUrl = FALLBACK_IMAGE;
          }
          console.log(`[Bulk] URL de imagen final para ${gameName}: ${coverImageUrl}`);
          
          const tasks = [];
          
          if ((submission.freePcMediafire || submission.freePcPixeldrain) && config.DISCORD_FREE_PC_CHANNEL_ID) {
            console.log("[Bulk] Añadiendo tarea para Free PC");
            tasks.push(sendGameToChannel(
              client,
              config.DISCORD_FREE_PC_CHANNEL_ID, 
              gameData, 
              submission.freePcMediafire, 
              submission.freePcPixeldrain, 
              "Versión Gratuita para PC",
              submission.url,
              coverImageUrl,
              submission.additionalParts
            ));
          }
          
          if ((submission.freeMobileMediafire || submission.freeMobilePixeldrain) && config.DISCORD_FREE_MOBILE_CHANNEL_ID) {
            console.log("[Bulk] Añadiendo tarea para Free Mobile");
            tasks.push(sendGameToChannel(
              client,
              config.DISCORD_FREE_MOBILE_CHANNEL_ID, 
              gameData, 
              submission.freeMobileMediafire, 
              submission.freeMobilePixeldrain, 
              "Versión Gratuita para Móvil",
              submission.url,
              coverImageUrl,
              submission.additionalParts
            ));
          }
          
          if ((submission.premiumPcMediafire || submission.premiumPcPixeldrain) && config.DISCORD_PREMIUM_PC_CHANNEL_ID) {
            console.log("[Bulk] Añadiendo tarea para Premium PC");
            tasks.push(sendGameToChannel(
              client,
              config.DISCORD_PREMIUM_PC_CHANNEL_ID, 
              gameData, 
              submission.premiumPcMediafire, 
              submission.premiumPcPixeldrain, 
              "Versión Premium para PC",
              submission.url,
              coverImageUrl,
              submission.additionalParts
            ));
          }
          
          if ((submission.premiumMobileMediafire || submission.premiumMobilePixeldrain) && config.DISCORD_PREMIUM_MOBILE_CHANNEL_ID) {
            console.log("[Bulk] Añadiendo tarea para Premium Mobile");
            tasks.push(sendGameToChannel(
              client,
              config.DISCORD_PREMIUM_MOBILE_CHANNEL_ID, 
              gameData, 
              submission.premiumMobileMediafire, 
              submission.premiumMobilePixeldrain, 
              "Versión Premium para Móvil",
              submission.url,
              coverImageUrl,
              submission.additionalParts
            ));
          }
          
          await Promise.all(tasks);
          
          results.push({ 
            ...submission,
            name: gameName, 
            success: true 
          });
          console.log(`[Bulk] Procesamiento exitoso para: ${gameName}`);
        } catch (error) {
          console.error(`[Bulk] Error procesando juego ${gameName} (${submission.url}):`, error);
          results.push({ 
            ...submission,
            name: gameName,
            success: false, 
            error: (error as Error).message || 'Error desconocido durante el procesamiento'
          });
        }

        processedCount++;

        try {
          await interaction.followUp({
            content: `Progreso: ${processedCount}/${submissions.length} procesados...`,
            flags: MessageFlags.Ephemeral
          });
        } catch(e) {
          console.warn(`Failed to send ephemeral progress update (${processedCount}/${submissions.length}):`, e);
        }
      }
      
    } catch (error) {
      console.error('[Bulk] Error general durante el procesamiento del lote:', error);
      await interaction.followUp({
        content: `Error crítico durante el procesamiento del lote: ${(error as Error).message}`,
        flags: MessageFlags.Ephemeral
      });
    } finally {
      activeSubmissions.delete(userId);
      
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      let userResultsMessage = '**Resumen del Lote**\n';
      userResultsMessage += '✅ Juegos procesados con éxito: ' + successCount + '\n';
      userResultsMessage += '❌ Juegos con errores: ' + failedCount + '\n\n';

      if (successCount > 0) {
        userResultsMessage += '**Juegos Publicados Correctamente:**\n';
        results.filter(r => r.success)
          .forEach(r => userResultsMessage += '- ' + r.name + ' (' + r.url + ')\n');
        userResultsMessage += '\n';
      }
      
      if (failedCount > 0) {
        userResultsMessage += '**Errores Encontrados:**\n';
        results.filter(r => !r.success)
          .forEach(r => userResultsMessage += '- ' + (r.name || r.url) + ': ' + (r.error || 'Error desconocido') + '\n');
      }
      
      try {
        const chunks = [];
        for (let i = 0; i < userResultsMessage.length; i += 1950) {
          chunks.push(userResultsMessage.substring(i, i + 1950));
        }
        
        let firstChunk = true;
        for (const chunk of chunks) {
          try {
            await interaction.followUp({
              content: chunk,
              flags: firstChunk ? undefined : MessageFlags.Ephemeral,
            });
          } catch (error) {
            console.error(`Failed to send user summary chunk ${firstChunk ? 'first' : 'additional'}:`, error);
            
            if (interaction.channel && interaction.channel.isTextBased()) {
              await (interaction.channel as TextChannel).send({
                content: `<@${userId}> ${chunk}`,
              }).catch((channelError: Error) => console.error("Failed to send channel message as fallback:", channelError));
            }
          }
          firstChunk = false;
        }
      } catch (e) {
        console.error("Failed to send final user summary:", e);
        
        try {
          const user = await client.users.fetch(userId);
          await user.send({
            content: "Resumen del procesamiento de juegos:\n\n" + userResultsMessage.substring(0, 1950)
          });
        } catch (dmError) {
          console.error("Failed to send DM with results:", dmError);
        }
      }

     
      if (config.DISCORD_LOGS_CHANNEL_ID) {
        try {
          const logsChannel = await client.channels.fetch(config.DISCORD_LOGS_CHANNEL_ID) as TextChannel;
          if (logsChannel && logsChannel.isTextBased()) {
           
            const user = await client.users.fetch(userId);
            const timestamp = new Date().toISOString();
            let logsMessage = `**Reporte de bulk post** - ${timestamp}\n`;
            logsMessage += `**Usuario:** ${user.tag} (${user.id})\n`;
            logsMessage += `**Total de juegos:** ${submissions.length}\n`;
            logsMessage += `**Exitosos:** ${successCount} | **Fallidos:** ${failedCount}\n\n`;
            
            if (successCount > 0) {
              logsMessage += '**Juegos Publicados:**\n';
              results.filter(r => r.success)
                .forEach(r => logsMessage += `- ${r.name} (${r.url})\n`);
              logsMessage += '\n';
            }
            
            if (failedCount > 0) {
              logsMessage += '**Errores:**\n';
              results.filter(r => !r.success)
                .forEach(r => logsMessage += `- ${r.name || r.url}: ${r.error || 'Error desconocido'}\n`);
            }
            
           
            const logChunks = [];
            for (let i = 0; i < logsMessage.length; i += 1950) {
              logChunks.push(logsMessage.substring(i, i + 1950));
            }
            
            for (const chunk of logChunks) {
              await logsChannel.send({
                content: chunk
              });
            }
            
            console.log(`[Bulk] Log report sent to logs channel ${config.DISCORD_LOGS_CHANNEL_ID}`);
          } else {
            console.error(`[Bulk] Logs channel ${config.DISCORD_LOGS_CHANNEL_ID} not found or not a text channel`);
          }
        } catch (logError) {
          console.error("[Bulk] Error sending log report:", logError);
        }
      }

      if (localImagePaths.length > 0) {
        console.log(`[Bulk] Limpiando ${localImagePaths.length} imágenes cacheadas...`);
        setTimeout(() => {
          localImagePaths.forEach(imgPath => {
            fs.unlink(imgPath, (err) => {
              if (err) {
                console.error(`[Bulk] Error al eliminar imagen cacheada ${imgPath}:`, err);
              } else {
                console.log(`[Bulk] Imagen eliminada: ${imgPath}`);
              }
            });
          });
        }, 5 * 1000);
      }
    }
  } catch (error) {
    console.error('[Bulk] Error executing command:', error);
    await interaction.followUp({
      content: 'Ocurrió un error al iniciar el comando. Por favor, intenta de nuevo.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function sendGameToChannel(
  client: Client,
  channelId: string, 
  gameData: Game, 
  linkMediafire: string | undefined, 
  linkPixeldrain: string | undefined, 
  type: string, 
  gameUrl: string,
  imageUrl: string,
  additionalParts?: Array<{
    partNumber: number;
    pcMediafire?: string;
    pcPixeldrain?: string;
    mobileMediafire?: string;
    mobilePixeldrain?: string;
    premiumPcMediafire?: string;
    premiumPcPixeldrain?: string;
    premiumMobileMediafire?: string;
    premiumMobilePixeldrain?: string;
  }>
): Promise<void> {
  const hasMainLinks = linkMediafire || linkPixeldrain;
  const hasAdditionalLinks = additionalParts && additionalParts.some(
    part => {
      const isPremiumType = type.includes("Premium");
      if (isPremiumType) {
        return part.premiumPcMediafire || part.premiumPcPixeldrain || 
               part.premiumMobileMediafire || part.premiumMobilePixeldrain;
      } else {
        return part.pcMediafire || part.pcPixeldrain || 
               part.mobileMediafire || part.mobilePixeldrain;
      }
    }
  );
  
  if (!hasMainLinks && !hasAdditionalLinks) {
    console.log(`[Bulk][${type}] Skipping send to ${channelId}, no links provided.`);
    return;
  }

  try {
    console.log(`[Bulk][${type}] Intentando enviar mensaje a canal ID: ${channelId}`);
    
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.error(`[Bulk][${type}] Canal ${channelId} no encontrado o no es un canal de texto`);
      return;
    }
    
    const textChannel = channel as TextChannel;
    const f95zoneLink = `[Ver en F95Zone](${gameData.url || gameUrl})`;

    const translateMap = {
      "2dcg": '2d',
      "2d game": "2d",
      "2d": "2d",
      "anal sex": "Anal",
      "anal": "Anal",
      "bdsm": "Bdsm",
      "sci-fi": "Ciencia ficción", 
      "mind control": "Control mental",
      "corruption": "Corrupción",
      "female domination": "Dominación femenina",
      "male domination": "Dominación masculina",
      "pregnancy": "Embarazo",
      "slave": "Esclavo",
      "school setting": "Escolar",
      "fantasy": "Fantasía",
      "furry": "Furry",
      "futa/trans": "Futa/Trans",
      "futa/trans protagonist": "Futa/Trans",
      "harem": "Harem",
      "humor": "Humor",
      "incest": "Incesto",
      "interracial": "Interracial",
      "lesbian": "Lesbianas",
      "loli": "Lol1",
      "milf": "Milf",
      "ntr": "Ntr",
      "netorare": "Ntr",
      "parody": "Parodia",
      "female protagonist": "Protagonista femenino",
      "male protagonist": "Protagonista masculino",
      "romance": "Romance",
      "rpg": "RPGM",
      "sandbox": "Sandbox",
      "shota": "Shota",
      "big tits": "Tetas grandes",
      "rape": "Violación",
      "virgin": "Virgen",
      "superpowers": "Superpoderes",
      "monster girl": "Monstruo",
      "monster": "Monstruo",
      "gay": "Gay",
    };

    const translatedTags = gameData.genre
      .filter((tag: string) => translateMap[tag.toLowerCase() as keyof typeof translateMap])
      .map((tag: string) => translateMap[tag.toLowerCase() as keyof typeof translateMap]);
    
    const embed = new EmbedBuilder()
      .setAuthor({
        name: 'HotZone Publisher',
        iconURL: 'https://cdn.discordapp.com/attachments/1143524516156051456/1147920354753704096/logo.png',
        url: 'https://hotzone18.com/'
      })
      .setTitle(gameData.name || 'No hay nombre disponible.')
      .setDescription(`\`\`\`\n${gameData.overview || 'No hay descripción disponible.'}\n\`\`\``)
      .addFields(
        {
          name: 'Generos',
          value: `\`\`\`\n${(gameData.genre && gameData.genre.length > 0) ? translatedTags.join(', ') : 'Sin géneros'}\n\`\`\``
        },
        {
          name: 'Puntuación media',
          value: `\`\`\`\n${!isNaN(gameData.rating?.average) ? gameData.rating.average : 0} ⭐\n\`\`\``,
          inline: true
        },
        {
          name: 'Puntuación máxima',
          value: `\`\`\`\n${!isNaN(gameData.rating?.best) ? gameData.rating.best : 0} ⭐\n\`\`\``,
          inline: true
        },
        {
          name: 'Puntuaciones',
          value: `\`\`\`\n${!isNaN(gameData.rating?.count) ? gameData.rating.count : 0}\n\`\`\``,
          inline: true
        },
        {
          name: 'Desarrollador',
          value: `\`\`\`\n${gameData.authors?.[0]?.name || 'Desconocido'}\n\`\`\``,
          inline: true
        },
        {
          name: 'Estado',
          value: `\`\`\`\n${gameData.status || 'Desconocido'}\n\`\`\``,
          inline: true
        },
        {
          name: 'Versión',
          value: `\`\`\`\n${gameData.version || 'Desconocida'}\n\`\`\``,
          inline: true
        }
      );
      
    let downloadText = "";
    
    const isPremiumType = type.includes("Premium");
    
    if (linkMediafire || linkPixeldrain) {
      downloadText += `**Parte 1:**\n${formatLink(linkMediafire || '', 'Mediafire')}\n${formatLink(linkPixeldrain || '', 'Pixeldrain')}\n`;
    }
    
    if (additionalParts && additionalParts.length > 0) {
      const sortedParts = [...additionalParts].sort((a, b) => a.partNumber - b.partNumber);
      
      for (const part of sortedParts) {
        let hasLinks = false;
        let mediafireLink = '';
        let pixeldrainLink = '';
        
        const isPC = type.includes("PC");
        
        if (isPremiumType) {
          if (isPC) {
            mediafireLink = part.premiumPcMediafire || '';
            pixeldrainLink = part.premiumPcPixeldrain || '';
          } else {
            mediafireLink = part.premiumMobileMediafire || '';
            pixeldrainLink = part.premiumMobilePixeldrain || '';
          }
        } else {
          if (isPC) {
            mediafireLink = part.pcMediafire || '';
            pixeldrainLink = part.pcPixeldrain || '';
          } else {
            mediafireLink = part.mobileMediafire || '';
            pixeldrainLink = part.mobilePixeldrain || '';
          }
        }
        
        hasLinks = !!mediafireLink || !!pixeldrainLink;
        
        if (hasLinks) {
          downloadText += `\n**Parte ${part.partNumber}:**\n${formatLink(mediafireLink, 'Mediafire')}\n${formatLink(pixeldrainLink, 'Pixeldrain')}\n`;
        }
      }
    }
    
    embed.addFields({
      name: 'Descargas',
      value: downloadText || 'No hay enlaces disponibles'
    });

    embed.addFields(
      {
        name: 'Instrucciones',
        value: `${f95zoneLink}`,
      },
      {
        name: 'Tipo',
        value: type
      }
    )
    .setColor(0x00b0f4)
    .setFooter({
      text: 'HotZone Publisher',
      iconURL: 'https://cdn.discordapp.com/attachments/1143524516156051456/1147920354753704096/logo.png'
    })
    .setTimestamp();

    let imageUrlWithFormat = imageUrl;
    if (!imageUrlWithFormat.includes('.png') && !imageUrlWithFormat.includes('format=png')) {
      imageUrlWithFormat = `${imageUrlWithFormat}${imageUrlWithFormat.includes('?') ? '&' : '?'}format=png`;
    }
    
    const finalImageUrl = `${imageUrlWithFormat}${imageUrlWithFormat.includes('?') ? '&' : '?'}cache=${Date.now()}`;
    embed.setImage(finalImageUrl);
    
    await textChannel.send({ embeds: [embed] });
    console.log(`[Bulk][${type}] Mensaje enviado exitosamente a ${channelId}.`);
  } catch (error) {
    console.error(`[Bulk][${type}] Error al enviar embed a ${channelId}:`, error);
  }
}

export async function execute(interaction: CommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const commandInvocationId = `f95bulk_${userId}_${Date.now()}`;

  try {
    if (interaction.channel?.id !== config.DISCORD_COMMAND_CHANNEL_ID) {
      await interaction.reply({
        content: "Este comando solo puede ser usado en el canal de comandos.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const existingActiveGames = activeSubmissions.get(userId)?.length || 0;
    const hasPendingGame = pendingSubmission.has(userId);

    if (existingActiveGames > 0) {
      const continueButton = new ButtonBuilder()
        .setCustomId(`continue_session_${commandInvocationId}`)
        .setLabel(`Continuar Sesión (${existingActiveGames} juegos)`)
        .setStyle(ButtonStyle.Primary);
      const newButton = new ButtonBuilder()
        .setCustomId(`new_session_${commandInvocationId}`)
        .setLabel('Iniciar Nueva Sesión (Descarta Actual)')
        .setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(continueButton, newButton);

      await interaction.reply({
        content: "Ya tienes una sesión de envío de juegos activa. ¿Qué deseas hacer?",
        components: [row],
        flags: MessageFlags.Ephemeral
      });

    } else if (hasPendingGame) {
      const resumeButton = new ButtonBuilder()
        .setCustomId(`resume_pending_${commandInvocationId}`)
        .setLabel('Continuar Juego Pendiente')
        .setStyle(ButtonStyle.Primary);
      const discardButton = new ButtonBuilder()
        .setCustomId(`discard_pending_${commandInvocationId}`)
        .setLabel('Descartar Juego Pendiente')
        .setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(resumeButton, discardButton);

      await interaction.reply({
        content: "Parece que dejaste un juego a medio añadir. ¿Quieres continuar con él o descartarlo?",
        components: [row],
        flags: MessageFlags.Ephemeral
      });

    } else {
      if (!activeSubmissions.has(userId)) {
        activeSubmissions.set(userId, []);
      }
      pendingSubmission.delete(userId);

      const initialModalId = 'game_modal_' + commandInvocationId;
      const modal = await createGameModal(initialModalId);
      await interaction.showModal(modal);
    }

    const existingListener = activeListeners.get(userId);
    if (existingListener) {
      interaction.client.removeListener('interactionCreate', existingListener);
      console.log(`[Bulk] Removed previous listener for user ${userId}`);
    }

    const interactionListener = async (i: Interaction) => {
      if (i.user.id !== userId) return;

      let customId: string | null = null;
      let interactionType = 'unknown';
      if (i.isModalSubmit()) {
         customId = i.customId;
         interactionType = 'ModalSubmit';
      } else if (i.isStringSelectMenu()) {
         customId = i.customId;
         interactionType = 'StringSelectMenu';
      } else if (i.isButton()) {
         customId = i.customId;
         interactionType = 'Button';
      }

      if (!customId) return;

     
      if (i.isButton() && customId.startsWith('show_premium_')) {
        console.log(`[Listener User: ${userId}] Skipping show_premium_ button, has dedicated handler`);
        return;
      }

      console.log(`[Listener User: ${userId}] Received ${interactionType} with ID: ${customId}`);

      try {
        if (i.isModalSubmit()) {
          await handleModalSubmit(i, userId);
          return;
        }

        if (i.isStringSelectMenu()) {
          const selectInteraction = i;
          const currentCustomId = selectInteraction.customId;

          if (currentCustomId.startsWith('final_options_')) {
             if (!selectInteraction.deferred && !selectInteraction.replied) {
                 await selectInteraction.deferUpdate();
             }

            const commandInvocationId = currentCustomId.substring('final_options_'.length);
            const selectedValue = selectInteraction.values[0];

            if (selectedValue === 'add_another') {
             
             
              const newGameButtonId = `show_new_game_modal_${commandInvocationId}_${Date.now()}`;
              const showModalButton = new ButtonBuilder()
                .setCustomId(newGameButtonId)
                .setLabel('Añadir Nuevo Juego')
                .setStyle(ButtonStyle.Primary);
                
              const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(showModalButton);
                
                await selectInteraction.editReply({
                  content: "Haz clic en el botón para añadir un nuevo juego:",
                  components: [row]
                });
                
               
                const newGameButtonHandler = async (btnInteraction: Interaction) => {
                  if (!btnInteraction.isButton()) return;
                  if (btnInteraction.user.id !== userId) return;
                  if (btnInteraction.customId !== newGameButtonId) return;
                  
                 
                  const newGameModalId = `game_modal_${commandInvocationId}_${Date.now()}`;
                  if (newGameModalId.length > 100) {
                    console.error(`Generated game modal ID too long: ${newGameModalId}`);
                    await btnInteraction.reply({ 
                      content: "Error interno: ID de modal demasiado largo.", 
                      ephemeral: true
                    });
                    return;
                  }
                  
                  const gameModal = await createGameModal(newGameModalId);
                  await btnInteraction.showModal(gameModal);
                  
                 
                  interaction.client.removeListener('interactionCreate', newGameButtonHandler);
                };
                
               
                interaction.client.on('interactionCreate', newGameButtonHandler);
                
               
                setTimeout(() => {
                  interaction.client.removeListener('interactionCreate', newGameButtonHandler);
                }, 5 * 60 * 1000);
            }
            else if (selectedValue === 'add_part') {
             
             
              if (activeSubmissions.get(userId)?.length === 0) {
                await selectInteraction.editReply({
                  content: "Error: No hay juegos activos para añadir partes.",
                  components: []
                });
                return;
              }
              
             
              const lastGame = activeSubmissions.get(userId)?.slice(-1)[0];
              if (!lastGame) {
                await selectInteraction.editReply({
                  content: "Error: No se pudo encontrar el juego más reciente.",
                  components: []
                });
                return;
              }
              
             
              const pendingPartGame: Partial<GameSubmission> = {
                url: lastGame.url,
                freePcMediafire: lastGame.freePcMediafire,
                freePcPixeldrain: lastGame.freePcPixeldrain,
                freeMobileMediafire: lastGame.freeMobileMediafire,
                freeMobilePixeldrain: lastGame.freeMobilePixeldrain,
                premiumPcMediafire: lastGame.premiumPcMediafire,
                premiumPcPixeldrain: lastGame.premiumPcPixeldrain,
                premiumMobileMediafire: lastGame.premiumMobileMediafire,
                premiumMobilePixeldrain: lastGame.premiumMobilePixeldrain,
                hasMultipleParts: true,
                additionalParts: [...(lastGame.additionalParts || [])]
              };
              
             
              const existingPartsCount = lastGame.additionalParts?.length || 0;
              const nextPartNumber = existingPartsCount + 2;
              
              pendingSubmission.set(userId, pendingPartGame);
              
             
              const currentActiveGames = activeSubmissions.get(userId) || [];
              if (currentActiveGames.length > 0) {
               
                activeSubmissions.set(userId, currentActiveGames.slice(0, -1));
              }
              
             
              const newFlowId = `flow_${userId}_${Date.now()}`;
              const showPartsButtonId = `show_parts_${newFlowId}_${nextPartNumber}`;
              
              const showPartsButton = new ButtonBuilder()
                .setCustomId(showPartsButtonId)
                .setLabel(`Añadir Parte ${nextPartNumber} (Free)`)
                .setStyle(ButtonStyle.Primary);
                
                const row = new ActionRowBuilder<ButtonBuilder>()
                  .addComponents(showPartsButton);
                  
                await selectInteraction.editReply({
                  content: `Juego "${lastGame.url.split('/').pop()?.substring(0, 30) || 'actual'}" recuperado para añadir partes. Haz clic en el botón para añadir la Parte ${nextPartNumber}:`,
                  components: [row]
                });
            }
            else if (selectedValue === 'submit_all') {
              await selectInteraction.editReply({ content: "Iniciando procesamiento del lote...", components: [] });
              await processGameSubmissions(interaction.client, userId, interaction as CommandInteraction);
              interaction.client.removeListener('interactionCreate', interactionListener);
              activeListeners.delete(userId);
              if (listenerTimeouts.has(userId)) {
                  clearTimeout(listenerTimeouts.get(userId));
                  listenerTimeouts.delete(userId);
              }
              console.log(`[Bulk] Removed listener for user ${userId} after final submission.`);
            }
            else {
              await selectInteraction.editReply({ content: "Opción no reconocida.", components: []});
            }
          }

          return;
        }

        if (i.isButton()) {
          const buttonInteraction = i;
          const currentCustomId = buttonInteraction.customId;

          if (currentCustomId.startsWith('show_premium_parts_')) {
            const parts = currentCustomId.split('_');
            const partNumberStr = parts[parts.length - 1];
            const partNumber = parseInt(partNumberStr, 10);
            const flowId = parts.slice(3, -1).join('_');

            if (isNaN(partNumber) || !flowId) {
                 console.error('Invalid data in show_premium_parts button:', currentCustomId);
                 await buttonInteraction.editReply({ content: "Error: datos de botón inválidos.", components: [] });
                 return;
            }
            if (!pendingSubmission.has(userId)) {
                 await buttonInteraction.editReply({ content: "Error: No se encontró juego pendiente.", components: [] });
                 return;
             }

            const partsModalCustomId = `parts_modal_${flowId}_premium${partNumber}`;
            if (partsModalCustomId.length > 100) {
                 await buttonInteraction.editReply({ content: "Error interno: ID de modal demasiado largo.", components: []});
                 return;
             }

            const premiumPartsModal = await createAdditionalPartsModal(partsModalCustomId, partNumber, true);
            await buttonInteraction.showModal(premiumPartsModal);
          }
          else if (currentCustomId.startsWith('skip_premium_parts_')) {
             const parts = currentCustomId.split('_');
             const partNumberStr = parts[parts.length - 1];
             const partNumber = parseInt(partNumberStr, 10);
             const commandInvocationId = parts.slice(3, -1).join('_');

             if (isNaN(partNumber) || !commandInvocationId) {
                 console.error('Invalid data in skip_premium_parts button:', currentCustomId);
                 await buttonInteraction.editReply({ content: "Error: datos de botón inválidos (skip).", components: [] });
                 return;
             }
             if (!pendingSubmission.has(userId)) {
                 await buttonInteraction.editReply({ content: "Error: No se encontró juego pendiente (skip).", components: [] });
                 return;
              }

             const nextPartNumber = partNumber + 1;
             const newFlowId = `flow_${userId}_${Date.now()}`;

             const addAnotherPartButton = new ButtonBuilder()
               .setCustomId(`show_parts_${newFlowId}_${nextPartNumber}`)
               .setLabel(`Añadir Parte ${nextPartNumber} (Free)`)
               .setStyle(ButtonStyle.Primary);
             const finishCurrentGamePartsButton = new ButtonBuilder()
               .setCustomId(`finish_parts_submit_${commandInvocationId}`)
               .setLabel('Terminar de Añadir Partes (Este Juego)')
               .setStyle(ButtonStyle.Success);
             const actionRow = new ActionRowBuilder<ButtonBuilder>()
               .addComponents(addAnotherPartButton, finishCurrentGamePartsButton);

             await buttonInteraction.editReply({
               content: `Enlaces Premium para Parte ${partNumber} saltados. ¿Quieres añadir la Parte ${nextPartNumber} (Free) o terminar con las partes de este juego?`,
               components: [actionRow]
             });
          }
          else if (currentCustomId.startsWith('show_parts_')) {
            const parts = currentCustomId.split('_');
            const partNumberStr = parts[parts.length - 1];
            const partNumber = parseInt(partNumberStr, 10);
            const flowId = parts.slice(2, -1).join('_');

            if (isNaN(partNumber) || !flowId) {
                 console.error('Invalid data in show_parts button:', currentCustomId);
                 await buttonInteraction.editReply({ content: "Error: datos de botón inválidos (show_parts).", components: [] });
                 return;
            }
            if (!pendingSubmission.has(userId)) {
                 await buttonInteraction.editReply({ content: "Error: No se encontró juego pendiente (show_parts).", components: [] });
                 return;
             }

            const partsModalCustomId = `parts_modal_${flowId}_${partNumber}`;
            if (partsModalCustomId.length > 100) {
                await buttonInteraction.editReply({ content: "Error interno: ID de modal demasiado largo (show_parts).", components: []});
                return;
            }

            const additionalPartsModal = await createAdditionalPartsModal(partsModalCustomId, partNumber, false);
            await buttonInteraction.showModal(additionalPartsModal);
          }
          else if (currentCustomId.startsWith('finish_parts_submit_')) {
             const commandInvocationId = currentCustomId.substring('finish_parts_submit_'.length);
             if (!commandInvocationId) {
                 console.error('Invalid commandInvocationId in finish_parts_submit_:', currentCustomId);
                 await buttonInteraction.editReply({ content: "Error interno finalizando partes.", components: [] });
                 return;
             }
             
            
             if (!buttonInteraction.deferred && !buttonInteraction.replied) {
                 await buttonInteraction.deferUpdate();
             }
             
             const finalizedGame = await finalizeCurrentGame(userId);

             if (!finalizedGame) {
                 await buttonInteraction.editReply({ content: "Error al finalizar el juego con partes.", components: [] });
                 return;
             }

             const userSubmissions = activeSubmissions.get(userId) || [];
             const selectMenu = new StringSelectMenuBuilder()
               .setCustomId(`final_options_${commandInvocationId}`)
               .setPlaceholder('Selecciona la siguiente acción')
               .addOptions(
                 new StringSelectMenuOptionBuilder()
                   .setLabel('Añadir Otro Juego')
                   .setValue('add_another')
                   .setEmoji('➕'),
                 new StringSelectMenuOptionBuilder()
                   .setLabel(`Enviar Lote (${userSubmissions.length} juego${userSubmissions.length === 1 ? '' : 's'})`)
                   .setValue('submit_all')
                   .setEmoji('✅')
               );
             const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

             const gameIdentifier = finalizedGame.url.split('/').filter(Boolean).pop()?.substring(0, 50) || 'actual';
             await buttonInteraction.editReply({
                 content: `Partes para el juego "${gameIdentifier}" añadidas. Total en lote: ${userSubmissions.length}. ¿Qué quieres hacer ahora?`,
                 components: [row]
             });
          }

          else if (currentCustomId.startsWith('add_another_')) {
             const commandId = currentCustomId.substring('add_another_'.length);
             const newGameModalId = `game_modal_${commandId}_${Date.now()}`;
             if (newGameModalId.length > 100) {
                await buttonInteraction.editReply({ content: "Error interno: ID de modal demasiado largo.", components: []});
                return;
             }
             const gameModal = await createGameModal(newGameModalId);
             await buttonInteraction.showModal(gameModal);
           }
           else if (currentCustomId.startsWith('submit_all_')) {
            
             if (!buttonInteraction.deferred && !buttonInteraction.replied) {
                 await buttonInteraction.deferUpdate();
             }
             
             await buttonInteraction.editReply({ content: "Iniciando procesamiento del lote...", components: [] });
             await processGameSubmissions(interaction.client, userId, buttonInteraction);
             interaction.client.removeListener('interactionCreate', interactionListener);
             activeListeners.delete(userId);
             console.log(`[Bulk] Removed listener for user ${userId} after submission.`);
           }
          else if (currentCustomId.startsWith('continue_session_')) {
                const userSubmissionsCount = activeSubmissions.get(userId)?.length || 0;
                const continueButton = new ButtonBuilder()
                  .setCustomId(`continue_session_${commandInvocationId}`)
                  .setLabel('Añadir Otro Juego')
                  .setStyle(ButtonStyle.Primary);
                const newButton = new ButtonBuilder()
                  .setCustomId(`new_session_${commandInvocationId}`)
                  .setLabel('Iniciar Nueva Sesión (Descarta Actual)')
                  .setStyle(ButtonStyle.Danger);
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(continueButton, newButton);
                await buttonInteraction.editReply({ content: `Ya tienes ${userSubmissionsCount} juegos...`, components: [row] });
          }
          else if (currentCustomId.startsWith('new_session_')) {
                activeSubmissions.delete(userId);
                pendingSubmission.delete(userId);
                const commandId = currentCustomId.substring('new_session_'.length);
                if (!commandId) { /* Error */ return; }
                await buttonInteraction.editReply({ content: "Sesión anterior eliminada. Iniciando nueva...", components: [] });
                const newInitialModalId = `game_modal_${commandId}_${Date.now()}`;
                const newModal = await createGameModal(newInitialModalId);
                await buttonInteraction.followUp({ content: "Por favor, completa el modal para añadir el primer juego.", flags: MessageFlags.Ephemeral });
                await buttonInteraction.showModal(newModal);
          }
          else if (currentCustomId.startsWith('resume_pending_')) {
                const pendingGame = pendingSubmission.get(userId);
                const commandId = currentCustomId.substring('resume_pending_'.length);
                if (pendingGame && commandId) {
                    const newFlowId = `flow_${userId}_${Date.now()}`;
                    const premiumModalCustomId = `premium_modal_${commandId}_resume_${newFlowId}`;
                    if (premiumModalCustomId.length > 100) { /* Error */ return; }
                    const premiumModal = await createPremiumGameModal(premiumModalCustomId);
                    await buttonInteraction.showModal(premiumModal);
                } else {
                    await buttonInteraction.editReply({ content: "Error: Juego pendiente no encontrado o ID inválido.", components: []});
                }
          }
          else if (currentCustomId.startsWith('discard_pending_')) {
                pendingSubmission.delete(userId);
                await buttonInteraction.editReply({ content: "Juego pendiente descartado. Puedes iniciar `/f95bulk` de nuevo.", components: []});
          }

        }

      } catch (error) {
         console.error(`[Listener User: ${userId}] Error handling interaction ${customId}:`, error);
         try {
             if (i.isModalSubmit() || i.isButton() || i.isStringSelectMenu()) {
                 const errorMessage = { content: "Ocurrió un error procesando tu acción.", components: [] };
                 
                 if ((i as any).replied || (i as any).deferred) {
                     await (i as any).followUp({ ...errorMessage, flags: MessageFlags.Ephemeral });
                 } else if (i.isButton() || i.isStringSelectMenu()) {
                     await i.update(errorMessage);
                 } else {
                     await (i as any).reply({ ...errorMessage, flags: MessageFlags.Ephemeral });
                 }
             }
         } catch (replyError) {
             console.error(`[Listener User: ${userId}] Failed to send error message for interaction ${customId}:`, replyError);
         }
      }
    };

    interaction.client.on('interactionCreate', interactionListener);
    activeListeners.set(userId, interactionListener);
    console.log(`[Bulk] Added new listener for user ${userId}`);

    if (listenerTimeouts.has(userId)) {
      clearTimeout(listenerTimeouts.get(userId));
      listenerTimeouts.delete(userId);
    }

    const timeoutId = setTimeout(() => {
      const currentListener = activeListeners.get(userId);
      if (currentListener === interactionListener) {
        interaction.client.removeListener('interactionCreate', currentListener);
        activeListeners.delete(userId);
        listenerTimeouts.delete(userId);
        
        pendingSubmission.delete(userId);

        console.log(`[Bulk] Listener timed out and removed for user ${userId}`);
        
        cleanupTempFiles();
      }
    }, 6 * 3600_000);

    listenerTimeouts.set(userId, timeoutId);
  } catch (error) {
    console.error(`Error executing command:`, error);
    await interaction.followUp({
      content: 'Ocurrió un error al ejecutar el comando. Por favor, intenta de nuevo más tarde.',
      flags: MessageFlags.Ephemeral
    });
  }
}