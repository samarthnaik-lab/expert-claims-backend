import supabase from '../config/database.js';

class BacklogDocumentModel {
  // Create a backlog document
  static async create(documentData) {
    const { data, error } = await supabase
      .from('backlog_documents')
      .insert([documentData])
      .select()
      .single();

    return { data, error };
  }

  // Create multiple documents
  static async createMultiple(documentsArray) {
    if (!documentsArray || documentsArray.length === 0) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from('backlog_documents')
      .insert(documentsArray)
      .select();

    return { data, error };
  }
}

export default BacklogDocumentModel;

