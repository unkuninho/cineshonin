import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, deleteDoc, updateDoc, doc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
let todasFigurinhas = []; 
let pacotesDisponiveis = new Set();
let arquivosPendentesUpload = []; // Agora suporta vários arquivos

const avatares = {
    "Kunin": "https://pbs.twimg.com/profile_images/2056927892857036800/CuIC3wUQ_400x400.jpg",
    "Shirlei": "https://pbs.twimg.com/profile_images/2052527008366678018/-k3TkFvu_400x400.jpg"
};

window.entrarNaSala = function(nome) {
    usuarioAtual = nome;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("room-screen").classList.remove("hidden");
    
    carregarMensagens();
    carregarGavetaFigurinhas(); 
    renderizarRecentes(); 
    
    document.getElementById("message-input").addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            enviarMensagem();
            esconderPainéis();
        }
    });
};

/* --- TELA CHEIA E HISTÓRICO --- */

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

window.apagarHistorico = async function() {
    if(confirm("ATENÇÃO: Isso vai apagar TODAS as mensagens do chat. Tem certeza?")) {
        try {
            const snapshot = await getDocs(query(collection(db, "mensagens")));
            snapshot.forEach(async (documento) => await deleteDoc(doc(db, "mensagens", documento.id)));
        } catch(erro) { console.error(erro); }
    }
};

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

/* --- PAINÉIS --- */

function esconderPainéis() {
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
        await addDoc(collection(db, "mensagens"), { tipo: "texto", texto: texto, autor: usuarioAtual, hora: serverTimestamp() });
        input.value = ""; 
        esconderPainéis();
    } catch (e) { console.error(e); }
};

/* --- SISTEMA DE PACOTES --- */

function carregarGavetaFigurinhas() {
    const q = query(collection(db, "gaveta_figurinhas"), orderBy("hora"));
    onSnapshot(q, (snapshot) => {
        todasFigurinhas = [];
        pacotesDisponiveis.clear();
        
        snapshot.forEach((documento) => {
            const fig = documento.data();
            fig.id = documento.id; 
            todasFigurinhas.push(fig);
            if(fig.pacote) pacotesDisponiveis.add(fig.pacote); 
        });

        const select = document.getElementById("pack-filter");
        const valorAtual = select.value;
        select.innerHTML = '<option value="Todos">Todos os Pacotes</option>';
        pacotesDisponiveis.forEach(p => select.innerHTML += `<option value="${p}">${p}</option>`);
        if(pacotesDisponiveis.has(valorAtual)) select.value = valorAtual;

        renderizarGaveta();
    });
}

window.renderizarGaveta = function() {
    const grid = document.getElementById("sticker-grid");
    grid.innerHTML = ""; 
    const pacoteSelecionado = document.getElementById("pack-filter").value;
    
    todasFigurinhas.forEach((fig) => {
        if (pacoteSelecionado !== "Todos" && fig.pacote !== pacoteSelecionado) return;

        const wrapper = document.createElement("div");
        wrapper.className = "sticker-wrapper";

        const imgElement = document.createElement("img");
        imgElement.src = fig.url;
        imgElement.className = "sticker-item";
        imgElement.title = fig.pacote ? `Pacote: ${fig.pacote}` : "Sem pacote";
        imgElement.onclick = function() { enviarFigurinhaSalva(fig.url); };
        
        const btnDel = document.createElement("button");
        btnDel.className = "btn-delete-sticker";
        btnDel.innerText = "×";
        btnDel.title = "Apagar Figurinha";
        btnDel.onclick = (e) => { e.stopPropagation(); excluirDaGaveta(fig.id); };

        wrapper.appendChild(imgElement);
        wrapper.appendChild(btnDel);
        grid.appendChild(wrapper);
    });
};

window.excluirDaGaveta = async function(idFigurinha) {
    if(confirm("Tem certeza que deseja apagar essa figurinha do seu pacote?")) {
        await deleteDoc(doc(db, "gaveta_figurinhas", idFigurinha));
    }
};

function renderizarRecentes() {
    const grid = document.getElementById("recent-stickers-grid");
    grid.innerHTML = "";
    let recentes = JSON.parse(localStorage.getItem("recentes_nosso_espaco")) || [];
    
    if (recentes.length === 0) {
        grid.innerHTML = `<span style="color: #666; font-size: 11px; padding: 10px;">Nenhuma recente ainda.</span>`;
        return;
    }

    recentes.forEach(url => {
        const img = document.createElement("img");
        img.src = url;
        img.className = "sticker-item"; 
        img.onclick = () => enviarFigurinhaSalva(url);
        grid.appendChild(img);
    });
}

/* --- LÓGICA DO MODAL (UPLOAD MULTIPLO) --- */

window.prepararUpload = function(event) {
    const files = event.target.files;
    if (files.length === 0) return;
    
    arquivosPendentesUpload = [];
    const maxTamanho = 800 * 1024; 
    let ignoradas = 0;

    // Filtra as imagens maiores que o limite e salva as boas
    for (let i = 0; i < files.length; i++) {
        if (files[i].size > maxTamanho) {
            ignoradas++;
        } else {
            arquivosPendentesUpload.push(files[i]);
        }
    }

    if (ignoradas > 0) {
        alert(`${ignoradas} imagem(ns) era(m) maior(es) que 800KB e não será(ão) enviada(s).`);
    }

    event.target.value = ''; 
    
    if (arquivosPendentesUpload.length === 0) return;
    
    const selectUpload = document.getElementById("upload-pack-select");
    selectUpload.innerHTML = '';
    
    pacotesDisponiveis.forEach(p => selectUpload.innerHTML += `<option value="${p}">${p}</option>`);
    selectUpload.innerHTML += `<option value="NOVO" style="font-weight:bold; color:#5865F2;">+ Criar Novo Pacote...</option>`;
    
    if (pacotesDisponiveis.size === 0) {
        selectUpload.value = "NOVO";
    }

    // Atualiza o título do modal
    document.getElementById("modal-title").innerText = arquivosPendentesUpload.length > 1
        ? `Salvar ${arquivosPendentesUpload.length} Figurinhas`
        : `Salvar Figurinha`;

    document.getElementById("upload-modal").classList.remove("hidden");
    toggleNewPackInput(); 
};

