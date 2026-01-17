import { createClient } from '@supabase/supabase-js'
import type { Database } from 'supabase/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase environment variables are missing.')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
