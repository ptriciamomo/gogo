// supabase.js
import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://ednraiixtmzymowfwarh.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkbnJhaWl4dG16eW1vd2Z3YXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0NTY2NzMsImV4cCI6MjA2ODAzMjY3M30.pI0SyhNSAZOec1-mE0tl66HPoTxvOckKezkuV5f3UEE';

let options = {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true, // Enable to automatically detect and handle auth tokens in URL
    },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, options);

export const testConnection = async () => {
    try {
        const { data, error } = await supabase.from('users').select('*').limit(1);
        if (error) {
            console.error('Supabase connection error:', error);
            return false;
        }
        console.log('Supabase connected successfully!', data);
        return true;
    } catch (err) {
        console.error('Failed to connect to Supabase:', err);
        return false;
    }
};
