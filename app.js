import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, deleteDoc, updateDoc, doc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
   WebRTC (Transmissão de Vídeo)
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
    } catch (erro) { console.error("Erro ao capturar tela:", erro); return; }

    const screenVideo = document.getElementById("screen-video");
    screenVideo.srcObject = localStream; screenVideo.classList.remove("hidden");
    document.getElementById("sem-transmissao").classList.add("hidden");

    const videoLocal = document.getElementById("local-preview");
    videoLocal.srcObject = localStream; videoLocal.classList.remove("hidden");

    btnShare.classList.add("transmitindo");
    btnShare.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="2" width="12" height="9" rx="1.5"/><path d="M4 13h6M7 11v2"/></svg> Parar transmissão`;

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.onicecandidate = (event) => { if (event.candidate) addDoc(refOfferCandidates(), event.candidate.toJSON()); };
    localStream.getVideoTracks()[0].onended = () => pararTransmissao();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await setDoc(refChamada(), { offer: { type: offer.type, sdp: offer.sdp }, answer: null });

    onSnapshot(refChamada(), async (snap) => {
        const dados = snap.data();
        if (!peerConnection) return;
        if (dados?.answer && !peerConnection.currentRemoteDescription) await peerConnection.setRemoteDescription(new RTCSessionDescription(dados.answer));
    });

    onSnapshot(refAnswerCandidates(), (snap) => {
        snap.docChanges().forEach(async (change) => {
            if (change.type === "added" && peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        });
    });
};

function pararTransmissao() {
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }

    const videoLocal = document.getElementById("local-preview");
    videoLocal.srcObject = null; videoLocal.classList.add("hidden");

    const screenVideo = document.getElementById("screen-video");
    screenVideo.srcObject = null; screenVideo.classList.add("hidden");
    document.getElementById("sem-transmissao").classList.remove("hidden");

    const btnShare = document.getElementById("btn-share");
    btnShare.classList.remove("transmitindo");
    btnShare.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="2" width="12" height="9" rx="1.5"/><path d="M4 13h6M7 11v2"/></svg> Compartilhar tela`;
    setDoc(refChamada(), { offer: null, answer: null });
}

