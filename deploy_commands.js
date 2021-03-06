#!/usr/bin/env node

const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();

const { Client, Intents } = require("discord.js");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");

const intents = new Intents();
intents.add(
  Intents.FLAGS.DIRECT_MESSAGES,
  Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
  Intents.FLAGS.GUILD_MESSAGES,
  Intents.FLAGS.GUILD_MESSAGE_REACTIONS
);

const client = new Client({ intents: intents });

// Collect all commands in `commands/`
const commands = [];
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "9" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  client.once("ready", async () => {
    console.log("Removing old commands...");
    const oldCommands = await rest.get(
      Routes.applicationCommands(client.user.id)
    );

    for (const command of oldCommands) {
      const deleteUrl = `${Routes.applicationCommands(client.user.id)}/${
        command.id
      }`;
      console.log(command.id, command.name);
      await rest.delete(deleteUrl);
    }

    console.log("Ready! Registering Commands...");

    // Register collected commands
    try {
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: commands,
      });

      console.log("Successfully registered application commands.");

      if (process.env.GUILD_ID && process.env.ROLE_ID) {
        console.log("Setting command permissions.");

        const registeredCommands = await rest.get(
          Routes.applicationCommands(client.user.id)
        );
        let permissions = [];
        for (const command of registeredCommands) {
          if (command.name !== "apply") {
            permissions.push({
              id: command.id,
              permissions: [
                {
                  id: process.env.ROLE_ID,
                  type: "ROLE",
                  permission: true,
                },
              ],
            });
          }
        }

        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        await guild.commands.permissions.set({ fullPermissions: permissions });
      } else {
        console.warn(
          "GUILD_ID and/or ROLE_ID env vars not found. Skipping Command permissions!"
        );
      }

      console.log("All done!");
    } catch (e) {
      console.error(e);
    }

    // Close Connection
    setTimeout(() => {
      client.destroy();
    }, 500);
  });

  if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN);
  } else {
    throw new Error("DISCORD_TOKEN environment variable not found");
  }
})();
