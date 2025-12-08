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

