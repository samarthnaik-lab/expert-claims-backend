import supabase from '../config/database.js';

class CommentModel {
  // Create a case comment
  static async create(commentData) {
    const { data, error } = await supabase
      .from('case_comments')
      .insert([commentData])
      .select()
      .single();

    return { data, error };
  }
}

export default CommentModel;

