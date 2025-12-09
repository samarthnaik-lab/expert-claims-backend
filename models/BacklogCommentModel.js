import supabase from '../config/database.js';

class BacklogCommentModel {
  // Get next backlog_commentid by finding max and incrementing
  static async getNextCommentId() {
    const { data, error } = await supabase
      .from('backlog_comments')
      .select('backlog_commentid')
      .order('backlog_commentid', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error getting max backlog_commentid:', error);
      return 1; // Default to 1 if error
    }

    const maxId = data?.backlog_commentid || 0;
    return maxId + 1;
  }

  // Create a backlog comment
  static async create(commentData) {
    // Generate backlog_commentid if not provided (auto-increment pattern)
    if (!commentData.backlog_commentid) {
      commentData.backlog_commentid = await this.getNextCommentId();
      console.log(`Generated backlog_commentid: ${commentData.backlog_commentid}`);
    }

    // Set timestamps if not provided
    if (!commentData.created_time) {
      commentData.created_time = new Date().toISOString();
    }
    if (!commentData.updated_time) {
      commentData.updated_time = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('backlog_comments')
      .insert([commentData])
      .select()
      .single();

    return { data, error };
  }
}

export default BacklogCommentModel;

