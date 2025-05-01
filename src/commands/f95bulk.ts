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
  ComponentType,
  Client,
  ChannelType,
  EmbedBuilder,
  TextChannel
} from "discord.js";
import { login, Game, getHandiworkFromURL } from 'f95api';
import { config } from "../config";
import { formatLink, downloadImage, uploadImageToDiscord } from "../utils";
import { sendGameEmbed } from "./f95";
import * as fs from 'fs';
import * as path from 'path';

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

export const data = new SlashCommandBuilder()
  .setName("f95bulk")
  .setDescription("Publicar múltiples juegos de F95Zone en lote");

async function createGameModal(customId: string): Promise<ModalBuilder> {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Añadir juego de F95Zone');

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
    .setTitle('Añadir enlaces premium');

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

async function handleModalSubmit(interaction: ModalSubmitInteraction, userId: string): Promise<GameSubmission | null> {
  const customId = interaction.customId;
  
  if (customId.startsWith('game_modal_')) {
    const url = interaction.fields.getTextInputValue('url');
    
    if (!url.includes("f95zone.to")) {
      try {
        await interaction.reply({ content: "La URL debe ser de F95Zone.", ephemeral: true });
      } catch (error) {
        console.error("Error al responder a interacción: URL inválida", error);
      }
      return null;
    }
    
    const tempGame: Partial<GameSubmission> = {
      url,
      freePcMediafire: interaction.fields.getTextInputValue('free-pc-mediafire'),
      freePcPixeldrain: interaction.fields.getTextInputValue('free-pc-pixeldrain'),
      freeMobileMediafire: interaction.fields.getTextInputValue('free-mobile-mediafire'),
      freeMobilePixeldrain: interaction.fields.getTextInputValue('free-mobile-pixeldrain'),
    };
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const premiumModalId = `premium_modal_${Date.now()}`;
      
      const showPremiumButton = new ButtonBuilder()
        .setCustomId(`show_premium_modal_${premiumModalId}`)
        .setLabel('Añadir Enlaces Premium')
        .setStyle(ButtonStyle.Primary);
        
      const premiumRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(showPremiumButton);
        
      await interaction.followUp({
        content: "Información inicial guardada. Haz clic en el botón para continuar:",
        components: [premiumRow],
        ephemeral: true
      });
    } catch (error) {
      console.error("Error al responder a interacción del modal inicial:", error);
    }
    
    if (!activeSubmissions.has(userId)) {
      activeSubmissions.set(userId, []);
    }
    
    return { ...tempGame } as GameSubmission;
  }
  
  else if (customId.startsWith('premium_modal_')) {
    const userSubmissions = activeSubmissions.get(userId) || [];
    const lastSubmission = userSubmissions[userSubmissions.length - 1];
    
    if (!lastSubmission) {
      try {
        await interaction.reply({ content: "Error: No se encontró una submisión previa de juego.", ephemeral: true });
      } catch (error) {
        console.error("Error al responder a interacción: No se encontró submisión previa", error);
      }
      return null;
    }
    
    lastSubmission.premiumPcMediafire = interaction.fields.getTextInputValue('premium-pc-mediafire');
    lastSubmission.premiumPcPixeldrain = interaction.fields.getTextInputValue('premium-pc-pixeldrain');
    lastSubmission.premiumMobileMediafire = interaction.fields.getTextInputValue('premium-mobile-mediafire');
    lastSubmission.premiumMobilePixeldrain = interaction.fields.getTextInputValue('premium-mobile-pixeldrain');
    
    const addButton = new ButtonBuilder()
      .setCustomId(`add_another_${Date.now()}`)
      .setLabel('Añadir Otro Juego')
      .setStyle(ButtonStyle.Primary);
      
    const submitButton = new ButtonBuilder()
      .setCustomId(`submit_all_${Date.now()}`)
      .setLabel('Enviar Todos los Juegos')
      .setStyle(ButtonStyle.Success);
    
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(addButton, submitButton);
    
    try {
      await interaction.reply({ 
        content: `Juego añadido correctamente. Total de juegos en lote: ${userSubmissions.length}`, 
        components: [row],
        ephemeral: true 
      });
    } catch (error) {
      console.error("Error al responder a interacción del modal premium:", error);
      
      try {
        await interaction.followUp({
          content: `Juego añadido correctamente. Total de juegos en lote: ${userSubmissions.length}`,
          components: [row],
          ephemeral: true
        });
      } catch (followUpError) {
        console.error("Error al hacer followUp en interacción:", followUpError);
      }
    }
    
    return lastSubmission;
  }
  
  return null;
}

