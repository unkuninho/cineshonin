# cineshonin

Sala privada para assistir tela compartilhada + chat, feita para duas pessoas
(Kunin e Shirlei). Vanilla JS + Firebase Firestore + WebRTC, sem framework.

## O que mudou nesta versão

1. **Autenticação leve por PIN** — cada pessoa digita um PIN de 4 dígitos na
   primeira vez que usa o app em um dispositivo (depois disso a sessão fica
   salva no navegador e não pede de novo). O PIN nunca trafega em texto puro
   nem é comparado no cliente: o hash SHA-256 é conferido pelas regras do
   Firestore contra um hash salvo em `/pins/{nome}`, que o app nunca consegue
   ler diretamente.
2. **Modais customizados** no lugar de `confirm()`/`alert()` nativos (apagar
   mensagem, remover figurinha, apagar histórico, imagem muito grande, PIN).
3. **Toasts de erro** quando um envio falha (mensagem, figurinha, sinal de
   tela) — antes esses erros eram silenciosos.
4. **CSS responsivo básico** para telas menores que 640px.

As fotos de fundo do login e os avatares continuam exatamente como estavam
(não foram alterados).

## Setup necessário no Firebase (só uma vez)

### 1. Ativar autenticação anônima
No [Firebase Console](https://console.firebase.google.com) do projeto
`createseriesapp`: **Authentication > Sign-in method > Anonymous > Ativar**.

### 2. Publicar as novas regras
Copie o conteúdo de `firestore.rules` para
**Firestore Database > Regras** e publique.

### 3. Criar o hash do PIN de cada pessoa
Como a coleção `/pins` não pode ser lida nem escrita pelo app (de propósito
— é o que impede alguém de "adivinhar" o PIN offline), os dois documentos
precisam ser criados manualmente, uma única vez, direto no Console.

Abra o console do navegador (F12) em qualquer site e rode, trocando `"1234"`
pelo PIN escolhido:

```js
async function hash(pin){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
}
hash("1234").then(console.log);
```

Copie o texto que aparecer (64 caracteres) e, no **Firestore Database >
Dados**, crie:

- Coleção `pins`, documento com ID `Kunin`, campo `hash` (string) = hash do
  PIN da Kunin.
- Coleção `pins`, documento com ID `Shirlei`, campo `hash` (string) = hash
  do PIN da Shirlei.

Prontinho — a partir daí, cada card do login vai pedir o PIN correspondente
na primeira vez em cada aparelho.

## Estrutura

- `index.html` — layout e estilos
- `app.js` — lógica (Firestore, WebRTC, autenticação, chat, figurinhas)
- `firestore.rules` — regras de segurança do Firestore
