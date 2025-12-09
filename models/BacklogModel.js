import supabase from '../config/database.js';

class BacklogModel {
  // Get next backlog_int_id by finding max and incrementing
  static async getNextBacklogIntId() {
    const { data, error } = await supabase
      .from('backlog')
      .select('backlog_int_id')
      .not('backlog_int_id', 'is', null) // Only count non-null values
      .order('backlog_int_id', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error getting max backlog_int_id:', error);
      return 1; // Default to 1 if error
    }

    const maxId = data?.backlog_int_id || 0;
    return maxId + 1;
  }

  // Create a backlog entry
  static async create(backlogData) {
    // Generate backlog_int_id if not provided (auto-increment pattern)
    if (!backlogData.backlog_int_id) {
      backlogData.backlog_int_id = await this.getNextBacklogIntId();
      console.log(`Generated backlog_int_id: ${backlogData.backlog_int_id}`);
    }

    const { data, error } = await supabase
      .from('backlog')
      .insert([backlogData])
      .select()
      .single();

    return { data, error };
  }

  // Get backlog by backlog_id with nested relationships
  static async findByBacklogId(backlogId) {
    // First get backlog entry
    let { data, error } = await supabase
      .from('backlog')
      .select('*')
      .eq('backlog_id', backlogId)
      .single();

    if (error) {
      console.error('Error fetching backlog:', error);
      return { data, error };
    }

    if (!data) {
      return { data: null, error: null };
    }

    // Fetch relationships separately to avoid schema mismatch issues
    
    // 1. Get case_types by case_type_id
    if (data.case_type_id) {
      const { data: caseType, error: caseTypeError } = await supabase
        .from('case_types')
        .select('*')
        .eq('case_type_id', data.case_type_id)
        .single();

      if (!caseTypeError && caseType) {
        data.case_types = caseType;
      } else if (caseTypeError) {
        console.error('Error fetching case_types:', caseTypeError);
        data.case_types = null;
      }
    } else {
      data.case_types = null;
    }

    // 2. Get partners by backlog_referring_partner_id
    if (data.backlog_referring_partner_id) {
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('*')
        .eq('partner_id', data.backlog_referring_partner_id)
        .single();

      if (!partnerError && partner) {
        data.partners = partner;
      } else if (partnerError) {
        console.error('Error fetching partners:', partnerError);
        data.partners = null;
      }
    } else {
      data.partners = null;
    }

    // 3. Get employees by assigned_to
    if (data.assigned_to) {
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', data.assigned_to)
        .single();

      if (!employeeError && employee) {
        data.employees = employee;
      } else if (employeeError) {
        console.error('Error fetching employees:', employeeError);
        data.employees = null;
      }
    } else {
      data.employees = null;
    }

    // 4. Get backlog_comments
    const { data: comments, error: commentsError } = await supabase
      .from('backlog_comments')
      .select('*')
      .eq('backlog_id', backlogId)
      .order('created_time', { ascending: false });

    if (!commentsError && comments) {
      data.backlog_comments = comments || [];
    } else if (commentsError) {
      console.error('Error fetching backlog_comments:', commentsError);
      data.backlog_comments = [];
    }

    // 5. Get backlog_documents (without nested relationships for now - simpler structure)
    const { data: documents, error: documentsError } = await supabase
      .from('backlog_documents')
      .select('*')
      .eq('backlog_id', backlogId)
      .order('upload_time', { ascending: false });

    if (!documentsError && documents) {
      // Convert file_size from text to number if possible, keep as is otherwise
      data.backlog_documents = documents.map(doc => ({
        ...doc,
        file_size: doc.file_size ? (isNaN(parseInt(doc.file_size)) ? doc.file_size : parseInt(doc.file_size)) : null,
        access_count: doc.access_count ? (isNaN(parseInt(doc.access_count)) ? doc.access_count : parseInt(doc.access_count)) : 0
      }));
    } else if (documentsError) {
      console.error('Error fetching backlog_documents:', documentsError);
      data.backlog_documents = [];
    } else {
      data.backlog_documents = [];
    }

    return { data, error };
  }

  // Update backlog by backlog_id
  static async update(backlogId, updateData) {
    // Remove backlog_id from updateData if present (can't update primary key)
    const { backlog_id, ...dataToUpdate } = updateData;
    
    // Add updated_time if not provided
    if (!dataToUpdate.updated_time) {
      dataToUpdate.updated_time = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('backlog')
      .update(dataToUpdate)
      .eq('backlog_id', backlogId)
      .select()
      .single();

    return { data, error };
  }
}

export default BacklogModel;

