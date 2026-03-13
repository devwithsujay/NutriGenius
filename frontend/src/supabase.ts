import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Export a flag so the UI knows if it's missing
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// We still have to pass strings to createClient to avoid crash, but it won't work
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)
