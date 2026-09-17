async function testKey(name: string, authHeader: string) {
  try {
    const res = await fetch('https://api.instantly.ai/api/v2/campaigns?limit=5', {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });
    console.log(`[v2] ${name}: HTTP ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`✅ [v2] Éxito con ${name}:`, JSON.stringify(data).slice(0, 200));
      return true;
    }
  } catch (err: any) {
    console.log(`Error v2 ${name}:`, err.message);
  }

  try {
    const rawKey = authHeader.replace('Bearer ', '');
    const res = await fetch(`https://api.instantly.ai/api/v1/campaign/list?api_key=${rawKey}&limit=5`);
    console.log(`[v1] ${name}: HTTP ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`✅ [v1] Éxito con ${name}:`, JSON.stringify(data).slice(0, 200));
      return true;
    }
  } catch (err: any) {
    console.log(`Error v1 ${name}:`, err.message);
  }

  return false;
}

async function main() {
  const rawBase64 = 'MWJkZDZiNGUtNDg2NS00ZWM0LTk2YTYtMzA4OWZlMDJhZDE2OldmQm9Hc2pxY2FrZg==';
  const decoded = Buffer.from(rawBase64, 'base64').toString('utf8');
  console.log('Decoded:', decoded);
  const parts = decoded.split(':');

  await testKey('Raw Base64', `Bearer ${rawBase64}`);
  await testKey('Decoded Combined', `Bearer ${decoded}`);
  await testKey('Decoded Part 0 (UUID)', `Bearer ${parts[0]}`);
  await testKey('Decoded Part 1 (Secret)', `Bearer ${parts[1]}`);
}

main().catch(console.error);