async function processGameSubmissions(client: Client, userId: string, interaction: CommandInteraction): Promise<void> {
  const submissions = activeSubmissions.get(userId);
  
  if (!submissions || submissions.length === 0) {
    await interaction.followUp({
      content: "No hay juegos para procesar.",
      ephemeral: true
    });
    return;
  }
  
  await interaction.followUp({
    content: `Procesando ${submissions.length} juegos...`,
    ephemeral: true
  });
  
  let localImagePaths: string[] = [];
  
  try {
    await login(config.F95_LOGIN_USER, config.F95_LOGIN_PASSWORD);
    
    const results: ResultItem[] = [];
    
    for (const submission of submissions) {
      let gameName = submission.url;
      try {
        const mockInteraction = {
          ...interaction,
          client: client,
          channel: interaction.channel,
          user: interaction.user,
          guild: interaction.guild,
          options: {
            get: (name: string) => {
              const valueMap: Record<string, string> = {
                'url': submission.url,
                'free-pc-mediafire': submission.freePcMediafire,
                'free-pc-pixeldrain': submission.freePcPixeldrain,
                'free-mobile-mediafire': submission.freeMobileMediafire,
                'free-mobile-pixeldrain': submission.freeMobilePixeldrain,
                'premium-pc-mediafire': submission.premiumPcMediafire,
                'premium-pc-pixeldrain': submission.premiumPcPixeldrain,
                'premium-mobile-mediafire': submission.premiumMobileMediafire,
                'premium-mobile-pixeldrain': submission.premiumMobilePixeldrain
              };
              
              return valueMap[name] ? { value: valueMap[name] } : null;
            }
          },
          deferReply: async () => {
            console.log(`Procesando juego: ${submission.url}`);
            return Promise.resolve();
          },
          editReply: async (message: any) => {
            console.log(`Actualización para ${submission.url}:`, 
              typeof message === 'string' ? message : message.content || 'Sin contenido');
            return Promise.resolve();
          },
          followUp: async (message: any) => {
            console.log(`Seguimiento para ${submission.url}:`, 
              typeof message === 'string' ? message : message.content || 'Sin contenido');
            return Promise.resolve();
          }
        };

        try {
          console.log(`Obteniendo datos para juego: ${submission.url}`);
          
          const gameData = await getHandiworkFromURL<Game>(submission.url, Game);
          
          if (!gameData) {
            console.error(`No se pudo obtener información del juego: ${submission.url}`);
            results.push({ 
              ...submission,
              name: gameName, 
              success: false, 
              error: "No se pudo obtener información del juego" 
            });
            continue;
          }
          
          gameName = gameData.name || submission.url;
          console.log(`Juego obtenido: ${gameName}`);
          
          const FALLBACK_IMAGE = 'https://cdn.discordapp.com/attachments/1143524516156051456/1147920354753704096/logo.png';
          let coverImageUrl = FALLBACK_IMAGE;
          let localImagePath: string | null = null;
          
          if (gameData.cover && typeof gameData.cover === 'string' && gameData.cover.trim()) {
            try {
              const originalUrl = gameData.cover.trim();
              const filename = `bulk_game_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
              const attachmentName = `cover_game_${gameName.replace(/[^a-zA-Z0-9]/g, '') || 'game'}.png`;
              
              console.log(`[Bulk] Descargando imagen para ${gameName}: ${originalUrl}`);
              localImagePath = await downloadImage(originalUrl, filename);
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
          
          if (submission.freePcMediafire && submission.freePcPixeldrain && config.DISCORD_FREE_PC_CHANNEL_ID) {
            console.log("Enviando al canal Free PC");
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
          
          if (submission.freeMobileMediafire && submission.freeMobilePixeldrain && config.DISCORD_FREE_MOBILE_CHANNEL_ID) {
            console.log("Enviando al canal Free Mobile");
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
          
          if (submission.premiumPcMediafire && submission.premiumPcPixeldrain && config.DISCORD_PREMIUM_PC_CHANNEL_ID) {
            console.log("Enviando al canal Premium PC");
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
          
          if (submission.premiumMobileMediafire && submission.premiumMobilePixeldrain && config.DISCORD_PREMIUM_MOBILE_CHANNEL_ID) {
            console.log("Enviando al canal Premium Mobile");
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
          
          if (config.DISCORD_LOGS_CHANNEL_ID) {
            
          }
          
          results.push({ 
            ...submission,
            name: gameName, 
            success: true 
          });
        } catch (error) {
          console.error(`Error procesando juego ${submission.url}:`, error);
          results.push({ 
            ...submission,
            name: gameName,
            success: false, 
            error: (error as Error).message 
          });
        }
      } catch (error) { 
        console.error(`Error processing game ${submission.url}:`, error);
        results.push({ 
          ...submission,
          name: gameName,
          success: false, 
          error: (error as Error).message 
        });
      }
    }
    
    
    const successCount = results.filter(r => r.success).length;
    const failedCount = submissions.length - successCount;
    let userResultsMessage = `**Resumen del Lote**\n✅ Juegos procesados con éxito: ${successCount}\n❌ Juegos con errores: ${failedCount}\n\n`;

    if (successCount > 0) {
      userResultsMessage += "**Juegos Publicados Correctamente:**\n";
      results.filter(r => r.success)
        .forEach(r => userResultsMessage += `- ${r.name} (${r.url})\n`);
      userResultsMessage += "\n";
    }
    
    if (failedCount > 0) {
      userResultsMessage += "**Errores Encontrados:**\n";
      results.filter(r => !r.success)
        .forEach(r => userResultsMessage += `- ${r.name || r.url}: ${r.error || 'Error desconocido'}\n`);
    }
    
    activeSubmissions.delete(userId);
    
    if (userResultsMessage.length > 4000) { 
        userResultsMessage = userResultsMessage.substring(0, 4000) + "... (mensaje truncado)";
    }

    await interaction.followUp({
      content: userResultsMessage,
      ephemeral: false
    });

    
    if (config.DISCORD_LOGS_CHANNEL_ID) {
      let logMessage = `**Resumen del Lote Procesado por ${interaction.user.username} (ID: ${interaction.user.id})**\n✅ Juegos procesados con éxito: ${successCount}\n❌ Juegos con errores: ${failedCount}\n\n`;

      if (successCount > 0) {
        logMessage += "**Juegos Publicados Correctamente (con enlaces):**\n";
        results.filter(r => r.success).forEach(r => {
          logMessage += `**- ${r.name}** (${r.url})\n`;
          if (r.freePcMediafire || r.freePcPixeldrain) {
             logMessage += `  Free PC: ${formatLink(r.freePcMediafire, 'Mediafire')} ${formatLink(r.freePcPixeldrain, 'Pixeldrain')}\n`;
          }
          if (r.freeMobileMediafire || r.freeMobilePixeldrain) {
             logMessage += `  Free Mobile: ${formatLink(r.freeMobileMediafire, 'Mediafire')} ${formatLink(r.freeMobilePixeldrain, 'Pixeldrain')}\n`;
          }
           if (r.premiumPcMediafire || r.premiumPcPixeldrain) {
             logMessage += `  Premium PC: ${formatLink(r.premiumPcMediafire, 'Mediafire')} ${formatLink(r.premiumPcPixeldrain, 'Pixeldrain')}\n`;
          }
          if (r.premiumMobileMediafire || r.premiumMobilePixeldrain) {
             logMessage += `  Premium Mobile: ${formatLink(r.premiumMobileMediafire, 'Mediafire')} ${formatLink(r.premiumMobilePixeldrain, 'Pixeldrain')}\n`;
          }
          logMessage += "\n"; 
        });
      }

      if (failedCount > 0) {
        logMessage += "**Errores Encontrados:**\n";
        results.filter(r => !r.success)
          .forEach(r => logMessage += `- ${r.name || r.url}: ${r.error || 'Error desconocido'}\n`);
      }

      try {
        const logsChannel = await client.channels.fetch(config.DISCORD_LOGS_CHANNEL_ID);
        if (logsChannel && logsChannel.type === ChannelType.GuildText) {
           
           const chunks = [];
           for (let i = 0; i < logMessage.length; i += 1950) {
               chunks.push(logMessage.substring(i, i + 1950));
           }
           for (const chunk of chunks) {
               await (logsChannel as TextChannel).send(chunk);
           }
        } else {
           console.error("Canal de logs no encontrado o no es de texto.");
        }
      } catch (error) {
        console.error("Error al enviar log detallado:", error);
      }
    }
    
  } catch (error) {
    console.error('Error processing bulk submissions:', error);
    await interaction.followUp({
      content: `Error al procesar lote de juegos: ${(error as Error).message}`,
      ephemeral: true
    });
  } finally {
    if (localImagePaths.length > 0) {
      console.log(`[Bulk] Limpiando ${localImagePaths.length} imágenes cacheadas...`);
      setTimeout(() => {
        localImagePaths.forEach(imgPath => {
          try {
            if (fs.existsSync(imgPath)) {
              fs.unlinkSync(imgPath);
              console.log(`[Bulk] Imagen eliminada: ${imgPath}`);
            }
          } catch (cleanupError) {
            console.error(`[Bulk] Error al eliminar imagen cacheada ${imgPath}:`, cleanupError);
          }
        });
      }, 10 * 1000);
    }
  }
}

async function sendGameToChannel(
  client: Client,
  channelId: string, 
  gameData: Game, 
  linkMediafire: string, 
  linkPixeldrain: string, 
  type: string, 
  gameUrl: string,
  imageUrl: string
): Promise<void> {
  try {
    console.log(`Intentando enviar mensaje a canal ${type} con ID: ${channelId}`);
    
    await sendGameEmbed(
      client,
      channelId,
      gameData,
      linkMediafire,
      linkPixeldrain,
      type,
      gameUrl,
      imageUrl
    );
    
  } catch (error) {
    console.error(`Error al enviar embed de ${type}:`, error);
  }
}

export async function execute(interaction: CommandInteraction): Promise<void> {
  try {
    if (interaction.channel?.id !== config.DISCORD_COMMAND_CHANNEL_ID) {
      await interaction.reply({ content: "Este comando solo puede ser usado en el canal de comandos.", ephemeral: true });
      return;
    }
    
    const userId = interaction.user.id;
    
    if (activeSubmissions.has(userId) && activeSubmissions.get(userId)!.length > 0) {
      const continueButton = new ButtonBuilder()
        .setCustomId(`continue_session_${Date.now()}`)
        .setLabel(`Continuar Sesión (${activeSubmissions.get(userId)!.length} juegos)`)
        .setStyle(ButtonStyle.Primary);
        
      const newButton = new ButtonBuilder()
        .setCustomId(`new_session_${Date.now()}`)
        .setLabel('Iniciar Nueva Sesión')
        .setStyle(ButtonStyle.Secondary);
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(continueButton, newButton);
      
      const response = await interaction.reply({
        content: "Ya tienes una sesión de envío de juegos activa. ¿Qué deseas hacer?",
        components: [row],
        ephemeral: true
      });
      
      try {
        const confirmation = await response.awaitMessageComponent({ 
          filter: i => i.user.id === userId, 
          time: 60_000,
          componentType: ComponentType.Button
        });
        
        if (confirmation.customId.startsWith('new_session_')) {
          activeSubmissions.delete(userId);
          await confirmation.update({ 
            content: "Iniciando nueva sesión de envío de juegos.", 
            components: [] 
          });
        } else {
          await confirmation.update({ 
            content: `Continuando sesión con ${activeSubmissions.get(userId)!.length} juegos.`, 
            components: [] 
          });
          
          const addButton = new ButtonBuilder()
            .setCustomId(`add_another_${Date.now()}`)
            .setLabel('Añadir Otro Juego')
            .setStyle(ButtonStyle.Primary);
            
          const submitButton = new ButtonBuilder()
            .setCustomId(`submit_all_${Date.now()}`)
            .setLabel('Enviar Todos los Juegos')
            .setStyle(ButtonStyle.Success);
          
          const actionRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(addButton, submitButton);
          
          await confirmation.followUp({
            content: `¿Qué deseas hacer con tu lote de ${activeSubmissions.get(userId)!.length} juegos?`,
            components: [actionRow],
            ephemeral: true
          });
          
          return;
        }
      } catch (e) {
        await interaction.editReply({
          content: "Tiempo de espera agotado. Por favor, inicia el comando nuevamente.",
          components: []
        });
        return;
      }
    }
    
    if (!activeSubmissions.has(userId)) {
      activeSubmissions.set(userId, []);
    }
    
    const modalId = `game_modal_${Date.now()}`;
    const modal = await createGameModal(modalId);
    await interaction.showModal(modal);
    
    const collector = interaction.channel!.createMessageComponentCollector({
      filter: i => i.user.id === userId,
      time: 3600_000 
    });
    
    collector.on('collect', async i => {
      if (i.customId.startsWith('add_another_')) {
        const newModalId = `game_modal_${Date.now()}`;
        const gameModal = await createGameModal(newModalId);
        await i.showModal(gameModal);
      }
      else if (i.customId.startsWith('submit_all_')) {
        await i.update({ content: "Preparando para procesar todos los juegos...", components: [] });
        await processGameSubmissions(interaction.client, userId, interaction);
        collector.stop();
      }
    });
    
    collector.on('end', () => {
      setTimeout(() => {
        if (activeSubmissions.has(userId)) {
          activeSubmissions.delete(userId);
        }
      }, 10_000);
    });
    
    const modalSubmitCollector = interaction.client.on('interactionCreate', async (modalInteraction) => {
      if (!modalInteraction.isModalSubmit()) return;
      if (modalInteraction.user.id !== userId) return;
      
      try {
        if (modalInteraction.customId.startsWith('game_modal_')) {
          const gameSubmission = await handleModalSubmit(modalInteraction as ModalSubmitInteraction, userId);
          if (gameSubmission) {
            const userSubmissions = activeSubmissions.get(userId) || [];
            userSubmissions.push(gameSubmission);
            activeSubmissions.set(userId, userSubmissions);
          }
        } 
        else if (modalInteraction.customId.startsWith('premium_modal_')) {
          await handleModalSubmit(modalInteraction as ModalSubmitInteraction, userId);
        }
      } catch (error) {
        console.error("Error al procesar interacción de modal:", error);
      }
    });
    
    const premiumButtonCollector = interaction.client.on('interactionCreate', async (buttonInteraction) => {
      if (!buttonInteraction.isButton()) return;
      if (buttonInteraction.user.id !== userId) return;
      
      try {
        if (buttonInteraction.customId.startsWith('show_premium_modal_')) {
          const modalId = buttonInteraction.customId.replace('show_premium_modal_', '');
          const premiumModal = await createPremiumGameModal(modalId);
          
          await buttonInteraction.showModal(premiumModal);
        }
      } catch (error) {
        console.error("Error al mostrar modal premium:", error);
      }
    });
    
  } catch (error) {
    console.error('Error executing f95bulk command:', error);
    try {
        await interaction.reply({ 
          content: `Error al ejecutar el comando: ${(error as Error).message}`, 
          ephemeral: true 
        });
    } catch (replyError) {
        console.error("Error al intentar responder con error:", replyError);
        await interaction.followUp({ 
            content: `Error al ejecutar el comando: ${(error as Error).message}`, 
            ephemeral: true 
        }).catch(followUpError => console.error("Error al intentar hacer followUp con error:", followUpError));
    }
  }
}
