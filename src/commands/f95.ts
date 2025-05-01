import { CommandInteraction, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ChannelType, TextChannel, Client } from "discord.js";
import { login, Game, getHandiworkFromURL } from 'f95api'
import { formatLink } from "../utils";
import { config } from "../config";
import { translate } from '@vitalets/google-translate-api';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as sharp from 'sharp';

export const data = new SlashCommandBuilder()
  .setName("f95")
  .setDescription("Obtiene información de un juego de F95Zone")
  .addStringOption(option => 
    option
      .setName("url")
      .setDescription("URL del juego en F95Zone")
      .setRequired(true)
  ).addStringOption(option => 
    option
      .setName("free-pc-mediafire")
      .setDescription("link de descarga free pc mediafire")
      .setRequired(false)
  ).addStringOption(option => 
    option
      .setName("free-pc-pixeldrain")
      .setDescription("link de descarga free pc pixeldrain")
      .setRequired(false)
  ).addStringOption(option => 
    option
      .setName("free-mobile-mediafire")
      .setDescription("link de descarga free mobile mediafire")
      .setRequired(false)
  ).addStringOption(option => 
    option
      .setName("free-mobile-pixeldrain")
      .setDescription("link de descarga free mobile pixeldrain")
      .setRequired(false)
  ).addStringOption(option => 
    option
      .setName("premium-pc-mediafire")
      .setDescription("link de descarga premium pc mediafire")
      .setRequired(false)
  ).addStringOption(option => 
    option
      .setName("premium-pc-pixeldrain")
      .setDescription("link de descarga premium pc pixeldrain")
      .setRequired(false)
  ).addStringOption(option => 
    option
      .setName("premium-mobile-mediafire")
      .setDescription("link de descarga premium mobile mediafire")
      .setRequired(false)
  ).addStringOption(option => 
    option
      .setName("premium-mobile-pixeldrain")
      .setDescription("link de descarga premium mobile pixeldrain")
      .setRequired(false)
  );

async function translateDescription(description: string): Promise<string> {
  try {
    const { text } = await translate(description, { to: 'es' });
    return text;
  } catch (error) {
    console.error('Error al traducir:', error);
  }
  return '';
}

async function downloadImage(url: string, filename: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const debugLog = (message: string) => {
      if (config.DEBUG_MODE) {
        console.log(`[DEBUG] ${message}`);
      }
    };
    
    const debugError = (message: string, error?: any) => {
      if (config.DEBUG_MODE) {
        if (error) {
          console.error(`[DEBUG ERROR] ${message}:`, error);
        } else {
          console.error(`[DEBUG ERROR] ${message}`);
        }
      }
    };
    
    const cacheDir = path.join(process.cwd(), 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    const fileBase = filename.replace(/\.[^/.]+$/, '');
    const filePath = path.join(cacheDir, `${fileBase}.png`);
    const tempPath = path.join(cacheDir, `${fileBase}_temp`);
    
    if (fs.existsSync(filePath)) {
      debugLog(`Imagen ya en caché: ${filePath}`);
      resolve(filePath);
      return;
    }
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    };
    
    debugLog(`Descargando imagen desde: ${url}`);
    
    https.get(url, options, (response) => {
      if (response.statusCode! < 200 || response.statusCode! >= 300) {
        debugError(`Error descargando imagen: Status code ${response.statusCode}`);
        reject(new Error(`Error HTTP: ${response.statusCode}`));
        return;
      }
      
      debugLog(`Respuesta recibida con status code: ${response.statusCode}`);
      
      const fileStream = fs.createWriteStream(tempPath);
      
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        debugLog(`Imagen temporal descargada: ${tempPath}`);
        
        debugLog(`Iniciando conversión a PNG con Sharp...`);
        sharp.default(tempPath)
          .png()
          .toFile(filePath)
          .then(() => {
            fs.unlink(tempPath, (unlinkErr) => {
              if (unlinkErr) debugError(`Error eliminando archivo temporal: ${unlinkErr.message}`);
            });
            
            debugLog(`Imagen convertida a PNG: ${filePath}`);
            resolve(filePath);
          })
          .catch((convErr: Error) => {
            debugError(`Error convirtiendo imagen a PNG: ${convErr.message}`, convErr);
            try {
              debugLog(`Intentando usar archivo temporal sin conversión...`);
              fs.renameSync(tempPath, filePath);
              debugLog(`Archivo temporal renombrado a: ${filePath}`);
              resolve(filePath);
            } catch (renameErr: unknown) {
              const error = renameErr instanceof Error ? renameErr : new Error(String(renameErr));
              debugError(`Error renombrando archivo temporal: ${error.message}`, error);
              reject(convErr);
            }
          });
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(tempPath, () => {});
        debugError(`Error escribiendo archivo: ${err.message}`, err);
        reject(err);
      });
    }).on('error', (err) => {
      debugError(`Error en solicitud HTTP: ${err.message}`, err);
      reject(err);
    });
  });
}

