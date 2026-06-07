const audioPlayer = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');

let mediaSource;
let sourceBuffer;
let isReconnecting = false;

// 오디오 초기화 및 에러 핸들링 함수
function initAudio() {
    console.log("초기화 시작");
    
    if (playBtn) playBtn.style.display = 'none';

    mediaSource = new MediaSource();
    audioPlayer.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', () => {
        const mimeType = 'audio/webm;codecs=opus';
        if (MediaSource.isTypeSupported(mimeType)) {
            sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            connectWebSocket();
        } else {
            console.error("Codec not supported by browser");
        }
    });

    // 에러 발생 시 자동 복구
    audioPlayer.addEventListener('error', () => {
        console.error("오디오 에러 발생! 2초 후 재시작합니다.");
        if (!isReconnecting) {
            isReconnecting = true;
            setTimeout(() => {
                isReconnecting = false;
                initAudio(); // 다시 처음부터 시작
            }, 2000);
        }
    });
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 템플릿의 글로벌 변수 ROOM_ID 사용 (하드코딩 방지)
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

        // 플레이어 에러 상태 확인
        if (audioPlayer.error) {
            console.log("플레이어 에러 상태, 복구 대기 중...");
            return;
        }

        if (sourceBuffer && !sourceBuffer.updating) {
            try {
                sourceBuffer.appendBuffer(event.data);
            } catch (e) {
                console.error("버퍼 에러:", e);
            }
        }
        
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => console.log("재생 대기중"));
        }
    };
}

// 버튼 클릭 시 시작
if (playBtn) {
    playBtn.addEventListener('click', initAudio);
}
