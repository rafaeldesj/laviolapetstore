/** Especialidade do colaborador que faz entregas. Só quem a tem aparece como entregador no módulo de Delivery. */
export const DELIVERY_SPECIALTY = 'Entregador / Delivery';

/** Aceita o nome novo e o antigo ("Entregador"). */
export const isDeliverySpecialty = (name?: string | null): boolean => /entregador|delivery/i.test(name || '');
