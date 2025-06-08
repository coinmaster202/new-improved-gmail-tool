// scripts/test-redis.js
import { Redis } from "@upstash/redis";

// Connect using environment variables
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function testInsertCode() {
  const code = "v500-123456";

  try {
    await redis.set(code, true);
    const check = await redis.get(code);

    if (check) {
      console.log(`✅ Successfully inserted: ${code}`);
    } else {
      console.log(`❌ Failed to insert: ${code}`);
    }
  } catch (e) {
    console.error("❌ Redis error:", e);
  }

  process.exit();
}

testInsertCode();
