require('libsodium-wrappers').ready.then(async () => {
    const { Client, GatewayIntentBits, Partials } = require('discord.js');
    const config = require('./config');
    const messages = require('./messages');
    const player = require('./player');
    const { handleCommand } = require('./commands');

    if (!config.token) {
        console.error('ERROR: DISCORD_TOKEN غير موجود في متغيرات البيئة');
        console.error('سو ملف .env وضع فيه: DISCORD_TOKEN=التوكن_هنا');
        process.exit(1);
    }

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMembers
        ],
        partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
    });

    let notifyChannel = null;

    function sendMessage(key, vars = {}) {
        if (!notifyChannel) return;
        let s = messages[key] || key;
        for (const k in vars) {
            s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
        }
        notifyChannel.send(s).catch(() => {});
    }

    player.setMessageSender(sendMessage);

    function buildEmbed(content, extraFooter = false) {
        const embed = {
            description: content,
            color: 0x5865F2,
            image: { url: config.embedImage }
        };

        if (extraFooter) {
            embed.footer = { text: config.signature };
        }

        return embed;
    }

    function sendReply(content, asEmbed, type) {
        if (!notifyChannel) return;

        if (asEmbed && type === 'helpEmbed') {
            return notifyChannel.send({ embeds: [buildEmbed(content, true)] }).catch(() => {});
        }

        if (asEmbed && type === 'queueEmbed') {
            return notifyChannel.send({ embeds: [buildEmbed(content, false)] }).catch(() => {});
        }

        return notifyChannel.send(content).catch(() => {});
    }

    client.on('ready', () => {
        console.log(`Logged in as ${client.user.tag}`);
    });

    client.on('messageCreate', async (message) => {
        try {
            if (message.author.bot) return;
            if (!message.guild || message.guild.id !== config.guildId) return;
            if (!message.content.startsWith(config.prefix)) return;

            notifyChannel = message.channel;
            await handleCommand(message, message.content, sendReply);
        } catch (e) {
            console.error('Command error:', e);
            if (notifyChannel) {
                notifyChannel.send(messages.errorOccurred).catch(() => {});
            }
        }
    });

    client.on('voiceStateUpdate', async (oldState, newState) => {
        try {
            const guild = client.guilds.cache.get(config.guildId);
            if (!guild) return;

            const targetChannel = guild.channels.cache.get(config.voiceChannelId);
            if (!targetChannel) return;

            const st = player.getState();
            const me = guild.members.me;
            const myChannel = me?.voice?.channel;

            if (myChannel && myChannel.id === config.voiceChannelId) {
                const humansWithMe = myChannel.members.filter(
                    m => !m.user.bot && m.id !== client.user.id
                ).size;

                if (humansWithMe === 0) {
                    player.leaveChannel();
                    sendMessage('leftVoice');
                    return;
                }
            }

            if (!myChannel) {
                const targetMembers = targetChannel.members.filter(
                    m => !m.user.bot && m.id !== client.user.id
                ).size;

                if (targetMembers > 0) {
                    const conn = await player.joinChannel(targetChannel);
                    if (conn) sendMessage('joinedVoice');
                }
            }
        } catch (e) {
            console.error('voiceStateUpdate error:', e);
        }
    });

    client.login(config.token).catch(err => {
        console.error('Login failed:', err);
        process.exit(1);
    });
});
