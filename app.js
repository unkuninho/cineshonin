import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, deleteDoc, updateDoc, doc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD4ng6qnK6dZ4U2WKcxu5bEaBJRhVnw0YM",
  authDomain: "createseriesapp.firebaseapp.com",
  projectId: "createseriesapp",
  messagingSenderId: "512877437886",
  appId: "1:512877437886:web:439e98036a281ac5ed8fef"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let usuarioAtual = "";
let cropperInstance = null; 
let nomeTemporarioUpload = ""; 
let respondendoA = null; 

const avatares = {
    "Kunin": "https://pbs.twimg.com/profile_images/2056927892857036800/CuIC3wUQ_400x400.jpg",
    "Shirlei": "https://pbs.twimg.com/profile_images/2052527008366678018/-k3TkFvu_400x400.jpg"
};

/* ─────────────────────────────────────────
   WebRTC (Vídeo)
───────────────────────────────────────── */
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const SALA_ID = "sala-principal";
let peerConnection = null;
let localStream = null;

function refChamada()          { return doc(db, "chamada", SALA_ID); }
function refOfferCandidates()  { return collection(db, "chamada", SALA_ID, "offerCandidates"); }
function refAnswerCandidates() { return collection(db, "chamada", SALA_ID, "answerCandidates"); }

window.iniciarCompartilhamento = async function() {
    const btnShare = document.getElementById("btn-share");
    if (localStream) { pararTransmissao(); return; }
    try { localStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
    } catch (erro) { return; }

    document.getElementById("screen-video").srcObject = localStream; document.getElementById("screen-video").classList.remove("hidden");
    document.getElementById("sem-transmissao").classList.add("hidden");
    document.getElementById("local-preview").srcObject = localStream; document.getElementById("local-preview").classList.remove("hidden");
    btnShare.classList.add("transmitindo"); btnShare.innerHTML = `Parar transmissão`;

    const oldOffers = await getDocs(refOfferCandidates()); oldOffers.forEach(d => deleteDoc(d.ref));
    const oldAnswers = await getDocs(refAnswerCandidates()); oldAnswers.forEach(d => deleteDoc(d.ref));

    peerConnection = new RTCPeerConnection(rtcConfig);
    let answerCandidatesQueue = []; 
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.onicecandidate = (event) => { if (event.candidate) addDoc(refOfferCandidates(), event.candidate.toJSON()); };
    localStream.getVideoTracks()[0].onended = () => pararTransmissao();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await setDoc(refChamada(), { offer: { type: offer.type, sdp: offer.sdp }, answer: null });

    onSnapshot(refChamada(), async (snap) => {
        const dados = snap.data();
        if (dados?.answer && peerConnection && !peerConnection.currentRemoteDescription && peerConnection.signalingState === "have-local-offer") { 
            await peerConnection.setRemoteDescription(new RTCSessionDescription(dados.answer));
            answerCandidatesQueue.forEach(c => peerConnection.addIceCandidate(c).catch(e=>e));
            answerCandidatesQueue = [];
        }
    });

    onSnapshot(refAnswerCandidates(), (snap) => {
        snap.docChanges().forEach((change) => {
            if (change.type === "added" && peerConnection) {
                const candidate = new RTCIceCandidate(change.doc.data());
                if (peerConnection.remoteDescription) peerConnection.addIceCandidate(candidate).catch(e=>e);
                else answerCandidatesQueue.push(candidate);
            }
        });
    });
};

function pararTransmissao() {
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    document.getElementById("local-preview").srcObject = null; document.getElementById("local-preview").classList.add("hidden");
    document.getElementById("screen-video").srcObject = null; document.getElementById("screen-video").classList.add("hidden");
    document.getElementById("sem-transmissao").classList.remove("hidden");
    const btnShare = document.getElementById("btn-share"); btnShare.classList.remove("transmitindo"); btnShare.innerHTML = `Compartilhar tela`;
    setDoc(refChamada(), { offer: null, answer: null });
}

