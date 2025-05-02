import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";
import { commands } from "./commands";
import { deployCommands } from "./deploy-commands";
import { ensureF95Session, cleanupTempFiles } from "./utils/utils";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

let isHealthy = true;
let lastHealthcheckTime = 0;
let lastCommandTime = 0;

async function performHealthcheck(): Promise<boolean> {
  try {
    console.log("Performing system healthcheck...");
    
    if (!client.isReady()) {
      console.error("Healthcheck failed: Discord client not connected");
      return false;
    }
    
    const sessionValid = await ensureF95Session();
    if (!sessionValid) {
      console.error("Healthcheck failed: Unable to establish F95Zone session");
      return false;
    }
    
    cleanupTempFiles();
    
    lastHealthcheckTime = Date.now();
    console.log("Healthcheck passed successfully");
    return true;
  } catch (error) {
    console.error("Error during healthcheck:", error);
    return false;
  }
}

setInterval(async () => {
  const currentTime = Date.now();
  if (currentTime - lastCommandTime > 15 * 60 * 1000) {
    isHealthy = await performHealthcheck();
  }
}, 30 * 60 * 1000);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot listo! Conectado como ${readyClient.user.tag} 🤖`);
  
  isHealthy = await performHealthcheck();
});

client.on(Events.GuildCreate, async (guild) => {
  await deployCommands({ guildId: guild.id });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;
  
  lastCommandTime = Date.now();
  
  const { commandName } = interaction;
  
  if (!isHealthy) {
    console.log("System was unhealthy, performing emergency healthcheck before processing command");
    isHealthy = await performHealthcheck();
    
    if (!isHealthy && interaction.isRepliable()) {
      try {
        await interaction.reply({
          content: "El sistema está experimentando problemas técnicos. Por favor, intenta de nuevo más tarde.",
          ephemeral: true
        });
        return;
      } catch (error) {
        console.error("Failed to reply to command with unhealthy status:", error);
        return;
      }
    }
  }
  
  if (commands[commandName as keyof typeof commands]) {
    try {
      await commands[commandName as keyof typeof commands].execute(interaction);
    } catch (error) {
      console.error(`Error al ejecutar el comando ${commandName}:`, error);
      
      const isExpiredInteraction = error instanceof Error && 
        'code' in error && 
        (error as any).code === 10062;
      
      if (isExpiredInteraction) {
        console.log(`Interacción expirada para el comando ${commandName}, ignorando respuesta.`);
        return;
      }
      
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ 
            content: "Hubo un error al ejecutar este comando!", 
            ephemeral: true 
          });
        } else {
          await interaction.reply({ 
            content: "Hubo un error al ejecutar este comando!", 
            ephemeral: true 
          });
        }
      } catch (replyError) {
        console.error('Error al intentar responder después de un error:', replyError);
      }
      
      isHealthy = await performHealthcheck();
    }
  }
});

client.login(config.DISCORD_TOKEN); 