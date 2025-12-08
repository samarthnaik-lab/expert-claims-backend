import supabase from '../config/database.js';

class BacklogDocumentModel {
  // Get next document_id by finding max and incrementing
  static async getNextDocumentId() {
    const { data, error } = await supabase
      .from('backlog_documents')
      .select('document_id')
      .order('document_id', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error getting max document_id:', error);
      return 1; // Default to 1 if error
    }

    const maxId = data?.document_id || 0;
    return maxId + 1;
  }

  // Create a backlog document
  static async create(documentData) {
    // Generate document_id if not provided
    if (!documentData.document_id) {
      documentData.document_id = await this.getNextDocumentId();
    }

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

    // Get starting document_id
    let nextId = await this.getNextDocumentId();
    
    // Assign document_id to each document
    const documentsWithIds = documentsArray.map(doc => ({
      ...doc,
      document_id: nextId++
    }));

    console.log('Documents with generated IDs:', documentsWithIds.map(d => ({
      document_id: d.document_id,
      backlog_id: d.backlog_id,
      original_filename: d.original_filename
    })));

    const { data, error } = await supabase
      .from('backlog_documents')
      .insert(documentsWithIds)
      .select();

    return { data, error };
  }
}

export default BacklogDocumentModel;

