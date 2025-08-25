import express from "express"
import qrcode from "qrcode"
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys"

const app = express()
const PORT = 3000

let sock
let qrCodeData = ""

// Lista de usuários que já receberam a primeira resposta
const usuariosAtendidos = new Set()

// Função principal do WhatsApp
async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState("auth")
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    })

    // Evento de conexão
    sock.ev.on("connection.update", (update) => {
        const { connection, qr, lastDisconnect } = update
        if (qr) {
            qrCodeData = qr
        }
        if (connection === "close") {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) startSock()
        } else if (connection === "open") {
            qrCodeData = null
            console.log("Conectado ao WhatsApp ✅")
        }
    })

    // Atualização de credenciais
    sock.ev.on("creds.update", saveCreds)

    // Recebimento de mensagens
    sock.ev.on("messages.upsert", async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue
            const sender = msg.key.remoteJid

            // Responde apenas na primeira mensagem do usuário desde que o bot iniciou
            if (!usuariosAtendidos.has(sender)) {
                usuariosAtendidos.add(sender)

                // Envia a imagem
                await sock.sendMessage(sender, {
                    image: { url: "https://raw.githubusercontent.com/JVSM-GAMES/Chatbot_Trafego/refs/heads/main/450106494_1184806682764208_4902864346130955971_n.jpg" },
                    caption: "🌿 Olá, seja bem-vindo ao *CG AGRO* 🌿"
                })

                // Envia os dois vídeos
                await sock.sendMessage(sender, {
                    video: { url: "https://raw.githubusercontent.com/JVSM-GAMES/Chatbot_Trafego/refs/heads/main/Misturador.mp4" },
                    caption: "Misturador de rações!"
                })

                await sock.sendMessage(sender, {
                    video: { url: "https://raw.githubusercontent.com/JVSM-GAMES/Chatbot_Trafego/refs/heads/main/Triturador.mp4" },
                    caption: "Triturador potente!"
                })
            }
        }
    })
}

// Endpoint para gerar QR Code
app.get("/qr", async (req, res) => {
    if (!qrCodeData) return res.send("Nenhum QR gerado no momento.")
    const qrImage = await qrcode.toDataURL(qrCodeData)
    res.send(`<img src="${qrImage}" alt="qr-code"/>`)
})

// Endpoint de settings (simples)
app.get("/settings", (req, res) => {
    res.send("Configurações do bot.")
})

// Endpoint para desconectar o WhatsApp
app.get("/logout", async (req, res) => {
    if (!sock) return res.send("Nenhum dispositivo conectado.")
    try {
        await sock.logout()
        sock.ev.removeAllListeners()
        sock = null
        usuariosAtendidos.clear()
        res.send("Desconectado com sucesso! Você pode gerar um novo QR.")
        console.log("Bot desconectado manualmente.")
    } catch (err) {
        console.error("Erro ao desconectar:", err)
        res.status(500).send("Erro ao desconectar.")
    }
})

// Inicia servidor HTTP
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`)
})

// Inicia WhatsApp
startSock().catch(err => console.error("Erro fatal:", err))
