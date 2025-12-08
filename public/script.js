const socket = io();

// --- STATE MACHINE UI ---
const views = {
    scanning: document.getElementById('scanning-view'),
    connected: document.getElementById('connected-view'),
    staged: document.getElementById('staged-view'),
    transfer: document.getElementById('transfer-view'),
    download: document.getElementById('download-view')
};

function switchState(stateName) {
    console.log('Switching state to:', stateName);

    // Manage Z-Index and Visibility for Circular Reveal
    Object.keys(views).forEach(key => {
        const el = views[key];
        if (key !== stateName) {
            el.classList.remove('active');
            // Wait for transition to finish before hiding
            setTimeout(() => {
                if (!el.classList.contains('active')) {
                    el.classList.add('hidden');
                }
            }, 600); // Match CSS transition duration
        }
    });

    const target = views[stateName];
    if (target) {
        target.classList.remove('hidden');
        // Force reflow
        void target.offsetWidth;
        target.classList.add('active');
    }
}

// --- RANDOM BACKGROUND ---
const pastelColors = ['#E0F2F1', '#E8EAF6', '#F3E5F5', '#FBE9E7', '#F1F8E9', '#E0E0E0'];
document.body.style.backgroundColor = pastelColors[Math.floor(Math.random() * pastelColors.length)];

// --- SOCKET EVENTS ---
socket.on('connect', () => {
    console.log('Connected to server.');
});

socket.on('peer-found', () => {
    if (!views.transfer.classList.contains('active') && !views.download.classList.contains('active')) {
        switchState('connected');
    }
});

socket.on('peer-lost', () => {
    location.reload();
});

socket.on('reset-session', () => {
    console.log('Session reset requested.');
    resetUI();
});

// --- FILE HANDLING ---
let stagedFile = null;
const fileInput = document.getElementById('file-input');
const uploadCard = document.getElementById('upload-card');

uploadCard.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) stageFile(e.target.files[0]);
});

document.body.addEventListener('dragover', (e) => e.preventDefault());
document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    if (views.connected.classList.contains('active')) {
        if (e.dataTransfer.files.length > 0) stageFile(e.dataTransfer.files[0]);
    }
});

function stageFile(file) {
    stagedFile = file;
    document.getElementById('staged-filename').textContent = file.name;
    switchState('staged');
}

// --- SEND LOGIC (CHUNKED) ---
const CHUNK_SIZE = 16 * 1024; // 16KB

document.getElementById('send-btn').addEventListener('click', async () => {
    if (!stagedFile) return;

    isSender = true; // Set role
    switchState('transfer');
    document.getElementById('transfer-status').textContent = 'Sending...';
    document.getElementById('sender-success').style.display = 'none'; // Reset success msg
    updateProgress(0);

    // 1. Offer Meta
    socket.emit('file-offer', {
        name: stagedFile.name,
        size: stagedFile.size,
        type: stagedFile.type
    });

    // 2. Send Data in Chunks
    let offset = 0;
    const fileReader = new FileReader();

    const readInfo = (file, start, end) => {
        return new Promise((resolve) => {
            const slice = file.slice(start, end);
            fileReader.onload = (e) => resolve(e.target.result);
            fileReader.readAsArrayBuffer(slice);
        });
    };

    while (offset < stagedFile.size) {
        const chunk = await readInfo(stagedFile, offset, offset + CHUNK_SIZE);

        socket.emit('file-chunk', {
            buffer: chunk
        });

        offset += chunk.byteLength;
        const percent = Math.min((offset / stagedFile.size) * 100, 100);
        updateProgress(percent);

        // Slight delay to allow UI to breathe and not block event loop too hard
        await new Promise(r => setTimeout(r, 0));
    }

    document.getElementById('transfer-status').textContent = 'Sent!';
    document.getElementById('sender-success').style.display = 'block';
});

function updateProgress(percent) {
    document.documentElement.style.setProperty('--progress', percent);
}

// --- RECEIVE LOGIC ---
let incomingMeta = null;
let incomingBuffer = [];
let receivedBytes = 0;

socket.on('file-offer', (meta) => {
    console.log('Receiving offer:', meta);
    incomingMeta = meta;
    incomingBuffer = [];
    receivedBytes = 0;

    switchState('transfer');
    document.getElementById('transfer-status').textContent = 'Receiving...';
    updateProgress(0);
});

socket.on('file-chunk', (data) => {
    if (!incomingMeta) return;

    incomingBuffer.push(data.buffer);
    receivedBytes += data.buffer.byteLength;

    const percent = Math.min((receivedBytes / incomingMeta.size) * 100, 100);
    updateProgress(percent);

    if (receivedBytes >= incomingMeta.size) {
        // Complete
        const blob = new Blob(incomingBuffer, { type: incomingMeta.type });
        const url = URL.createObjectURL(blob);

        const downloadBtn = document.getElementById('download-btn');
        downloadBtn.href = url;
        downloadBtn.download = incomingMeta.name;
        document.getElementById('received-filename').textContent = incomingMeta.name;

        // Wait a beat for 100% animation
        setTimeout(() => {
            // Smart Button Text for Receiver
            const receiverBtn = document.querySelector('#download-view button');
            if (receiverBtn) receiverBtn.innerHTML = '<span class="material-symbols-outlined">restart_alt</span> Send Back';

            switchState('download');
        }, 500);
    }
});

// --- 3D TILT EFFECT ---
// --- 3D TILT EFFECT ---
const cards = document.querySelectorAll('.card');

cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
        // Only allow tilt in Connected (upload) state. 
        // Disabled in Staged, Transfer, Download, etc.
        if (!views.connected.classList.contains('active')) {
            card.style.transform = 'none';
            return;
        }

        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Calculate center relative
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Axis rotation (max 10 deg)
        // Mouse X affects Rotate Y (tilt left/right)
        // Mouse Y affects Rotate X (tilt up/down - inverse)
        const rotateY = ((x - centerX) / centerX) * 10;
        const rotateX = -((y - centerY) / centerY) * 10;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
    });
});

// --- RESET LOGIC & SMART BUTTON ---
let isSender = false;

window.resetSession = function () {
    socket.emit('reset-session');
};

function resetUI() {
    // Reset Data
    stagedFile = null;
    incomingMeta = null;
    incomingBuffer = [];
    receivedBytes = 0;
    isSender = false; // Reset role
    fileInput.value = '';

    // Reset UI
    document.getElementById('sender-success').style.display = 'none';
    updateProgress(0);

    // Go back to connected state
    switchState('connected');
}

// --- HELP SYSTEM ---
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.getElementById('close-help-btn');

function toggleHelp(show) {
    if (show) {
        helpModal.classList.remove('hidden');
        // Tiny timeout for CSS transition
        setTimeout(() => helpModal.classList.add('active'), 10);
    } else {
        helpModal.classList.remove('active');
        setTimeout(() => helpModal.classList.add('hidden'), 300);
    }
}

if (helpBtn) {
    helpBtn.addEventListener('click', () => toggleHelp(true));
    closeHelpBtn.addEventListener('click', () => toggleHelp(false));

    // Close on background click
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) toggleHelp(false);
    });
}
