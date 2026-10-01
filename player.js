const {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType,
    entersState,
    joinVoiceChannel,
    VoiceConnectionStatus
} = require('@discordjs/voice');
const playdl = require('play-dl');
const ytSearch = require('youtube-search-api');
const config = require('./config');

const state = {
    connection: null,
    player: createAudioPlayer(),
    current: null,
    queue: [],
    volume: config.defaultVolume,
    loop: false,
    playing: false
};

let messageSender = () => {};
function setMessageSender(fn) { messageSender = fn; }
function getState() { return state; }

async function searchYouTube(query) {
    try {
        const res = await ytSearch.GetListByKeyword(query, false, 1);
        if (!res || !res.items || res.items.length === 0) return null;
        const item = res.items[0];
        return {
            title: item.title,
            url: `https://www.youtube.com/watch?v=${item.id}`
        };
    } catch (e) {
        console.error('searchYouTube error:', e);
        return null;
    }
}

async function buildStream(url) {
    const stream = await playdl.stream(url, {
        quality: 2,
        discordPlayerCompatibility: true
    });
    return stream;
}

async function playNext() {
    if (state.queue.length === 0) {
        state.current = null;
        state.playing = false;
        return;
    }

    const song = state.queue.shift();
    state.current = song;
    state.playing = true;

    try {
        const streamData = await buildStream(song.url);
        const resource = createAudioResource(streamData.stream, {
            inputType: streamData.type,
            inlineVolume: true
        });
        resource.volume.setVolume(state.volume / 100);
        state.player.play(resource);
        messageSender('nowPlaying', { title: song.title });
    } catch (err) {
        console.error('playNext error:', err);
        state.playing = false;
        state.current = null;
        playNext();
    }
}

state.player.on(AudioPlayerStatus.Idle, () => {
    if (state.current) {
        messageSender('songEnded');
    }

    if (state.loop && state.current) {
        state.queue.unshift(state.current);
    }

    playNext();
});

state.player.on('error', (err) => {
    console.error('Player error:', err);
    playNext();
});

async function joinChannel(channel) {
    if (state.connection) return state.connection;

    state.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });

    try {
        await entersState(state.connection, VoiceConnectionStatus.Ready, 30000);
        state.connection.subscribe(state.player);
    } catch (e) {
        console.error('Join failed:', e);
        try { state.connection.destroy(); } catch (_) {}
        state.connection = null;
        return null;
    }

    return state.connection;
}

function leaveChannel() {
    if (state.connection) {
        try { state.connection.destroy(); } catch (_) {}
        state.connection = null;
    }
    state.player.stop(true);
    state.current = null;
    state.queue = [];
    state.playing = false;
    state.loop = false;
}

module.exports = {
    state,
    setMessageSender,
    getState,
    searchYouTube,
    playNext,
    joinChannel,
    leaveChannel
};