async function entrarComoEspectadora() {
    onSnapshot(refChamada(), async (snap) => {
        const dados = snap.data();
        if (!dados?.offer) {
            if (peerConnection) {
                peerConnection.close(); peerConnection = null;
                document.getElementById("screen-video").srcObject = null;
                document.getElementById("screen-video").classList.add("hidden");
                document.getElementById("sem-transmissao").classList.remove("hidden");
            }
            return;
        }

        if (peerConnection) return;
        peerConnection = new RTCPeerConnection(rtcConfig);
        peerConnection.ontrack = (event) => {
            const video = document.getElementById("screen-video");
            video.srcObject = event.streams[0]; video.classList.remove("hidden");
            document.getElementById("sem-transmissao").classList.add("hidden");
        };

        peerConnection.onicecandidate = (event) => { if (event.candidate) addDoc(refAnswerCandidates(), event.candidate.toJSON()); };
        await peerConnection.setRemoteDescription(new RTCSessionDescription(dados.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await updateDoc(refChamada(), { answer: { type: answer.type, sdp: answer.sdp } });

        onSnapshot(refOfferCandidates(), (snapCand) => {
            snapCand.docChanges().forEach(async (change) => {
                if (change.type === "added" && peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            });
        });
    });
}

/* ─────────────────────────────────────────
   PRESENÇA E CONTROLE DA SALA
───────────────────────────────────────── */
async function marcarPresenca(nome, online) {
    await setDoc(doc(db, "presenca", nome), { online: online, ultimaVez: serverTimestamp() });
}

function ouvirPresenca() {
    const outro = usuarioAtual === "Kunin" ? "Shirlei" : "Kunin";
    onSnapshot(doc(db, "presenca", outro), (snap) => {
        const dados = snap.data();
        const dot = document.getElementById("presence-dot");
        const label = document.getElementById("presence-label");
        if (!dot || !label) return;
        if (dados && dados.online) {
            dot.className = "presence-dot online"; label.textContent = outro + " online";
        } else {
            dot.className = "presence-dot offline"; label.textContent = outro + " offline";
        }
    });
}

window.entrarNaSala = function(nome) {
    usuarioAtual = nome;
    
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("room-screen").classList.remove("hidden");
    
    atualizarBadgeUsuario();

    const btnShare = document.getElementById("btn-share");
    if (nome === "Kunin") btnShare.classList.remove("hidden");
    else { btnShare.classList.add("hidden"); entrarComoEspectadora(); }

    marcarPresenca(nome, true);
    window.addEventListener("beforeunload", () => { marcarPresenca(usuarioAtual, false); if (usuarioAtual === "Kunin") pararTransmissao(); });
    
    document.addEventListener("visibilitychange", () => { 
        const isVisible = !document.hidden;
        marcarPresenca(usuarioAtual, isVisible); 
        
        if(isVisible) {
            getDocs(query(collection(db, "mensagens"))).then(snap => {
                snap.forEach(d => {
                    let m = d.data();
                    if (m.autor !== usuarioAtual && !m.lida) {
                        updateDoc(doc(db, "mensagens", d.id), { lida: true });
                    }
                });
            });
        }
    });

    ouvirPresenca(); carregarMensagens(); carregarGavetaFigurinhas();

    document.getElementById("message-input").addEventListener("keypress", function(event) {
        if (event.key === "Enter") { enviarMensagem(); esconderPaineis(); }
    });
};

/* ─────────────────────────────────────────
   EDIÇÃO DE PERFIL COM CROPPER
───────────────────────────────────────── */
function atualizarBadgeUsuario() {
    document.getElementById("user-badge-name").textContent = usuarioAtual;
    document.getElementById("badge-avatar").src = avatares[usuarioAtual] || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png";
}

window.abrirModalPerfil = function() {
    document.getElementById("edit-name-input").value = usuarioAtual;
    document.getElementById("modal-edit-profile").classList.remove("hidden");
};

window.fecharModalPerfil = function() { document.getElementById("modal-edit-profile").classList.add("hidden"); };

window.escolherFotoLink = function() {
    const novoNome = document.getElementById("edit-name-input").value.trim();
    if (!novoNome) return alert("Por favor, digite um nome!");
    const novaFoto = prompt("Cole o link (URL) da imagem:");
    if (novaFoto && novaFoto.trim() !== "") { aplicarNovoPerfil(novoNome, novaFoto.trim()); fecharModalPerfil(); }
};

window.escolherFotoGaleria = function() {
    const novoNome = document.getElementById("edit-name-input").value.trim();
    if (!novoNome) return alert("Por favor, digite um nome!");
    nomeTemporarioUpload = novoNome;
    document.getElementById("profile-upload").click(); 
};

window.iniciarCorteDeFoto = function(event) {
    const file = event.target.files[0]; if (!file) return; event.target.value = '';

    const reader = new FileReader();
    reader.onloadend = function() {
        fecharModalPerfil(); 
        const img = document.getElementById("image-to-crop"); img.src = reader.result;
        document.getElementById("modal-cropper").classList.remove("hidden");

        if (cropperInstance) cropperInstance.destroy();
        setTimeout(() => {
            cropperInstance = new Cropper(img, { aspectRatio: 1, viewMode: 1, background: false, dragMode: 'move' });
        }, 100);
    };
    reader.readAsDataURL(file);
};

window.fecharModalCropper = function() {
    document.getElementById("modal-cropper").classList.add("hidden");
    if(cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
};

window.salvarFotoCortada = function() {
    if (!cropperInstance) return;
    const canvas = cropperInstance.getCroppedCanvas({ width: 300, height: 300 });
    const croppedBase64 = canvas.toDataURL('image/webp', 0.85);
    aplicarNovoPerfil(nomeTemporarioUpload, croppedBase64);
    fecharModalCropper();
};

function aplicarNovoPerfil(novoNome, novaFoto) {
    setDoc(doc(db, "presenca", usuarioAtual), { online: false, ultimaVez: serverTimestamp() });
    usuarioAtual = novoNome; avatares[usuarioAtual] = novaFoto;
    atualizarBadgeUsuario(); marcarPresenca(usuarioAtual, true); carregarMensagens();
}

/* ─────────────────────────────────────────
   COMPARTILHAMENTO NO X (TWITTER) CORRIGIDO
───────────────────────────────────────── */
window.compartilharNoX = function() {
    const assistido = prompt("O que você estava assistindo?");
    if (!assistido || assistido.trim() === "") return;

    const nota = prompt("Qual nota você dá de 0 a 10?");
    if (!nota || nota.trim() === "") return;

    const texto = `Estava assistindo ${assistido.trim()} e dou a nota ${nota.trim()}/10`;
    
    // Usando a API de intents oficial do Twitter que aceita perfeitamente espaços e caracteres especiais
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(texto)}`;
    
    window.open(url, '_blank');
};

/* ─────────────────────────────────────────
   TELA CHEIA E ARRASTE DO CHAT
───────────────────────────────────────── */
window.toggleFullScreen = function() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => console.error(err));
    else document.exitFullscreen();
};

window.mudarTransparencia = function(valor) { document.documentElement.style.setProperty('--bg-alpha', valor); };
window.toggleLeftPanel = function() { document.getElementById("left-panel-wrapper").classList.toggle("minimized"); };

window.apagarHistorico = async function() {
    if(confirm("ATENÇÃO: Isso vai apagar TODAS as mensagens do chat. Tem certeza?")) {
        try {
            const snapshot = await getDocs(query(collection(db, "mensagens")));
            snapshot.forEach(async (d) => await deleteDoc(doc(db, "mensagens", d.id)));
        } catch(e) { console.error("Erro ao apagar histórico: ", e); }
    }
};

const overlayPanel = document.getElementById("overlay-panel");
const dragHandle = document.getElementById("drag-handle");
let isDragging = false;
let dragOffsetX = 0; let dragOffsetY = 0;

dragHandle.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = overlayPanel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top;
    overlayPanel.style.transition = "none";
    overlayPanel.style.bottom = "auto"; overlayPanel.style.right = "auto";
});

document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    let newX = e.clientX - dragOffsetX; let newY = e.clientY - dragOffsetY;
    
    if (newX < 0) newX = 0; if (newY < 0) newY = 0;
    if (newX + overlayPanel.offsetWidth > window.innerWidth) newX = window.innerWidth - overlayPanel.offsetWidth;
    if (newY + overlayPanel.offsetHeight > window.innerHeight) newY = window.innerHeight - overlayPanel.offsetHeight;

    overlayPanel.style.left = `${newX}px`; overlayPanel.style.top = `${newY}px`;
});

document.addEventListener("mouseup", () => {
    if (isDragging) { isDragging = false; overlayPanel.style.transition = "background 0.1s ease"; }
});

document.addEventListener("fullscreenchange", () => {
    const chatBox = document.getElementById("chat-box");
    if (document.fullscreenElement) {
        document.body.classList.add("fullscreen-active");
        setTimeout(() => { if (chatBox) chatBox.scrollTop = chatBox.scrollHeight; }, 100);
    } else {
        document.body.classList.remove("fullscreen-active");
        setTimeout(() => { if (chatBox) chatBox.scrollTop = chatBox.scrollHeight; }, 100);
    }
});

/* ─────────────────────────────────────────
   MENSAGENS, FIGURINHAS E RESPOSTAS
───────────────────────────────────────── */
window.excluirMensagem = async function(idMsg) { if(confirm("Deseja apagar esta mensagem?")) await deleteDoc(doc(db, "mensagens", idMsg)); };
window.editarMensagem = async function(idMsg) {
    const textoAtual = document.getElementById(`texto-${idMsg}`).innerText;
    const novoTexto = prompt("Editar mensagem:", textoAtual);
    if (novoTexto !== null && novoTexto.trim() !== "" && novoTexto !== textoAtual) await updateDoc(doc(db, "mensagens", idMsg), { texto: novoTexto, editado: true });
};
window.excluirFigurinhaDaGaveta = async function(idFig) { if(confirm("Remover esta figurinha da gaveta?")) await deleteDoc(doc(db, "gaveta_figurinhas", idFig)); };

function esconderPaineis() { document.getElementById("emoji-picker").classList.add("hidden"); document.getElementById("sticker-picker").classList.add("hidden"); }
window.toggleEmojiPicker = function() { document.getElementById("emoji-picker").classList.toggle("hidden"); document.getElementById("sticker-picker").classList.add("hidden"); };
window.toggleStickerPicker = function() { document.getElementById("sticker-picker").classList.toggle("hidden"); document.getElementById("emoji-picker").classList.add("hidden"); };
document.getElementById("emoji-picker").addEventListener('emoji-click', event => {
    const input = document.getElementById("message-input"); input.value += event.detail.unicode; input.focus();
});

window.prepararResposta = function(idMsg, autor, texto, tipo) {
    respondendoA = { id: idMsg, autor: autor, texto: texto, tipo: tipo };
    document.getElementById("reply-preview-author").textContent = autor;
    document.getElementById("reply-preview-text").textContent = tipo === 'figurinha' ? '🖼️ Figurinha' : texto;
    document.getElementById("reply-preview-container").classList.remove("hidden");
    document.getElementById("message-input").focus();
};

window.cancelarResposta = function() {
    respondendoA = null; document.getElementById("reply-preview-container").classList.add("hidden");
};

window.enviarMensagem = async function() {
    const input = document.getElementById("message-input"); const texto = input.value;
    if(texto.trim() === "") return;
    try {
        await addDoc(collection(db, "mensagens"), { tipo: "texto", texto: texto, autor: usuarioAtual, hora: serverTimestamp(), lida: false, resposta: respondendoA ? respondendoA : null });
        input.value = ""; esconderPaineis(); cancelarResposta();
    } catch (e) { console.error("Erro ao enviar mensagem: ", e); }
};

window.enviarFigurinhaSalva = async function(base64String) {
    try {
        await addDoc(collection(db, "mensagens"), { tipo: "figurinha", url: base64String, autor: usuarioAtual, hora: serverTimestamp(), lida: false, resposta: respondendoA ? respondendoA : null });
        esconderPaineis(); cancelarResposta();
    } catch (erro) { console.error("Erro ao enviar figurinha: ", erro); }
};

function carregarGavetaFigurinhas() {
    const q = query(collection(db, "gaveta_figurinhas"), orderBy("hora"));
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById("sticker-grid"); grid.innerHTML = "";
        snapshot.forEach((documento) => {
            const fig = documento.data(); const idFig = documento.id;
            const wrapper = document.createElement("div"); wrapper.className = "sticker-wrapper";
            const imgElement = document.createElement("img"); imgElement.src = fig.url; imgElement.className = "sticker-item";
            imgElement.onclick = function() { enviarFigurinhaSalva(fig.url); };
            const btnDel = document.createElement("button"); btnDel.className = "sticker-del-btn";
            btnDel.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1L9 9M9 1L1 9" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`;
            btnDel.onclick = function(e) { e.stopPropagation(); excluirFigurinhaDaGaveta(idFig); };
            wrapper.appendChild(imgElement); wrapper.appendChild(btnDel); grid.appendChild(wrapper);
        });
    });
}