window.fecharModalUpload = function() {
    document.getElementById("upload-modal").classList.add("hidden");
    arquivosPendentesUpload = [];
    document.getElementById("new-pack-input").value = "";
};

window.toggleNewPackInput = function() {
    const select = document.getElementById("upload-pack-select");
    const inputNovo = document.getElementById("new-pack-input");
    if (select.value === "NOVO") {
        inputNovo.classList.remove("hidden");
        inputNovo.focus();
    } else {
        inputNovo.classList.add("hidden");
    }
};

window.confirmarUpload = async function() {
    if (arquivosPendentesUpload.length === 0) return;
    
    const arquivosSeguros = [...arquivosPendentesUpload];
    
    const select = document.getElementById("upload-pack-select");
    let nomePacote = select.value;
    
    if (nomePacote === "NOVO") {
        nomePacote = document.getElementById("new-pack-input").value.trim();
        if (nomePacote === "") {
            alert("Digite o nome do novo pacote!");
            return;
        }
    }
    
    fecharModalUpload();

    const grid = document.getElementById("sticker-grid");
    const loadingId = "loading-" + Date.now();
    grid.innerHTML += `<div id="${loadingId}" style="color: gray; font-size: 12px; width: 100%;">Salvando ${arquivosSeguros.length} imagem(ns)...</div>`;
    
    // Processa os arquivos sequencialmente para não sobrecarregar o navegador
    for (let i = 0; i < arquivosSeguros.length; i++) {
        const arquivo = arquivosSeguros[i];
        const reader = new FileReader();

        await new Promise((resolve) => {
            reader.onloadend = async function() {
                const base64String = reader.result;
                try {
                    await addDoc(collection(db, "gaveta_figurinhas"), { 
                        url: base64String, 
                        pacote: nomePacote,
                        hora: serverTimestamp() 
                    });

                    // Se enviou apenas uma, manda direto pro chat. Se enviou várias, guarda apenas na gaveta para não floodar.
                    if (arquivosSeguros.length === 1) {
                        enviarFigurinhaSalva(base64String);
                    } else {
                        // Salva nas recentes silenciosamente
                        let recentes = JSON.parse(localStorage.getItem("recentes_nosso_espaco")) || [];
                        recentes = [base64String, ...recentes.filter(u => u !== base64String)].slice(0, 6);
                        localStorage.setItem("recentes_nosso_espaco", JSON.stringify(recentes));
                        renderizarRecentes();
                    }
                } catch (erro) {
                    console.error("Erro ao salvar", erro);
                }
                resolve();
            };
            reader.readAsDataURL(arquivo);
        });
    }

    const loadElement = document.getElementById(loadingId);
    if(loadElement) loadElement.remove();
};

window.enviarFigurinhaSalva = async function(base64String) {
    try {
        await addDoc(collection(db, "mensagens"), { tipo: "figurinha", url: base64String, autor: usuarioAtual, hora: serverTimestamp() });
        esconderPainéis();

        let recentes = JSON.parse(localStorage.getItem("recentes_nosso_espaco")) || [];
        recentes = [base64String, ...recentes.filter(u => u !== base64String)].slice(0, 6);
        localStorage.setItem("recentes_nosso_espaco", JSON.stringify(recentes));
        renderizarRecentes();

    } catch (erro) { console.error(erro); }
};

/* --- RENDERIZAÇÃO DAS MENSAGENS NO CHAT --- */

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
                    botoesAcaoHTML = `<div class="msg-actions"><button class="btn-action" onclick="excluirMensagem('${idMsg}')" title="Excluir">🗑️</button></div>`;
                } else {
                    botoesAcaoHTML = `<div class="msg-actions"><button class="btn-action" onclick="editarMensagem('${idMsg}')" title="Editar">✏️</button><button class="btn-action" onclick="excluirMensagem('${idMsg}')" title="Excluir">🗑️</button></div>`;
                }
            }

            if (mensagem.tipo === "figurinha") {
                conteudoHTML = `<img src="${mensagem.url}" class="sticker-img">`;
                classeExtra = "is-sticker"; 
            } else {
                conteudoHTML = `<span id="texto-${idMsg}">${mensagem.texto || ""}</span>`; 
                if (mensagem.editado) conteudoHTML += ` <span style="font-size: 10px; color: rgba(255,255,255,0.6); font-style: italic;">(editado)</span>`;
            }

            const bubbleHTML = `<div class="message-bubble ${classeExtra}">${botoesAcaoHTML}${!isOwn && mensagem.tipo !== "figurinha" ? `<span class="message-author">${mensagem.autor}</span>` : ''}${conteudoHTML}</div>`;
            
            if (isOwn) msgElement.innerHTML = bubbleHTML + avatarHTML;
            else msgElement.innerHTML = avatarHTML + bubbleHTML;
            
            chatBox.appendChild(msgElement);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

window.iniciarCompartilhamento = async function() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
        const videoElement = document.getElementById("screen-video");
        videoElement.srcObject = stream;
    } catch (erro) { console.error(erro); }
};
