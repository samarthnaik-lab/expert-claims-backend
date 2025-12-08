// Input validation utilities

class Validators {
  // Validate email format
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate partner_id is a number
  static isValidPartnerId(partnerId) {
    return partnerId && !isNaN(Number(partnerId)) && Number(partnerId) > 0;
  }

  // Validate pagination parameters
  static validatePagination(page, size) {
    const pageNum = page ? parseInt(page) : 1;
    const sizeNum = size ? parseInt(size) : 10;
    
    if (isNaN(pageNum) || pageNum < 1) {
      return { valid: false, page: 1, size: sizeNum };
    }
    if (isNaN(sizeNum) || sizeNum < 1 || sizeNum > 100) {
      return { valid: false, page: pageNum, size: 10 };
    }
    
    return { valid: true, page: pageNum, size: sizeNum };
  }
}

export default Validators;