async function entrarComoEspectadora() {
    onSnapshot(refChamada(), async (snap) => {
        const dados = snap.data();
        if (!dados?.offer) {
            if (peerConnection) { peerConnection.close(); peerConnection = null; document.getElementById("screen-video").srcObject = null; document.getElementById("screen-video").classList.add("hidden"); document.getElementById("sem-transmissao").classList.remove("hidden"); }
            return;
        }
        if (peerConnection) return;
        
        peerConnection = new RTCPeerConnection(rtcConfig);
        let offerCandidatesQueue = []; 
        peerConnection.ontrack = (event) => { document.getElementById("screen-video").srcObject = event.streams[0]; document.getElementById("screen-video").classList.remove("hidden"); document.getElementById("sem-transmissao").classList.add("hidden"); };
        peerConnection.onicecandidate = (event) => { if (event.candidate) addDoc(refAnswerCandidates(), event.candidate.toJSON()); };

        onSnapshot(refOfferCandidates(), (snapCand) => {
            snapCand.docChanges().forEach((change) => {
                if (change.type === "added" && peerConnection) {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    if (peerConnection.remoteDescription) peerConnection.addIceCandidate(candidate).catch(e=>e);
                    else offerCandidatesQueue.push(candidate);
                }
            });
        });

        await peerConnection.setRemoteDescription(new RTCSessionDescription(dados.offer));
        offerCandidatesQueue.forEach(c => peerConnection.addIceCandidate(c).catch(e=>e)); offerCandidatesQueue = [];
        const answer = await peerConnection.createAnswer(); await peerConnection.setLocalDescription(answer);
        await updateDoc(refChamada(), { answer: { type: answer.type, sdp: answer.sdp } });
    });
}

/* ─────────────────────────────────────────
   SALA / PRESENÇA / PERFIL
───────────────────────────────────────── */
async function marcarPresenca(nome, online) { await setDoc(doc(db, "presenca", nome), { online: online, ultimaVez: serverTimestamp() }); }
function ouvirPresenca() {
    const outro = usuarioAtual === "Kunin" ? "Shirlei" : "Kunin";
    onSnapshot(doc(db, "presenca", outro), (snap) => {
        const dados = snap.data();
        if (!dados) return;
        document.getElementById("presence-dot").className = dados.online ? "presence-dot online" : "presence-dot offline";
        document.getElementById("presence-label").textContent = outro + (dados.online ? " online" : " offline");
    });
}

window.entrarNaSala = function(nome) {
    usuarioAtual = nome;
    if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
    document.getElementById("login-screen").classList.add("hidden"); document.getElementById("room-screen").classList.remove("hidden");
    atualizarBadgeUsuario();
    if (nome === "Kunin") document.getElementById("btn-share").classList.remove("hidden"); else entrarComoEspectadora();
    marcarPresenca(nome, true);
    window.addEventListener("beforeunload", () => { marcarPresenca(usuarioAtual, false); if (usuarioAtual === "Kunin") pararTransmissao(); });
    document.addEventListener("visibilitychange", () => { marcarPresenca(usuarioAtual, !document.hidden); });
    ouvirPresenca(); carregarMensagens(); carregarGavetaFigurinhas();
    document.getElementById("message-input").addEventListener("keypress", function(e) { if (e.key === "Enter") { enviarMensagem(); esconderPaineis(); } });
};

