import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zxmjxxpyvwxhsycyxeyp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4bWp4eHB5dnd4aHN5Y3l4ZXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTk1MDUsImV4cCI6MjA5Njc3NTUwNX0.EUKl3q1hGt26xCXEFZIytj5hmVkPyrff-mF-9t73W04';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectColumns() {
  console.log('Fetching one delivery...');
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching delivery:', error);
  } else if (data && data.length > 0) {
    console.log('Columns in deliveries table:', Object.keys(data[0]));
    console.log('Sample data:', data[0]);
  } else {
    console.log('No deliveries found in the table or table does not exist.');
  }
}

inspectColumns();
