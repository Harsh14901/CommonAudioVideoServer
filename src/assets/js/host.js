/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
var addr = location.host
console.log(addr);
const getParams = function (url) {
  const params = {};
  const parser = document.createElement('a');
  parser.href = url;
  const query = parser.search.substring(1);
  const vars = query.split('&');
  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split('=');
    params[pair[0]] = decodeURIComponent(pair[1]);
  }
  return params;
};

const ogg2mkv = (file) => {
    return file.substr(0,file.length-3) + 'mkv';
}

const socket = io(`http://${addr}/`);

const maxError = 0.5;
const eventTimeDiff = 1;
const interval = 1000;
let networkOffset = 0;
let disableEventListener = false;
let onlyHost = false;

let userId = '';
const roomId = getParams(location.href).roomId;
const videoPaths = [];
// let trackId = '';

const getNetworkOffset = async () => {
  const reqStart = new Date().getTime();
  const response = await axios.get(`http://${addr}/time`);
  const time = response.data.time;
  const reqEnd = new Date().getTime();
  networkOffset = ((reqEnd + reqStart) / 2 - time) / 1000;
  console.log('Network Latency predicted as ' + networkOffset);
};
getNetworkOffset();

const video = document.getElementById('videosrc');
let lastState = {};
let lastRecievedAt = 0;

setInterval(() => {
  if (video.readyState !== 4 || lastState === {}) return;
  if (lastState.is_playing) video.play();
  else video.pause();
  const expectedPosition = lastState.is_playing
    ? new Date().getTime() / 1000 -
      lastState.last_updated +
      lastState.position -
      networkOffset
    : lastState.position;
  if (Math.abs(video.currentTime - expectedPosition) >= maxError) {
    console.log('Syncing now...');
    disableEventListener = true;
    video.currentTime = expectedPosition;
    setTimeout(() => {
      disableEventListener = false;
    }, interval);
  } else {
    console.log('The sync offset is less than 1sec');
  }
}, interval);

const setPlaybackTime = data => {
  lastRecievedAt = new Date().getTime() / 1000;
  console.log('Recieved data at' + lastRecievedAt);
  video.currentTime =
    data.position + lastRecievedAt - data.last_updated - networkOffset;
  console.log('setting current time to ' + video.currentTime);
};
document.getElementById('startParty').addEventListener('click', () => {
  socket.emit('joinRoom', {
    roomId: roomId,
  });
  socket.emit('makeMeHost',{
      roomId: roomId,
  })
});
socket.on('roomDetails',data => {
    console.log("Recieved room details");
    console.log(data);
    lastState = data.state;
    onlyHost = data.onlyHost;
    data.audioPaths.forEach(p => {
        videoPaths.push(ogg2mkv(p));
    })
    video.src = `http://${addr}/api/listen?path=${encodeURIComponent(ogg2mkv(data.currentAudioPath))}`;

})

socket.on('addTrack',data => {
    videoPaths.push(ogg2mkv(data.audioPath));
})
socket.on('joinRoom', data => {
  console.log('Present state is: ');
  console.log(data);
  lastState = data.state;
  onlyHost = data.onlyHost;
});

socket.on('userId', data => {
  console.log(data);
  userId = data.userId;
});

socket.on('sendMessage', msg => {
  console.log('Recieved a message from the server');
  console.log(msg);
});

socket.on('pause', data => {
  disableEventListener = true;

  console.log('Pausing playback');
  video.currentTime = data.position;
  video.pause();
  lastState = data;
  setTimeout(() => {
    disableEventListener = false;
  }, interval);
});

socket.on('play', data => {
  disableEventListener = true;

  console.log('playing audio');
  console.log('Play data recieved');
  console.log(data);

  setPlaybackTime(data);
  video.play();
  lastState = data;

  setTimeout(() => {
    disableEventListener = false;
  }, interval);
});

socket.on('seek', data => {
  disableEventListener = true;
  console.log('Seeking audio buffer');
  setPlaybackTime(data);
  console.log('Is playing: ' + data.is_playing);
  lastState = data;
  console.log('Seek data recieved');
  console.log(data);

  setTimeout(() => {
    disableEventListener = false;
  }, interval);
});

video.addEventListener('play', event => {
  if (disableEventListener || onlyHost) return;
  console.log('Play event detected');
  lastState.last_updated = new Date().getTime() / 1000;
  lastState.position = video.currentTime;
  lastState.is_playing = true;
  socket.emit('play', lastState);
});
video.addEventListener('pause', event => {
  if (disableEventListener || onlyHost) return;
  console.log('Pause event detected');
  lastState.last_updated = new Date().getTime() / 1000;
  lastState.position = video.currentTime;
  lastState.is_playing = false;
  socket.emit('pause', lastState);
});
video.addEventListener('seeked', event => {
  if (disableEventListener || !video.paused || onlyHost) return;
  console.log('audio.paused is :' + video.paused);
  console.log('Seek event detected');
  lastState.last_updated = new Date().getTime() / 1000;
  lastState.position = video.currentTime;
  console.log(lastState);
  socket.emit('seek', lastState);
});