function atualizarBadgeUsuario() { document.getElementById("user-badge-name").textContent = usuarioAtual; document.getElementById("badge-avatar").src = avatares[usuarioAtual] || ""; }
window.abrirModalPerfil = function() { document.getElementById("edit-name-input").value = usuarioAtual; document.getElementById("modal-edit-profile").classList.remove("hidden"); };
window.fecharModalPerfil = function() { document.getElementById("modal-edit-profile").classList.add("hidden"); };
window.escolherFotoLink = function() { const n = document.getElementById("edit-name-input").value.trim(); if(!n) return; const f = prompt("URL da imagem:"); if (f) { aplicarNovoPerfil(n, f.trim()); fecharModalPerfil(); } };
window.escolherFotoGaleria = function() { const n = document.getElementById("edit-name-input").value.trim(); if(!n) return; nomeTemporarioUpload = n; document.getElementById("profile-upload").click(); };
window.iniciarCorteDeFoto = function(event) {
    const file = event.target.files[0]; if (!file) return; event.target.value = '';
    const reader = new FileReader();
    reader.onloadend = function() { fecharModalPerfil(); const img = document.getElementById("image-to-crop"); img.src = reader.result; document.getElementById("modal-cropper").classList.remove("hidden"); if (cropperInstance) cropperInstance.destroy(); setTimeout(() => { cropperInstance = new Cropper(img, { aspectRatio: 1, viewMode: 1, background: false }); }, 100); };
    reader.readAsDataURL(file);
};
window.fecharModalCropper = function() { document.getElementById("modal-cropper").classList.add("hidden"); if(cropperInstance) cropperInstance.destroy(); };
window.salvarFotoCortada = function() { if (!cropperInstance) return; const canvas = cropperInstance.getCroppedCanvas({ width: 300, height: 300 }); aplicarNovoPerfil(nomeTemporarioUpload, canvas.toDataURL('image/webp', 0.85)); fecharModalCropper(); };
function aplicarNovoPerfil(novoNome, novaFoto) { setDoc(doc(db, "presenca", usuarioAtual), { online: false, ultimaVez: serverTimestamp() }); usuarioAtual = novoNome; avatares[usuarioAtual] = novaFoto; atualizarBadgeUsuario(); marcarPresenca(usuarioAtual, true); carregarMensagens(); }

/* ─────────────────────────────────────────
   GERAÇÃO DE CARD (TMDB & LIVRE) + COMPARTILHAMENTO
───────────────────────────────────────── */
const TMDB_API_KEY = "72c510d429567c89261f7a37b8ef9a0b";
let debounceTimer;
let selectedTMDBMedia = null;
let modoShareAtual = 'tmdb';

window.abrirCompartilhamento = function() {
    document.getElementById("modal-share").classList.remove("hidden");
    mudarModoShare('tmdb');
};

window.fecharModalShare = function() { document.getElementById("modal-share").classList.add("hidden"); };

window.mudarModoShare = function(modo) {
    modoShareAtual = modo;
    if(modo === 'tmdb') {
        document.getElementById("tab-tmdb").classList.add("active");
        document.getElementById("tab-livre").classList.remove("active");
        document.getElementById("share-tmdb-view").classList.remove("hidden");
        document.getElementById("share-livre-view").classList.add("hidden");
        limparSelecaoTMDB();
    } else {
        document.getElementById("tab-livre").classList.add("active");
        document.getElementById("tab-tmdb").classList.remove("active");
        document.getElementById("share-livre-view").classList.remove("hidden");
        document.getElementById("share-tmdb-view").classList.add("hidden");
    }
};

