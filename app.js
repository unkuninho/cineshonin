import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, deleteDoc, updateDoc, doc, getDocs, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// O objeto de avatares agora é dinâmico e pode ser alterado durante o uso
const avatares = {
    "Kunin": "https://pbs.twimg.com/profile_images/2056927892857036800/CuIC3wUQ_400x400.jpg",
    "Shirlei": "https://pbs.twimg.com/profile_images/2052527008366678018/-k3TkFvu_400x400.jpg"
};

/* ─────────────────────────────────────────
   WebRTC (Transmissão de Vídeo)
───────────────────────────────────────── */

const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

const SALA_ID = "sala-principal";
let peerConnection = null;
let localStream = null;

function refChamada()          { return doc(db, "chamada", SALA_ID); }
function refOfferCandidates()  { return collection(db, "chamada", SALA_ID, "offerCandidates"); }
function refAnswerCandidates() { return collection(db, "chamada", SALA_ID, "answerCandidates"); }

window.iniciarCompartilhamento = async function() {
    const btnShare = document.getElementById("btn-share");

    if (localStream) {
        pararTransmissao();
        return;
    }

    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
    } catch (erro) {
        console.error("Erro ao capturar tela:", erro);
        return;
    }

    const screenVideo = document.getElementById("screen-video");
    screenVideo.srcObject = localStream;
    screenVideo.classList.remove("hidden");
    document.getElementById("sem-transmissao").classList.add("hidden");

    const videoLocal = document.getElementById("local-preview");
    videoLocal.srcObject = localStream;
    videoLocal.classList.remove("hidden");

    btnShare.classList.add("transmitindo");
    btnShare.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="2" width="12" height="9" rx="1.5"/><path d="M4 13h6M7 11v2"/></svg> Parar transmissão`;

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) addDoc(refOfferCandidates(), event.candidate.toJSON());
    };

    localStream.getVideoTracks()[0].onended = () => pararTransmissao();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    await setDoc(refChamada(), {
        offer: { type: offer.type, sdp: offer.sdp },
        answer: null
    });

    onSnapshot(refChamada(), async (snap) => {
        const dados = snap.data();
        if (!peerConnection) return;
        if (dados?.answer && !peerConnection.currentRemoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(dados.answer));
        }
    });

    onSnapshot(refAnswerCandidates(), (snap) => {
        snap.docChanges().forEach(async (change) => {
            if (change.type === "added" && peerConnection)
                await peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        });
    });
};

function pararTransmissao() {
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }

    const videoLocal = document.getElementById("local-preview");
    videoLocal.srcObject = null;
    videoLocal.classList.add("hidden");

    const screenVideo = document.getElementById("screen-video");
    screenVideo.srcObject = null;
    screenVideo.classList.add("hidden");
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
                peerConnection.close();
                peerConnection = null;
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
            video.srcObject = event.streams[0];
            video.classList.remove("hidden");
            document.getElementById("sem-transmissao").classList.add("hidden");
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) addDoc(refAnswerCandidates(), event.candidate.toJSON());
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(dados.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await updateDoc(refChamada(), { answer: { type: answer.type, sdp: answer.sdp } });

        onSnapshot(refOfferCandidates(), (snapCand) => {
            snapCand.docChanges().forEach(async (change) => {
                if (change.type === "added" && peerConnection)
                    await peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            });
        });
    });
}

/* ─────────────────────────────────────────
   PRESENÇA & INTERFACE DA SALA
───────────────────────────────────────── */

async function marcarPresenca(nome, online) {
    await setDoc(doc(db, "presenca", nome), {
        online: online,
        ultimaVez: serverTimestamp()
    });
}

function ouvirPresenca() {
    // Escuta a presença baseada no nome "oposto" da configuração padrão, ou pode ser aprimorado futuramente
    const outro = usuarioAtual === "Kunin" ? "Shirlei" : "Kunin";
    onSnapshot(doc(db, "presenca", outro), (snap) => {
        const dados = snap.data();
        const dot = document.getElementById("presence-dot");
        const label = document.getElementById("presence-label");
        if (!dot || !label) return;
        if (dados && dados.online) {
            dot.className = "presence-dot online";
            label.textContent = outro + " online";
        } else {
            dot.className = "presence-dot offline";
            label.textContent = outro + " offline";
        }
    });
}

window.entrarNaSala = function(nome) {
    usuarioAtual = nome;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("room-screen").classList.remove("hidden");
    
    atualizarBadgeUsuario();

    const btnShare = document.getElementById("btn-share");
    if (nome === "Kunin") {
        btnShare.classList.remove("hidden");
    } else {
        btnShare.classList.add("hidden");
        entrarComoEspectadora();
    }

    marcarPresenca(nome, true);

    window.addEventListener("beforeunload", () => {
        marcarPresenca(usuarioAtual, false);
        if (usuarioAtual === "Kunin") pararTransmissao();
    });

    document.addEventListener("visibilitychange", () => {
        marcarPresenca(usuarioAtual, !document.hidden);
    });

    ouvirPresenca();
    carregarMensagens();
    carregarGavetaFigurinhas();

    document.getElementById("message-input").addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            enviarMensagem();
            esconderPaineis();
        }
    });
};

/* ─────────────────────────────────────────
   EDIÇÃO DINÂMICA DE PERFIL (Nome e Foto)
───────────────────────────────────────── */

function atualizarBadgeUsuario() {
    document.getElementById("user-badge-name").textContent = usuarioAtual;
    document.getElementById("badge-avatar").src = avatares[usuarioAtual] || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png";
}

window.editarPerfil = function() {
    const novoNome = prompt("Como você quer ser chamado(a)?", usuarioAtual);
    if (!novoNome || novoNome.trim() === "") return;
    
    const novaFoto = prompt("Cole o link (URL) da sua nova foto de perfil:", avatares[usuarioAtual] || "");
    if (!novaFoto || novaFoto.trim() === "") return;

    // Desmarca presença do nome antigo antes de trocar
    setDoc(doc(db, "presenca", usuarioAtual), { online: false, ultimaVez: serverTimestamp() });

    // Atualiza dados
    usuarioAtual = novoNome.trim();
    avatares[usuarioAtual] = novaFoto.trim();

    // Reflete as mudanças
    atualizarBadgeUsuario();
    marcarPresenca(usuarioAtual, true);
    
    // Recarrega o chat para as fotos atualizarem (opcional, mas bom pra consistência)
    carregarMensagens();
};

/* ─────────────────────────────────────────
   TELA CHEIA, TRANSPARÊNCIA E PAINEL ESQUERDO
───────────────────────────────────────── */

window.toggleFullScreen = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
        document.exitFullscreen();
    }
};

window.mudarTransparencia = function(valor) {
    document.documentElement.style.setProperty('--bg-alpha', valor);
};

window.toggleLeftPanel = function() {
    const panel = document.getElementById("left-panel-wrapper");
    panel.classList.toggle("minimized");
};

window.apagarHistorico = async function() {
    if(confirm("ATENÇÃO: Isso vai apagar TODAS as mensagens do chat. Tem certeza?")) {
        try {
            const snapshot = await getDocs(query(collection(db, "mensagens")));
            snapshot.forEach(async (d) => await deleteDoc(doc(db, "mensagens", d.id)));
        } catch(e) { console.error("Erro ao apagar histórico: ", e); }
    }
};

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
   MENSAGENS, FIGURINHAS E EDIÇÕES
───────────────────────────────────────── */

window.excluirMensagem = async function(idMsg) {
    if(confirm("Deseja apagar esta mensagem?")) await deleteDoc(doc(db, "mensagens", idMsg));
};

window.editarMensagem = async function(idMsg) {
    const textoAtual = document.getElementById(`texto-${idMsg}`).innerText;
    const novoTexto = prompt("Editar mensagem:", textoAtual);
    if (novoTexto !== null && novoTexto.trim() !== "" && novoTexto !== textoAtual) {
        await updateDoc(doc(db, "mensagens", idMsg), { texto: novoTexto, editado: true });
    }
};

window.excluirFigurinhaDaGaveta = async function(idFig) {
    if(confirm("Remover esta figurinha da gaveta?")) await deleteDoc(doc(db, "gaveta_figurinhas", idFig));
};

function esconderPaineis() {
    document.getElementById("emoji-picker").classList.add("hidden");
    document.getElementById("sticker-picker").classList.add("hidden");
}

window.toggleEmojiPicker = function() {
    document.getElementById("emoji-picker").classList.toggle("hidden");
    document.getElementById("sticker-picker").classList.add("hidden");
};

window.toggleStickerPicker = function() {
    document.getElementById("sticker-picker").classList.toggle("hidden");
    document.getElementById("emoji-picker").classList.add("hidden");
};

document.getElementById("emoji-picker").addEventListener('emoji-click', event => {
    const input = document.getElementById("message-input");
    input.value += event.detail.unicode;
    input.focus();
});

window.enviarMensagem = async function() {
    const input = document.getElementById("message-input");
    const texto = input.value;
    if(texto.trim() === "") return;
    try {
        await addDoc(collection(db, "mensagens"), {
            tipo: "texto", texto: texto, autor: usuarioAtual, hora: serverTimestamp()
        });
        input.value = "";
        esconderPaineis();
    } catch (e) { console.error("Erro ao enviar mensagem: ", e); }
};

function carregarGavetaFigurinhas() {
    const q = query(collection(db, "gaveta_figurinhas"), orderBy("hora"));
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById("sticker-grid");
        grid.innerHTML = "";
        snapshot.forEach((documento) => {
            const fig = documento.data();
            const idFig = documento.id;

            const wrapper = document.createElement("div");
            wrapper.className = "sticker-wrapper";

            const imgElement = document.createElement("img");
            imgElement.src = fig.url;
            imgElement.className = "sticker-item";
            imgElement.title = "Clique para enviar";
            imgElement.onclick = function() { enviarFigurinhaSalva(fig.url); };

            const btnDel = document.createElement("button");
            btnDel.className = "sticker-del-btn";
            btnDel.title = "Remover";
            btnDel.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1L9 9M9 1L1 9" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`;
            btnDel.onclick = function(e) { e.stopPropagation(); excluirFigurinhaDaGaveta(idFig); };

            wrapper.appendChild(imgElement);
            wrapper.appendChild(btnDel);
            grid.appendChild(wrapper);
        });
    });
}

