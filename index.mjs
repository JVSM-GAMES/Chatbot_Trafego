import express from 'express'
import Pino from 'pino'
import fs from 'fs'
import * as baileys from '@whiskeysockets/baileys'
import qrcode from 'qrcode'
import { Boom } from '@hapi/boom'

const { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = baileys
const logger = Pino({ level: process.env.LOG_LEVEL || 'info' })
const app = express()
app.use(express.json())

const PORT = process.env.PORT || 10000

// Configurações
const settingsFile = './settings.json'
let settings = { allowGroups: false, blockedNumbers: [] }
if (fs.existsSync(settingsFile)) {
  try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8')) }
  catch (e) { logger.warn('Falha ao carregar settings.json, usando padrão.') }
}

// Estado
let latestQr = null
let sock = null
const usuariosAtendidos = new Set()

// Endpoints
app.get('/', (_, res) => res.send('ok'))

app.get('/qr', async (_, res) => {
  if (!latestQr) return res.send('Nenhum QR disponível (ou já conectado).')
  res.send(`
    <html><body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;">
      <h2>Escaneie o QR abaixo:</h2>
      <img src="${latestQr}" style="width:300px;height:300px" />
    </body></html>
  `)
})

app.get('/settings', (_, res) => res.send("Configurações do bot."))

app.post('/settings', (req, res) => {
  const { allowGroups, blockedNumbers } = req.body
  if (typeof allowGroups === 'boolean') settings.allowGroups = allowGroups
  if (Array.isArray(blockedNumbers)) settings.blockedNumbers = blockedNumbers
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
  res.json({ success: true, settings })
})

// Endpoint para desconectar o WhatsApp
app.get('/logout', async (_, res) => {
  if (!sock) return res.send("Nenhum dispositivo conectado.")
  try {
    await sock.logout()
    sock.ev.removeAllListeners()
    sock = null
    usuariosAtendidos.clear()
    latestQr = null
    res.send("Desconectado com sucesso! Você pode gerar um novo QR.")
    console.log("Bot desconectado manualmente.")
  } catch (err) {
    console.error("Erro ao desconectar:", err)
    res.status(500).send("Erro ao desconectar.")
  }
})

app.listen(PORT, () => logger.info({ PORT }, 'HTTP server online'))

// Função para limpar texto da mensagem
function sanitizeText(msg) {
  const m = msg.message
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    ''
  ).trim()
}

// WhatsApp
async function startWA() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()
  sock = makeWASocket({ version, auth: state, printQRInTerminal: false, logger })

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update
    if (qr) latestQr = await qrcode.toDataURL(qr)
    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      if (shouldReconnect) setTimeout(startWA, 2000)
    } else if (connection === 'open') {
      latestQr = null
      console.log("Conectado ao WhatsApp ✅")
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) return

      const jid = msg.key.remoteJid
      const text = sanitizeText(msg)
      if (!text) return

      const isGroup = jid.endsWith('@g.us')
      const num = jid.replace(/@.*$/, '')

      if ((isGroup && !settings.allowGroups) || settings.blockedNumbers.includes(num)) {
        logger.info(`Ignorando mensagem de ${jid} devido às configurações.`)
        return
      }

      // Responde apenas na primeira mensagem do usuário desde que o bot iniciou
      if (!usuariosAtendidos.has(jid)) {
        usuariosAtendidos.add(jid)

        // Envia imagem
        await sock.sendMessage(jid, {
          image: { url: "https://raw.githubusercontent.com/JVSM-GAMES/Chatbot_Trafego/refs/heads/main/450106494_1184806682764208_4902864346130955971_n.jpg" },
          caption: "🌿 Olá, seja bem-vindo ao *CG AGRO* 🌿"
        })

        // Envia vídeos
        await sock.sendMessage(jid, {
          video: { url: "https://raw.githubusercontent.com/JVSM-GAMES/Chatbot_Trafego/refs/heads/main/Misturador.mp4" },
          caption: "Misturador de rações!"
        })
        await sock.sendMessage(jid, {
          video: { url: "https://raw.githubusercontent.com/JVSM-GAMES/Chatbot_Trafego/refs/heads/main/Triturador.mp4" },
          caption: "Triturador potente!"
        })
      }
    }
  })
}

startWA().catch(err => logger.error({ err }, 'Erro fatal'))
