import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys"
import express from "express"
import qrcode from "qrcode"

const app = express()
const PORT = 3000

let sock
let qrCodeData = ""

// Lista de usuários que já receberam a primeira resposta
const usuariosAtendidos = new Set()

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState("auth")
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    })

    // Evento de QR Code
    sock.ev.on("connection.update", (update) => {
        const { connection, qr, lastDisconnect } = update
        if (qr) {
            qrCodeData = qr
        }
        if (connection === "close") {
            const shouldReconnect = 
                (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut)
            if (shouldReconnect) {
                startSock()
            }
        }
    })

    // Credenciais
    sock.ev.on("creds.update", saveCreds)

    // Mensagens recebidas
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return

        const sender = msg.key.remoteJid

        // Só responde se for a primeira mensagem desse número
        if (!usuariosAtendidos.has(sender)) {
            usuariosAtendidos.add(sender)

            // Envia a imagem com texto
            await sock.sendMessage(sender, {
                image: { url: "https://raw.githubusercontent.com/JVSM-GAMES/Chatbot_Trafego/refs/heads/main/450106494_1184806682764208_4902864346130955971_n.jpg" },
                caption: "🌿 Olá, seja bem-vindo ao atendimento *CG AGRO* 🌿"
            })

            // Envia os dois vídeos
            await sock.sendMessage(sender, {
                video: { url: "https://example.com/video1.mp4" },
                caption: "Conheça mais sobre nossos produtos!"
            })
            await sock.sendMessage(sender, {
                video: { url: "https://example.com/video2.mp4" },
                caption: "Aqui está mais um vídeo informativo!"
            })
        }
    })
}

// Rota para gerar o QR em /qr
app.get("/qr", async (req, res) => {
    if (!qrCodeData) {
        return res.send("Nenhum QR gerado no momento.")
    }
    const qrImage = await qrcode.toDataURL(qrCodeData)
    res.send(`<img src="${qrImage}" alt="qr-code"/>`)
})

// Rota simples de settings
app.get("/settings", (req, res) => {
    res.send("Configurações do bot.")
})

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`)
})

startSock()
