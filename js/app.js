/* =========================================================
   AVIS - Il Corpo e il Sangue
   app.js — con scheda text-image (cuore / circolazione)
   ========================================================= */

// --- VARIABILI GLOBALI ---
let schedeData         = [];
let currentCardIndex   = 0;
let selectedQuestion   = null;
let matchesFound       = 0;
let totalMatchesNeeded = 0;
let nomeAlunno         = "";
let erroriPerScheda    = [];

// Stato specifico schede text-image
let selectedDomandaId  = null;
let resolvedHotspots   = new Set();

// Coppie abbinate — tenute in memoria per ridisegnare le linee al resize/rotazione
// Ogni elemento: { domEl, targetEl, color, dasharray, useCenter }
let connectedPairs = [];

// Riferimento alla funzione che adatta il wrapper immagine al resize
let currentFitWrapper = null;

// ResizeObserver: scatta quando il contenitore cambia dimensione (es. rotazione tablet)
let resizeObserver = null;

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // blocca il popup automatico
    deferredInstallPrompt = e; // lo salviamo per usarlo dopo
});

function initResizeObserver() {
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => {
        clearTimeout(window._resizeTimer);
        window._resizeTimer = setTimeout(() => {
            if (currentFitWrapper) currentFitWrapper();
            redrawAllLines();
        }, 80);
    });
    resizeObserver.observe(appContainer);
}

function redrawAllLines() {
    const canvas = document.getElementById('lines-canvas');
    if (!canvas) return;
    // Rimuove solo le linee permanenti (non quella temporanea di errore)
    [...canvas.querySelectorAll('line')].filter(l => l.id !== 'temp-err-line').forEach(l => l.remove());
    // Ridisegna ogni coppia salvata
    connectedPairs.forEach(pair => {
        if (!pair.domEl.isConnected || !pair.targetEl.isConnected) return;
        const rD = pair.domEl.getBoundingClientRect();
        const rT = pair.targetEl.getBoundingClientRect();
        const rC = canvas.getBoundingClientRect();
        const x1 = rD.right - rC.left;
        const y1 = rD.top + rD.height / 2 - rC.top;
        const x2 = pair.useCenter
            ? rT.left + rT.width  / 2 - rC.left
            : rT.left - rC.left;
        const y2 = pair.useCenter
            ? rT.top  + rT.height / 2 - rC.top
            : rT.top  + rT.height / 2 - rC.top;
        appendLine(canvas, x1, y1, x2, y2, pair.color, pair.dasharray, null);
    });
}

// --- SUONI ---
const audioCorrect = new Audio('sound/sound-correct.mp3');
const audioError   = new Audio('sound/sound-error.mp3');

function playSound(audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

// --- ELEMENTI DOM ---
const appContainer = document.getElementById('app-container');
const titoloScheda = document.getElementById('titolo-scheda');
const btnNext      = document.getElementById('btn-next');
const btnPrev      = document.getElementById('btn-prev');
const progressBar  = document.getElementById('progress-bar');
const mainFooter   = document.getElementById('main-footer');

// =========================================================
// INIZIALIZZAZIONE
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    mainFooter.style.display = 'none';
    titoloScheda.innerText   = 'Il Corpo e il Sangue';

    fetch('data/data.json')
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(data => {
            schedeData = data.schede;
            showCover();
        })
        .catch(err => {
            appContainer.innerHTML = `<p style="color:red;padding:20px;">Errore nel caricamento dei dati: ${err.message}</p>`;
        });
});

