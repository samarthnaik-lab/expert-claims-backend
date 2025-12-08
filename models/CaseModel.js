import supabase from '../config/database.js';

class CaseModel {
  // Create a new case
  static async create(caseData) {
    const { data, error } = await supabase
      .from('cases')
      .insert([caseData])
      .select()
      .single();

    return { data, error };
  }

  // Get case by case_id
  static async findByCaseId(caseId) {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('case_id', caseId)
      .single();

    return { data, error };
  }
}

export default CaseModel;

