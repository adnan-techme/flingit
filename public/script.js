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
let stagedFiles = [];
const fileInput = document.getElementById('file-input');
const uploadCard = document.getElementById('upload-card');
const addMoreBtn = document.getElementById('add-more-btn');

uploadCard.addEventListener('click', () => fileInput.click());

// Add more button functionality
if (addMoreBtn) {
    addMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent bubbling if needed
        fileInput.click();
    });
}

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFiles(Array.from(e.target.files));
    }
    fileInput.value = ''; // Reset to allow selecting same files again
});

document.body.addEventListener('dragover', (e) => e.preventDefault());
document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    if (views.connected.classList.contains('active') || views.staged.classList.contains('active')) {
        if (e.dataTransfer.files.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    }
});

function handleFiles(files) {
    stagedFiles = [...stagedFiles, ...files];
    renderStagedFiles();
    switchState('staged');
}

function renderStagedFiles() {
    const listContainer = document.getElementById('staged-files-list');
    listContainer.innerHTML = '';

    if (stagedFiles.length === 0) {
        // If no files left, go back to connected state
        stagedFiles = [];
        switchState('connected');
        return;
    }

    stagedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-list-item';
        item.innerHTML = `
            <span class="material-symbols-outlined" style="opacity: 0.7;">description</span>
            <div class="file-info">
                <span class="file-name">${file.name}</span>
                <span class="file-size">${formatBytes(file.size)}</span>
            </div>
            <button class="remove-btn" onclick="removeFile(${index})" title="Remove">
                <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
            </button>
        `;
        listContainer.appendChild(item);
    });
}

window.removeFile = function (index) {
    stagedFiles.splice(index, 1);
    renderStagedFiles();
};

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// --- SEND LOGIC (CHUNKED) ---
const CHUNK_SIZE = 16 * 1024; // 16KB

document.getElementById('send-btn').addEventListener('click', async () => {
    if (stagedFiles.length === 0) return;

    isSender = true; // Set role
    switchState('transfer');
    document.getElementById('transfer-status').textContent = 'Starting transfer...';
    document.getElementById('sender-success').style.display = 'none';
    updateProgress(0);

    // 0. Notify Batch Start
    socket.emit('batch-offer', {
        count: stagedFiles.length
    });

    for (let i = 0; i < stagedFiles.length; i++) {
        const file = stagedFiles[i];
        document.getElementById('transfer-status').textContent = `Sending ${i + 1} of ${stagedFiles.length}...`;

        // 1. Offer Meta
        socket.emit('file-offer', {
            name: file.name,
            size: file.size,
            type: file.type
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

        while (offset < file.size) {
            const chunk = await readInfo(file, offset, offset + CHUNK_SIZE);

            socket.emit('file-chunk', {
                buffer: chunk
            });

            offset += chunk.byteLength;
            // Calculate progress for current file 
            // (Could ideally do total progress but per-file is fine for now)
            const percent = Math.min((offset / file.size) * 100, 100);
            updateProgress(percent);

            // Slight delay to allow UI to breathe
            await new Promise(r => setTimeout(r, 0));
        }

        // Small pause between files
        await new Promise(r => setTimeout(r, 200));
    }

    document.getElementById('transfer-status').textContent = 'All Sent!';
    document.getElementById('sender-success').style.display = 'block';
});

function updateProgress(percent) {
    document.documentElement.style.setProperty('--progress', percent);
}

// --- RECEIVE LOGIC ---
let incomingMeta = null;
let incomingBuffer = [];
let receivedBytes = 0;
let batchCount = 1; // Default to 1
let receivedFiles = []; // Store blobs/meta

socket.on('batch-offer', (data) => {
    console.log('Batch offer received:', data);
    batchCount = data.count;
    receivedFiles = []; // Reset received list
    // Receiver doesn't switch state yet, waits for first file-offer
});

socket.on('file-offer', (meta) => {
    console.log('Receiving offer:', meta);
    incomingMeta = meta;
    incomingBuffer = [];
    receivedBytes = 0;

    switchState('transfer');
    const currentCount = receivedFiles.length + 1;
    document.getElementById('transfer-status').textContent = `Receiving ${currentCount} of ${batchCount}...`;
    updateProgress(0);
});

socket.on('file-chunk', (data) => {
    if (!incomingMeta) return;

    incomingBuffer.push(data.buffer);
    receivedBytes += data.buffer.byteLength;

    const percent = Math.min((receivedBytes / incomingMeta.size) * 100, 100);
    updateProgress(percent);

    if (receivedBytes >= incomingMeta.size) {
        // File Complete
        const blob = new Blob(incomingBuffer, { type: incomingMeta.type });
        receivedFiles.push({
            meta: incomingMeta,
            blob: blob
        });

        // Check if batch is done
        if (receivedFiles.length >= batchCount) {
            finishBatchReceive();
        }
    }
});

function finishBatchReceive() {
    const listContainer = document.getElementById('received-files-list');
    listContainer.innerHTML = '';

    receivedFiles.forEach(file => {
        const url = URL.createObjectURL(file.blob);
        const item = document.createElement('div');
        item.className = 'file-list-item received';
        item.innerHTML = `
            <div class="file-info">
                <span class="file-name">${file.meta.name}</span>
                <span class="file-size">${formatBytes(file.meta.size)}</span>
            </div>
            <a href="${url}" download="${file.meta.name}" class="download-action-btn" title="Download">
                <span class="material-symbols-outlined">download</span>
            </a>
        `;
        listContainer.appendChild(item);
    });

    document.getElementById('received-title').textContent = `${receivedFiles.length} File${receivedFiles.length > 1 ? 's' : ''} Received`;

    // Wait a beat for 100% animation
    setTimeout(() => {
        switchState('download');
    }, 500);
}

// --- 3D TILT EFFECT ---
const cards = document.querySelectorAll('.card');

cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
        // Only allow tilt in Connected (upload) state or Staged state
        if (!views.connected.classList.contains('active') && !views.staged.classList.contains('active')) {
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
    stagedFiles = [];
    receivedFiles = [];
    incomingMeta = null;
    incomingBuffer = [];
    receivedBytes = 0;
    batchCount = 1;
    isSender = false;
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