async function uploadImageToDiscord(client: Client, imagePath: string, filename: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const channel = await client.channels.fetch(config.DISCORD_IMAGES_CHANNEL_ID);
      
      if (!channel || channel.type !== ChannelType.GuildText) {
        console.error('Canal de imágenes no encontrado o no es un canal de texto');
        reject(new Error('Canal de imágenes no encontrado'));
        return;
      }
      
      const textChannel = channel as TextChannel;
      
      const pngFilename = filename.endsWith('.png') ? filename : `${filename.replace(/\.[^/.]+$/, '')}.png`;
      
      const attachment = new AttachmentBuilder(imagePath, { 
        name: pngFilename,
        description: "Game cover image (PNG)"
      });
      
      console.log(`Subiendo imagen a canal de Discord: ${config.DISCORD_IMAGES_CHANNEL_ID}`);
      const message = await textChannel.send({ files: [attachment] });
      
      if (message.attachments.size > 0) {
        const imageUrl = message.attachments.first()?.url;
        if (imageUrl) {
          console.log(`Imagen subida exitosamente a Discord. URL: ${imageUrl}`);
          resolve(imageUrl);
          return;
        }
      }
      
      reject(new Error('No se pudo obtener la URL de la imagen subida'));
    } catch (error) {
      console.error('Error al subir imagen a Discord:', error);
      reject(error);
    }
  });
}

async function sendToChannel(interaction: CommandInteraction, channelId: string, gameData: any, imageUrl: string, linkMediafire: string, linkPixeldrain: string, type: string, gameUrl: string): Promise<void> {
  try {
    console.log(`Intentando enviar mensaje a canal ${type} con ID: ${channelId}`);
    console.log(`Enlaces: Mediafire=${linkMediafire}, Pixeldrain=${linkPixeldrain}`);
    
    if (!channelId) {
      console.log(`No se ha configurado el canal para ${type}`);
      return;
    }

    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.error(`Canal ${type} (ID: ${channelId}) no encontrado o no es un canal de texto`);
      return;
    }

    console.log(`Canal ${type} encontrado correctamente: ${channel.id}`);
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
    }
    const translatedTags = gameData.genre
      .filter((tag: string) => translateMap[tag.toLowerCase() as keyof typeof translateMap])
      .map((tag: string) => translateMap[tag.toLowerCase() as keyof typeof translateMap]);
    const translatedDescription = await translateDescription(gameData.overview || gameData.overview || '');
    
    const embed = new EmbedBuilder()
      .setAuthor({
        name: 'HotZone Publisher',
        iconURL: 'https://cdn.discordapp.com/attachments/1143524516156051456/1147920354753704096/logo.png',
        url: 'https://hotzone18.com/'
      })
      .setTitle(gameData.name || 'No hay nombre disponible.')
      .setDescription(`\`\`\`\n${translatedDescription}\n\`\`\``)
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
        },
        {
          name: 'Descargas',
          value: `${formatLink(linkMediafire, 'Mediafire')}\n${formatLink(linkPixeldrain, 'Pixeldrain')}`
        },
        {
          name: 'Instrucciones',
          value: `${f95zoneLink}`
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
    
    console.log(`Enviando embed de ${type} al canal ${channel.id}...`);
    await textChannel.send({ embeds: [embed] });
    console.log(`Embed de ${type} enviado con éxito al canal ${channelId}`);
    
  } catch (error) {
    console.error(`Error al enviar embed de ${type}:`, error);
  }
}

