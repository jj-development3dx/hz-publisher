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
  MessageFlags
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
}

interface ResultItem extends GameSubmission {
  name: string;
  success: boolean;
  error?: string;
}

const activeSubmissions = new Map<string, GameSubmission[]>();
const pendingSubmission = new Map<string, Partial<GameSubmission>>();

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
    .setTitle('Añadir enlaces premium (2/2)');

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

async function handleModalSubmit(interaction: ModalSubmitInteraction, userId: string): Promise<GameSubmission | null | 'pending'> {
  const customId = interaction.customId;
  
  if (customId.startsWith('game_modal_')) {
    const url = interaction.fields.getTextInputValue('url');
    
    if (!url.includes("f95zone.to")) {
      try {
        await interaction.followUp({ content: "La URL debe ser de F95Zone.", flags: MessageFlags.Ephemeral });
      } catch (error) {
        try {
          await interaction.reply({ content: "La URL debe ser de F95Zone.", flags: MessageFlags.Ephemeral });
        } catch (replyError) {
          console.error("Error responding to invalid URL modal:", replyError);
        }
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
    };
    
    pendingSubmission.set(userId, tempGame);
    
    try {
      const flowId = `flow_${userId}_${Date.now()}`;
      
      const showPremiumButton = new ButtonBuilder()
        .setCustomId(`show_premium_${flowId}`)
        .setLabel('Añadir Enlaces Premium')
        .setStyle(ButtonStyle.Primary);
        
      const addGameNoPremiumButton = new ButtonBuilder()
        .setCustomId(`add_no_premium_${flowId}`)
        .setLabel('Añadir Juego (Sin Premium)')
        .setStyle(ButtonStyle.Secondary);
        
      const choiceRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(showPremiumButton, addGameNoPremiumButton);
        
      await interaction.reply({
        content: "Información inicial guardada. Elige el siguiente paso:",
        components: [choiceRow],
        flags: MessageFlags.Ephemeral
      });
      return 'pending';
    } catch (error) {
      console.error("Error responding after initial modal submission:", error);
      try {
        await interaction.followUp({
          content: "Error procesando el modal inicial. Por favor, intenta añadir el juego de nuevo.",
          flags: MessageFlags.Ephemeral
        });
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
        await interaction.followUp({ content: "Error: No se encontró información inicial del juego pendiente.", flags: MessageFlags.Ephemeral });
      } catch (error) {
        try {
          await interaction.reply({ content: "Error: No se encontró información inicial del juego pendiente.", flags: MessageFlags.Ephemeral });
        } catch (replyError) {
          console.error("Error responding to missing pending game state:", replyError);
        }
      }
      return null;
    }
    
    pendingGame.premiumPcMediafire = interaction.fields.getTextInputValue('premium-pc-mediafire');
    pendingGame.premiumPcPixeldrain = interaction.fields.getTextInputValue('premium-pc-pixeldrain');
    pendingGame.premiumMobileMediafire = interaction.fields.getTextInputValue('premium-mobile-mediafire');
    pendingGame.premiumMobilePixeldrain = interaction.fields.getTextInputValue('premium-mobile-pixeldrain');
    
    if (!activeSubmissions.has(userId)) {
      activeSubmissions.set(userId, []);
    }
    
    const completedGame = pendingGame as GameSubmission;
    activeSubmissions.get(userId)!.push(completedGame);
    pendingSubmission.delete(userId);
    
    const userSubmissions = activeSubmissions.get(userId) || [];
    
    const commandInvocationId = customId.split('_')[2] + '_' + customId.split('_')[3];
    const addButton = new ButtonBuilder()
      .setCustomId(`add_another_${commandInvocationId}`)
      .setLabel('Añadir Otro Juego')
      .setStyle(ButtonStyle.Primary);
      
    const submitButton = new ButtonBuilder()
      .setCustomId(`submit_all_${commandInvocationId}`)
      .setLabel('Enviar Todos los Juegos')
      .setStyle(ButtonStyle.Success);
    
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(addButton, submitButton);
    
    try {
      await interaction.deferUpdate();
      await interaction.editReply({
        content: `Juego añadido correctamente (con premium). Total en lote: ${userSubmissions.length}`,
        components: [row]
      });
    } catch (error) {
      console.error("Error updating after premium modal:", error);
      try {
        await interaction.followUp({
          content: `Juego añadido. Total: ${userSubmissions.length}`,
          components: [row],
          flags: MessageFlags.Ephemeral
        });
      } catch (followUpError) {
        console.error("Error in followUp after premium modal error:", followUpError);
      }
    }
    return completedGame;
  }
  
  return null;
}

const listenerTimeouts = new Map<string, NodeJS.Timeout>();

async function processGameSubmissions(client: Client, userId: string, interaction: CommandInteraction | ButtonInteraction | ModalSubmitInteraction): Promise<void> {
  try {
    const submissions = activeSubmissions.get(userId) || [];
    if (submissions.length === 0) {
      await interaction.followUp({
        content: "No hay juegos en la cola para procesar.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.followUp({
      content: `Procesando ${submissions.length} juegos. Esto puede tardar varios minutos...`,
      flags: MessageFlags.Ephemeral
    });

    if (!await ensureF95Session()) {
      await interaction.followUp({
        content: "Error al iniciar sesión en F95Zone. Por favor, intenta de nuevo más tarde.",
        flags: MessageFlags.Ephemeral
      });
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
              coverImageUrl
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
              coverImageUrl
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
              coverImageUrl
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
              coverImageUrl
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
        for (const chunk of chunks) {
          await interaction.followUp({
            content: chunk,
          });
        }
      } catch (e) {
        console.error("Failed to send final user summary:", e);
      }

      if (config.DISCORD_LOGS_CHANNEL_ID) {
        let logMessage = '**Resumen del Lote Procesado por ' + interaction.user.username + ' (ID: ' + interaction.user.id + ')**\n';
        logMessage += '✅ Éxito: ' + successCount + ', ❌ Fallos: ' + failedCount + '\n\n';

        results.forEach(r => {
          logMessage += '**' + (r.success ? '✅' : '❌') + ' ' + (r.name || r.url) + '**\n';
          if (!r.success) logMessage += '   Error: ' + (r.error || 'Desconocido') + '\n';
          if (r.freePcMediafire || r.freePcPixeldrain) logMessage += '   Free PC: ' + formatLink(r.freePcMediafire, 'MF') + ' ' + formatLink(r.freePcPixeldrain, 'PD') + '\n';
          if (r.freeMobileMediafire || r.freeMobilePixeldrain) logMessage += '   Free Mobile: ' + formatLink(r.freeMobileMediafire, 'MF') + ' ' + formatLink(r.freeMobilePixeldrain, 'PD') + '\n';
          if (r.premiumPcMediafire || r.premiumPcPixeldrain) logMessage += '   Premium PC: ' + formatLink(r.premiumPcMediafire, 'MF') + ' ' + formatLink(r.premiumPcPixeldrain, 'PD') + '\n';
          if (r.premiumMobileMediafire || r.premiumMobilePixeldrain) logMessage += '   Premium Mobile: ' + formatLink(r.premiumMobileMediafire, 'MF') + ' ' + formatLink(r.premiumMobilePixeldrain, 'PD') + '\n';
          logMessage += '   URL F95: <' + r.url + '>\n\n';
        });

        try {
          const logsChannel = await client.channels.fetch(config.DISCORD_LOGS_CHANNEL_ID);
          if (logsChannel && logsChannel.type === ChannelType.GuildText) {
            const logChunks = [];
            for (let i = 0; i < logMessage.length; i += 1950) {
              logChunks.push(logMessage.substring(i, i + 1950));
            }
            for (const chunk of logChunks) {
              await (logsChannel as TextChannel).send(chunk);
            }
          } else {
            console.error("[Bulk] Canal de logs no encontrado o no es de texto.");
          }
        } catch (error) {
          console.error("[Bulk] Error al enviar log detallado:", error);
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
  imageUrl: string
): Promise<void> {
  if (!linkMediafire && !linkPixeldrain) {
    console.log(`[Bulk][${type}] Skipping send to ${channelId}, no links provided.`);
    return;
  }

  try {
    console.log(`[Bulk][${type}] Intentando enviar mensaje a canal ID: ${channelId}`);
    await sendGameEmbed(
      client,
      channelId,
      gameData,
      linkMediafire || '',
      linkPixeldrain || '',
      type,
      gameUrl,
      imageUrl
    );
    console.log(`[Bulk][${type}] Mensaje enviado exitosamente a ${channelId}.`);
  } catch (error) {
    console.error(`[Bulk][${type}] Error al enviar embed a ${channelId}:`, error);
  }
}

const activeListeners = new Map<string, (interaction: Interaction) => Promise<void>>();

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

      let interactionId = '';
      if ('customId' in i && i.customId) {
        interactionId = i.customId;
        if (!interactionId.includes(userId) && !interactionId.startsWith('game_modal_') && !interactionId.startsWith('premium_modal_')) {
          console.log(`[Bulk] Invalid interaction ID: ${interactionId}`);
          return;
        }
      } else {
        return;
      }

      try {
        if (i.isModalSubmit()) {
          await handleModalSubmit(i, userId);
          return;
        }

        if (i.isButton()) {
          const buttonInteraction = i;
          const customId = buttonInteraction.customId;

          if (customId.startsWith('show_premium_')) {
            const flowId = customId.substring('show_premium_'.length);
            if (!pendingSubmission.has(userId)) {
              await buttonInteraction.update({ content: "Error: No se encontró juego pendiente.", components: [] });
              return;
            }
            const premiumModalCustomId = `premium_modal_${flowId}`;
            if (premiumModalCustomId.length > 100) {
              console.error(`Generated premium modal custom ID too long: ${premiumModalCustomId}`);
              await buttonInteraction.update({ content: "Error interno: ID de modal demasiado largo.", components: []});
              return;
            }
            const premiumModal = await createPremiumGameModal(premiumModalCustomId);
            await buttonInteraction.showModal(premiumModal);
          }
          else if (customId.startsWith('add_no_premium_')) {
            const flowId = customId.substring('add_no_premium_'.length);
            const pendingGame = pendingSubmission.get(userId);
            if (pendingGame) {
              if (!activeSubmissions.has(userId)) activeSubmissions.set(userId, []);
              activeSubmissions.get(userId)!.push(pendingGame as GameSubmission);
              pendingSubmission.delete(userId);

              const userSubmissions = activeSubmissions.get(userId) || [];

              const addButton = new ButtonBuilder()
                .setCustomId(`add_another_${commandInvocationId}`)
                .setLabel('Añadir Otro Juego')
                .setStyle(ButtonStyle.Primary);
              const submitButton = new ButtonBuilder()
                .setCustomId(`submit_all_${commandInvocationId}`)
                .setLabel('Enviar Todos los Juegos')
                .setStyle(ButtonStyle.Success);
              const row = new ActionRowBuilder<ButtonBuilder>().addComponents(addButton, submitButton);

              await buttonInteraction.update({
                content: `Juego añadido (sin premium). Total en lote: ${userSubmissions.length}`,
                components: [row]
              });
            } else {
              await buttonInteraction.update({ content: "Error: No se encontró juego pendiente para añadir.", components: [] });
            }
          }
          else if (customId.startsWith('add_another_')) {
            const modalCommandId = customId.substring('add_another_'.length);
            const newGameModalId = `game_modal_${commandInvocationId}_${Date.now()}`;
            const gameModal = await createGameModal(newGameModalId);
            await buttonInteraction.showModal(gameModal);
          }
          else if (customId.startsWith('submit_all_')) {
            await buttonInteraction.update({ content: "Iniciando procesamiento del lote...", components: [] });
            await processGameSubmissions(interaction.client, userId, buttonInteraction);
            interaction.client.removeListener('interactionCreate', interactionListener);
            activeListeners.delete(userId);
            console.log(`[Bulk] Removed listener for user ${userId} after submission.`);
          }
          else if (customId.startsWith('resume_pending_')) {
            const pendingGame = pendingSubmission.get(userId);
            if (pendingGame) {
              const newFlowId = `flow_${userId}_${Date.now()}`;
              const showPremiumButton = new ButtonBuilder()
                .setCustomId(`show_premium_${newFlowId}`)
                .setLabel('Añadir Enlaces Premium')
                .setStyle(ButtonStyle.Primary);
              const addGameNoPremiumButton = new ButtonBuilder()
                .setCustomId(`add_no_premium_${newFlowId}`)
                .setLabel('Añadir Juego (Sin Premium)')
                .setStyle(ButtonStyle.Secondary);
              const choiceRow = new ActionRowBuilder<ButtonBuilder>().addComponents(showPremiumButton, addGameNoPremiumButton);

              await buttonInteraction.update({
                content: "Continuando con el juego pendiente. Elige el siguiente paso:",
                components: [choiceRow]
              });
            } else {
              await buttonInteraction.update({ content: "Error: Juego pendiente no encontrado. Por favor, inicia el comando de nuevo.", components: []});
            }
          }
          else if (customId.startsWith('discard_pending_')) {
            pendingSubmission.delete(userId);
            await buttonInteraction.update({ content: "Juego pendiente descartado. Puedes iniciar el comando `/f95bulk` de nuevo para añadir juegos.", components: []});
          }
          else if (customId.startsWith('continue_session_')) {
            const userSubmissions = activeSubmissions.get(userId) || [];
            const addButton = new ButtonBuilder()
              .setCustomId(`add_another_${commandInvocationId}`)
              .setLabel('Añadir Otro Juego')
              .setStyle(ButtonStyle.Primary);
            const submitButton = new ButtonBuilder()
              .setCustomId(`submit_all_${commandInvocationId}`)
              .setLabel(`Enviar ${userSubmissions.length} Juegos`)
              .setStyle(ButtonStyle.Success);
            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(addButton, submitButton);

            await buttonInteraction.update({
              content: `Continuando sesión con ${userSubmissions.length} juegos. ¿Qué deseas hacer?`,
              components: [actionRow]
            });
          }
          else if (customId.startsWith('new_session_')) {
            activeSubmissions.delete(userId);
            pendingSubmission.delete(userId);
            await buttonInteraction.update({ content: "Sesión anterior eliminada. Iniciando nueva sesión...", components: [] });

            const newInitialModalId = `game_modal_${commandInvocationId}_${Date.now()}`;
            const newModal = await createGameModal(newInitialModalId);
            try {
              await interaction.showModal(newModal);
            } catch (showModalError) {
              console.error("Failed to show modal after 'new_session' update:", showModalError);
              await buttonInteraction.followUp({ content: "Por favor, usa `/f95bulk` de nuevo para empezar.", flags: MessageFlags.Ephemeral});
            }
          }
        }
      } catch (error) {
        const interactionIdentifier = 'customId' in i ? i.customId : 'unknown';
        console.error(`[Bulk Listener Error] User ${userId}, Interaction ID ${interactionIdentifier}:`, error);
        if (i.isRepliable()) {
          try {
            await i.followUp({ content: "Ocurrió un error procesando tu acción.", flags: MessageFlags.Ephemeral }).catch(() => {});
          } catch (e) {
            if (i.isButton() || i.isModalSubmit()) {
              await i.editReply({ content: "Ocurrió un error.", components: []}).catch(() => {});
            }
          }
        }
      }
    };

    interaction.client.on('interactionCreate', interactionListener);
    activeListeners.set(userId, interactionListener);
    console.log(`[Bulk] Registered listener for user ${userId}`);

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
    console.error('[Bulk] Error executing command:', error);
    
    try {
      await interaction.reply({
        content: 'Ocurrió un error al iniciar el comando. Por favor, intenta de nuevo.',
        flags: MessageFlags.Ephemeral
      });
    } catch (replyError) {
      console.error('[Bulk] Error replying to command execution error:', replyError);
    }
  }
}
