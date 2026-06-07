let socket;
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const audioPlayer = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');

let mediaSource = new MediaSource();
let sourceBuffer = null;
let queue = [];

audioPlayer.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener('sourceopen', () => {
    // 코덱을 확인하고 버퍼 생성
    const mimeType = 'audio/webm;codecs=opus';
    if (MediaSource.isTypeSupported(mimeType)) {
        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        
        // 데이터가 들어올 때마다 처리
        sourceBuffer.addEventListener('updateend', () => {
            if (queue.length > 0 && !sourceBuffer.updating) {
                sourceBuffer.appendBuffer(queue.shift());
            }
        });
    } else {
        console.error("Codec not supported by browser");
        statusText.textContent = "Codec not supported";
        statusDot.className = 'status-dot error';
    }
});

function connectWebSocket(room_id) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws/listen/${encodeURIComponent(room_id)}`);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        statusDot.className = 'status-dot active';
        statusText.textContent = 'LIVE';
    };

    socket.onmessage = (event) => {
        // 문자열 메시지(방송 종료 등) 처리
        if (typeof event.data === 'string') {
            if (event.data === 'BROADCAST_ENDED') {
                statusDot.className = 'status-dot';
                statusText.textContent = 'Broadcast Ended';
                socket.close();
            }
            return;
        }

        // 데이터가 도착하면 콘솔에 찍어서 확인
        console.log("데이터 수신:", event.data.byteLength, "bytes");

        if (sourceBuffer && !sourceBuffer.updating) {
            try {
                sourceBuffer.appendBuffer(event.data);
            } catch (e) {
                console.error("버퍼 에러:", e);
                // 에러 발생 시 초기화 시도
                if (e.name === 'InvalidStateError') {
                    console.log("버퍼 초기화 시도...");
                    // 복구가 불가능할 경우 sourceBuffer를 abort하는 등의 추가 처리가 들어갈 수 있습니다.
                }
            }
        } else {
            queue.push(event.data);
        }

        // 재생 버튼이 눌린 상태에서 오디오가 멈춰있으면 재생 강제
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => console.log("재생 대기중"));
        }
    };
}

// 버튼 클릭 시 재생 및 웹소켓 연결 (브라우저 자동재생 정책 대응)
playBtn.addEventListener('click', () => {
    playBtn.style.display = 'none'; // 버튼 숨김
    connectWebSocket(ROOM_ID);      // 서버 템플릿 변수 ROOM_ID 사용
});