window.salvarNovaFigurinha = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    if (file.size > 800 * 1024) { alert("Imagem muito grande! Escolha uma de até 800KB."); return; }

    const grid = document.getElementById("sticker-grid");
    const loadingId = "loading-" + Date.now();
    grid.innerHTML += `<div id="${loadingId}" style="color:rgba(255,255,255,0.4);font-size:12px;width:100%;padding:8px;">Convertendo...</div>`;

    const reader = new FileReader();
    reader.onloadend = async function() {
        const base64String = reader.result;
        try {
            await addDoc(collection(db, "gaveta_figurinhas"), { url: base64String, hora: serverTimestamp() });
            enviarFigurinhaSalva(base64String);
            const el = document.getElementById(loadingId);
            if (el) el.remove();
        } catch (erro) {
            const el = document.getElementById(loadingId);
            if (el) el.innerText = "Erro ao salvar!";
        }
    };
    reader.readAsDataURL(file);
};

window.enviarFigurinhaSalva = async function(base64String) {
    try {
        await addDoc(collection(db, "mensagens"), {
            tipo: "figurinha", url: base64String, autor: usuarioAtual, hora: serverTimestamp()
        });
        esconderPaineis();
    } catch (erro) { console.error("Erro ao enviar figurinha: ", erro); }
};

