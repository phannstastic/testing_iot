// npm install node-telegram-bot-api express pg mqtt
const express = require('express');
const TelegramBot = require('8580448561:AAERRvFznUnzFR85z-ce80EGgN2J7XCK-TU');
const { Client } = require('pg');
const mqtt = require('mqtt');

// Ambil info dari Environment Variables
const TOKEN = process.env.TELEGRAM_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const MQTT_BROKER_URL = process.env.MQTT_URL;
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.RAILWAY_STATIC_URL; // URL publik dari Railway

if (!TOKEN || !DATABASE_URL || !MQTT_BROKER_URL || !APP_URL) {
  console.error("Error: Variabel environment (TOKEN, DB_URL, MQTT_URL, APP_URL) belum lengkap.");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN);
const app = express();
app.use(express.json());

// Set Webhook
const WEBHOOK_URL = `https://${APP_URL}/api/webhook/${TOKEN}`;
bot.setWebhook(WEBHOOK_URL);
console.log(`[Bot] Webhook diatur ke: ${WEBHOOK_URL}`);

// Koneksi
const dbClient = new Client({ connectionString: DATABASE_URL });
const mqttClient = mqtt.connect(MQTT_BROKER_URL);

dbClient.connect().then(() => console.log('[Bot] Terhubung ke DB'));
mqttClient.on('connect', () => console.log('[Bot] Terhubung ke EMQX'));

// Endpoint untuk webhook
app.post(`/api/webhook/${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Listener Perintah
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Halo! Saya bot IoT Anda. Coba /suhuterakhir atau /nyalakan_lampu");
});

bot.onText(/\/suhuterakhir/, async (msg) => {
  try {
    // Pastikan tabel ada (jika worker belum jalan)
    await dbClient.query("CREATE TABLE IF NOT EXISTS sensor_data (id SERIAL PRIMARY KEY, topic TEXT, value FLOAT, created_at TIMESTAMPTZ DEFAULT NOW())");
    
    const res = await dbClient.query("SELECT value, created_at FROM sensor_data WHERE topic = 'sensor/dummy/suhu' ORDER BY created_at DESC LIMIT 1");
    
    if (res.rows.length > 0) {
      const suhu = res.rows[0].value;
      const waktu = new Date(res.rows[0].created_at).toLocaleString('id-ID');
      bot.sendMessage(msg.chat.id, `Suhu dummy terakhir: ${suhu}°C (pada ${waktu})`);
    } else {
      bot.sendMessage(msg.chat.id, "Belum ada data suhu dummy yang masuk.");
    }
  } catch (e) {
    console.error('[Bot] Gagal ambil data:', e);
    bot.sendMessage(msg.chat.id, "Gagal mengambil data dari database.");
  }
});

bot.onText(/\/nyalakan_lampu/, (msg) => {
  const topic = 'perintah/kamar/lampu';
  const message = '{"state": "ON"}';
  mqttClient.publish(topic, message, (err) => {
    if (err) {
      bot.sendMessage(msg.chat.id, "Gagal mengirim perintah ke MQTT.");
    } else {
      bot.sendMessage(msg.chat.id, "Perintah 'nyalakan lampu' terkirim!");
    }
  });
});

app.listen(PORT, () => console.log(`[Bot] Server berjalan di port ${PORT}`));