window.salvarNovaFigurinha = async function(event) {
    const file = event.target.files[0]; if (!file) return; event.target.value = '';
    if (file.size > 800 * 1024) { alert("Imagem muito grande! Escolha uma de até 800KB."); return; }
    const grid = document.getElementById("sticker-grid"); const loadingId = "loading-" + Date.now();
    grid.innerHTML += `<div id="${loadingId}" style="color:rgba(255,255,255,0.4);font-size:12px;width:100%;padding:8px;">Convertendo...</div>`;

    const reader = new FileReader();
    reader.onloadend = async function() {
        const base64String = reader.result;
        try {
            await addDoc(collection(db, "gaveta_figurinhas"), { url: base64String, hora: serverTimestamp() });
            enviarFigurinhaSalva(base64String); const el = document.getElementById(loadingId); if (el) el.remove();
        } catch (erro) { const el = document.getElementById(loadingId); if (el) el.innerText = "Erro ao salvar!"; }
    };
    reader.readAsDataURL(file);
};

/* ─────────────────────────────────────────
   RENDERIZAÇÃO DO CHAT E NOTIFICAÇÕES
───────────────────────────────────────── */
function formatarDataHora(timestamp) {
    if (!timestamp) return "";
    const data = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const hoje = new Date(); const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (data.toDateString() === hoje.toDateString()) return `hoje ${hora}`;
    if (data.toDateString() === ontem.toDateString()) return `ontem ${hora}`;
    return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + ` ${hora}`;
}

