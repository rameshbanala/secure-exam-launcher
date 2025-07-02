const { MongoClient } = require('mongodb');

const uri = 'mongodb://g1careers:g1careers%23%401@164.52.213.200:27017/g1careers?authSource=admin';

async function connectAndListCollections() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db('g1careers');
    const collections = await db.listCollections().toArray();

    console.log("📦 Collections in g1careers DB:");
    collections.forEach(col => console.log(`- ${col.name}`));
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
  }
}

connectAndListCollections();