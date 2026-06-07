// 전역 변수로 관리
let mediaSource;
let sourceBuffer;
let queue = [];
const audioPlayer = document.getElementById('audioPlayer');

// HTML 버튼이 이 함수를 부릅니다
function initAudio() {
    console.log("초기화 시작");
    
    // 재생 버튼 숨김 처리
    const playBtn = document.getElementById('playBtn');
    if(playBtn) playBtn.style.display = 'none';

    mediaSource = new MediaSource();
    audioPlayer.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', () => {
        const mimeType = 'audio/webm;codecs=opus';
        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        
        sourceBuffer.addEventListener('updateend', () => {
            if (queue.length > 0 && !sourceBuffer.updating) {
                sourceBuffer.appendBuffer(queue.shift());
            }
        });
        
        // sourceopen 이후 연결 시작
        connectWebSocket();
    });
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // HTML 템플릿에 정의되어 있는 전역 변수 ROOM_ID를 사용합니다.
    // (h1 태그 파싱 시 "Listening:" 텍스트로 인해 발생할 수 있는 에러 방지)
    const room_id = ROOM_ID; 
    
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/listen/${encodeURIComponent(room_id)}`);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        if(statusDot) statusDot.className = 'status-dot active';
        if(statusText) statusText.textContent = 'LIVE';
    };

    socket.onmessage = (event) => {
        // 문자열 메시지(방송 종료 등) 처리
        if (typeof event.data === 'string') {
            if (event.data === 'BROADCAST_ENDED') {
                const statusDot = document.getElementById('statusDot');
                const statusText = document.getElementById('statusText');
                if(statusDot) statusDot.className = 'status-dot';
                if(statusText) statusText.textContent = 'Broadcast Ended';
                socket.close();
            }
            return;
        }

        console.log("데이터 수신:", event.data.byteLength, "bytes");

        if (sourceBuffer && !sourceBuffer.updating) {
            try {
                sourceBuffer.appendBuffer(event.data);
            } catch (e) {
                console.error("버퍼 에러 발생, 큐에 추가:", e);
                queue.push(event.data);
            }
        } else {
            queue.push(event.data);
        }

        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => console.log("재생 대기중"));
        }
    };
}