document.getElementById("tmdb-search-input").addEventListener("input", (e) => {
    clearTimeout(debounceTimer); const q = e.target.value.trim(); const resBox = document.getElementById("tmdb-search-results");
    if (q.length < 2) { resBox.classList.add("hidden"); return; }
    debounceTimer = setTimeout(async () => {
        try { const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=pt-BR&query=${encodeURIComponent(q)}`); const data = await res.json(); mostrarResultadosTMDB(data.results); } catch (err) {}
    }, 400);
});

function mostrarResultadosTMDB(results) {
    const resBox = document.getElementById("tmdb-search-results"); resBox.innerHTML = "";
    const validos = results.filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 5);
    if (validos.length === 0) { resBox.innerHTML = `<div style="padding:10px; font-size:12px; color:gray; text-align:center;">Sem resultados.</div>`; resBox.classList.remove("hidden"); return; }
    validos.forEach(item => {
        const titulo = item.title || item.name; const ano = (item.release_date || item.first_air_date || "N/A").substring(0,4);
        const poster = item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : "https://via.placeholder.com/32x48/111/fff?text=Capa";
        
        // CORREÇÃO AQUI: Capta também a imagem "backdrop" (horizontal) para usar de fundo!
        const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : (item.poster_path ? `https://image.tmdb.org/t/p/w1280${item.poster_path}` : poster);
        const highResPoster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : poster;

        const div = document.createElement("div"); div.className = "tmdb-result-item";
        div.innerHTML = `<img src="${poster}" class="tmdb-result-poster"><div class="tmdb-result-text"><strong>${titulo}</strong><span style="font-size:11px;color:gray;">${item.media_type==='movie'?'🎬 Filme':'📺 Série'} • ${ano}</span></div>`;
        div.onclick = () => selecionarTMDB(item, titulo, highResPoster, backdropUrl);
        resBox.appendChild(div);
    });
    resBox.classList.remove("hidden");
}

window.selecionarTMDB = function(item, titulo, posterUrlHighRes, backdropUrl) {
    selectedTMDBMedia = { ...item, titulo: titulo, highResPoster: posterUrlHighRes, backdrop: backdropUrl };
    document.getElementById("tmdb-search-results").classList.add("hidden"); document.querySelector(".tmdb-search-box").classList.add("hidden");
    document.getElementById("tmdb-selected").classList.remove("hidden"); document.getElementById("tmdb-selected-poster").src = `https://image.tmdb.org/t/p/w92${item.poster_path}`; document.getElementById("tmdb-selected-title").textContent = titulo;
    if (item.media_type === 'tv') document.getElementById("tmdb-tv-inputs").classList.remove("hidden"); else document.getElementById("tmdb-tv-inputs").classList.add("hidden");
};

window.limparSelecaoTMDB = function() {
    selectedTMDBMedia = null; document.getElementById("tmdb-selected").classList.add("hidden"); document.querySelector(".tmdb-search-box").classList.remove("hidden"); document.getElementById("tmdb-search-input").value = "";
    document.getElementById("tmdb-season").value = ""; document.getElementById("tmdb-episode").value = ""; document.getElementById("share-rating").value = "";
};

function exibirNotificacaoCopia() {
    const box = document.getElementById("aviso-container");
    box.innerHTML = `<div id="copia-aviso">✨ Imagem gerada! Pressione <b>Ctrl+V</b> para colar no Twitter.</div>`;
}

window.gerarECompartilharCard = async function() {
    const aviso = document.getElementById("gerando-aviso");
    const tituloCap = document.getElementById("cap-title");
    const subCap = document.getElementById("cap-subtitle");
    const ratingCap = document.getElementById("cap-rating");
    const posterCap = document.getElementById("cap-poster");
    const posterWrap = document.getElementById("cap-poster-wrapper");
    const bgImg = document.getElementById("cap-bg-img");
    const bgNoise = document.getElementById("cap-bg-noise");
    const avatar = document.getElementById("cap-avatar");
    
    let nota = document.getElementById("share-rating").value || "S/N";
    ratingCap.textContent = nota;

    const fotoOriginal = avatares[usuarioAtual] || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png";
    avatar.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(fotoOriginal)}`;

    let textoTweet = "";

    if (modoShareAtual === 'tmdb') {
        if (!selectedTMDBMedia) return alert("Selecione um filme ou série primeiro!");
        aviso.classList.remove("hidden");

        const isTv = selectedTMDBMedia.media_type === 'tv';
        let subText = isTv ? "SÉRIE" : "FILME";
        
        let textoAdd = "";
        if (isTv) {
            const temp = document.getElementById("tmdb-season").value; const ep = document.getElementById("tmdb-episode").value;
            if (temp) { subText += ` • T${temp}`; textoAdd += ` Temporada ${temp}`; }
            if (ep) { subText += `E${ep}`; textoAdd += ` Episódio ${ep}`; }
            if(textoAdd) textoAdd = ` (${textoAdd.trim()})`;
        }
        
        tituloCap.textContent = selectedTMDBMedia.titulo;
        subCap.textContent = subText;
        textoTweet = `Estava assistindo ${selectedTMDBMedia.titulo}${textoAdd} e dou a nota ${nota}/10`;

        posterWrap.style.display = "block";
        bgImg.style.display = "block";
        bgNoise.style.opacity = "0.5"; 
        // AQUI ESTÁ A MÁGICA: O fundo agora puxa o Backdrop (A imagem horizontal 16:9 limpa do TMDB)
        bgImg.src = selectedTMDBMedia.backdrop; 
        posterCap.src = selectedTMDBMedia.highResPoster;

    } else {
        const txtLivre = document.getElementById("livre-title-input").value.trim();
        if (!txtLivre) return alert("Digite o que vocês assistiram!");
        aviso.classList.remove("hidden");

        tituloCap.textContent = txtLivre;
        subCap.textContent = "NOSSO ESPAÇO";
        textoTweet = `Estava assistindo ${txtLivre} e dou a nota ${nota}/10`;

        posterWrap.style.display = "none";
        bgImg.style.display = "none";
        bgNoise.style.opacity = "1";
    }

    try {
        const promiseBlob = new Promise(async (resolve, reject) => {
            try {
                const cardElement = document.getElementById("capture-container");
                await new Promise(r => setTimeout(r, 150)); 
                const canvas = await html2canvas(cardElement, { scale: 2, useCORS: true, backgroundColor: '#0b0c10' });
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error("Falha ao criar a imagem"));
                }, 'image/png');
            } catch (e) { reject(e); }
        });

        const clipboardItem = new ClipboardItem({ 'image/png': promiseBlob });
        await navigator.clipboard.write([clipboardItem]);
        
        exibirNotificacaoCopia();
        
        setTimeout(() => {
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(textoTweet)}`, '_blank');
        }, 300);

    } catch (err) {
        console.error("Erro no Clipboard:", err);
        alert("O seu navegador bloqueou a cópia automática da imagem. Tente novamente clicando no botão!");
    } finally {
        fecharModalShare();
        aviso.classList.add("hidden");
    }
};

