import fetch from 'node-fetch';

async function test() {
  const url = 'https://www.tiktok.com/@aoieditmykisah/video/7630815219989999999'; // Fake ID
  const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}`;
  
  try {
    const res = await fetch(apiUrl);
    const text = await res.text();
    console.log("RESPONSE:", text);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
test();