const opacidades = [1, 1, 1, 1, 1]; 

let isInitialLoad = true;

function carregarMensagens() {
    const q = query(collection(db, "mensagens"), orderBy("hora"));
    onSnapshot(q, (snapshot) => {
        
        if (!isInitialLoad) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const msg = change.doc.data();
                    if (msg.autor !== usuarioAtual && document.hidden) {
                        if (Notification.permission === "granted") {
                            const notifText = msg.tipo === 'figurinha' ? '🖼️ Nova figurinha' : msg.texto;
                            new Notification(`Mensagem de ${msg.autor}`, {
                                body: notifText,
                                icon: avatares[msg.autor] || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"
                            });
                        }
                    }
                }
            });
        }

        const chatBox = document.getElementById("chat-box"); chatBox.innerHTML = "";
        const todas = []; snapshot.forEach((d) => todas.push({ id: d.id, ...d.data() }));
        const ultimas = todas.slice(-5);

        ultimas.forEach((mensagem, idx) => {
            const idMsg = mensagem.id; const isOwn = mensagem.autor === usuarioAtual; const opacidade = opacidades[idx];

            if (!isOwn && !mensagem.lida && document.visibilityState === 'visible') {
                updateDoc(doc(db, "mensagens", idMsg), { lida: true }).catch(e => console.log(e));
            }

            const separador = document.createElement("div"); separador.className = "msg-separador";
            separador.textContent = formatarDataHora(mensagem.hora); separador.style.opacity = opacidade * 0.6; chatBox.appendChild(separador);

            const msgElement = document.createElement("div"); msgElement.className = `message-row ${isOwn ? 'own' : 'other'}`; msgElement.style.opacity = opacidade;
            const fotoUrl = avatares[mensagem.autor] || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png";
            const avatarHTML = `<img src="${fotoUrl}" class="avatar">`;

            const txtLimpo = mensagem.texto ? mensagem.texto.replace(/'/g, "\\'") : "";
            const btnResponder = `<button class="btn-action" onclick="prepararResposta('${idMsg}', '${mensagem.autor}', '${txtLimpo}', '${mensagem.tipo}')" title="Responder"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg></button>`;

            let conteudoHTML = ""; let classeExtra = ""; let botoesAcaoHTML = "";
            if (isOwn) {
                if (mensagem.tipo === "figurinha") {
                    botoesAcaoHTML = `<div class="msg-actions">${btnResponder}<button class="btn-action" onclick="excluirMensagem('${idMsg}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
                } else {
                    botoesAcaoHTML = `<div class="msg-actions">${btnResponder}<button class="btn-action" onclick="editarMensagem('${idMsg}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="btn-action" onclick="excluirMensagem('${idMsg}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
                }
            } else { botoesAcaoHTML = `<div class="msg-actions">${btnResponder}</div>`; }

            if (mensagem.tipo === "figurinha") { conteudoHTML = `<img src="${mensagem.url}" class="sticker-img">`; classeExtra = "is-sticker";
            } else { conteudoHTML = `<span id="texto-${idMsg}">${mensagem.texto || ""}</span>`; if (mensagem.editado) conteudoHTML += ` <span class="msg-editado">(editado)</span>`; }

            if (mensagem.resposta) {
                const repText = mensagem.resposta.tipo === 'figurinha' ? '🖼️ Figurinha' : (mensagem.resposta.texto || "");
                const replyBlock = `<div class="reply-block"><strong>${mensagem.resposta.autor}</strong>${repText}</div>`;
                conteudoHTML = replyBlock + conteudoHTML;
            }

            let statusTick = "";
            if (isOwn) {
                const cor = mensagem.lida ? "#3ba55c" : "rgba(255,255,255,0.4)";
                statusTick = `<span class="msg-status"><svg viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L7 17l-5-5"/><path d="M22 10l-7.5 7.5L13 16"/></svg></span>`;
                conteudoHTML += statusTick;
            }

            const nomeHTML = (!isOwn && mensagem.tipo !== "figurinha") ? `<div class="message-author-above">${mensagem.autor}</div>` : "";
            const bubbleHTML = `<div class="msg-col ${isOwn ? 'col-own' : 'col-other'}">${nomeHTML}<div class="message-bubble ${classeExtra}">${botoesAcaoHTML}${conteudoHTML}</div></div>`;

            msgElement.innerHTML = isOwn ? bubbleHTML + avatarHTML : avatarHTML + bubbleHTML; chatBox.appendChild(msgElement);
        });
        
        chatBox.scrollTop = chatBox.scrollHeight;
        isInitialLoad = false;
    });
}

