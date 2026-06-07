let mediaRecorder;
let socket;
let audioContext;
let analyser;
let stream;

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const visualizer = document.getElementById('visualizer');

// Initialize visualizer bars
for (let i = 0; i < 20; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    visualizer.appendChild(bar);
}
const bars = document.querySelectorAll('.bar');

async function start() {
    try {
        // Request microphone access
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Setup AudioContext for visualizer
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        
        updateVisualizer();

        // Setup WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/ws/broadcast/${encodeURIComponent(ROOM_ID)}`);

        socket.onopen = () => {
            statusDot.className = 'status-dot active';
            statusText.textContent = 'ON AIR';
            
            // Start recording and sending chunks every 1 second
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
            
            mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                    const buffer = await e.data.arrayBuffer();
                    socket.send(buffer);
                }
            };
            
            mediaRecorder.start(1000); // 1000ms chunk size
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

function updateVisualizer() {
    if (!analyser) return;
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    for (let i = 0; i < bars.length; i++) {
        // Map frequency data to bar height (10px to 100px)
        const value = dataArray[i];
        const height = Math.max(10, (value / 255) * 100);
        bars[i].style.height = `${height}px`;
        
        if (value > 200) {
            bars[i].style.background = 'var(--danger-color)'; // Red if loud
        } else {
            bars[i].style.background = 'var(--accent-color)';
        }
    }
    
    requestAnimationFrame(updateVisualizer);
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
        audioContext.close();
    }
}

function stopBroadcast() {
    stopRecording();
    if (socket) {
        socket.close();
    }
    window.location.href = '/';
}

// Start automatically
window.onload = start;
