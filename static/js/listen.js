let socket;
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const audioPlayer = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');

let mediaSource;
let sourceBuffer;
let queue = [];
let isInit = false;

function initAudio() {
    if (isInit) return;
    isInit = true;
    
    playBtn.textContent = 'CONNECTING...';
    playBtn.disabled = true;

    mediaSource = new MediaSource();
    audioPlayer.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', () => {
        // MediaRecorder defaults to webm opus in Chrome/Firefox
        const mimeType = 'audio/webm;codecs=opus';
        
        if (MediaSource.isTypeSupported(mimeType)) {
            sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            
            sourceBuffer.addEventListener('updateend', () => {
                if (queue.length > 0 && !sourceBuffer.updating) {
                    sourceBuffer.appendBuffer(queue.shift());
                }
            });
            
            connectWebSocket();
        } else {
            statusText.textContent = "Codec not supported by browser";
            statusDot.className = 'status-dot error';
        }
    });

    audioPlayer.play().catch(e => {
        console.log('Autoplay prevented:', e);
        playBtn.textContent = 'CLICK TO PLAY';
        playBtn.disabled = false;
        isInit = false;
    });
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws/listen/${encodeURIComponent(ROOM_ID)}`);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        statusDot.className = 'status-dot active';
        statusText.textContent = 'LIVE';
        playBtn.style.display = 'none'; // Hide play button once connected
    };

    socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
            if (event.data === 'BROADCAST_ENDED') {
                statusDot.className = 'status-dot';
                statusText.textContent = 'Broadcast Ended';
                socket.close();
            } else if (event.data === 'ROOM_NOT_FOUND') {
                statusDot.className = 'status-dot error';
                statusText.textContent = 'Room Not Found';
            }
            return;
        }

        // Binary audio chunk received
        const data = event.data;
        if (sourceBuffer && !sourceBuffer.updating) {
            sourceBuffer.appendBuffer(data);
        } else {
            queue.push(data);
        }
        
        // Ensure playback continues
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => console.log(e));
        }
    };

    socket.onclose = () => {
        if(statusText.textContent === 'LIVE') {
            statusDot.className = 'status-dot';
            statusText.textContent = 'Disconnected';
        }
    };

    socket.onerror = (err) => {
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Connection Error';
        console.error('WebSocket Error:', err);
    };
}
