const { MessageActionRow, MessageButton, MessageEmbed } = require("discord.js");

class TLApplication {
  _initApplicationData() {
    this.applicationData = {
      user_id: this.userId,
      user_name: "",
      status: null,
      current_question: 0,
      current_sample_question: 0,
      started_at: null,
      submitted_at: null,
      reviewed_at: null,
      questions: [],
      sample_post: [],
      thread_id: this.threadId,
    };
  }

  async _saveApplicationData() {
    await this.settings.saveApplication(
      this.applicationData.user_id,
      this.applicationData
    );
  }

  async _resetApplication() {
    this._initApplicationData();
    await this._saveApplicationData();
  }

  async _fetchApplicationData() {
    this.applicationData = await this.settings.fetchApplication(
      this.applicationData.user_id
    );

    if (Object.keys(this.applicationData).length === 0) {
      this._resetApplication();
    }
  }

  async _deleteCurrentApplication() {
    await this.settings.deleteApplication(this.applicationData.user_id);
  }

  async _saveSubmission() {
    if (this.applicationData.thread_id) {
      await this.settings.saveSubmission(
        this.applicationData.thread_id,
        this.applicationData
      );
    }
  }

  async _fetchSubmission(threadId) {
    this.applicationData = await this.settings.fetchSubmission(threadId);
  }

  async _askNextQuestion(type = "application") {
    if (type == "application") {
      const questions = (await this.settings.getQuestions()) || [];
      const index = this.applicationData.current_question;
      if (index < questions.length) {
        const text = `**Question ${index + 1}/${questions.length}:\n\n${
          questions[index]
        }**`;
        await this.client.users.cache
          .get(this.applicationData.user_id)
          .send(text);
      }
    } else {
      const questions = (await this.settings.getSamplePostQuestions()) || [];
      const index = this.applicationData.current_sample_question;
      let text = "";
      if (index < questions.length) {
        if (index == 0) {
          text +=
            "_ _\nYou have answered all application questions. The Sample post questions now follow:\n\n";
        }

        text += `**Question ${index + 1}/${questions.length}:\n\n${
          questions[index]
        }**`;
        await this.client.users.cache
          .get(this.applicationData.user_id)
          .send(text);
      }
    }
  }

  // TODO Refactor
  async _saveAnswer(message) {
    const questions = (await this.settings.getQuestions()) || [];
    const sampleQuestions =
      (await this.settings.getSamplePostQuestions()) || [];

    if (this.applicationData.current_question <= questions.length - 1) {
      let obj = {
        q: questions[this.applicationData.current_question],
        a: message.content,
        answer_id: message.id,
      };
      this.applicationData.questions.push(obj);
      this.applicationData.current_question += 1;
      await this._saveApplicationData();

      if (this.applicationData.current_question < questions.length) {
        this._askNextQuestion("application");
      } else {
        this._askNextQuestion("sample");
      }
    } else if (
      this.applicationData.current_sample_question <=
      sampleQuestions.length - 1
    ) {
      let obj = {
        q: sampleQuestions[this.applicationData.current_sample_question],
        a: message.content,
        answer_id: message.id,
      };
      this.applicationData.sample_post.push(obj);
      this.applicationData.current_sample_question += 1;
      await this._saveApplicationData();

      if (
        this.applicationData.current_sample_question < sampleQuestions.length
      ) {
        this._askNextQuestion("sample");
      } else {
        this._askConfirmation();
      }
    } else {
      this._askConfirmation();
    }
  }

  // TODO Refactor
  async _editAnswer(oldMessage, newMessage) {
    // Search for replies to application questions first.
    let matches = this.applicationData.questions.filter(
      (x) => x.answer_id === oldMessage.id
    );
    if (matches.length !== 0) {
      const obj = matches[0];
      const index = this.applicationData.questions.indexOf(obj);

      if (obj) {
        obj.a = newMessage.content;
        obj.answer_id = newMessage.id;

        this.applicationData.questions[index] = obj;
      }
      await this._saveApplicationData();
      await this._saveSubmission();

      // serach for replies to sample post questions.
    } else {
      matches = this.applicationData.sample_post.filter(
        (x) => x.answer_id === oldMessage.id
      );

      if (matches.length !== 0) {
        const obj = matches[0];
        const index = this.applicationData.sample_post.indexOf(obj);

        if (obj) {
          obj.a = newMessage.content;
          obj.answer_id = newMessage.id;

          this.applicationData.sample_post[index] = obj;
        }
        await this._saveApplicationData();
        await this._saveSubmission();
      }
    }
  }

