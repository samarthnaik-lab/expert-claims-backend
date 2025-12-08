import supabase from '../config/database.js';

class IdGenerator {
  // Generate case_id using case_code_counters
  static async generateCaseId() {
    const currentYear = new Date().getFullYear() % 100; // Last 2 digits of year
    
    // Get or create counter for current year
    const { data: counter, error: counterError } = await supabase
      .from('case_code_counters')
      .select('*')
      .eq('yy', currentYear)
      .single();

    let nextNum = 1;
    
    if (counterError || !counter) {
      // Create new counter for this year
      const { error: insertError } = await supabase
        .from('case_code_counters')
        .insert([{ yy: currentYear, last_num: 1 }]);
      
      if (insertError) {
        console.error('Error creating case counter:', insertError);
      }
    } else {
      nextNum = (counter.last_num || 0) + 1;
      
      // Update counter
      await supabase
        .from('case_code_counters')
        .update({ last_num: nextNum })
        .eq('yy', currentYear);
    }

    // Format: ECSI-YY-XXX (e.g., ECSI-25-001)
    const caseId = `ECSI-${currentYear.toString().padStart(2, '0')}-${nextNum.toString().padStart(3, '0')}`;
    return caseId;
  }

  // Generate backlog_id using backlog_code_counters
  static async generateBacklogId() {
    const currentYear = new Date().getFullYear() % 100;
    
    // Get or create counter for current year
    const { data: counter, error: counterError } = await supabase
      .from('backlog_code_counters')
      .select('*')
      .eq('yy', currentYear)
      .single();

    let nextNum = 1;
    
    if (counterError || !counter) {
      // Create new counter for this year
      const { error: insertError } = await supabase
        .from('backlog_code_counters')
        .insert([{ yy: currentYear, last_num: 1 }]);
      
      if (insertError) {
        console.error('Error creating backlog counter:', insertError);
      }
    } else {
      nextNum = (counter.last_num || 0) + 1;
      
      // Update counter
      await supabase
        .from('backlog_code_counters')
        .update({ last_num: nextNum })
        .eq('yy', currentYear);
    }

    // Format: BLG-YY-XXX (e.g., BLG-25-001)
    const backlogId = `BLG-${currentYear.toString().padStart(2, '0')}-${nextNum.toString().padStart(3, '0')}`;
    return backlogId;
  }
}

export default IdGenerator;