/* ─────────────────────────────────────────
   RENDERIZAÇÃO DO CHAT
───────────────────────────────────────── */

function formatarDataHora(timestamp) {
    if (!timestamp) return "";
    const data = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const hoje = new Date();
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (data.toDateString() === hoje.toDateString()) return `hoje ${hora}`;
    if (data.toDateString() === ontem.toDateString()) return `ontem ${hora}`;
    return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + ` ${hora}`;
}

const opacidades = [0.5, 0.65, 0.8, 0.95, 1];

function carregarMensagens() {
    const q = query(collection(db, "mensagens"), orderBy("hora"));
    onSnapshot(q, (snapshot) => {
        const chatBox = document.getElementById("chat-box");
        chatBox.innerHTML = "";

        const todas = [];
        snapshot.forEach((d) => todas.push({ id: d.id, ...d.data() }));
        const ultimas = todas.slice(-5);

        ultimas.forEach((mensagem, idx) => {
            const idMsg = mensagem.id;
            const isOwn = mensagem.autor === usuarioAtual;
            const opacidade = opacidades[idx];

            const separador = document.createElement("div");
            separador.className = "msg-separador";
            separador.textContent = formatarDataHora(mensagem.hora);
            separador.style.opacity = opacidade * 0.6;
            chatBox.appendChild(separador);

            const msgElement = document.createElement("div");
            msgElement.className = `message-row ${isOwn ? 'own' : 'other'}`;
            msgElement.style.opacity = opacidade;

            // Busca a foto no dicionário atualizado de avatares
            const fotoUrl = avatares[mensagem.autor] || "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png";
            const avatarHTML = `<img src="${fotoUrl}" class="avatar">`;

            let conteudoHTML = "";
            let classeExtra = "";
            let botoesAcaoHTML = "";

            if (isOwn) {
                if (mensagem.tipo === "figurinha") {
                    botoesAcaoHTML = `<div class="msg-actions"><button class="btn-action" onclick="excluirMensagem('${idMsg}')" title="Excluir"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
                } else {
                    botoesAcaoHTML = `<div class="msg-actions"><button class="btn-action" onclick="editarMensagem('${idMsg}')" title="Editar"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="btn-action" onclick="excluirMensagem('${idMsg}')" title="Excluir"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
                }
            }

            if (mensagem.tipo === "figurinha") {
                conteudoHTML = `<img src="${mensagem.url}" class="sticker-img">`;
                classeExtra = "is-sticker";
            } else {
                conteudoHTML = `<span id="texto-${idMsg}">${mensagem.texto || ""}</span>`;
                if (mensagem.editado) conteudoHTML += ` <span class="msg-editado">(editado)</span>`;
            }

            const nomeHTML = (!isOwn && mensagem.tipo !== "figurinha")
                ? `<div class="message-author-above">${mensagem.autor}</div>`
                : "";

            const bubbleHTML = `
                <div class="msg-col ${isOwn ? 'col-own' : 'col-other'}">
                    ${nomeHTML}
                    <div class="message-bubble ${classeExtra}">
                        ${botoesAcaoHTML}
                        ${conteudoHTML}
                    </div>
                </div>`;

            msgElement.innerHTML = isOwn ? bubbleHTML + avatarHTML : avatarHTML + bubbleHTML;
            chatBox.appendChild(msgElement);
        });

        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

/* ─────────────────────────────────────────
   FUNDO ANIMADO DO LOGIN
───────────────────────────────────────── */
const fotosDeFundo = [
    "https://lh3.googleusercontent.com/pw/AP1GczN7hy1Erfh8TyyOodUWRE7TyTV87ZG9lmNIeFtNPxTYegdTv9lDsCuHa9pX2gDIW4nAKSjkhJeTLMZ5vlnSXe2b3sgZXXKd3detQuJX0Zd64bvKSTzRONdT3ueXftmAAO-pcw3KfhcpR1meijcMWy-c=w683-h911-s-no-gm?authuser=0",
    "https://lh3.googleusercontent.com/pw/AP1GczNm-4vUYJvI93aikfdouiDN-gxmI-aF0wyGf1XfvwKnNOqkiAdZca1MlHTK_k8EiYd9coqrlB_ssp0jiTHhpXXKA94NzIGf8gvK54weLB6KEhhWcS35ZNAUtbB_IEnoGCd_yLT__hi0kd-MYo_2W5cS=w683-h911-s-no-gm?authuser=0",
    "https://lh3.googleusercontent.com/pw/AP1GczPZEbb1VJvfwOQxrX052UbCRWAg_u3PTQa2BOBFONhGzGLJlQe8bw30ZG0ouw0pIDO60YME1fIvbGP6mbLCAm3sKprEenj-132uqdXspCa6bzK-61QMmGGw3bxT91ybaTvLGcUkpuUBi_ZkUj9PDIVD=w683-h911-s-no-gm?authuser=0",
    "https://lh3.googleusercontent.com/pw/AP1GczOAn5RfTwpDO2J8x_ArQrRWO3iR9EEXfUgkCY0vL7DhXRqpUj0aDSsOgFaH1rIsbOgBO5Geg5_IVgCL07gQ5NxGgrJydfn2eKd9gJHZfhM7LAXDCcKpLWgeNWxTDrt7TJZYaR-v57yzf_QjA2HqsdmP=w683-h911-s-no-gm?authuser=0",
    "https://lh3.googleusercontent.com/pw/AP1GczN8LSIJRG_WyVIuVsZJwYoO2zraP9LAmkKB-zjjpjxV-7pVmxfeutQeuYkPytiyDm8UNK2BfRRJGTB8Pux3TgHoXeRF82xbcp7fgu4z-xctXtUxuCAo1aserBl01dRYzoN_6mtlBQQVhJaBS2tRy607=w683-h911-s-no-gm?authuser=0"
];

let indexFotoFundo = 0;

function rotacionarFundo() {
    const loginScreen = document.getElementById("login-screen");
    if (loginScreen && !loginScreen.classList.contains("hidden")) {
        loginScreen.style.backgroundImage = `url('${fotosDeFundo[indexFotoFundo]}')`;
        indexFotoFundo = (indexFotoFundo + 1) % fotosDeFundo.length;
    }
}

if(fotosDeFundo.length > 0) {
    rotacionarFundo();
    setInterval(rotacionarFundo, 6000); 
}