// =========================================================
// MODAL INSTALLAZIONE PWA (Strada A)
// =========================================================
function showInstallModal() {
    // Non mostrare se già installata come app
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /android/i.test(navigator.userAgent);
	const isSafariDesktop = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) 
                        && !isIOS 
                        && !isAndroid;

    let istruzioni = '';
    let mostraBtnInstalla = false;

    if (isIOS) {
        istruzioni = `
            <ol class="install-steps">
                <li>Tocca il tasto <strong>Condividi</strong> in basso (il quadrato con la freccia ↑)</li>
                <li>Scorri e tocca <strong>"Aggiungi a schermata Home"</strong></li>
                <li>Tocca <strong>"Aggiungi"</strong> in alto a destra</li>
            </ol>
            <p class="install-note">⚠️ Usa <strong>Safari</strong> — altri browser non supportano l'installazione su iPad/iPhone.</p>
        `;
    } else if (isAndroid) {
        istruzioni = `
            <ol class="install-steps">
                <li>Tocca il menu <strong>⋮</strong> in alto a destra del browser</li>
                <li>Tocca <strong>"Aggiungi a schermata Home"</strong> o <strong>"Installa app"</strong></li>
                <li>Conferma toccando <strong>"Installa"</strong></li>
            </ol>
        `;
	} else if (isSafariDesktop) {
        istruzioni = `
            <ol class="install-steps">
                <li>Safari su Mac <strong>non supporta</strong> l'installazione di questa app</li>
                <li>Apri questa pagina con <strong>Google Chrome</strong> o <strong>Microsoft Edge</strong></li>
                <li>Clicca l'icona di installazione nella barra degli indirizzi</li>
            </ol>
            <p class="install-note">⚠️ Per installare l'app su Mac usa <strong>Chrome</strong> o <strong>Edge</strong>, non Safari.</p>
        `;
        mostraBtnInstalla = false;
    } else {
        if (deferredInstallPrompt) {
            // Prompt disponibile — app non ancora installata
            istruzioni = `
                <ol class="install-steps">
                    <li>Clicca il bottone <strong>"Installa ora"</strong> qui sotto</li>
                    <li>Clicca <strong>"Installa"</strong> nella finestra che appare</li>
                    <li>L'app si aprirà automaticamente e sarà disponibile sul desktop</li>
                </ol>
            `;
            mostraBtnInstalla = true;
        } else {
            // Prompt non disponibile — potrebbe essere già installata
            // oppure il browser non supporta l'installazione
            istruzioni = `
                <ol class="install-steps">
                    <li>Controlla se l'icona <strong>"Il Corpo e il Sangue"</strong> 
                        è già presente sul desktop o nel menu Start</li>
                    <li>Se la trovi, avviala da lì — <strong>non usare il browser</strong></li>
                    <li>Se non la trovi, clicca l'icona di installazione 
                        nella <strong>barra degli indirizzi</strong> del browser</li>
                </ol>
            `;
            mostraBtnInstalla = true;
        }
    }

    const btnInstalla = mostraBtnInstalla
        ? `<button id="install-modal-btn" class="install-modal-primary" onclick="installaDaPWA()">
               📲 ${deferredInstallPrompt ? 'Installa ora' : 'Installa app'}
           </button>`
        : '';

    const modal = document.createElement('div');
    modal.id = 'install-modal';
    modal.innerHTML = `
        <div id="install-modal-box">
            <div id="install-modal-header">
                <span id="install-modal-icon">📲</span>
                <div>
                    <h2 id="install-modal-title">Installa l'app</h2>
                    <p id="install-modal-sub">Per la migliore esperienza e per usarla <strong>senza internet</strong></p>
                </div>
            </div>
            <div id="install-modal-body">
                ${istruzioni}
            </div>
            <div id="install-modal-actions">
                ${btnInstalla}
                <button class="install-modal-secondary" onclick="chiudiInstallModal()">
                    Continua nel browser
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function chiudiInstallModal() {
    const modal = document.getElementById('install-modal');
    if (modal) {
        modal.classList.add('install-modal-hide');
        setTimeout(() => modal.remove(), 350);
    }
}

function installaDaPWA() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
        deferredInstallPrompt = null;
        chiudiInstallModal();
    });
}

// =========================================================
// COPERTINA
// =========================================================
function showCover() {
	appContainer.style.backgroundColor = '';
    appContainer.innerHTML = `
        <svg id="lines-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;overflow:visible;"></svg>
        <div class="cover-container">
            <h2 class="cover-subtitle">Gioca, Impara e…</h2>
            <h1 class="cover-title">RIFLETTI!</h1>
            <input type="text" id="input-nome"
                   placeholder="Inserisci il tuo nome (facoltativo)"
                   autocomplete="off" autocorrect="off" autocapitalize="words"
                   spellcheck="false" maxlength="20">
            <button id="btn-start" class="btn-start">INIZIA IL PERCORSO</button>
        </div>
    `;
	// WATERMARK PRE-RILASCIO — rimuovere dopo pagamento
	document.body.appendChild(Object.assign(document.createElement('div'), {
		id: 'watermark-test',
		innerText: 'VERSIONE TEST'
	}));
    document.getElementById('btn-start').addEventListener('click', avviaGioco);
    document.getElementById('input-nome').addEventListener('keydown', e => {
        if (e.key === 'Enter') avviaGioco();
    });

    // Mostra banner installazione solo se non già installata e non già mostrata
    if (!window.matchMedia('(display-mode: standalone)').matches &&
		!window.navigator.standalone) {
		showInstallModal();
	}
}

function installaPWA() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
        deferredInstallPrompt = null;
        chiudiBanner();
    });
}

function avviaGioco() {
    // Chiude il banner installazione se ancora visibile
    const banner = document.getElementById('install-banner');
    if (banner) banner.remove();

    const inputVal = document.getElementById('input-nome').value.trim();
    nomeAlunno = inputVal !== '' ? inputVal : 'Campione';
    erroriPerScheda = new Array(schedeData.length).fill(0);

    audioCorrect.volume = 0;
    audioCorrect.play().then(() => {
        audioCorrect.pause();
        audioCorrect.currentTime = 0;
        audioCorrect.volume = 1;
    }).catch(() => {});

    mainFooter.style.display = 'flex';
    loadCard(0);
}

// =========================================================
// CARICAMENTO SCHEDA
// =========================================================
function loadCard(index) {
    currentCardIndex      = index;
    const card            = schedeData[index];

    selectedQuestion      = null;
    selectedDomandaId     = null;
    matchesFound          = 0;
    resolvedHotspots      = new Set();
    connectedPairs        = [];
    currentFitWrapper     = null;
    erroriPerScheda[index] = 0;

    titoloScheda.innerText = (card.icona ? card.icona + ' ' : '') + card.titolo;
    progressBar.innerText  = `Scheda ${index + 1} di ${schedeData.length}`;
    btnPrev.disabled = (index === 0);
    btnNext.disabled = true;
    btnNext.classList.remove('pulse-btn');

    appContainer.innerHTML = `
        <svg id="lines-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;overflow:visible;"></svg>
    `;
	// Colore di sfondo per ogni scheda (pastello)
	const coloriSchede = [
		'#D6EAF8', // azzurro
		'#FEF9E7', // giallo
		'#D5F5E3', // verde
		'#FDEBD0', // pesca
		'#F9F0FF', // lavanda
		'#FDEDEC'  // rosa
	];
	appContainer.style.backgroundColor = coloriSchede[index % coloriSchede.length];

    if (card.tipo === 'text-text') {
        renderTextText(card);
    } else if (card.tipo === 'text-image') {
        renderTextImage(card);
    } else {
        appContainer.innerHTML += `<p style="padding:20px;color:gray;">Tipo scheda non supportato.</p>`;
        btnNext.disabled = false;
    }

    // Avvia il ResizeObserver dopo il render (gestisce rotazione tablet)
    initResizeObserver();
}

// =========================================================
// RENDER: SCHEDA TESTO-TESTO
// =========================================================
function renderTextText(card) {
    totalMatchesNeeded = card.coppie.length;

    const layout = document.createElement('div');
    layout.className = 'layout-testo-testo';

    const colDomande  = document.createElement('div');
    colDomande.className = 'colonna-domande';

    const colRisposte = document.createElement('div');
    colRisposte.className = 'colonna-risposte';

    card.coppie.forEach(coppia => {
        const btn = document.createElement('div');
        btn.className  = 'card-item domanda-item';
        btn.innerText  = coppia.domanda;
        btn.dataset.id = coppia.id_q;
        btn.addEventListener('click', () => selectQuestion(btn));
        colDomande.appendChild(btn);
    });

    let arrayRisposte = card.coppie.map(c => ({ testo: c.risposta, id: c.id_q }));
    if (card.distrattori && card.distrattori.length > 0) {
        card.distrattori.forEach((d, i) => arrayRisposte.push({ testo: d, id: `distrattore_${i}` }));
    }
    // Salva l'ordine originale prima di mescolare (serve per il controllo)
	const arrayRisposteOriginale = [...arrayRisposte];
	arrayRisposte = shuffleNoFixedPoints(arrayRisposte);
	// Fallback: se ci sono distrattori lo shuffle normale va bene
	// perché i distrattori non hanno corrispondenza fissa
	if (arrayRisposteOriginale.length !== arrayRisposte.length) {
		arrayRisposte = shuffleArray(arrayRisposteOriginale);
	}

    arrayRisposte.forEach(risposta => {
        const btn = document.createElement('div');
        btn.className  = 'card-item risposta-item';
        btn.innerText  = risposta.testo;
        btn.dataset.id = risposta.id;
        btn.addEventListener('click', () => checkAnswer(btn));
        colRisposte.appendChild(btn);
    });

    layout.appendChild(colDomande);
    layout.appendChild(colRisposte);
    appContainer.appendChild(layout);
}

// =========================================================
// RENDER: SCHEDA TESTO-IMMAGINE
//
// Principio chiave del responsive:
// Gli hotspot usano coordinate PERCENTUALI (left/top/width/height in %)
// rispetto al wrapper dell'immagine. Quando il wrapper si ridimensiona
// (su tablet piccolo, PC grande, qualsiasi schermo) gli hotspot
// seguono proporzionalmente — senza mai toccare un pixel fisso.
// =========================================================
function renderTextImage(card) {
    totalMatchesNeeded = card.elementi.length;

    // Se l'immagine non è ancora disponibile, mostra placeholder e sblocca avanti
    if (!card.immagine_bg) {
        appContainer.innerHTML += `
            <div style="text-align:center;padding:30px;color:#888;">
                <p style="font-size:1.4rem;margin-bottom:10px;">🚧 Scheda in sviluppo</p>
                <p style="font-size:1rem;">${card.titolo}</p>
            </div>`;
        btnNext.disabled = false;
        return;
    }

    const layout = document.createElement('div');
    layout.className = 'layout-text-image';

    // ---- Colonna SINISTRA: lista domande ----
    const colDomande = document.createElement('div');
    colDomande.className = 'colonna-domande-img';

    // Mescoliamo le domande così ogni partita è diversa
    const domandeMescolate = shuffleArray([...card.elementi]);

    domandeMescolate.forEach((el, i) => {
        const btn = document.createElement('div');
        btn.className  = 'card-item domanda-item domanda-img-item';
        btn.dataset.id = el.id_hotspot;
        btn.innerHTML  = `<span class="domanda-num">${i + 1}</span><span>${el.testo}</span>`;
        btn.addEventListener('click', () => selectDomandaImg(btn, el.id_hotspot));
        colDomande.appendChild(btn);
    });

    // ---- Colonna DESTRA: immagine + hotspot ----
    const colImmagine = document.createElement('div');
    colImmagine.className = 'colonna-immagine';

    // Il wrapper mantiene il rapporto d'aspetto dell'SVG (600:620 ≈ 0.968)
    // e gli hotspot si posizionano su di esso in percentuale
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'img-wrapper';
    imgWrapper.id        = 'img-wrapper';

    const img = document.createElement('img');
    img.src       = card.immagine_bg;
    img.alt       = card.titolo;
    img.className = 'anatomia-img';

    // Adatta il wrapper alle dimensioni reali dell'immagine visualizzata,
    // così gli hotspot in % si allineano sempre correttamente.
    function fitWrapper() {
        const col = colImmagine;
        const colW = col.clientWidth  - 16;  // -padding
        const colH = col.clientHeight - 16;
        const ratio = img.naturalWidth / img.naturalHeight;

        let w = colW;
        let h = colW / ratio;
        if (h > colH) { h = colH; w = colH * ratio; }

        imgWrapper.style.width  = w + 'px';
        imgWrapper.style.height = h + 'px';

        // Ridisegna le linee dopo il resize dell'immagine
        redrawAllLines();
    }

    img.addEventListener('load', fitWrapper);
    if (img.complete && img.naturalWidth) fitWrapper();
    // Rende fitWrapper disponibile al ResizeObserver
    currentFitWrapper = fitWrapper;

    imgWrapper.appendChild(img);

    // Hotspot — rect invisibili (cuore) o circle visibili (circolazione)
    card.elementi.forEach(el => {
        const hs   = el.hotspot;
        const zone = document.createElement('div');
        zone.className  = 'hotspot-zone';
        zone.dataset.id = el.id_hotspot;

        if (hs.shape === 'circle' && hs.visible) {
            const diameter = hs.r * 2;
            zone.style.left   = (hs.cx - hs.r) + '%';
            zone.style.top    = (hs.cy - hs.r) + '%';
            zone.style.width  = diameter + '%';
            zone.style.height = diameter + '%';
            zone.classList.add('hotspot-circle');
            zone.style.setProperty('--hs-color', hs.color);
            zone.style.borderRadius = '50%';
        } else if (hs.shape === 'rect' && hs.visible) {
            // Rettangolo visibile — bordo colorato, sfondo trasparente
            zone.style.left   = hs.x + '%';
            zone.style.top    = hs.y + '%';
            zone.style.width  = hs.w + '%';
            zone.style.height = hs.h + '%';
            zone.classList.add('hotspot-rect-visible');
            zone.style.setProperty('--hs-color', hs.color);
            zone.style.borderRadius = '10px';
        } else {
            // Rettangolo invisibile (default)
            zone.style.left   = hs.x + '%';
            zone.style.top    = hs.y + '%';
            zone.style.width  = hs.w + '%';
            zone.style.height = hs.h + '%';
        }

        zone.addEventListener('click', () => checkAnswerImg(zone, el.id_hotspot));
        imgWrapper.appendChild(zone);
    });

    colImmagine.appendChild(imgWrapper);
    layout.appendChild(colDomande);
    layout.appendChild(colImmagine);
    appContainer.appendChild(layout);
}

// =========================================================
// LOGICA TESTO-TESTO
// =========================================================
function selectQuestion(element) {
    if (element.classList.contains('correct')) return;
    if (selectedQuestion) selectedQuestion.classList.remove('selected');
    selectedQuestion = element;
    selectedQuestion.classList.add('selected');
}

function checkAnswer(elementRisposta) {
    if (!selectedQuestion || elementRisposta.classList.contains('correct')) return;

    const idDomanda  = selectedQuestion.dataset.id;
    const idRisposta = elementRisposta.dataset.id;

    if (idDomanda === idRisposta) {
        playSound(audioCorrect);
        selectedQuestion.classList.remove('selected');
        selectedQuestion.classList.add('correct');
        elementRisposta.classList.add('correct');
        const dEl = selectedQuestion, rEl = elementRisposta;
        requestAnimationFrame(() => drawLineTT(dEl, rEl, '#4CAF50'));
        // Salva la coppia per il ridisegno al resize
        connectedPairs.push({ domEl: dEl, targetEl: rEl, color: '#4CAF50', dasharray: '8,6', useCenter: false });
        selectedQuestion = null;
        matchesFound++;
        if (matchesFound === totalMatchesNeeded) {
            setTimeout(() => showLevelComplete(), 300);
        }
    } else {
        playSound(audioError);
        erroriPerScheda[currentCardIndex]++;
        elementRisposta.classList.add('error');
        setTimeout(() => elementRisposta.classList.remove('error'), 450);
    }
}

// =========================================================
// LOGICA TESTO-IMMAGINE
// =========================================================
function selectDomandaImg(element, id) {
    if (element.classList.contains('correct')) return;
    if (selectedQuestion) selectedQuestion.classList.remove('selected');
    selectedQuestion  = element;
    selectedDomandaId = id;
    selectedQuestion.classList.add('selected');
}

function checkAnswerImg(zoneElement, hotspotId) {
    if (!selectedQuestion || !selectedDomandaId) return;
    if (resolvedHotspots.has(hotspotId)) return;

    if (selectedDomandaId === hotspotId) {
        // ✅ CORRETTO
        playSound(audioCorrect);
        selectedQuestion.classList.remove('selected');
        selectedQuestion.classList.add('correct');
        zoneElement.classList.add('correct');
        resolvedHotspots.add(hotspotId);

        const dEl = selectedQuestion, zEl = zoneElement;
        requestAnimationFrame(() => drawLineImg(dEl, zEl, '#4CAF50', null));
        // Salva la coppia per il ridisegno al resize
        connectedPairs.push({ domEl: dEl, targetEl: zEl, color: '#4CAF50', dasharray: '0', useCenter: true });

        selectedQuestion  = null;
        selectedDomandaId = null;
        matchesFound++;

        if (matchesFound === totalMatchesNeeded) {
            setTimeout(() => showLevelComplete(), 300);
        }
    } else {
        // ❌ ERRATO
        playSound(audioError);
        erroriPerScheda[currentCardIndex]++;

        const domSnap = selectedQuestion;
        const zoneSnap = zoneElement;

        domSnap.classList.add('error-img');

        requestAnimationFrame(() => {
            const lineId = 'temp-err-line';
            // Rimuovi eventuale linea errore precedente
            const old = document.getElementById(lineId);
            if (old) old.remove();

            drawLineImg(domSnap, zoneSnap, '#e30513', lineId);

            setTimeout(() => {
                domSnap.classList.remove('error-img');
                const l = document.getElementById(lineId);
                if (l) l.remove();
            }, 1400);
        });
    }
}

// =========================================================
// EFFETTO LIVELLO SUPERATO
// =========================================================
const messaggi = [
    '⭐ Perfetto!',
    '🏆 Ottimo lavoro!',
    '🎉 Fantastico!',
    '💪 Ben fatto!',
    '🌟 Eccellente!'
];

function showLevelComplete() {
    // Scegli messaggio casuale
    const msg = messaggi[Math.floor(Math.random() * messaggi.length)];

    // Crea overlay sopra tutto il contenuto
    const overlay = document.createElement('div');
    overlay.id = 'level-complete-overlay';
    overlay.innerHTML = `
        <div class="level-complete-box">
            <div class="level-complete-emoji">${msg.split(' ')[0]}</div>
            <div class="level-complete-text">${msg.split(' ').slice(1).join(' ')}</div>
            <div class="level-complete-sub">Scheda completata!</div>
        </div>
    `;

    // Aggiunge sopra app-container (non dentro, per non disturbare il layout)
    document.body.appendChild(overlay);

    // Dopo 2.2s rimuove overlay e sblocca il tasto avanti
    setTimeout(() => {
        overlay.classList.add('level-complete-fade-out');
        setTimeout(() => {
            overlay.remove();
            btnNext.disabled = false;
            btnNext.classList.add('pulse-btn');
        }, 400); // durata fade-out
    }, 2200);
}

// =========================================================
// DISEGNO LINEE SVG
// =========================================================
function drawLineTT(btnA, btnB, color) {
    if (window.innerWidth <= 650) return;
    const canvas = document.getElementById('lines-canvas');
    if (!canvas) return;
    const rA = btnA.getBoundingClientRect();
    const rB = btnB.getBoundingClientRect();
    const rC = canvas.getBoundingClientRect();
    appendLine(canvas,
        rA.right - rC.left,  rA.top + rA.height / 2 - rC.top,
        rB.left  - rC.left,  rB.top + rB.height / 2 - rC.top,
        color, '8,6', null
    );
}

function drawLineImg(domEl, zoneEl, color, id) {
    const canvas = document.getElementById('lines-canvas');
    if (!canvas) return;
    const rD = domEl.getBoundingClientRect();
    const rZ = zoneEl.getBoundingClientRect();
    const rC = canvas.getBoundingClientRect();
    // Partenza: bordo destro della domanda, centrato
    const x1 = rD.right - rC.left;
    const y1 = rD.top + rD.height / 2 - rC.top;
    // Arrivo: centro dell'hotspot sull'immagine
    const x2 = rZ.left + rZ.width  / 2 - rC.left;
    const y2 = rZ.top  + rZ.height / 2 - rC.top;
    appendLine(canvas, x1, y1, x2, y2, color, '0', id);
}

function appendLine(canvas, x1, y1, x2, y2, color, dasharray, id) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '3.5');
    line.setAttribute('stroke-dasharray', dasharray || '0');
    line.setAttribute('stroke-linecap', 'round');
    if (id) line.setAttribute('id', id);
    canvas.appendChild(line);
    return line;
}

// =========================================================
// NAVIGAZIONE
// =========================================================
btnNext.addEventListener('click', () => {
    if (currentCardIndex < schedeData.length - 1) {
        loadCard(currentCardIndex + 1);
    } else {
        showRiepilogo();
    }
});

btnPrev.addEventListener('click', () => {
    if (currentCardIndex > 0) {
        loadCard(currentCardIndex - 1);
    }
});

// =========================================================
// RIEPILOGO FINALE
// =========================================================
function showRiepilogo() {
    mainFooter.style.display = 'none';
	appContainer.style.backgroundColor = '';
    titoloScheda.innerText   = 'Riepilogo Finale';

    let erroriTotali  = 0;
    let domandeTotali = 0;
    let listaHTML     = '';

    schedeData.forEach((scheda, index) => {
        const numDomande = scheda.coppie
            ? scheda.coppie.length
            : (scheda.elementi ? scheda.elementi.length : 0);
        domandeTotali += numDomande;
        const errori    = erroriPerScheda[index];
        erroriTotali   += errori;
        const hasErrors = errori > 0;

        listaHTML += `
            <div class="riepilogo-scheda ${hasErrors ? 'has-errors' : ''}">
                <span class="riepilogo-scheda-title">${scheda.icona ? scheda.icona + ' ' : ''}${scheda.titolo}</span>
                <span class="riepilogo-scheda-stats">
                    Domande: <strong>${numDomande}</strong> &nbsp;|&nbsp;
                    <span style="color:${hasErrors ? 'var(--avis-red)' : 'var(--success-green)'}; font-weight:700;">
                        Errori: ${errori}
                    </span>
                </span>
            </div>`;
    });

    appContainer.innerHTML = `
        <svg id="lines-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;overflow:visible;"></svg>
        <div class="riepilogo-container">
            <h1 class="riepilogo-title">Complimenti<br>${escapeHTML(nomeAlunno.toUpperCase())}!</h1>
            <p class="riepilogo-subtitle">Hai completato il percorso formativo AVIS.</p>
            <div class="riepilogo-counters">
                <div class="counter-box">
                    <div class="counter-label">Totale Domande</div>
                    <div class="counter-value" style="color:var(--avis-blue);">${domandeTotali}</div>
                </div>
                <div class="counter-box">
                    <div class="counter-label">Totale Errori</div>
                    <div class="counter-value" style="color:${erroriTotali === 0 ? 'var(--success-green)' : 'var(--avis-red)'};">
                        ${erroriTotali}
                    </div>
                </div>
            </div>
            <div class="riepilogo-list">${listaHTML}</div>
            <button class="btn-start" onclick="location.reload()">GIOCA DI NUOVO</button>
        </div>
    `;
}

// =========================================================
// UTILITÀ
// =========================================================
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Mescola le risposte garantendo che nessuna risposta
 * rimanga nella stessa posizione della domanda originale.
 * Riprova fino a 20 volte (in pratica sempre < 5).
 * Funziona solo per array di coppie { id } — non per le domande.
 */
function shuffleNoFixedPoints(array) {
    if (array.length <= 1) return array;
    let result;
    let tentativi = 0;
    do {
        result = shuffleArray(array);
        tentativi++;
    } while (
        result.some((item, i) => item.id === array[i].id) &&
        tentativi < 20
    );
    return result;
}

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
