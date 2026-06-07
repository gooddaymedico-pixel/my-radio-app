let socket;
let stream;
let audioContext;
let analyser;

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const visualizer = document.getElementById('visualizer');

// Map of listener_id -> RTCPeerConnection
const peerConnections = {};

// STUN server configuration for ICE
const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Initialize visualizer bars
for (let i = 0; i < 20; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    visualizer.appendChild(bar);
}
const bars = document.querySelectorAll('.bar');

async function start() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Setup AudioContext for visualizer
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        updateVisualizer();

        // Setup WebSocket Signaling
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/ws/broadcast/${encodeURIComponent(ROOM_ID)}`);

        socket.onopen = () => {
            statusDot.className = 'status-dot active';
            statusText.textContent = 'ON AIR';
        };

        socket.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            
            if (message.type === 'listener_joined') {
                await createPeerConnection(message.listener_id);
            } else if (message.type === 'listener_left') {
                if (peerConnections[message.source]) {
                    peerConnections[message.source].close();
                    delete peerConnections[message.source];
                }
            } else if (message.type === 'answer') {
                const pc = peerConnections[message.source];
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
                }
            } else if (message.type === 'candidate') {
                const pc = peerConnections[message.source];
                if (pc && message.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                }
            }
        };

        socket.onclose = () => {
            statusDot.className = 'status-dot';
            statusText.textContent = 'Disconnected';
            stopRecording();
        };

        socket.onerror = (err) => {
            statusDot.className = 'status-dot error';
            statusText.textContent = 'Error';
            console.error('WebSocket Error:', err);
        };

    } catch (err) {
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Mic Access Denied';
        console.error('Error accessing microphone:', err);
    }
}

async function createPeerConnection(listenerId) {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[listenerId] = pc;

    // Add local stream tracks to connection
    stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.send(JSON.stringify({
                target: listenerId,
                type: 'candidate',
                candidate: event.candidate
            }));
        }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.send(JSON.stringify({
        target: listenerId,
        type: 'offer',
        sdp: offer.sdp
    }));
}

function updateVisualizer() {
    if (!analyser) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    for (let i = 0; i < bars.length; i++) {
        const value = dataArray[i];
        const height = Math.max(10, (value / 255) * 100);
        bars[i].style.height = `${height}px`;
        if (value > 200) {
            bars[i].style.background = 'var(--danger-color)';
        } else {
            bars[i].style.background = 'var(--accent-color)';
        }
    }
    requestAnimationFrame(updateVisualizer);
}

function stopRecording() {
    Object.values(peerConnections).forEach(pc => pc.close());
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        audioContext.close();
    }
}

function stopBroadcast() {
    stopRecording();
    if (socket) socket.close();
    window.location.href = '/';
}

window.onload = start;
