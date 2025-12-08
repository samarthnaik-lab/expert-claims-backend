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

    // 5. Get backlog_documents with nested relationships
    const { data: documents, error: documentsError } = await supabase
      .from('backlog_documents')
      .select('*')
      .eq('backlog_id', backlogId)
      .order('upload_time', { ascending: false });

    if (!documentsError && documents && documents.length > 0) {
      // For each document, fetch document_categories and users separately
      const documentsWithRelations = await Promise.all(
        documents.map(async (doc) => {
          const docWithRelations = { ...doc };

          // Get document_categories
          if (doc.category_id) {
            const { data: category, error: categoryError } = await supabase
              .from('document_categories')
              .select('*')
              .eq('category_id', doc.category_id)
              .single();

            if (!categoryError && category) {
              docWithRelations.document_categories = category;
            } else {
              docWithRelations.document_categories = null;
            }
          } else {
            docWithRelations.document_categories = null;
          }

          // Get users (uploaded_by)
          if (doc.uploaded_by) {
            const { data: user, error: userError } = await supabase
              .from('users')
              .select('*')
              .eq('user_id', doc.uploaded_by)
              .single();

            if (!userError && user) {
              docWithRelations.users = user;
            } else {
              docWithRelations.users = null;
            }
          } else {
            docWithRelations.users = null;
          }

          return docWithRelations;
        })
      );

      data.backlog_documents = documentsWithRelations;
    } else if (documentsError) {
      console.error('Error fetching backlog_documents:', documentsError);
      data.backlog_documents = [];
    } else {
      data.backlog_documents = [];
    }

    return { data, error };
  }
}

export default BacklogModel;

