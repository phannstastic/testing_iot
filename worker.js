// npm install mqtt pg
const mqtt = require('mqtt');
const { Client } = require('pg');

// Ambil info dari Environment Variables di Railway
const MQTT_BROKER_URL = process.env.MQTT_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!MQTT_BROKER_URL || !DATABASE_URL) {
  console.error("Error: Variabel MQTT_URL atau DATABASE_URL tidak diset.");
  process.exit(1);
}

const dbClient = new Client({ connectionString: DATABASE_URL });
const mqttClient = mqtt.connect(MQTT_BROKER_URL);

async function startWorker() {
  try {
    await dbClient.connect();
    console.log('[Worker] Terhubung ke Database PostgreSQL.');
  } catch (e) {
    console.error('[Worker] Gagal terhubung ke Database!', e);
    return;
  }

  mqttClient.on('connect', () => {
    console.log('[Worker] Terhubung ke Broker EMQX.');
    mqttClient.subscribe('sensor/#', (err) => { 
      if (!err) console.log('[Worker] Berhasil subscribe ke topic sensor/#');
    });
  });

  mqttClient.on('message', async (topic, message) => {
    console.log(`[Worker] Data diterima: ${topic} -> ${message.toString()}`);
    try {
      const data = JSON.parse(message.toString());
      // Pastikan tabelnya ada
      await dbClient.query("CREATE TABLE IF NOT EXISTS sensor_data (id SERIAL PRIMARY KEY, topic TEXT, value FLOAT, created_at TIMESTAMPTZ DEFAULT NOW())");

      const query = 'INSERT INTO sensor_data(topic, value) VALUES($1, $2)';
      await dbClient.query(query, [topic, data.value]);
      console.log('[Worker] Data berhasil disimpan ke DB');

    } catch (e) {
      console.error('[Worker] Gagal simpan ke DB (data bukan JSON?):', e.message);
    }
  });

  mqttClient.on('error', (err) => console.error('[Worker] MQTT Error:', err));
}

startWorker();