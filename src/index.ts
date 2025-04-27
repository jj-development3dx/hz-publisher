import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";
import { commands } from "./commands";
import { deployCommands } from "./deploy-commands";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot listo! Conectado como ${readyClient.user.tag} 🤖`);
});

client.on(Events.GuildCreate, async (guild) => {
  await deployCommands({ guildId: guild.id });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;
  
  const { commandName } = interaction;
  
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
    }
  }
});

client.login(config.DISCORD_TOKEN); 