import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

// Configure Supabase client with expc schema using service role key for private schema access
// Using db.schema option is the correct way to specify schema in Supabase JS client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: {
      schema: 'expc'
    },
    global: {
      headers: {
        'Accept-Profile': 'expc'
      }
    }
  }
);

export default supabase;
