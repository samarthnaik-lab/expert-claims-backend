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

  // Get all backlog entries by employee_id (assigned_to) with nested relationships
  // Used by support team to view all backlog entries assigned to a specific employee
  static async findByEmployeeId(employeeId) {
    try {
      // First get all backlog entries assigned to this employee
      let { data: backlogList, error } = await supabase
        .from('backlog')
        .select('*')
        .eq('assigned_to', employeeId)
        .order('created_time', { ascending: false });

      if (error) {
        console.error('Error fetching backlog by employee_id:', error);
        return { data: null, error };
      }

      if (!backlogList || backlogList.length === 0) {
        return { data: [], error: null };
      }

      // For each backlog entry, fetch relationships in parallel
      const backlogWithRelations = await Promise.all(
        backlogList.map(async (backlog) => {
          // Fetch all relationships for this backlog entry
          const [caseType, partner, employee, comments, documents] = await Promise.all([
            // 1. Get case_types by case_type_id
            backlog.case_type_id
              ? supabase
                  .from('case_types')
                  .select('*')
                  .eq('case_type_id', backlog.case_type_id)
                  .single()
                  .then(({ data, error }) => ({ data, error }))
                  .catch(() => ({ data: null, error: null }))
              : Promise.resolve({ data: null, error: null }),

            // 2. Get partners by backlog_referring_partner_id
            backlog.backlog_referring_partner_id
              ? supabase
                  .from('partners')
                  .select('*')
                  .eq('partner_id', backlog.backlog_referring_partner_id)
                  .single()
                  .then(({ data, error }) => ({ data, error }))
                  .catch(() => ({ data: null, error: null }))
              : Promise.resolve({ data: null, error: null }),

            // 3. Get employees by assigned_to
            backlog.assigned_to
              ? supabase
                  .from('employees')
                  .select('*')
                  .eq('employee_id', backlog.assigned_to)
                  .single()
                  .then(({ data, error }) => ({ data, error }))
                  .catch(() => ({ data: null, error: null }))
              : Promise.resolve({ data: null, error: null }),

            // 4. Get backlog_comments
            supabase
              .from('backlog_comments')
              .select('*')
              .eq('backlog_id', backlog.backlog_id)
              .order('created_time', { ascending: false })
              .then(({ data, error }) => ({ data: data || [], error }))
              .catch(() => ({ data: [], error: null })),

            // 5. Get backlog_documents
            supabase
              .from('backlog_documents')
              .select('*')
              .eq('backlog_id', backlog.backlog_id)
              .order('upload_time', { ascending: false })
              .then(({ data, error }) => ({ 
                data: (data || []).map(doc => ({
                  ...doc,
                  file_size: doc.file_size ? (isNaN(parseInt(doc.file_size)) ? doc.file_size : parseInt(doc.file_size)) : null,
                  access_count: doc.access_count ? (isNaN(parseInt(doc.access_count)) ? doc.access_count : parseInt(doc.access_count)) : 0
                })),
                error 
              }))
              .catch(() => ({ data: [], error: null }))
          ]);

          // Attach relationships to backlog entry
          backlog.case_types = caseType.data;
          backlog.partners = partner.data;
          backlog.employees = employee.data;
          backlog.backlog_comments = comments.data || [];
          backlog.backlog_documents = documents.data || [];

          // Add partner_name from partners if exists
          if (backlog.partners) {
            const firstName = backlog.partners.first_name || '';
            const lastName = backlog.partners.last_name || '';
            backlog.partner_name = `${firstName}${lastName}`.trim() || null;
          } else {
            backlog.partner_name = null;
          }

          return backlog;
        })
      );

      return { data: backlogWithRelations, error: null };
    } catch (error) {
      console.error('Error in findByEmployeeId:', error);
      return { data: null, error };
    }
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

