import express from "express"
import qrcode from "qrcode"
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys"

const app = express()
const PORT = 3000

let sock
let qrCodeData = ""

// Conjunto de usuários que já receberam a primeira resposta
const usuariosAtendidos = new Set()

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState("auth")
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    })

    // Evento de QR Code
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

    // Mensagens recebidas
    sock.ev.on("messages.upsert", async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue
            const sender = msg.key.remoteJid

            // Responde apenas se for a primeira mensagem desde que o bot iniciou
            if (!usuariosAtendidos.has(sender)) {
                usuariosAtendidos.add(sender)

                // Envia a imagem
                await sock.sendMessage(sender, {
                    image: { url: "https://raw.githubusercontent.com/JVSM-GAMES/Chatbot_Trafego/refs/heads/main/450106494_1184806682764208_4902864346130955971_n.jpg" },
                    caption: "🌿 Olá, seja bem-vindo ao *CG AGRO* 🌿"
                })

                // Envia dois vídeos
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

// Rota para gerar QR Code em /qr
app.get("/qr", async (req, res) => {
    if (!qrCodeData) return res.send("Nenhum QR gerado no momento.")
    const qrImage = await qrcode.toDataURL(qrCodeData)
    res.send(`<img src="${qrImage}" alt="qr-code"/>`)
})

// Rota simples de /settings
app.get("/settings", (req, res) => {
    res.send("Configurações do bot.")
})

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`)
})

// Inicia o WhatsApp
startSock().catch(err => console.error("Erro fatal:", err))