/* ─────────────────────────────────────────
   TELA CHEIA, ARRASTE DO CHAT E MENSAGENS
───────────────────────────────────────── */
window.toggleFullScreen = function() { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err=>err); else document.exitFullscreen(); };
window.mudarTransparencia = function(valor) { document.documentElement.style.setProperty('--bg-alpha', valor); };
window.toggleLeftPanel = function() { document.getElementById("left-panel-wrapper").classList.toggle("minimized"); };

window.apagarHistorico = async function() { if(confirm("ATENÇÃO: Apagar tudo?")) { const snap = await getDocs(query(collection(db, "mensagens"))); snap.forEach(d => deleteDoc(d.ref)); } };

const overlayPanel = document.getElementById("overlay-panel"); const dragHandle = document.getElementById("drag-handle");
let isDragging = false; let dragOffsetX = 0; let dragOffsetY = 0;
dragHandle.addEventListener("mousedown", (e) => { isDragging = true; const rect = overlayPanel.getBoundingClientRect(); dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top; overlayPanel.style.transition = "none"; overlayPanel.style.bottom = "auto"; overlayPanel.style.right = "auto"; });
document.addEventListener("mousemove", (e) => { if (!isDragging) return; let newX = e.clientX - dragOffsetX; let newY = e.clientY - dragOffsetY; if (newX < 0) newX = 0; if (newY < 0) newY = 0; if (newX + overlayPanel.offsetWidth > window.innerWidth) newX = window.innerWidth - overlayPanel.offsetWidth; if (newY + overlayPanel.offsetHeight > window.innerHeight) newY = window.innerHeight - overlayPanel.offsetHeight; overlayPanel.style.left = `${newX}px`; overlayPanel.style.top = `${newY}px`; });
document.addEventListener("mouseup", () => { if (isDragging) { isDragging = false; overlayPanel.style.transition = "background 0.1s ease"; } });
document.addEventListener("fullscreenchange", () => { const chatBox = document.getElementById("chat-box"); if (document.fullscreenElement) document.body.classList.add("fullscreen-active"); else document.body.classList.remove("fullscreen-active"); setTimeout(() => { if (chatBox) chatBox.scrollTop = chatBox.scrollHeight; }, 100); });

window.excluirMensagem = async function(idMsg) { if(confirm("Apagar?")) await deleteDoc(doc(db, "mensagens", idMsg)); };
window.editarMensagem = async function(idMsg) { const atual = document.getElementById(`texto-${idMsg}`).innerText; const novo = prompt("Editar:", atual); if (novo && novo.trim() !== "" && novo !== atual) await updateDoc(doc(db, "mensagens", idMsg), { texto: novo, editado: true }); };
window.excluirFigurinhaDaGaveta = async function(idFig) { if(confirm("Remover da gaveta?")) await deleteDoc(doc(db, "gaveta_figurinhas", idFig)); };

