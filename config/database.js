import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

// Using SERVICE_ROLE_KEY for backend operations (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default supabase;

