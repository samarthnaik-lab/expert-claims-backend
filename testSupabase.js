

import supabase from './supabaseClient.js';

async function testConnection() {
  const { data, error } = await supabase.from('cases').select('*').limit(1);

  if (error) {
    console.log("❌ Supabase connection failed:", error.message);
  } else {
    console.log("✅ Supabase connected successfully!");
    console.log("Sample row:", data);
  }
}

testConnection();
