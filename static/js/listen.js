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

    // 에러 핸들러 추가: 미디어 요소에서 에러가 발생하면 처리
    audioPlayer.addEventListener('error', (e) => {
        console.error('Audio Player Error:', e);
        statusText.textContent = "Audio Error. Reconnecting...";
        // 잠시 후 재시도
        setTimeout(initAudio, 2000); 
    });

    mediaSource.addEventListener('sourceopen', () => {
        const mimeType = 'audio/webm;codecs=opus';
        if (MediaSource.isTypeSupported(mimeType)) {
            sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            
            sourceBuffer.addEventListener('updateend', () => {
                if (queue.length > 0 && !sourceBuffer.updating) {
                    sourceBuffer.appendBuffer(queue.shift());
                }
            });

            // SourceBuffer 에러 발생 시 처리
            sourceBuffer.addEventListener('error', (e) => {
                console.error('SourceBuffer Error:', e);
                // 에러 발생 시 버퍼 초기화 시도
                if (!sourceBuffer.updating) {
                    sourceBuffer.abort();
                }
            });
            
            connectWebSocket();
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
        playBtn.style.display = 'none';
    };

    socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
            if (event.data === 'BROADCAST_ENDED') {
                statusDot.className = 'status-dot';
                statusText.textContent = 'Broadcast Ended';
                socket.close();
            }
            return;
        }

        const data = event.data;
        // 데이터가 들어올 때 에러 상태가 아니라면 추가
        if (sourceBuffer && !sourceBuffer.updating && audioPlayer.error === null) {
            try {
                sourceBuffer.appendBuffer(data);
            } catch (e) {
                console.error('AppendBuffer Error:', e);
            }
        } else {
            queue.push(data);
        }
        
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => console.log(e));
        }
    };
}
