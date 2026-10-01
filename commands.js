const config = require('./config');
const messages = require('./messages');
const player = require('./player');

const PLAY_CMDS   = ["ش", "p", "شغل", "تشغيل", "play"];
const STOP_CMDS   = ["stop", "توقف", "توقيف", "ت"];
const SKIP_CMDS   = ["skip", "s", "س", "سكب"];
const PAUSE_CMDS  = ["pause", "إيقاف"];
const RESUME_CMDS = ["resume", "استئناف", "متابعة"];
const VOL_CMDS    = ["ص", "v", "صوت", "volume"];
const LOOP_ON     = ["تكرار", "loop"];
const LOOP_OFF    = ["لتكرر"];
const HELP_AR     = ["مساعدة"];
const HELP_EN     = ["help"];
const CURRENT_CMD = "الاغنية";
const QUEUE_CMD   = "الاغاني";
const CLEAR_CMD   = "مسح";
const REMOVE_CMD  = "شيله";

function fmt(key, vars = {}) {
    let s = messages[key] || key;
    for (const k in vars) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
    }
    return s;
}

function textReply(sendReply, key, vars) {
    sendReply(fmt(key, vars), false);
}

function embedReply(sendReply, key, vars) {
    sendReply(fmt(key, vars), true);
}

function buildHelpAr() {
    return fmt('helpTitleAr') + '\n' +
        '!ش | !p | !شغل | !تشغيل | !play [اسم] - تشغيل أغنية\n' +
        '!stop | !توقف | !توقيف | !ت - إيقاف التشغيل\n' +
        '!skip | !s | !س | !سكب - تخطي الأغنية\n' +
        '!pause | !إيقاف - إيقاف مؤقت\n' +
        '!resume | !استئناف | !متابعة - استئناف\n' +
        '!صوت | !ص | !v | !volume [0-200] - ضبط الصوت\n' +
        '!تكرار - تفعيل التكرار\n' +
        '!لتكرر - إيقاف التكرار\n' +
        '!الاغنية - عرض الأغنية الحالية\n' +
        '!الاغاني - عرض الطابور\n' +
        '!مسح - مسح الطابور\n' +
        '!شيله [رقم] - حذف أغنية من الطابور';
}

function buildHelpEn() {
    return fmt('helpTitleEn') + '\n' +
        '!p | !play [query] - play a song\n' +
        '!stop - stop playback\n' +
        '!skip | !s - skip current song\n' +
        '!pause - pause current song\n' +
        '!resume - resume current song\n' +
        '!v | !volume [0-200] - set volume\n' +
        '!loop - enable loop\n' +
        '!unloop - disable loop\n' +
        '!current - show current song\n' +
        '!queue - show queue\n' +
        '!clear - clear queue\n' +
        '!remove [number] - remove song from queue';
}

async function handleCommand(message, content, sendReply) {
    const parts = content.slice(config.prefix.length).trim().split(/\s+/);
    if (parts.length === 0) return;
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const st = player.getState();

    if (PLAY_CMDS.includes(cmd)) {
        const query = args.join(' ').trim();
        if (!query) return embedReply(sendReply, 'noResults');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return embedReply(sendReply, 'notInVoice');

        const humans = voiceChannel.members.filter(m => !m.user.bot).size;
        if (humans === 0) return embedReply(sendReply, 'noOneInVoice');

        if (voiceChannel.id !== config.voiceChannelId) {
            return embedReply(sendReply, 'notInVoice');
        }

        if (!st.connection) {
            const conn = await player.joinChannel(voiceChannel);
            if (!conn) return embedReply(sendReply, 'errorOccurred');
            textReply(sendReply, 'joinedVoice');
        }

        const isIdle = !st.playing && st.queue.length === 0;

        textReply(sendReply, 'searching');

        const result = await player.searchYouTube(query);
        if (!result) return embedReply(sendReply, 'noResults');

        if (isIdle) {
            st.queue.push(result);
            player.playNext();
        } else {
            if (st.queue.length >= config.maxQueueSize) {
                return embedReply(sendReply, 'queueFull');
            }
            st.queue.push(result);
            embedReply(sendReply, 'addedToQueue', {
                title: result.title,
                position: st.queue.length
            });
        }
        return;
    }

    if (STOP_CMDS.includes(cmd)) {
        if (!st.connection) return embedReply(sendReply, 'notInVoice');
        player.leaveChannel();
        return embedReply(sendReply, 'stopped');
    }

    if (SKIP_CMDS.includes(cmd)) {
        if (!st.playing) return embedReply(sendReply, 'notPlaying');
        st.loop = false;
        st.player.stop();
        return embedReply(sendReply, 'skipped');
    }

    if (PAUSE_CMDS.includes(cmd)) {
        if (!st.playing) return embedReply(sendReply, 'notPlaying');
        const ok = st.player.pause();
        return embedReply(sendReply, ok ? 'paused' : 'alreadyPaused');
    }

    if (RESUME_CMDS.includes(cmd)) {
        if (!st.playing) return embedReply(sendReply, 'notPlaying');
        const ok = st.player.unpause();
        return embedReply(sendReply, ok ? 'resumed' : 'notPaused');
    }

    if (VOL_CMDS.includes(cmd)) {
        const v = parseInt(args[0], 10);
        if (isNaN(v) || v < config.minVolume || v > config.maxVolume) {
            return embedReply(sendReply, 'volumeInvalid');
        }
        st.volume = v;
        const res = st.player.state.resource;
        if (res && res.volume) res.volume.setVolume(v / 100);
        return embedReply(sendReply, 'volumeSet', { volume: v });
    }

    if (LOOP_ON.includes(cmd)) {
        st.loop = true;
        return embedReply(sendReply, 'loopEnabled');
    }

    if (LOOP_OFF.includes(cmd)) {
        st.loop = false;
        return embedReply(sendReply, 'loopDisabled');
    }

    if (cmd === CURRENT_CMD) {
        if (!st.current) return embedReply(sendReply, 'notPlaying');
        return embedReply(sendReply, 'currentSong', { title: st.current.title });
    }

    if (cmd === QUEUE_CMD) {
        if (st.queue.length === 0) return embedReply(sendReply, 'queueEmpty');
        let out = fmt('queueList') + '\n';
        st.queue.forEach((song, i) => {
            out += fmt('queueItem', { index: i + 1, title: song.title }) + '\n';
        });
        return sendReply(out.trim(), true, 'queueEmbed');
    }

    if (cmd === CLEAR_CMD) {
        st.queue = [];
        return embedReply(sendReply, 'queueCleared');
    }

    if (cmd === REMOVE_CMD) {
        const n = parseInt(args[0], 10);
        if (isNaN(n) || n < 1 || n > st.queue.length) {
            return embedReply(sendReply, 'invalidQueueNumber');
        }
        st.queue.splice(n - 1, 1);
        return embedReply(sendReply, 'removedFromQueue');
    }

    if (HELP_AR.includes(cmd)) {
        return sendReply(buildHelpAr(), true, 'helpEmbed');
    }

    if (HELP_EN.includes(cmd)) {
        return sendReply(buildHelpEn(), true, 'helpEmbed');
    }
}

module.exports = { handleCommand };
