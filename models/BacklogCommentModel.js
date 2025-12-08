import supabase from '../config/database.js';

class BacklogCommentModel {
  // Create a backlog comment
  static async create(commentData) {
    const { data, error } = await supabase
      .from('backlog_comments')
      .insert([commentData])
      .select()
      .single();

    return { data, error };
  }
}

export default BacklogCommentModel;

