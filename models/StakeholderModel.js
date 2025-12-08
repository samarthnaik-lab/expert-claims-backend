import supabase from '../config/database.js';

class StakeholderModel {
  // Create a stakeholder
  static async create(stakeholderData) {
    const { data, error } = await supabase
      .from('case_stakeholders')
      .insert([stakeholderData])
      .select()
      .single();

    return { data, error };
  }

  // Create multiple stakeholders
  static async createMultiple(stakeholdersArray) {
    if (!stakeholdersArray || stakeholdersArray.length === 0) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from('case_stakeholders')
      .insert(stakeholdersArray)
      .select();

    return { data, error };
  }
}

export default StakeholderModel;

