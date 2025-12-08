import supabase from '../config/database.js';

class BonusModel {
  // Get all bonus calculations for a partner with case and customer info
  static async getBonusCalculations(partnerId) {
    const { data, error } = await supabase
      .from('partner_bonus_calculations')
      .select(`
        *,
        cases (
          case_id,
          case_value,
          value_currency,
          case_summary,
          case_description,
          case_type_id,
          assigned_to,
          priority,
          ticket_stage,
          due_date,
          referral_date,
          customer_id,
          customers (
            customer_id,
            first_name,
            last_name
          )
        )
      `)
      .eq('partner_id', partnerId)
      .order('calculation_date', { ascending: false });

    return { data, error };
  }

  // Calculate total bonus amount
  static async calculateTotalBonus(partnerId) {
    const { data, error } = await supabase
      .from('partner_bonus_calculations')
      .select('stage_bonus_amount')
      .eq('partner_id', partnerId);

    if (error) {
      return { total: 0, error };
    }

    const total = data.reduce((sum, record) => {
      return sum + (parseFloat(record.stage_bonus_amount) || 0);
    }, 0);

    return { total, error: null };
  }
}

export default BonusModel;

