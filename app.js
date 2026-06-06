import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
// Adicionados: deleteDoc, updateDoc, doc, getDocs
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
    
    document.getElementById("message-input").addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            enviarMensagem();
            esconderPainéis();
        }
    });
};

/* --- NOVAS FUNÇÕES (TELA CHEIA, TRANSPARÊNCIA, HISTÓRICO) --- */

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
    // Altera a variável CSS que criamos, atualizando a opacidade instantaneamente
    document.documentElement.style.setProperty('--bg-alpha', valor);
};

window.apagarHistorico = async function() {
    // Confirmação dupla para não apagar sem querer
    if(confirm("ATENÇÃO: Isso vai apagar TODAS as mensagens do chat para você e para a Shirlei. Tem certeza?")) {
        try {
            const q = query(collection(db, "mensagens"));
            const snapshot = await getDocs(q);
            // Passa por todas as mensagens e deleta uma por uma
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
    // Pega o texto atual direto do HTML para você não precisar digitar tudo de novo
    const textoAtual = document.getElementById(`texto-${idMsg}`).innerText;
    
    // Abre uma caixinha nativa do navegador para digitar o novo texto
    const novoTexto = prompt("Editar mensagem:", textoAtual);
    
    // Se digitou algo diferente de vazio e diferente do antigo, salva no banco
    if (novoTexto !== null && novoTexto.trim() !== "" && novoTexto !== textoAtual) {
        await updateDoc(doc(db, "mensagens", idMsg), {
            texto: novoTexto,
            editado: true // Salva a marcação de edição
        });
    }
};


/* --- CONTROLE DE PAINÉIS, CHAT E FIGURINHAS (Mantidos) --- */

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
        await addDoc(collection(db, "mensagens"), {
            tipo: "texto",
            texto: texto,
            autor: usuarioAtual,
            hora: serverTimestamp() 
        });
        input.value = ""; 
        esconderPainéis();
    } catch (e) {
        console.error("Erro ao enviar mensagem: ", e);
    }
};

function carregarGavetaFigurinhas() {
    const q = query(collection(db, "gaveta_figurinhas"), orderBy("hora"));
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById("sticker-grid");
        grid.innerHTML = ""; 
        snapshot.forEach((doc) => {
            const fig = doc.data();
            const imgElement = document.createElement("img");
            imgElement.src = fig.url;
            imgElement.className = "sticker-item";
            imgElement.title = "Clique para enviar";
            imgElement.onclick = function() { enviarFigurinhaSalva(fig.url); };
            grid.appendChild(imgElement);
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
    grid.innerHTML += `<div id="${loadingId}" style="color: gray; font-size: 12px; width: 100%;">Convertendo...</div>`;
    
    const reader = new FileReader();
    reader.onloadend = async function() {
        const base64String = reader.result;
        try {
            await addDoc(collection(db, "gaveta_figurinhas"), { url: base64String, hora: serverTimestamp() });
            enviarFigurinhaSalva(base64String);
            document.getElementById(loadingId).remove();
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
    } catch (erro) {
        console.error("Erro ao enviar figurinha: ", erro);
    }
};

/* --- RENDERIZAÇÃO DAS MENSAGENS COM BOTÕES --- */

function carregarMensagens() {
    const q = query(collection(db, "mensagens"), orderBy("hora"));
    onSnapshot(q, (snapshot) => {
        const chatBox = document.getElementById("chat-box");
        chatBox.innerHTML = ""; 
        
        snapshot.forEach((documento) => {
            const mensagem = documento.data();
            const idMsg = documento.id; // Precisamos do ID para editar/excluir
            const msgElement = document.createElement("div");
            
            const isOwn = mensagem.autor === usuarioAtual;
            msgElement.className = `message-row ${isOwn ? 'own' : 'other'}`;
            
            const fotoUrl = avatares[mensagem.autor] || "";
            const avatarHTML = `<img src="${fotoUrl}" class="avatar">`;
            
            let conteudoHTML = "";
            let classeExtra = "";
            let botoesAcaoHTML = "";

            // Cria os botões apenas para as SUAS mensagens
            if (isOwn) {
                if (mensagem.tipo === "figurinha") {
                    botoesAcaoHTML = `
                        <div class="msg-actions">
                            <button class="btn-action" onclick="excluirMensagem('${idMsg}')" title="Excluir">🗑️</button>
                        </div>`;
                } else {
                    botoesAcaoHTML = `
                        <div class="msg-actions">
                            <button class="btn-action" onclick="editarMensagem('${idMsg}')" title="Editar">✏️</button>
                            <button class="btn-action" onclick="excluirMensagem('${idMsg}')" title="Excluir">🗑️</button>
                        </div>`;
                }
            }

            if (mensagem.tipo === "figurinha") {
                conteudoHTML = `<img src="${mensagem.url}" class="sticker-img">`;
                classeExtra = "is-sticker"; 
            } else {
                // Coloca o texto dentro de um 'span' com ID para podermos puxar o texto na hora de editar
                conteudoHTML = `<span id="texto-${idMsg}">${mensagem.texto || ""}</span>`; 
                if (mensagem.editado) {
                    conteudoHTML += ` <span style="font-size: 10px; color: rgba(255,255,255,0.6); font-style: italic;">(editado)</span>`;
                }
            }

            const bubbleHTML = `
                <div class="message-bubble ${classeExtra}">
                    ${botoesAcaoHTML}
                    ${!isOwn && mensagem.tipo !== "figurinha" ? `<span class="message-author">${mensagem.autor}</span>` : ''}
                    ${conteudoHTML}
                </div>
            `;
            
            if (isOwn) {
                msgElement.innerHTML = bubbleHTML + avatarHTML;
            } else {
                msgElement.innerHTML = avatarHTML + bubbleHTML;
            }
            
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
    } catch (erro) {
        console.error("Erro ao compartilhar a tela: ", erro);
    }
};