/* ─────────────────────────────────────────
   FUNDO ANIMADO INFINITO
───────────────────────────────────────── */
const fotosDeFundo = [
    "https://lh3.googleusercontent.com/pw/AP1GczN7hy1Erfh8TyyOodUWRE7TyTV87ZG9lmNIeFtNPxTYegdTv9lDsCuHa9pX2gDIW4nAKSjkhJeTLMZ5vlnSXe2b3sgZXXKd3detQuJX0Zd64bvKSTzRONdT3ueXftmAAO-pcw3KfhcpR1meijcMWy-c=w683-h911-s-no-gm?authuser=0",
    "https://lh3.googleusercontent.com/pw/AP1GczNm-4vUYJvI93aikfdouiDN-gxmI-aF0wyGf1XfvwKnNOqkiAdZca1MlHTK_k8EiYd9coqrlB_ssp0jiTHhpXXKA94NzIGf8gvK54weLB6KEhhWcS35ZNAUtbB_IEnoGCd_yLT__hi0kd-MYo_2W5cS=w683-h911-s-no-gm?authuser=0",
    "https://lh3.googleusercontent.com/pw/AP1GczPZEbb1VJvfwOQxrX052UbCRWAg_u3PTQa2BOBFONhGzGLJlQe8bw30ZG0ouw0pIDO60YME1fIvbGP6mbLCAm3sKprEenj-132uqdXspCa6bzK-61QMmGGw3bxT91ybaTvLGcUkpuUBi_ZkUj9PDIVD=w683-h911-s-no-gm?authuser=0",
    "https://lh3.googleusercontent.com/pw/AP1GczOAn5RfTwpDO2J8x_ArQrRWO3iR9EEXfUgkCY0vL7DhXRqpUj0aDSsOgFaH1rIsbOgBO5Geg5_IVgCL07gQ5NxGgrJydfn2eKd9gJHZfhM7LAXDCcKpLWgeNWxTDrt7TJZYaR-v57yzf_QjA2HqsdmP=w683-h911-s-no-gm?authuser=0",
    "https://lh3.googleusercontent.com/pw/AP1GczN8LSIJRG_WyVIuVsZJwYoO2zraP9LAmkKB-zjjpjxV-7pVmxfeutQeuYkPytiyDm8UNK2BfRRJGTB8Pux3TgHoXeRF82xbcp7fgu4z-xctXtUxuCAo1aserBl01dRYzoN_6mtlBQQVhJaBS2tRy607=w683-h911-s-no-gm?authuser=0"
];

function inicializarSliderFundo() {
    const track = document.getElementById("slider-track");
    if (track && fotosDeFundo.length > 0) {
        let imagensHtml = fotosDeFundo.map(url => `<img src="${url}" alt="Fundo">`).join('');
        track.innerHTML = imagensHtml + imagensHtml;
    }
}
inicializarSliderFundo();