  async _askConfirmation() {
    const row = new MessageActionRow().addComponents(
      new MessageButton()
        .setCustomId("submit_application")
        .setLabel("Submit application!")
        .setStyle("SUCCESS")
    );

    const payload = {
      content: await this.settings.getMessage("confirm_submission"),
      components: [row],
    };

    this.applicationData.status = "confirmation";
    await this._saveApplicationData();

    await this.client.users.cache
      .get(this.applicationData.user_id)
      .send(payload);
  }

  async _sendSubmissionSuccess() {
    const msg = await this.settings.getMessage("submitted");
    await this.client.users.cache.get(this.applicationData.user_id).send(msg);
  }

  async _submitClarification(message) {
    const thread = await this.client.channels.fetch(
      this.applicationData.thread_id
    );
    await thread.send(`**Applicant's Response:**\n\n${message.content}`);
  }

  constructor(args) {
    if (!args.userId && !args.threadId) {
      throw new Error("A Discord userId or threadId needs to be provided");
    }

    if (!args.client) {
      throw new Error("A Discordjs Client needs to be provided");
    }

    this.client = args.client;
    this.settings = args.settings;
    this.userId = args.userId;
    this.threadId = args.threadId;

    this._initApplicationData();
  }

  async hasExistingSubmission() {
    await this._fetchApplicationData();
    return this.applicationData.status === "applied";
  }

  async welcome() {
    const row = new MessageActionRow()
      .addComponents(
        new MessageButton()
          .setCustomId("start_application")
          .setLabel("Get Started!")
          .setStyle("SUCCESS")
      )
      .addComponents(
        new MessageButton()
          .setCustomId("cancel_application")
          .setLabel("Cancel")
          .setStyle("DANGER")
      );

    const questionsEmbed = new MessageEmbed()
      .setColor("#0099ff")
      .setTitle("Application Questions")
      .setDescription("");

    const sampleEmbed = new MessageEmbed()
      .setColor("#00ff99")
      .setTitle("Weekly Post Sample Questions")
      .setDescription("");

    // TODO Refactor
    const questions = await this.settings.getQuestions();
    for (let i = 0; i < questions.length; i++) {
      questionsEmbed.addFields({
        name: `${i + 1}. ${questions[i]}`,
        value: "\u200b",
      });
    }

    const sampleQuestions = await this.settings.getSamplePostQuestions();
    for (let i = 0; i < sampleQuestions.length; i++) {
      sampleEmbed.addFields({
        name: `${i + 1}. ${sampleQuestions[i]}`,
        value: "\u200b",
      });
    }
    // TODO end Refactor

    const payload = {
      content: `${await this.settings.getMessage("welcome")}_ _\n\n`,
      embeds: [questionsEmbed, sampleEmbed],
      components: [row],
    };

    await this.client.users.cache.get(this.userId).send(payload);
  }

  async start() {
    this._resetApplication();
    this.applicationData.status = "new";
    await this._saveApplicationData();
    await this._askNextQuestion();
  }

