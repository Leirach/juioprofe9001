import { google } from 'googleapis';
import ytdl from 'ytdl-core';
import { Song } from "./musicClasses";
import { Duration } from 'luxon';

const youtube = google.youtube('v3');
const apiKey = process.env.YT_API_KEY;
const prependURL = 'https://www.youtube.com/watch?v=';
const regexURL = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/

export async function getPlaylist(playlist: string, nextPageToken: string): Promise<Array<Song>> {
    // check pagination for really long playlists
    if(!nextPageToken)
        return Array<Song>();
    if (nextPageToken == 'first')
        nextPageToken = null;

    // get video IDs from playlist
    // console.log("getting playlist");
    let res = await youtube.playlistItems.list({
        key: apiKey,
        part: ['snippet'],
        playlistId: playlist,
        pageToken: nextPageToken,
        maxResults: 50,
    });

    // map the ids to an array and then request the video info
    // 50 at a time to reduce api quota usage
    let videoIds = res.data.items.map(item => {
        return item.snippet.resourceId.videoId;
    });
    
    // This nasty ass bottleneck will stop the thread for ~500 ms every 50 songs in a playlist
    // I should probably do something about it
    let videoInfo = await youtube.videos.list({
        key: apiKey,
        part: ['snippet','contentDetails'],
        id: videoIds,
    });

    let songs = videoInfo.data.items.map(item => {
        return new Song(item.snippet.title,  prependURL+item.id, item.contentDetails.duration, item.snippet.thumbnails.medium.url);
    });

    return songs.concat(await getPlaylist(playlist, res.data.nextPageToken));
}

export async function searchYT(keyword: string){
    let res = await youtube.search.list({
        q: keyword,
        key: apiKey,
        part: ['snippet'],
        safeSearch: "none",
        maxResults: 1,
    });
    if (!res.data.items){
        return null;
    }
    let id = res.data.items[0].id.videoId;
    let videoInfo = await youtube.videos.list({
        key: apiKey,
        part: ['snippet','contentDetails'],
        id: [id],
    });

    const firstResult = videoInfo.data.items[0];
    return new Song(firstResult.snippet.title, prependURL+firstResult.id, firstResult.contentDetails.duration, firstResult.snippet.thumbnails.medium.url)
}

export async function getSongMetadata(url: string) {
    var match = url.match(regexURL);
    let songid = (match&&match[7].length==11)? match[7] : '';
    if (!songid) {
        return null;
    }
    let res = await youtube.videos.list({
        key: apiKey,
        part: ['snippet','contentDetails'],
        id: [songid],
    });
    if (!res) {
        return null;
    }
    return res.data.items[0];
}

export async function songFromURL(url: string) {
    let song = await getSongMetadata(url);
    if (!song) {
        return null;
    }
    return new Song(song.snippet.title, prependURL+song.id, song.contentDetails.duration, song.snippet.thumbnails.medium.url);
    /*
    try {
        let songInfo = await ytdl.getInfo(url);
        return new Song(songInfo.title, url, songInfo.length_seconds);
    } catch (err) {
        return null;
    }
    */
}

export async function getSongs(url: string) {
    if(url.includes('/playlist?list=')){
        let playlistId = url.split('/playlist?list=')[1];
        playlistId = playlistId.split('&')[0];
        return getPlaylist(playlistId, "first");
    }
    return songFromURL(url);
}

export function getTimestamp(stream: number, total: string) {
    let ltime = Duration.fromMillis(stream);
    let tTime = Duration.fromISO(total);
    let format: string;
    format = tTime.as('hours') < 1? 'mm:ss' : 'hh:mm:ss';
    return ltime.toFormat(format) + '/' + tTime.toFormat(format);
}