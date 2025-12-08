import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

// Using ANON_KEY (subject to RLS policies)
const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Using SERVICE_ROLE_KEY (bypasses RLS - for testing only)
const supabaseService = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAdmin() {
  console.log('\n=== Testing with ANON_KEY (subject to RLS) ===');
  const { data: dataAnon, error: errorAnon } = await supabaseAnon
    .from('admin')
    .select('*')
    .limit(5);

  if (errorAnon) {
    console.log("❌ Error with ANON_KEY:", errorAnon.message);
    console.log("Error details:", errorAnon);
  } else {
    console.log("✅ Query successful with ANON_KEY");
    console.log(`Rows returned: ${dataAnon.length}`);
    if (dataAnon.length > 0) {
      console.log("Sample data:", dataAnon);
    } else {
      console.log("⚠️  Empty array - This means RLS policies are blocking the query!");
    }
  }

  console.log('\n=== Testing with SERVICE_ROLE_KEY (bypasses RLS) ===');
  const { data: dataService, error: errorService } = await supabaseService
    .from('admin')
    .select('*')
    .limit(5);

  if (errorService) {
    console.log("❌ Error with SERVICE_ROLE_KEY:", errorService.message);
  } else {
    console.log("✅ Query successful with SERVICE_ROLE_KEY");
    console.log(`Rows returned: ${dataService.length}`);
    if (dataService.length > 0) {
      console.log("Sample data:", dataService);
      console.log("\n💡 Solution: The admin table has RLS enabled.");
      console.log("   Either disable RLS for testing, or create proper RLS policies.");
    }
  }
}

testAdmin();