function esconderPaineis() { document.getElementById("emoji-picker").classList.add("hidden"); document.getElementById("sticker-picker").classList.add("hidden"); }
window.toggleEmojiPicker = function() { document.getElementById("emoji-picker").classList.toggle("hidden"); document.getElementById("sticker-picker").classList.add("hidden"); };
window.toggleStickerPicker = function() { document.getElementById("sticker-picker").classList.toggle("hidden"); document.getElementById("emoji-picker").classList.add("hidden"); };
document.getElementById("emoji-picker").addEventListener('emoji-click', event => { const i = document.getElementById("message-input"); i.value += event.detail.unicode; i.focus(); });

window.prepararResposta = function(idMsg, autor, texto, tipo) { respondendoA = { id: idMsg, autor: autor, texto: texto, tipo: tipo }; document.getElementById("reply-preview-author").textContent = autor; document.getElementById("reply-preview-text").textContent = tipo === 'figurinha' ? '🖼️ Figurinha' : texto; document.getElementById("reply-preview-container").classList.remove("hidden"); document.getElementById("message-input").focus(); };
window.cancelarResposta = function() { respondendoA = null; document.getElementById("reply-preview-container").classList.add("hidden"); };
window.enviarMensagem = async function() { const i = document.getElementById("message-input"); const t = i.value; if(t.trim()==="") return; try { await addDoc(collection(db, "mensagens"), { tipo: "texto", texto: t, autor: usuarioAtual, hora: serverTimestamp(), lida: false, resposta: respondendoA||null }); i.value = ""; esconderPaineis(); cancelarResposta(); } catch(e){} };
window.enviarFigurinhaSalva = async function(base64) { try { await addDoc(collection(db, "mensagens"), { tipo: "figurinha", url: base64, autor: usuarioAtual, hora: serverTimestamp(), lida: false, resposta: respondendoA||null }); esconderPaineis(); cancelarResposta(); } catch(e){} };

function carregarGavetaFigurinhas() {
    onSnapshot(query(collection(db, "gaveta_figurinhas"), orderBy("hora", "desc"), limit(30)), (snap) => {
        const grid = document.getElementById("sticker-grid"); grid.innerHTML = "";
        const figs = []; snap.forEach((d) => figs.push({ id: d.id, ...d.data() }));
        figs.forEach((fig) => {
            const w = document.createElement("div"); w.className = "sticker-wrapper";
            const i = document.createElement("img"); i.src = fig.url; i.className = "sticker-item"; i.onclick = () => enviarFigurinhaSalva(fig.url);
            const b = document.createElement("button"); b.className = "sticker-del-btn"; b.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1L9 9M9 1L1 9" stroke="white" stroke-width="1.5"/></svg>`;
            b.onclick = (e) => { e.stopPropagation(); excluirFigurinhaDaGaveta(fig.id); }; w.appendChild(i); w.appendChild(b); grid.appendChild(w);
        });
    });
}

window.salvarNovaFigurinha = async function(event) {
    const file = event.target.files[0]; if (!file) return; event.target.value = '';
    if (file.size > 800 * 1024) return alert("Imagem muito grande! Até 800KB.");
    const reader = new FileReader();
    reader.onloadend = async function() {
        const base64 = reader.result;
        try { await addDoc(collection(db, "gaveta_figurinhas"), { url: base64, hora: serverTimestamp() }); enviarFigurinhaSalva(base64); } catch(e){}
    }; reader.readAsDataURL(file);
};

