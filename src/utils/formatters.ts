export const formatPhoneBR = (value: string): string => {
  // Remove everything that is not a digit
  const numbers = value.replace(/\D/g, '');
  
  if (numbers.length === 0) return '';
  
  if (numbers.length <= 2) {
    return `(${numbers}`;
  }
  
  if (numbers.length <= 6) {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
  }
  
  if (numbers.length <= 10) {
    // Format as (XX) XXXX-XXXX
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
  }
  
  // Format as (XX) XXXXX-XXXX
  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
};