export async function execute(interaction: CommandInteraction): Promise<void> {
  try {
    if (interaction.channel?.id !== config.DISCORD_COMMAND_CHANNEL_ID) {
      await interaction.editReply("Este comando solo puede ser usado en el canal de comandos.");
      return;
    }
    
    await interaction.deferReply();
    
    const url = interaction.options.get("url")?.value as string;
    
    if (!url.includes("f95zone.to")) {
      await interaction.editReply("La URL debe ser de F95Zone.");
      return;
    }

    const freePcMediafire = interaction.options.get("free-pc-mediafire")?.value as string || "";
    const freePcPixeldrain = interaction.options.get("free-pc-pixeldrain")?.value as string || "";
    const freeMobileMediafire = interaction.options.get("free-mobile-mediafire")?.value as string || "";
    const freeMobilePixeldrain = interaction.options.get("free-mobile-pixeldrain")?.value as string || "";
    const premiumPcMediafire = interaction.options.get("premium-pc-mediafire")?.value as string || "";
    const premiumPcPixeldrain = interaction.options.get("premium-pc-pixeldrain")?.value as string || "";
    const premiumMobileMediafire = interaction.options.get("premium-mobile-mediafire")?.value as string || "";
    const premiumMobilePixeldrain = interaction.options.get("premium-mobile-pixeldrain")?.value as string || "";

    console.log("Enlaces proporcionados:");
    console.log(`Free PC - Mediafire: ${freePcMediafire || 'No proporcionado'}`);
    console.log(`Free PC - Pixeldrain: ${freePcPixeldrain || 'No proporcionado'}`);
    console.log(`Free Mobile - Mediafire: ${freeMobileMediafire || 'No proporcionado'}`);
    console.log(`Free Mobile - Pixeldrain: ${freeMobilePixeldrain || 'No proporcionado'}`);
    console.log(`Premium PC - Mediafire: ${premiumPcMediafire || 'No proporcionado'}`);
    console.log(`Premium PC - Pixeldrain: ${premiumPcPixeldrain || 'No proporcionado'}`);
    console.log(`Premium Mobile - Mediafire: ${premiumMobileMediafire || 'No proporcionado'}`);
    console.log(`Premium Mobile - Pixeldrain: ${premiumMobilePixeldrain || 'No proporcionado'}`);

    console.log("Canales configurados:");
    console.log(`Canal Free PC: ${config.DISCORD_FREE_PC_CHANNEL_ID || 'No configurado'}`);
    console.log(`Canal Free Mobile: ${config.DISCORD_FREE_MOBILE_CHANNEL_ID || 'No configurado'}`);
    console.log(`Canal Premium PC: ${config.DISCORD_PREMIUM_PC_CHANNEL_ID || 'No configurado'}`);
    console.log(`Canal Premium Mobile: ${config.DISCORD_PREMIUM_MOBILE_CHANNEL_ID || 'No configurado'}`);

    const checkInteractionValid = async () => {
      try {
        await interaction.editReply("Cargando información del juego...");
        return true;
      } catch (error) {
        if (error instanceof Error && 'code' in error && (error as any).code === 10062) {
          console.log("Interacción expirada, no se puede continuar");
          return false;
        }
        return true;
      }
    };

    try {
      await login(config.F95_LOGIN_USER, config.F95_LOGIN_PASSWORD);

      if (!await checkInteractionValid()) return;
      
      const gameData = await getHandiworkFromURL<Game>(url, Game);
      
      if (!await checkInteractionValid()) return;

      if (!gameData) {
        await interaction.editReply("No se pudo obtener información del juego.");
        return;
      }

      const FALLBACK_IMAGE = 'https://cdn.discordapp.com/attachments/1143524516156051456/1147920354753704096/logo.png';
      
      let coverImageUrl = '';
      let localImagePath = null;
      let discordCdnUrl = null;
      
      if (gameData.cover && typeof gameData.cover === 'string' && gameData.cover.trim()) {
        try {
          let url = gameData.cover.trim();
          
          if (url.startsWith('http:')) {
            url = url.replace('http:', 'https:');
          }
          
          url = url.replace(/\s/g, '%20');
          
          new URL(url);
          
          try {
            const filename = `game_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            const attachmentName = `cover_game.png`;
            
            console.log(`Descargando imagen: ${url}`);
            localImagePath = await downloadImage(url, filename);
            console.log(`Imagen guardada en: ${localImagePath}`);
            
            if (localImagePath) {
              discordCdnUrl = await uploadImageToDiscord(interaction.client, localImagePath, attachmentName);
              console.log(`URL de Discord CDN obtenida: ${discordCdnUrl}`);
              
              if (discordCdnUrl) {
                coverImageUrl = discordCdnUrl;
              } else {
                coverImageUrl = url.includes('.png') ? url : `${url}?format=png`;
              }
            } else {
              coverImageUrl = url.includes('.png') ? url : `${url}?format=png`;
            }
          } catch (uploadError) {
            console.error('Error al subir imagen a Discord:', uploadError);
            coverImageUrl = url.includes('.png') ? url : `${url}?format=png`;
          }
          
        } catch (e) {
          console.error('Error procesando URL de imagen:', e);
          coverImageUrl = FALLBACK_IMAGE;
        }
      } else {
        coverImageUrl = FALLBACK_IMAGE;
      }
      
      console.log('URL de imagen final:', coverImageUrl);

      if (!await checkInteractionValid()) return;

      await interaction.editReply(`Información del juego "${gameData.name}" obtenida correctamente. Enviando a los canales correspondientes...`);

      const tasks = [];
      let channelsCount = 0;

      // Free PC
      if (freePcMediafire && freePcPixeldrain && config.DISCORD_FREE_PC_CHANNEL_ID) {
        console.log("Preparando envío al canal Free PC");
        channelsCount++;
        tasks.push(sendToChannel(
          interaction, 
          config.DISCORD_FREE_PC_CHANNEL_ID, 
          gameData, 
          coverImageUrl, 
          freePcMediafire, 
          freePcPixeldrain, 
          "Versión Gratuita para PC",
          url
        ));
      } else {
        console.log("No se enviará al canal Free PC - Falta algún parámetro");
        if (!freePcMediafire) console.log("Falta enlace Mediafire para Free PC");
        if (!freePcPixeldrain) console.log("Falta enlace Pixeldrain para Free PC");
        if (!config.DISCORD_FREE_PC_CHANNEL_ID) console.log("Falta configuración de canal para Free PC");
      }

      // Free Mobile
      if (freeMobileMediafire && freeMobilePixeldrain && config.DISCORD_FREE_MOBILE_CHANNEL_ID) {
        console.log("Preparando envío al canal Free Mobile");
        channelsCount++;
        tasks.push(sendToChannel(
          interaction, 
          config.DISCORD_FREE_MOBILE_CHANNEL_ID, 
          gameData, 
          coverImageUrl, 
          freeMobileMediafire, 
          freeMobilePixeldrain, 
          "Versión Gratuita para Móvil",
          url
        ));
      } else {
        console.log("No se enviará al canal Free Mobile - Falta algún parámetro");
        if (!freeMobileMediafire) console.log("Falta enlace Mediafire para Free Mobile");
        if (!freeMobilePixeldrain) console.log("Falta enlace Pixeldrain para Free Mobile");
        if (!config.DISCORD_FREE_MOBILE_CHANNEL_ID) console.log("Falta configuración de canal para Free Mobile");
      }

      // Premium PC
      if (premiumPcMediafire && premiumPcPixeldrain && config.DISCORD_PREMIUM_PC_CHANNEL_ID) {
        console.log("Preparando envío al canal Premium PC");
        channelsCount++;
        tasks.push(sendToChannel(
          interaction, 
          config.DISCORD_PREMIUM_PC_CHANNEL_ID, 
          gameData, 
          coverImageUrl, 
          premiumPcMediafire, 
          premiumPcPixeldrain, 
          "Versión Premium para PC",
          url
        ));
      } else {
        console.log("No se enviará al canal Premium PC - Falta algún parámetro");
        if (!premiumPcMediafire) console.log("Falta enlace Mediafire para Premium PC");
        if (!premiumPcPixeldrain) console.log("Falta enlace Pixeldrain para Premium PC");
        if (!config.DISCORD_PREMIUM_PC_CHANNEL_ID) console.log("Falta configuración de canal para Premium PC");
      }

      // Premium Mobile
      if (premiumMobileMediafire && premiumMobilePixeldrain && config.DISCORD_PREMIUM_MOBILE_CHANNEL_ID) {
        console.log("Preparando envío al canal Premium Mobile");
        channelsCount++;
        tasks.push(sendToChannel(
          interaction, 
          config.DISCORD_PREMIUM_MOBILE_CHANNEL_ID, 
          gameData, 
          coverImageUrl, 
          premiumMobileMediafire, 
          premiumMobilePixeldrain, 
          "Versión Premium para Móvil",
          url
        ));
      } else {
        console.log("No se enviará al canal Premium Mobile - Falta algún parámetro");
        if (!premiumMobileMediafire) console.log("Falta enlace Mediafire para Premium Mobile");
        if (!premiumMobilePixeldrain) console.log("Falta enlace Pixeldrain para Premium Mobile");
        if (!config.DISCORD_PREMIUM_MOBILE_CHANNEL_ID) console.log("Falta configuración de canal para Premium Mobile");
      }

      if (config.DISCORD_LOGS_CHANNEL_ID) {
        const logsChannel = interaction.client.channels.cache.get(config.DISCORD_LOGS_CHANNEL_ID) as TextChannel;
        if (logsChannel) {
          logsChannel.send(`El usuario ${interaction.user.username} (ID: ${interaction.user.id}) ha publicado el juego "${gameData.name}" (${gameData.url}).`);
        }
      }

      
      if (channelsCount === 0) {
        await interaction.followUp({
          content: "⚠️ No se enviaron mensajes a ningún canal. Verifica que has proporcionado ambos enlaces (Mediafire y Pixeldrain) para al menos un tipo de descarga y que los canales están configurados.",
          ephemeral: true
        });
      }

      await Promise.all(tasks);
      
      await interaction.followUp({
        content: `✅ Mensajes enviados a ${channelsCount} canales correctamente.\n\nEnlaces proporcionados:\nFree PC - Mediafire: ${freePcMediafire || 'No proporcionado'}\nFree PC - Pixeldrain: ${freePcPixeldrain || 'No proporcionado'}\nFree Mobile - Mediafire: ${freeMobileMediafire || 'No proporcionado'}\nFree Mobile - Pixeldrain: ${freeMobilePixeldrain || 'No proporcionado'}\nPremium PC - Mediafire: ${premiumPcMediafire || 'No proporcionado'}\nPremium PC - Pixeldrain: ${premiumPcPixeldrain || 'No proporcionado'}\nPremium Mobile - Mediafire: ${premiumMobileMediafire || 'No proporcionado'}\nPremium Mobile - Pixeldrain: ${premiumMobilePixeldrain || 'No proporcionado'}\n\nCanales configurados:\nCanal Free PC: ${config.DISCORD_FREE_PC_CHANNEL_ID || 'No configurado'}\nCanal Free Mobile: ${config.DISCORD_FREE_MOBILE_CHANNEL_ID || 'No configurado'}\nCanal Premium PC: ${config.DISCORD_PREMIUM_PC_CHANNEL_ID || 'No configurado'}\nCanal Premium Mobile: ${config.DISCORD_PREMIUM_MOBILE_CHANNEL_ID || 'No configurado'}`,
        ephemeral: false
      });
      
      if (localImagePath) {
        setTimeout(() => {
          try {
            if (localImagePath) {
              fs.unlinkSync(localImagePath);
              console.log(`Archivo temporal eliminado: ${localImagePath}`);
            }
          } catch (cleanupError) {
            console.error(`Error al eliminar archivo temporal: ${cleanupError}`);
          }
        }, 30 * 1000);
      }
      
    } catch (error: any) {
      console.error('Error al obtener datos del juego:', error);
      
      try {
        await interaction.editReply(`Error al obtener información del juego: ${error.message || 'Error desconocido'}`);
      } catch (replyError) {
        if (replyError instanceof Error && 'code' in replyError && (replyError as any).code === 10062) {
          console.log("Interacción expirada, no se puede reportar el error");
        } else {
          console.error('Error al reportar el error original:', replyError);
        }
      }
    }
  } catch (error) {
    console.error('Error al procesar el comando f95:', error);
    
    try {
      await interaction.editReply('Ocurrió un error al procesar el comando.');
    } catch (replyError) {
      if (replyError instanceof Error && 'code' in replyError && (replyError as any).code === 10062) {
        console.log("Interacción expirada, no se puede reportar el error general");
      } else {
        console.error('Error al reportar el error general:', replyError);
      }
    }
  }
}