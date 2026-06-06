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
let todasFigurinhas = []; // Guarda todas as figurinhas localmente para filtrar sem recarregar o banco

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
    renderizarRecentes(); // Carrega o histórico de recentes na hora que entra
    
    document.getElementById("message-input").addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            enviarMensagem();
            esconderPainéis();
        }
    });
};

/* --- TELA CHEIA, TRANSPARÊNCIA, HISTÓRICO GERAL --- */

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

/* --- NOVO: SISTEMA DE PACOTES, EXCLUSÃO E RECENTES --- */

function carregarGavetaFigurinhas() {
    const q = query(collection(db, "gaveta_figurinhas"), orderBy("hora"));
    onSnapshot(q, (snapshot) => {
        todasFigurinhas = [];
        let pacotes = new Set();
        
        snapshot.forEach((documento) => {
            const fig = documento.data();
            fig.id = documento.id; // Guarda o ID do banco para poder excluir depois
            todasFigurinhas.push(fig);
            if(fig.pacote) pacotes.add(fig.pacote); // Extrai os pacotes únicos
        });

        // Atualiza a lista dropdown de pacotes
        const select = document.getElementById("pack-filter");
        const valorAtual = select.value;
        select.innerHTML = '<option value="Todos">Todos os Pacotes</option>';
        pacotes.forEach(p => {
            select.innerHTML += `<option value="${p}">${p}</option>`;
        });
        if(pacotes.has(valorAtual)) select.value = valorAtual;

        renderizarGaveta();
    });
}

// Renderiza o grid principal baseado no pacote selecionado
window.renderizarGaveta = function() {
    const grid = document.getElementById("sticker-grid");
    grid.innerHTML = ""; 
    const pacoteSelecionado = document.getElementById("pack-filter").value;
    
    todasFigurinhas.forEach((fig) => {
        // Se o pacote for "Todos" passa tudo, senão só renderiza os do pacote correto
        if (pacoteSelecionado !== "Todos" && fig.pacote !== pacoteSelecionado) return;

        const wrapper = document.createElement("div");
        wrapper.className = "sticker-wrapper";

        const imgElement = document.createElement("img");
        imgElement.src = fig.url;
        imgElement.className = "sticker-item";
        imgElement.title = fig.pacote ? `Pacote: ${fig.pacote}` : "Sem pacote";
        imgElement.onclick = function() { enviarFigurinhaSalva(fig.url); };
        
        // Botão de Excluir que aparece no hover
        const btnDel = document.createElement("button");
        btnDel.className = "btn-delete-sticker";
        btnDel.innerText = "×";
        btnDel.title = "Apagar Figurinha";
        btnDel.onclick = (e) => {
            e.stopPropagation(); // Evita que clique na imagem sem querer
            excluirDaGaveta(fig.id);
        };

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
    // Puxa as ultimas 6 da memória do navegador local
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

window.salvarNovaFigurinha = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = ''; 
    const maxTamanho = 800 * 1024; 
    if (file.size > maxTamanho) {
        alert("Imagem muito grande! Escolha uma de até 800KB.");
        return;
    }

    // Pede o nome do pacote para a imagem
    const nomePacote = prompt("Em qual pacote deseja salvar essa figurinha? (ex: Memes, Amor, Engraçadas)", "Geral");
    if (nomePacote === null || nomePacote.trim() === "") return; // Cancelou a operação

    const grid = document.getElementById("sticker-grid");
    const loadingId = "loading-" + Date.now();
    grid.innerHTML += `<div id="${loadingId}" style="color: gray; font-size: 12px; width: 100%;">Salvando...</div>`;
    
    const reader = new FileReader();
    reader.onloadend = async function() {
        const base64String = reader.result;
        try {
            await addDoc(collection(db, "gaveta_figurinhas"), { 
                url: base64String, 
                pacote: nomePacote.trim(), // Salva o nome do pacote no banco
                hora: serverTimestamp() 
            });
            enviarFigurinhaSalva(base64String);
        } catch (erro) {
            document.getElementById(loadingId).innerText = "Erro ao salvar!";
        }
    };
    reader.readAsDataURL(file);
};

window.enviarFigurinhaSalva = async function(base64String) {
    try {
        await addDoc(collection(db, "mensagens"), { tipo: "figurinha", url: base64String, autor: usuarioAtual, hora: serverTimestamp() });
        esconderPainéis();

        // Lógica para salvar a imagem nas "Recentes" (Máximo de 6 itens)
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
