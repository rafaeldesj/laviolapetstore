import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zxmjxxpyvwxhsycyxeyp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4bWp4eHB5dnd4aHN5Y3l4ZXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTk1MDUsImV4cCI6MjA5Njc3NTUwNX0.EUKl3q1hGt26xCXEFZIytj5hmVkPyrff-mF-9t73W04';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Attempting login for admin@laviola.com...');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@laviola.com',
    password: 'admin'
  });

  if (error) {
    console.error('Login failed:', error.message);
  } else {
    console.log('Login succeeded! User ID:', data.user.id);
  }
}

run();
