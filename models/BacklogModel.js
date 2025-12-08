import supabase from '../config/database.js';

class BacklogModel {
  // Create a backlog entry
  static async create(backlogData) {
    const { data, error } = await supabase
      .from('backlog')
      .insert([backlogData])
      .select()
      .single();

    return { data, error };
  }

  // Get backlog by backlog_id
  static async findByBacklogId(backlogId) {
    const { data, error } = await supabase
      .from('backlog')
      .select('*')
      .eq('backlog_id', backlogId)
      .single();

    return { data, error };
  }
}

export default BacklogModel;

