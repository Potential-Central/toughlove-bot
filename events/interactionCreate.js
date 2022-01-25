const fs = require("fs");
const path = require("path");
const __parentDir = path.dirname(process.mainModule.filename);
const { Collection } = require("discord.js");
const Bugsnag = require("@bugsnag/js");

const commands = new Collection();
const commandFiles = fs
  .readdirSync(__parentDir + "/commands")
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(__parentDir, "commands", file));
  // Set a new item in the Collection
  // With the key as the command name and the value as the exported module
  commands.set(command.data.name, command);
}

const buttons = new Collection();
const buttonFiles = fs
  .readdirSync(__parentDir + "/buttons")
  .filter((file) => file.endsWith(".js"));

for (const file of buttonFiles) {
  const button = require(path.join(__parentDir, "buttons", file));
  // Set a new item in the Collection
  // With the key as the button name and the value as the exported module
  buttons.set(button.data.name, button);
}

module.exports = {
  name: "interactionCreate",
  async execute(settings, interaction) {
    if (interaction.isCommand()) {
      const command = commands.get(interaction.commandName);

      if (!command) return;

      try {
        await command.execute(settings, interaction);
      } catch (error) {
        console.error(error);

        if (process.env.BUGSNAG_API_KEY) {
          Bugsnag.notify(error);
        }
      }

      console.log(
        `${interaction.user.tag} triggered  /${interaction.commandName}`
      );
    } else if (interaction.isButton()) {
      const button = buttons.get(interaction.customId);

      if (!button) return;

      try {
        await button.execute(settings, interaction);
      } catch (error) {
        console.error(error);

        if (process.env.BUGSNAG_API_KEY) {
          Bugsnag.notify(error);
        }

      }

      console.log(`${interaction.user.tag} pressed #${interaction.customId}`);
    }
  },
};
