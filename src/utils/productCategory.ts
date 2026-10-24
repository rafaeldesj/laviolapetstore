const has = (n: string, words: string[]) => words.some(w => n.includes(w));

export const PRODUCT_CATEGORIES = [
  'Ração / Alimentos',
  'Higiene & Beleza',
  'Medicamentos / Farmácia',
  'Acessórios',
  'Brinquedos',
  'Outros',
];

/** Sugere a categoria pelo nome do produto (só uma sugestão: o operador pode trocar). */
export function guessCategory(name: string): string {
  const n = name.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (has(n, ['ANTIPULGA', 'VERMIFUGO', 'BRAVECTO', 'NEXGARD', 'SIMPARICA', 'ZELOTRIL', 'VITAMINOL', 'SUPLEMENTO', 'POMADA', 'COLIRIO', 'REMEDIO', 'FRONTLINE', 'CAPSTAR', 'CREDELIO', 'OTOLOGICO', 'ANTIPARASIT', 'CARRAPATICIDA', 'COMPRIMIDO', 'MEDIC', 'CONFRONT', 'UNGUENTO'])) return 'Medicamentos / Farmácia';
  if (has(n, ['SHAMPOO', 'CONDICIONADOR', 'SABONETE', 'CREME DENTAL', 'ESCOVA', 'TALCO', 'PERFUME', 'COLONIA', 'AREIA', 'GRANULADO', 'LENCO', 'FRALDA', 'TAPETE HIG', 'HIGIENIC', 'DESODORANTE', 'ELIMINADOR', 'SACO COLETOR', 'CORTADOR', 'TOSA', 'PIPI'])) return 'Higiene & Beleza';
  if (has(n, ['BOLA', 'BRINQ', 'MORDEDOR', 'PELUCIA', 'FRISBEE', 'CORDA', 'VARINHA', 'RATINHO'])) return 'Brinquedos';
  if (has(n, ['COLEIRA', 'PEITORAL', 'GUIA', 'CAMA', 'CAIXA TRANSP', 'COMEDOURO', 'BEBEDOURO', 'FOCINHEIRA', 'CERCADINHO', 'CASINHA', 'ROUPA', 'GAIOLA', 'CINTO', 'PLACA', 'TRANSPORTE', 'ARRANHADOR', 'POTE', 'ALCA', 'BANDANA', 'TOALHA', 'JAULA', 'COLAR'])) return 'Acessórios';
  if (has(n, ['RACAO', 'GOLDEN', 'PREMIER', 'QUATREE', 'BILLY', 'FOSTER', 'QUARTZ', 'WHISKAS', 'PEDIGREE', 'SPECIAL', 'KIKO', 'SNACK', 'PETISCO', 'BIFINHO', 'OSSO', 'GRANEL', 'MISTURA', 'MILHO', 'GIRASSOL', 'PAINCO', 'ALPISTE', 'SEMENTE', 'SACHE', 'CHURU', 'CASCO', 'ORELHA', 'NUTRI', 'BISCOITO', 'GUABI', 'NATURAL', 'FILHOTE', 'ADULTO', 'CASTRADO'])) return 'Ração / Alimentos';
  return 'Outros';
}
