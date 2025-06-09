const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const expressionDisplay = document.getElementById('expression');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const captureButton = document.getElementById('captureButton');
const statusElement = document.getElementById('status');
const spinner = document.getElementById('spinner');
const imageUpload = document.getElementById('imageUpload');
const uploadedImage = document.getElementById('uploadedImage');
const imageCanvas = document.getElementById('imageCanvas');
const photoExpression = document.getElementById('photoExpression');
const photoStatus = document.getElementById('photoStatus');
const inputSizeRange = document.getElementById('inputSizeRange');
const inputSizeValue = document.getElementById('inputSizeValue');
const minConfidenceRange = document.getElementById('minConfidenceRange');
const minConfidenceValue = document.getElementById('minConfidenceValue');


let isModelLoaded = false;
let stream = null;
let detectionInterval = null;
let currentInputSize = parseInt(inputSizeRange.value);
let currentMinConfidence = parseFloat(minConfidenceRange.value);

const expressionColors = {
    happy: '#f1c40f',    // Kuning
    sad: '#3498db',      // Biru
    angry: '#e74c3c',    // Merah
    surprised: '#9b59b6', // Ungu
    fearful: '#95a5a6',  // Abu-abu
    disgusted: '#2ecc71', // Hijau
    neutral: '#ecf0f1'   // Putih keabu-abuan
};

function log(message) {
    const debug = document.getElementById('debug');
    const timestamp = new Date().toLocaleTimeString();
    if (debug) {
        const maxLogEntries = 10;
        const currentLogs = debug.innerHTML.split('<br>');
        if (currentLogs.length >= maxLogEntries) {
            debug.innerHTML = currentLogs.slice(currentLogs.length - maxLogEntries + 1).join('<br>');
        }
        debug.innerHTML += `[${timestamp}] ${message}<br>`;
        debug.scrollTop = debug.scrollHeight;
    }
    console.log(message);
}

function showSection(mode) {
    document.getElementById('cameraSection').style.display = 'none';
    document.getElementById('photoSection').style.display = 'none';
    document.getElementById('aboutSection').style.display = 'none';

    if (mode === 'camera') {
        document.getElementById('cameraSection').style.display = 'block';
    } else if (mode === 'photo') {
        document.getElementById('photoSection').style.display = 'block';
        stopVideo();
    } else if (mode === 'about') {
        document.getElementById('aboutSection').style.display = 'block';
        stopVideo();
    }
}

async function loadModels() {
    try {
        log("Memuat model...");
        statusElement.textContent = 'Memuat model... Ini mungkin memakan waktu sebentar.';
        spinner.style.display = 'block';

        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        log("Model berhasil dimuat!");
        statusElement.textContent = 'Model berhasil dimuat! Siap untuk deteksi.';
        spinner.style.display = 'none';
        isModelLoaded = true;
        startButton.disabled = false;
    } catch (err) {
        log("Gagal memuat model: " + err.message);
        statusElement.textContent = 'Terjadi kesalahan saat memuat model: ' + err.message + '. Silakan coba muat ulang halaman.';
        spinner.style.display = 'none';
    }
}

async function startVideo() {
    if (!isModelLoaded) {
        statusElement.textContent = 'Model masih dimuat. Harap tunggu.';
        return;
    }

    if (stream) {
        statusElement.textContent = 'Kamera sudah aktif.';
        return;
    }

    try {
        log("Memulai kamera...");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        video.srcObject = stream;

        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            if (detectionInterval) clearInterval(detectionInterval);
            detectionInterval = setInterval(detectExpressions, 100);
            startButton.disabled = true;
            stopButton.disabled = false;
            captureButton.disabled = false;
            statusElement.textContent = 'Kamera aktif. Mencari ekspresi wajah...';
            log("Kamera berhasil dimulai.");
        };

        video.play();
    } catch (err) {
        log("Gagal mengakses kamera: " + err.message);
        statusElement.textContent = 'Gagal mengakses kamera: ' + err.message + '. Pastikan Anda memberikan izin.';
        startButton.disabled = false;
    }
}

function stopVideo() {
    if (stream) {
        log("Menghentikan kamera...");
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        clearInterval(detectionInterval);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        startButton.disabled = false;
        stopButton.disabled = true;
        captureButton.disabled = true;

        expressionDisplay.textContent = 'Menunggu...';
        expressionDisplay.classList.remove('flash');
        statusElement.textContent = 'Kamera dihentikan.';
        log("Kamera dihentikan.");
    }
}

