import supabase from '../config/database.js';

class PaymentModel {
  // Create a payment phase
  static async create(paymentData) {
    const { data, error } = await supabase
      .from('case_payment_phases')
      .insert([paymentData])
      .select()
      .single();

    return { data, error };
  }

  // Create multiple payment phases
  static async createMultiple(paymentsArray) {
    if (!paymentsArray || paymentsArray.length === 0) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from('case_payment_phases')
      .insert(paymentsArray)
      .select();

    return { data, error };
  }
}

export default PaymentModel;

