import supabase from '../config/database.js';

class CustomerModel {
  // Create a new customer
  static async create(customerData) {
    const { data, error } = await supabase
      .from('customers')
      .insert([customerData])
      .select()
      .single();

    return { data, error };
  }

  // Find customer by first_name and last_name
  static async findByName(firstName, lastName, partnerId = null) {
    let query = supabase
      .from('customers')
      .select('*')
      .eq('first_name', firstName)
      .eq('last_name', lastName)
      .eq('deleted_flag', false);

    if (partnerId) {
      query = query.eq('partner_id', partnerId);
    }

    const { data, error } = await query.maybeSingle();

    return { data, error };
  }

  // Find customer by mobile number
  static async findByMobileNumber(mobileNumber) {
    // Clean mobile number (remove +91, spaces, etc.)
    let cleanMobile = mobileNumber.replace(/[^\d]/g, '');
    
    // Remove +91 prefix if present
    if (cleanMobile.startsWith('91') && cleanMobile.length === 12) {
      cleanMobile = cleanMobile.substring(2);
    }
    
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('mobile_number', cleanMobile)
      .eq('deleted_flag', false)
      .maybeSingle();

    return { data, error };
  }

  // Find customer by customer_id
  static async findByCustomerId(customerId) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('customer_id', customerId)
      .eq('deleted_flag', false)
      .maybeSingle();

    return { data, error };
  }

  // Find customer by user_id
  static async findByUserId(userId) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .eq('deleted_flag', false)
      .maybeSingle();

    return { data, error };
  }

  // Update customer
  static async update(customerId, updateData) {
    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('customer_id', customerId)
      .select()
      .single();

    return { data, error };
  }
}

export default CustomerModel;