async function detectExpressions() {
    if (video.paused || video.ended || video.readyState !== 4) {
        return;
    }

    try {
        const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: currentInputSize }))
            .withFaceLandmarks()
            .withFaceExpressions();

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (detections.length > 0) {
            let resultsHtml = '';
            
            const resizedDetections = faceapi.resizeResults(detections, { width: canvas.width, height: canvas.height });

            resizedDetections.forEach((detection, index) => {
                const box = detection.detection.box;
                const expressions = detection.expressions;
                
                const sortedExpressions = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
                const dominantExpression = sortedExpressions[0];
                const dominantLabel = dominantExpression[0].charAt(0).toUpperCase() + dominantExpression[0].slice(1);
                // const dominantConfidence = (dominantExpression[1] * 100).toFixed(1); // Tidak digunakan langsung di label canvas

                const filteredExpressions = sortedExpressions.filter(([expName, expValue]) => expValue >= currentMinConfidence);

                if (filteredExpressions.length === 0) {
                    resultsHtml += `Wajah ${index + 1}: <span style="color: #ccc;">Tidak Terdeteksi</span><br>`;
                    return;
                }

                const color = expressionColors[dominantExpression[0]] || '#fff';

                // --- MODIFIKASI UNTUK GAMBAR KOTAK LABEL SEPERTI YANG DIINGINKAN ---

                // Gambar border untuk kotak deteksi wajah DULU
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                // Tentukan ukuran teks
                ctx.font = '22px Arial';
                const text = `${dominantLabel}`;
                const textMetrics = ctx.measureText(text);
                const textWidth = textMetrics.width;
                const textHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent; // Lebih akurat

                const labelPaddingX = 10; // Padding horizontal lebih besar
                const labelPaddingY = 5;  // Padding vertikal

                // Hitung posisi kotak label (di atas kotak deteksi, sedikit masuk ke dalam)
                const labelBoxX = box.x;
                const labelBoxY = box.y - (textHeight + labelPaddingY * 2); // Posisi Y di atas kotak wajah
                const labelBoxWidth = textWidth + labelPaddingX * 2;
                const labelBoxHeight = textHeight + labelPaddingY * 2;

                // Pastikan kotak label tidak keluar dari batas atas canvas
                // Jika labelBoxY negatif, set ke 0
                const adjustedLabelBoxY = Math.max(0, labelBoxY);
                // Jika labelBoxX + labelBoxWidth melebihi canvas width, sesuaikan labelBoxX
                const adjustedLabelBoxX = Math.min(canvas.width - labelBoxWidth, labelBoxX);


                // Gambar kotak background untuk label
                ctx.fillStyle = color;
                ctx.fillRect(adjustedLabelBoxX, adjustedLabelBoxY, labelBoxWidth, labelBoxHeight);
                
                // Gambar teks label di dalam kotak background
                ctx.fillStyle = '#000'; // Warna teks hitam
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic'; // Kembali ke baseline default
                ctx.fillText(text, adjustedLabelBoxX + labelPaddingX, adjustedLabelBoxY + labelPaddingY + textMetrics.actualBoundingBoxAscent);

                // --- AKHIR MODIFIKASI ---


                // Tambahkan detail ekspresi ke HTML (di luar canvas)
                resultsHtml += `Wajah ${index + 1}: `;
                filteredExpressions.forEach(([expName, expValue], i) => {
                    const label = expName.charAt(0).toUpperCase() + expName.slice(1);
                    const confidence = (expValue * 100).toFixed(1);
                    resultsHtml += `<span style="color: ${expressionColors[expName] || '#fff'};">${label} ${confidence}%</span>${i < filteredExpressions.length - 1 ? ', ' : ''}`;
                });
                resultsHtml += '<br>';
            });

            expressionDisplay.innerHTML = resultsHtml;
            expressionDisplay.classList.add('flash');
            setTimeout(() => expressionDisplay.classList.remove('flash'), 300);
        } else {
            expressionDisplay.textContent = 'Tidak ada wajah terdeteksi';
        }
    } catch (err) {
        log("Kesalahan dalam deteksi: " + err.message);
    }
}

function captureSnapshot() {
    if (!stream) {
        alert("Kamera belum aktif. Silakan mulai kamera terlebih dahulu.");
        return;
    }

    const snapshotCanvas = document.createElement('canvas');
    snapshotCanvas.width = video.videoWidth;
    snapshotCanvas.height = video.videoHeight;
    const snapshotCtx = snapshotCanvas.getContext('2d');

    snapshotCtx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
    // Gambar overlay deteksi dari canvas utama
    snapshotCtx.drawImage(canvas, 0, 0); // Ini akan menyertakan kotak dan label yang sudah digambar

    const image = snapshotCanvas.toDataURL("image/png");
    const link = document.createElement('a');
    link.download = `snapshot_ekspresi_${Date.now()}.png`;
    link.href = image;
    link.click();
    log("Tangkapan layar diambil.");
}

imageUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) {
        photoStatus.textContent = 'Tidak ada file dipilih.';
        return;
    }
    
    if (!isModelLoaded) {
        photoStatus.textContent = 'Model masih dimuat. Harap tunggu.';
        return;
    }

    photoStatus.textContent = 'Menganalisis gambar...';
    photoExpression.textContent = 'Menunggu...';
    photoExpression.classList.remove('flash');

    try {
        const img = await faceapi.bufferToImage(file);
        uploadedImage.src = img.src;

        uploadedImage.onload = async () => {
            const displayWidth = uploadedImage.clientWidth;
            const displayHeight = uploadedImage.clientHeight;

            imageCanvas.width = displayWidth;
            imageCanvas.height = displayHeight;

            const ctx = imageCanvas.getContext('2d'); // Pastikan ctx ini adalah untuk imageCanvas
            ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);

            const detections = await faceapi
                .detectAllFaces(uploadedImage, new faceapi.TinyFaceDetectorOptions({ inputSize: currentInputSize }))
                .withFaceLandmarks()
                .withFaceExpressions();

            if (detections.length > 0) {
                const resized = faceapi.resizeResults(detections, {
                    width: displayWidth,
                    height: displayHeight
                });

                let resultsHtml = '';

                resized.forEach((detection, index) => {
                    const box = detection.detection.box;
                    const expressions = detection.expressions;

                    const sortedExpressions = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
                    const dominantExpression = sortedExpressions[0];
                    const dominantLabel = dominantExpression[0].charAt(0).toUpperCase() + dominantExpression[0].slice(1);
                    // const dominantConfidence = (dominantExpression[1] * 100).toFixed(1); // Tidak digunakan langsung di label canvas

                    const filteredExpressions = sortedExpressions.filter(([expName, expValue]) => expValue >= currentMinConfidence);

                    if (filteredExpressions.length === 0) {
                        resultsHtml += `Wajah ${index + 1}: <span style="color: #ccc;">Tidak Terdeteksi</span><br>`;
                        return;
                    }

                    const color = expressionColors[dominantExpression[0]] || '#fff';

                    // --- MODIFIKASI UNTUK GAMBAR KOTAK LABEL SEPERTI YANG DIINGINKAN (MODE FOTO) ---
                    
                    // Gambar border untuk kotak deteksi wajah DULU
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    ctx.strokeRect(box.x, box.y, box.width, box.height);

                    // Tentukan ukuran teks
                    ctx.font = '22px Arial';
                    const text = `${dominantLabel}`;
                    const textMetrics = ctx.measureText(text);
                    const textWidth = textMetrics.width;
                    const textHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;

                    const labelPaddingX = 10;
                    const labelPaddingY = 5;

                    // Hitung posisi kotak label
                    const labelBoxX = box.x;
                    const labelBoxY = box.y - (textHeight + labelPaddingY * 2);
                    const labelBoxWidth = textWidth + labelPaddingX * 2;
                    const labelBoxHeight = textHeight + labelPaddingY * 2;

                    const adjustedLabelBoxY = Math.max(0, labelBoxY);
                    const adjustedLabelBoxX = Math.min(imageCanvas.width - labelBoxWidth, labelBoxX);

                    // Gambar kotak background untuk label
                    ctx.fillStyle = color;
                    ctx.fillRect(adjustedLabelBoxX, adjustedLabelBoxY, labelBoxWidth, labelBoxHeight);
                    
                    // Gambar teks label di dalam kotak background
                    ctx.fillStyle = '#000';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'alphabetic';
                    ctx.fillText(text, adjustedLabelBoxX + labelPaddingX, adjustedLabelBoxY + labelPaddingY + textMetrics.actualBoundingBoxAscent);

                    // --- AKHIR MODIFIKASI (MODE FOTO) ---

                    resultsHtml += `Wajah ${index + 1}: `;
                    filteredExpressions.forEach(([expName, expValue], i) => {
                        const label = expName.charAt(0).toUpperCase() + expName.slice(1);
                        const confidence = (expValue * 100).toFixed(1);
                        resultsHtml += `<span style="color: ${expressionColors[expName] || '#fff'};">${label} ${confidence}%</span>${i < filteredExpressions.length - 1 ? ', ' : ''}`;
                    });
                    resultsHtml += '<br>';
                });

                photoExpression.innerHTML = resultsHtml;
                photoExpression.classList.add('flash');
                setTimeout(() => photoExpression.classList.remove('flash'), 300);
                photoStatus.textContent = `Deteksi selesai. ${detections.length} wajah ditemukan.`;
            } else {
                photoExpression.textContent = 'Tidak ada wajah terdeteksi.';
                photoStatus.textContent = 'Deteksi selesai. Tidak ada wajah ditemukan.';
            }
        };
    } catch (err) {
        photoStatus.textContent = 'Kesalahan saat memproses gambar: ' + err.message;
        log("Kesalahan pemrosesan gambar: " + err.message);
    }
});

inputSizeRange.addEventListener('input', (e) => {
    currentInputSize = parseInt(e.target.value);
    inputSizeValue.textContent = currentInputSize;
    log(`Ukuran Input Model diubah menjadi: ${currentInputSize}`);
});

minConfidenceRange.addEventListener('input', (e) => {
    currentMinConfidence = parseFloat(e.target.value);
    minConfidenceValue.textContent = currentMinConfidence;
    log(`Minimum Kepercayaan Deteksi diubah menjadi: ${currentMinConfidence}`);
});

startButton.addEventListener('click', startVideo);
stopButton.addEventListener('click', stopVideo);
captureButton.addEventListener('click', captureSnapshot);

document.addEventListener('DOMContentLoaded', () => {
    loadModels();
    showSection('camera');
});