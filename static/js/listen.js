const audioPlayer = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

let socket;
let peerConnection;

const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws/listen/${encodeURIComponent(ROOM_ID)}`);

    socket.onopen = () => {
        if(statusDot) statusDot.className = 'status-dot active';
        if(statusText) statusText.textContent = 'Connecting via P2P...';
    };

    socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'broadcast_ended') {
            if(statusDot) statusDot.className = 'status-dot';
            if(statusText) statusText.textContent = 'Broadcast Ended';
            if (peerConnection) peerConnection.close();
            socket.close();
            return;
        } else if (message.type === 'error') {
            if(statusDot) statusDot.className = 'status-dot error';
            if(statusText) statusText.textContent = message.message;
            return;
        }

        if (message.type === 'offer') {
            peerConnection = new RTCPeerConnection(rtcConfig);

            // WebRTC 트랙(오디오 스트림)이 수신되면 audioPlayer에 직접 연결합니다.
            peerConnection.ontrack = (e) => {
                console.log("WebRTC 트랙 수신됨", e.streams[0]);
                if(statusText) statusText.textContent = 'LIVE (WebRTC)';
                
                audioPlayer.srcObject = e.streams[0];
                audioPlayer.play().catch(err => console.log("Auto-play prevented", err));
            };

            peerConnection.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.send(JSON.stringify({
                        type: 'candidate',
                        candidate: e.candidate
                    }));
                }
            };

            await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            socket.send(JSON.stringify({
                type: 'answer',
                sdp: answer.sdp
            }));
            
        } else if (message.type === 'candidate' && peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    };
    
    socket.onclose = () => {
        if(statusText && statusText.textContent.includes('LIVE')) {
            if(statusDot) statusDot.className = 'status-dot';
            if(statusText) statusText.textContent = 'Disconnected';
        }
        if (peerConnection) peerConnection.close();
    };

    socket.onerror = (err) => {
        if(statusDot) statusDot.className = 'status-dot error';
        if(statusText) statusText.textContent = 'Connection Error';
        console.error('WebSocket Error:', err);
    };
}

if (playBtn) {
    playBtn.addEventListener('click', () => {
        playBtn.style.display = 'none';
        
        // 모바일 브라우저의 오디오 정책을 풀기 위해 빈 재생 시도
        audioPlayer.play().catch(() => {});
        
        connectWebSocket();
    });
}