  async submit(user) {
    await this._fetchApplicationData();

    const channelId = await this.settings.getChannelId();
    const channel = await this.client.channels.fetch(channelId);

    if (channel) {
      const thread = await channel.threads.create({
        name: `${user.username} application`,
        reason: "TL Application",
      });

      const buttons = new MessageActionRow()
        .addComponents(
          new MessageButton()
            .setCustomId("approve_application")
            .setLabel("Approve")
            .setStyle("SUCCESS")
        )
        .addComponents(
          new MessageButton()
            .setCustomId("decline_application")
            .setLabel("Decline")
            .setStyle("DANGER")
        );

      const member = await channel.guild.members.fetch(
        this.applicationData.user_id
      );

      const roleId = await this.settings.getRoleId();
      let roleNotifyText = "";

      if (roleId) {
        roleNotifyText = `<@&${roleId}>`;
      }

      const header = {
        content: `**Applicant:** <@${this.applicationData.user_id}>\n**Discord Joined At:** ${user.createdAt}\n**PC Joined At:** ${member.joinedAt}\n\n${roleNotifyText}`,
        components: [buttons],
      };

      await thread.send(header);

      // TODO Refactor
      for (let i = 0; i < this.applicationData.questions.length; i++) {
        const q = this.applicationData.questions[i];
        await thread.send(`_ _\n**${i + 1}. ${q.q}**`);
        await thread.send(q.a);
      }

      for (let i = 0; i < this.applicationData.sample_post.length; i++) {
        const q = this.applicationData.sample_post[i];
        await thread.send(`_ _\n**${i + 1}. ${q.q}**`);
        await thread.send(q.a);
      }
      // TODO end Refactor

      this.applicationData.user_name = user.username;
      this.applicationData.status = "applied";
      this.applicationData.thread_id = thread.id;

      await this._saveApplicationData();
      await this._saveSubmission();
    } else {
      throw new Error("No Channel found to post application to.");
    }
  }

  async cancel(interaction) {
    const msg = await this.settings.getMessage("canceled");
    await this._deleteCurrentApplication();
    interaction.editReply(msg);
  }

  async approve(interaction) {
    await this._fetchSubmission(interaction.channelId);

    if (Object.keys(this.applicationData).length === 0) {
      interaction.reply({
        content: "An error occurred: Application not found!",
      });
      return;
    } else {
      const thread = await this.client.channels.fetch(interaction.channelId);
      await thread.setName(
        `${this.applicationData.user_name} application - ✅`
      );

      this.applicationData.status = "approved";
      this.applicationData.processedAt = new Date();

      interaction.editReply(
        `✅ Application approved by <@${interaction.user.id}>.`
      );

      const msg = await this.settings.getMessage("approved");
      const user = await this.client.users.fetch(this.applicationData.user_id);
      if (user) {
        user.send(msg);
      }

      await this._saveSubmission();
      await this._deleteCurrentApplication();
    }
  }

  async decline(interaction) {
    await this._fetchSubmission(interaction.channelId);

    if (Object.keys(this.applicationData).length === 0) {
      interaction.reply({
        content: "An error occurred: Application not found!",
      });
      return;
    } else {
      const thread = await this.client.channels.fetch(interaction.channelId);

      await thread.setName(
        `${this.applicationData.user_name} application - ⛔`
      );

      this.applicationData.status = "declined";
      this.applicationData.processedAt = new Date();

      interaction.editReply(
        `⛔ Application declined by <@${interaction.user.id}>.`
      );

      const msg = await this.settings.getMessage("declined");
      const user = await this.client.users.fetch(this.applicationData.user_id);
      if (user) {
        user.send(msg);
      }

      await this._saveSubmission();
      await this._deleteCurrentApplication();
    }
  }

  async onUserMessage(message) {
    await this._fetchApplicationData();

    if (this.applicationData.status === "applied") {
      await this._submitClarification(message);
    } else if (this.applicationData.status === "new") {
      await this._saveAnswer(message);
    }
  }

  async onUserMessageUpdate(oldMessage, newMessage) {
    await this._fetchApplicationData();

    if (this.applicationData.status === "new") {
      await this._editAnswer(oldMessage, newMessage);
    }
  }

  async onThreadMessage(message) {
    await this._fetchSubmission(message.channelId);
    const user = await this.client.users.fetch(this.applicationData.user_id);

    if (user) {
      user.send(message.content);
    }
  }
}

module.exports = TLApplication;
module.exports.TLApplication = TLApplication;
module.exports.default = TLApplication;