function formatarDataHora(ts) { if(!ts) return ""; const d = ts.toDate?ts.toDate():new Date(ts); const h = new Date(); const o = new Date(h); o.setDate(h.getDate()-1); const hh = d.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"}); if(d.toDateString()===h.toDateString()) return `hoje ${hh}`; if(d.toDateString()===o.toDateString()) return `ontem ${hh}`; return d.toLocaleDateString("pt-BR", {day:"2-digit",month:"2-digit"})+` ${hh}`; }

let isInitialLoad = true;
function carregarMensagens() {
    onSnapshot(query(collection(db, "mensagens"), orderBy("hora", "desc"), limit(50)), (snap) => {
        if (!isInitialLoad) { snap.docChanges().forEach((c) => { if(c.type==="added"){ const m=c.doc.data(); if(m.autor!==usuarioAtual && document.hidden && Notification.permission==="granted") new Notification(`De ${m.autor}`, {body:m.tipo==='figurinha'?'🖼️ Figurinha':m.texto}); } }); }
        const box = document.getElementById("chat-box"); box.innerHTML = "";
        const todas = []; snap.forEach((d) => todas.push({ id: d.id, ...d.data() })); todas.reverse();
        todas.forEach((m) => {
            const isOwn = m.autor === usuarioAtual;
            if (!isOwn && !m.lida && document.visibilityState === 'visible') updateDoc(doc(db, "mensagens", m.id), { lida: true }).catch(e=>e);
            
            const sep = document.createElement("div"); sep.className = "msg-separador"; sep.textContent = formatarDataHora(m.hora); box.appendChild(sep);
            const r = document.createElement("div"); r.className = `message-row ${isOwn?'own':'other'}`;
            const ava = `<img src="${avatares[m.autor]||""}" class="avatar">`;
            const txt = m.texto ? m.texto.replace(/'/g, "\\'") : "";
            const bResp = `<button class="btn-action" onclick="prepararResposta('${m.id}', '${m.autor}', '${txt}', '${m.tipo}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg></button>`;
            
            let btnAct = "";
            if (isOwn) {
                if(m.tipo==="figurinha") btnAct = `<div class="msg-actions">${bResp}<button class="btn-action" onclick="excluirMensagem('${m.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"><path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3"/></svg></button></div>`;
                else btnAct = `<div class="msg-actions">${bResp}<button class="btn-action" onclick="editarMensagem('${m.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"><path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z"/></svg></button><button class="btn-action" onclick="excluirMensagem('${m.id}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"><path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3"/></svg></button></div>`;
            } else { btnAct = `<div class="msg-actions">${bResp}</div>`; }

            let cont = m.tipo==="figurinha" ? `<img src="${m.url}" class="sticker-img">` : `<span id="texto-${m.id}">${m.texto||""}</span>${m.editado?' <span class="msg-editado">(editado)</span>':''}`;
            if (m.resposta) cont = `<div class="reply-block"><strong>${m.resposta.autor}</strong>${m.resposta.tipo==='figurinha'?'🖼️ Figurinha':m.resposta.texto}</div>` + cont;
            if (isOwn) cont += `<span class="msg-status"><svg viewBox="0 0 24 24" fill="none" stroke="${m.lida?"#3ba55c":"rgba(255,255,255,0.4)"}" stroke-width="2.5"><path d="M18 6L7 17l-5-5"/><path d="M22 10l-7.5 7.5L13 16"/></svg></span>`;

            r.innerHTML = isOwn ? `<div class="msg-col col-own"><div class="message-bubble ${m.tipo==='figurinha'?'is-sticker':''}">${btnAct}${cont}</div></div>${ava}` : `${ava}<div class="msg-col col-other"><div class="message-author-above">${m.autor}</div><div class="message-bubble ${m.tipo==='figurinha'?'is-sticker':''}">${btnAct}${cont}</div></div>`;
            box.appendChild(r);
        });
        box.scrollTop = box.scrollHeight; isInitialLoad = false;
    });
}

/* ─────────────────────────────────────────
   FUNDO ANIMADO INFINITO DA TELA DE LOGIN
───────────────────────────────────────── */
// Cole aqui os seus 5 links do Google Drive!
const fotosDeFundo = [
    "SUA_FOTO_1_AQUI",
    "SUA_FOTO_2_AQUI",
    "SUA_FOTO_3_AQUI",
    "SUA_FOTO_4_AQUI",
    "SUA_FOTO_5_AQUI"
];

function inicializarSliderFundo() { 
    const track = document.getElementById("slider-track"); 
    if(track && fotosDeFundo.length > 0) { 
        let imagensHtml = fotosDeFundo.map(url => `<img src="${url}">`).join(''); 
        track.innerHTML = imagensHtml + imagensHtml; 
    } 
}
inicializarSliderFundo();
