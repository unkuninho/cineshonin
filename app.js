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

const avatares = {
    "Kunin": "https://pbs.twimg.com/profile_images/2056927892857036800/CuIC3wUQ_400x400.jpg",
    "Shirlei": "https://pbs.twimg.com/profile_images/2052527008366678018/-k3TkFvu_400x400.jpg"
};

/* --- PRESENÇA --- */

async function marcarPresenca(nome, online) {
    await setDoc(doc(db, "presenca", nome), {
        online: online,
        ultimaVez: serverTimestamp()
    });
}

function ouvirPresenca() {
    const outrousuario = usuarioAtual === "Kunin" ? "Shirlei" : "Kunin";
    onSnapshot(doc(db, "presenca", outrousuario), (snap) => {
        const dados = snap.data();
        const dot = document.getElementById("presence-dot");
        const label = document.getElementById("presence-label");
        if (!dot || !label) return;
        if (dados && dados.online) {
            dot.className = "presence-dot online";
            label.textContent = outrousuario + " online";
        } else {
            dot.className = "presence-dot offline";
            label.textContent = outrousuario + " offline";
        }
    });
}

window.entrarNaSala = function(nome) {
    usuarioAtual = nome;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("room-screen").classList.remove("hidden");
    document.getElementById("user-badge-name").textContent = nome;

    marcarPresenca(nome, true);

    // Marca offline ao fechar aba
    window.addEventListener("beforeunload", () => marcarPresenca(nome, false));
    // Visibilidade: online quando aba ativa, offline quando minimizada/em background
    document.addEventListener("visibilitychange", () => {
        marcarPresenca(nome, !document.hidden);
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

/* --- TELA CHEIA, TRANSPARÊNCIA, HISTÓRICO --- */

window.toggleFullScreen = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Erro ao entrar em tela cheia: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
};

window.mudarTransparencia = function(valor) {
    document.documentElement.style.setProperty('--bg-alpha', valor);
};

window.apagarHistorico = async function() {
    if(confirm("ATENÇÃO: Isso vai apagar TODAS as mensagens do chat. Tem certeza?")) {
        try {
            const q = query(collection(db, "mensagens"));
            const snapshot = await getDocs(q);
            snapshot.forEach(async (documento) => {
                await deleteDoc(doc(db, "mensagens", documento.id));
            });
        } catch(erro) {
            console.error("Erro ao apagar histórico: ", erro);
        }
    }
};

/* --- EDIÇÃO E EXCLUSÃO INDIVIDUAL DE MENSAGENS --- */

window.excluirMensagem = async function(idMsg) {
    if(confirm("Deseja apagar esta mensagem?")) {
        await deleteDoc(doc(db, "mensagens", idMsg));
    }
};

window.editarMensagem = async function(idMsg) {
    const textoAtual = document.getElementById(`texto-${idMsg}`).innerText;
    const novoTexto = prompt("Editar mensagem:", textoAtual);
    if (novoTexto !== null && novoTexto.trim() !== "" && novoTexto !== textoAtual) {
        await updateDoc(doc(db, "mensagens", idMsg), {
            texto: novoTexto,
            editado: true
        });
    }
};

/* --- EXCLUIR FIGURINHA DA GAVETA --- */

window.excluirFigurinhaDaGaveta = async function(idFig) {
    if(confirm("Remover esta figurinha da gaveta?")) {
        await deleteDoc(doc(db, "gaveta_figurinhas", idFig));
    }
};

/* --- CONTROLE DE PAINÉIS --- */

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

/* --- MENSAGENS --- */

window.enviarMensagem = async function() {
    const input = document.getElementById("message-input");
    const texto = input.value;
    if(texto.trim() === "") return;
    try {
        await addDoc(collection(db, "mensagens"), {
            tipo: "texto",
            texto: texto,
            autor: usuarioAtual,
            hora: serverTimestamp()
        });
        input.value = "";
        esconderPaineis();
    } catch (e) {
        console.error("Erro ao enviar mensagem: ", e);
    }
};

/* --- GAVETA DE FIGURINHAS (com exclusão e fechar ao enviar) --- */

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
            btnDel.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L9 9M9 1L1 9" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`;
            btnDel.onclick = function(e) {
                e.stopPropagation();
                excluirFigurinhaDaGaveta(idFig);
            };

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
    const maxTamanho = 800 * 1024;
    if (file.size > maxTamanho) {
        alert("Imagem muito grande! Escolha uma de até 800KB.");
        return;
    }
    const grid = document.getElementById("sticker-grid");
    const loadingId = "loading-" + Date.now();
    grid.innerHTML += `<div id="${loadingId}" style="color:rgba(255,255,255,0.4);font-size:12px;width:100%;padding:8px;">Convertendo...</div>`;

    const reader = new FileReader();
    reader.onloadend = async function() {
        const base64String = reader.result;
        try {
            await addDoc(collection(db, "gaveta_figurinhas"), { url: base64String, hora: serverTimestamp() });
            enviarFigurinhaSalva(base64String);
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();
        } catch (erro) {
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.innerText = "Erro ao salvar!";
        }
    };
    reader.readAsDataURL(file);
};

window.enviarFigurinhaSalva = async function(base64String) {
    try {
        await addDoc(collection(db, "mensagens"), {
            tipo: "figurinha",
            url: base64String,
            autor: usuarioAtual,
            hora: serverTimestamp()
        });
        // Fecha o picker ao enviar figurinha
        esconderPaineis();
    } catch (erro) {
        console.error("Erro ao enviar figurinha: ", erro);
    }
};

/* --- RENDERIZAÇÃO DAS MENSAGENS --- */

function carregarMensagens() {
    const q = query(collection(db, "mensagens"), orderBy("hora"));
    onSnapshot(q, (snapshot) => {
        const chatBox = document.getElementById("chat-box");
        chatBox.innerHTML = "";

        snapshot.forEach((documento) => {
            const mensagem = documento.data();
            const idMsg = documento.id;
            const msgElement = document.createElement("div");

            const isOwn = mensagem.autor === usuarioAtual;
            msgElement.className = `message-row ${isOwn ? 'own' : 'other'}`;

            const fotoUrl = avatares[mensagem.autor] || "";
            const avatarHTML = `<img src="${fotoUrl}" class="avatar">`;

            let conteudoHTML = "";
            let classeExtra = "";
            let botoesAcaoHTML = "";

            if (isOwn) {
                if (mensagem.tipo === "figurinha") {
                    botoesAcaoHTML = `
                        <div class="msg-actions">
                            <button class="btn-action" onclick="excluirMensagem('${idMsg}')" title="Excluir">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                        </div>`;
                } else {
                    botoesAcaoHTML = `
                        <div class="msg-actions">
                            <button class="btn-action" onclick="editarMensagem('${idMsg}')" title="Editar">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                            <button class="btn-action" onclick="excluirMensagem('${idMsg}')" title="Excluir">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                        </div>`;
                }
            }

            if (mensagem.tipo === "figurinha") {
                conteudoHTML = `<img src="${mensagem.url}" class="sticker-img">`;
                classeExtra = "is-sticker";
            } else {
                conteudoHTML = `<span id="texto-${idMsg}">${mensagem.texto || ""}</span>`;
                if (mensagem.editado) {
                    conteudoHTML += ` <span style="font-size:10px;color:rgba(255,255,255,0.45);font-style:italic;">(editado)</span>`;
                }
            }

            const bubbleHTML = `
                <div class="message-bubble ${classeExtra}">
                    ${botoesAcaoHTML}
                    ${!isOwn && mensagem.tipo !== "figurinha" ? `<span class="message-author">${mensagem.autor}</span>` : ''}
                    ${conteudoHTML}
                </div>
            `;

            msgElement.innerHTML = isOwn ? bubbleHTML + avatarHTML : avatarHTML + bubbleHTML;
            chatBox.appendChild(msgElement);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

window.iniciarCompartilhamento = async function() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
        document.getElementById("screen-video").srcObject = stream;
    } catch (erro) {
        console.error("Erro ao compartilhar a tela: ", erro);
    }
};
