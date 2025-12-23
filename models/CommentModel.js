import supabase from '../config/database.js';

class CommentModel {
  // Create a case comment
  static async create(commentData) {
    const schema = process.env.SUPABASE_SCHEMA || '';
    const tableName = schema ? `${schema}.case_comments` : 'case_comments';

    const { data, error } = await supabase
      .from(tableName)
      .insert([commentData])
      .select()
      .single();

    return { data, error };
  }
}

export default CommentModel;

