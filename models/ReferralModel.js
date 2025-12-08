import supabase from '../config/database.js';

class ReferralModel {
  // Get referrals by partner_id with pagination - using cases table
  static async findByPartnerId(partnerId, page = 1, size = 10) {
    const offset = (page - 1) * size;
    
    const { data, error, count } = await supabase
      .from('cases')
      .select(`
        *,
        case_types(*),
        customers(*),
        partners!cases_referring_partner_id_fkey(*),
        partner_bonus_calculations(*)
      `, { count: 'exact' })
      .eq('referring_partner_id', partnerId)
      .order('referral_date', { ascending: false })
      .range(offset, offset + size - 1);

    return { data, error, count };
  }

  // Get all referrals by partner_id (no pagination) - using cases table
  static async findAllByPartnerId(partnerId) {
    const { data, error } = await supabase
      .from('cases')
      .select(`
        *,
        case_types(*),
        customers(*),
        partners!cases_referring_partner_id_fkey(*),
        partner_bonus_calculations(*)
      `)
      .eq('referring_partner_id', partnerId)
      .order('referral_date', { ascending: false });

    return { data, error };
  }

  // Get backlog referrals by partner_id - using backlog table
  static async findBacklogByPartnerId(partnerId) {
    const { data, error } = await supabase
      .from('backlog')
      .select('*')
      .eq('backlog_referring_partner_id', partnerId)
      .order('backlog_referral_date', { ascending: false });

    return { data, error };
  }
}

export default ReferralModel;

